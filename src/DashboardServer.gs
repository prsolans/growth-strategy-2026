/**
 * Dashboard Server — backend functions for the Command Center dashboard.
 *
 * Called via google.script.run from Dashboard.html.
 * All functions read from existing data sources — no new writes except refreshARData.
 */

// ── Get cached AR data for a specific account ──────────────────────────

/**
 * Returns the full cached AR payload for a company.
 * @param {string} companyName
 * @returns {Object|null} Parsed AR data or null if no cache exists
 */
/**
 * Returns cached AR data as a JSON string (avoids google.script.run serialization issues).
 * @param {string} companyName
 * @returns {string|null} JSON string or null
 */
function getDashboardData(companyName) {
  if (!companyName) return null;
  var start = Date.now();

  // ── Drive cache: go direct to folder by name (no index needed) ──────
  try {
    var t0 = Date.now();
    var timing = {};
    var root = _getCacheRootFolder();
    var folders = root.getFoldersByName(companyName);
    if (folders.hasNext()) {
      var folder = folders.next();
      timing.folder = Date.now() - t0;

      // intelligence.json (L2)
      var t1 = Date.now();
      var intelFile = folder.getFilesByName('intelligence.json');
      if (intelFile.hasNext()) {
        var intelBlob = intelFile.next().getBlob().getDataAsString();
        timing.intelRead = Date.now() - t1;
        timing.intelKB = Math.round(intelBlob.length / 1024);
        var t1b = Date.now();
        var intel = JSON.parse(intelBlob);
        timing.intelParse = Date.now() - t1b;

        // meta.json
        var meta = {};
        var metaFile = folder.getFilesByName('meta.json');
        if (metaFile.hasNext()) meta = JSON.parse(metaFile.next().getBlob().getDataAsString());

        // research.json (L1)
        var t2 = Date.now();
        var l1Data = null, l1Signals = null, l1Enrichment = null;
        var researchFile = folder.getFilesByName('research.json');
        if (researchFile.hasNext()) {
          var researchBlob = researchFile.next().getBlob().getDataAsString();
          timing.researchRead = Date.now() - t2;
          timing.researchKB = Math.round(researchBlob.length / 1024);
          var t2b = Date.now();
          var research = JSON.parse(researchBlob);
          timing.researchParse = Date.now() - t2b;
          l1Data = research.data || null;
          l1Signals = research.productSignals || null;
          l1Enrichment = research.enrichment || null;
        } else {
          timing.researchRead = 0;
          timing.researchKB = 0;
        }

        // If no L1 cache, fall back to live bookscrub sheet read + cache it
        if (!l1Data) {
          var t3l = Date.now();
          Logger.log('[Dashboard] No research.json for "' + companyName + '" — reading live bookscrub');
          try {
            l1Data = getCompanyData(companyName);
            l1Signals = generateProductSignals(l1Data);
            timing.liveFallback = Date.now() - t3l;
            // Write to cache so next load is fast
            try {
              writeResearchCache(companyName, { data: l1Data, productSignals: l1Signals }, 'dashboard-backfill');
              Logger.log('[Dashboard] Backfilled research.json for "' + companyName + '"');
            } catch (we) {
              Logger.log('[Dashboard] research.json backfill failed (non-fatal): ' + we.message);
            }
            // Update card preview so landing page shows updated data
            try { updateCardPreview(companyName); } catch (cp) { /* non-fatal */ }
          } catch (e) {
            Logger.log('[Dashboard] Live bookscrub read failed: ' + e.message);
          }
        }

        // Read gvs-results.json if present
        var gvsResults = null;
        try {
          var gvsFile = folder.getFilesByName('gvs-results.json');
          if (gvsFile.hasNext()) {
            gvsResults = JSON.parse(gvsFile.next().getBlob().getDataAsString());
          }
        } catch (ge) {
          Logger.log('[Dashboard] gvs-results.json read failed (non-fatal): ' + ge.message);
        }

        var result = {
          companyName:        companyName,
          generatedAt:        meta.l2GeneratedAt || null,
          pipeline:           meta.l2Pipeline || 'glean',
          source:             'drive',
          briefUrl:           (meta.cardPreview && meta.cardPreview.briefUrl) || null,
          fullUrl:            (meta.cardPreview && meta.cardPreview.fullUrl) || null,
          accountProfile:     intel.accountProfile     || null,
          businessMap:        intel.businessMap         || null,
          agreementLandscape: intel.agreementLandscape  || null,
          contractCommerce:   intel.contractCommerce    || null,
          priorityMap:        intel.priorityMap         || null,
          briefing:           intel.briefing            || null,
          bigBets:            intel.bigBets             || null,
          gvsResults:         gvsResults,
          productSignals:     l1Signals,
          enrichment:         l1Enrichment,
          liveData:           l1Data,
          liveProductSignals: l1Signals
        };

        // Fill doc URLs from Deliverables if not in cardPreview
        if (!result.briefUrl || !result.fullUrl) {
          try {
            var delivs = getDeliverables(companyName);
            for (var d = 0; d < delivs.length; d++) {
              if (delivs[d].type === 'ar_brief' && delivs[d].url && !result.briefUrl) result.briefUrl = delivs[d].url;
              if (delivs[d].type === 'ar_full' && delivs[d].url && !result.fullUrl)  result.fullUrl = delivs[d].url;
            }
          } catch (e) {
            Logger.log('[Dashboard] Deliverables lookup failed (non-fatal): ' + e.message);
          }
        }

        var t3 = Date.now();
        timing.total = Date.now() - start;
        result._timing = timing;
        var json = JSON.stringify(result);
        timing.payloadKB = Math.round(json.length / 1024);
        timing.serialize = Date.now() - t3;
        // Re-serialize with final timing included
        result._timing = timing;
        json = JSON.stringify(result);
        Logger.log('[Dashboard] TOTAL for "' + companyName + '": ' + timing.total + 'ms, payload ' + timing.payloadKB + 'KB');
        return json;
      }
    }
  } catch (e) {
    Logger.log('[Dashboard] Drive cache read failed: ' + e.message);
  }

  Logger.log('[Dashboard] No Drive cache found for "' + companyName + '"');
  return null;
}

// ── Get live bookscrub data (no AR run needed) ─────────────────────────

/**
 * Returns real-time internal data for a company from the bookscrub sheet.
 * Fast — no LLM calls, just sheet reads + product signal computation.
 * @param {string} companyName
 * @returns {Object} { data, productSignals }
 */
/**
 * Returns bookscrub data for a company, serialized as a JSON string
 * to avoid google.script.run serialization issues with large objects.
 * @param {string} companyName
 * @returns {string} JSON string of { data, productSignals }
 */
function getDashboardLiveData(companyName) {
  if (!companyName) throw new Error('Company name required');

  // ── Try Drive cache first (research.json from prior AR run) ─────────
  try {
    var cached = getResearchCache(companyName);
    if (cached && cached.research && cached.research.data) {
      var data = cached.research.data;
      var signals = cached.research.productSignals || generateProductSignals(data);
      Logger.log('[Dashboard] getDashboardLiveData CACHE HIT for "' + companyName + '" — ' +
        (data.activeProducts || []).length + ' products');
      var json = JSON.stringify({ data: data, productSignals: signals });
      Logger.log('[Dashboard] Payload size: ' + json.length + ' chars');
      return json;
    }
  } catch (e) {
    Logger.log('[Dashboard] getDashboardLiveData cache read failed, falling back to live: ' + e.message);
  }

  // ── Fall back to live sheet read ────────────────────────────────────
  var data = getCompanyData(companyName);
  var signals = generateProductSignals(data);
  Logger.log('[Dashboard] getDashboardLiveData LIVE for "' + companyName + '" — ' +
    (data.activeProducts || []).length + ' products');
  var json = JSON.stringify({ data: data, productSignals: signals });
  Logger.log('[Dashboard] Payload size: ' + json.length + ' chars');
  return json;
}

// ── Get GVS submission history ─────────────────────────────────────────

/**
 * Returns previous GVS value case submissions for a company.
 * Reads from the GVS log spreadsheet (cross-project, read-only).
 * @param {string} companyName
 * @returns {Object[]} Array of { timestamp, user, account, industry, lob, capabilities, roi, totalBenefit, payback }
 */
function getGVSHistory(companyName) {
  if (!companyName) return [];
  var sheetId = PropertiesService.getScriptProperties().getProperty('GVS_LOG_SHEET_ID');
  if (!sheetId) {
    Logger.log('[Dashboard] GVS_LOG_SHEET_ID not set — skipping GVS history');
    return [];
  }

  try {
    var ss    = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheets()[0];
    if (!sheet || sheet.getLastRow() < 2) return [];

    var allData = sheet.getDataRange().getValues();
    var results = [];
    var target  = companyName.toLowerCase();

    for (var i = 1; i < allData.length; i++) {
      var account = String(allData[i][2] || '').toLowerCase();
      if (account === target || account.indexOf(target) !== -1) {
        results.push({
          timestamp:    allData[i][0],
          user:         allData[i][1],
          account:      allData[i][2],
          industry:     allData[i][3],
          companySize:  allData[i][4],
          lob:          allData[i][5],
          capabilities: allData[i][6],
          roi:          allData[i][7],
          totalBenefit: allData[i][8],
          payback:      allData[i][9]
        });
      }
    }

    return results;
  } catch (e) {
    Logger.log('[Dashboard] Error reading GVS log: ' + e.message);
    return [];
  }
}

// ── List all cached accounts ───────────────────────────────────────────

/**
 * Returns a list of all accounts that have cached AR data.
 * @returns {Object[]} Array of { companyName, generatedAt, pipeline, briefUrl, fullUrl }
 */
function getCachedAccounts() {
  var start = Date.now();

  // Short-lived CacheService (2 min) — just to avoid hammering on rapid refreshes
  var cache = CacheService.getScriptCache();
  var cached = cache.get('dashboard_accounts');
  if (cached) {
    Logger.log('[Dashboard] getCachedAccounts: CacheService hit (' + ((Date.now() - start)) + 'ms)');
    return cached;
  }

  var accounts = [];

  // List subfolders directly — no index file needed
  try {
    var root = _getCacheRootFolder();
    var subfolders = root.getFolders();
    while (subfolders.hasNext()) {
      var folder = subfolders.next();
      var name = folder.getName();
      try {
        // Only include accounts that have L2 intelligence
        var metaFiles = folder.getFilesByName('meta.json');
        if (!metaFiles.hasNext()) continue;
        var meta = JSON.parse(metaFiles.next().getBlob().getDataAsString());
        if (!meta.l2GeneratedAt) continue;

        // Read card preview from meta.cardPreview (written by updateCardPreview)
        var preview = meta.cardPreview || {};
        accounts.push({
          companyName:     name,
          generatedAt:     meta.l2GeneratedAt || null,
          pipeline:        meta.l2Pipeline || null,
          industry:        preview.industry || null,
          companyOverview: preview.companyOverview || null,
          acv:             preview.acv || null,
          productCount:    preview.productCount || 0,
          briefUrl:        preview.briefUrl || null,
          fullUrl:         preview.fullUrl || null,
          introText:       preview.introText || null
        });
      } catch (e) {
        Logger.log('[Dashboard] getCachedAccounts: skipping "' + name + '": ' + e.message);
        continue;
      }
    }
  } catch (e) {
    Logger.log('[Dashboard] getCachedAccounts Drive read failed: ' + e.message);
  }

  // Sort by most recently generated first
  accounts.sort(function(a, b) {
    var da = a.generatedAt ? new Date(a.generatedAt).getTime() : 0;
    var db = b.generatedAt ? new Date(b.generatedAt).getTime() : 0;
    return db - da;
  });

  var json = JSON.stringify(accounts);
  // Cache for 2 minutes (120 seconds) — kept short so new accounts appear quickly
  try { cache.put('dashboard_accounts', json, 120); } catch (e) { /* non-fatal */ }
  Logger.log('[Dashboard] getCachedAccounts: ' + accounts.length + ' accounts (' + ((Date.now() - start)) + 'ms)');
  return json;
}

/**
 * Writes card preview summary into meta.json for fast landing page loads.
 * Called after AR generation completes.
 */
function updateCardPreview(companyName) {
  if (!companyName) return;
  var start = Date.now();
  try {
    var folder = _getCompanyFolder(companyName, false);
    if (!folder) return;

    var meta = _readJsonFile(folder, 'meta.json') || {};
    var preview = {};

    // Read summary from intelligence.json
    var intel = _readJsonFile(folder, 'intelligence.json');
    if (intel) {
      if (intel.accountProfile) {
        preview.industry = intel.accountProfile.industry || null;
        var overview = intel.accountProfile.companyOverview || '';
        if (overview) preview.companyOverview = overview.substring(0, 140);
      }
      if (intel.briefing && intel.briefing.introText) {
        preview.introText = intel.briefing.introText.substring(0, 120);
      }
    }

    // Read ACV + product count from research.json
    var research = _readJsonFile(folder, 'research.json');
    if (research && research.data) {
      if (research.data.financial && research.data.financial.acv) {
        preview.acv = research.data.financial.acv;
      }
      if (research.data.activeProducts) {
        preview.productCount = research.data.activeProducts.length;
      }
    }

    // Brief/Full URLs
    try {
      var delivs = getDeliverables(companyName);
      for (var d = 0; d < delivs.length; d++) {
        if (delivs[d].type === 'ar_brief' && delivs[d].url) preview.briefUrl = delivs[d].url;
        if (delivs[d].type === 'ar_full' && delivs[d].url) preview.fullUrl = delivs[d].url;
      }
    } catch (e) { /* non-fatal */ }

    meta.cardPreview = preview;
    _writeJsonFile(folder, 'meta.json', meta);

    // Invalidate CacheService so next landing page load picks up the new data
    try { CacheService.getScriptCache().remove('dashboard_accounts'); } catch (e) { /* non-fatal */ }

    Logger.log('[Dashboard] updateCardPreview for "' + companyName + '" (' + ((Date.now() - start)) + 'ms)');
  } catch (e) {
    Logger.log('[Dashboard] updateCardPreview failed for "' + companyName + '": ' + e.message);
  }
}

/**
 * One-time cleanup: removes index entries (and trashes folders) for accounts
 * that don't have L2 intelligence. Also backfills cardPreview for accounts that do.
 * Run manually from Script Editor.
 */
function cleanupAndBackfill() {
  var index = _readIndex();
  var names = Object.keys(index);
  var kept = 0, removed = 0, backfilled = 0;

  var cleanIndex = {};

  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    try {
      var folder = DriveApp.getFolderById(index[name]);
      var metaFiles = folder.getFilesByName('meta.json');
      var hasL2 = false;

      if (metaFiles.hasNext()) {
        var meta = JSON.parse(metaFiles.next().getBlob().getDataAsString());
        hasL2 = !!meta.l2GeneratedAt;
      }

      if (!hasL2) {
        // No L2 intelligence — trash the folder, skip from new index
        folder.setTrashed(true);
        removed++;
        Logger.log('[Cleanup] Trashed: ' + name);
      } else {
        // Keep in index, backfill card preview
        cleanIndex[name] = index[name];
        kept++;
        try {
          updateCardPreview(name);
          backfilled++;
        } catch (e) {
          Logger.log('[Cleanup] cardPreview failed for "' + name + '": ' + e.message);
        }
      }
    } catch (e) {
      // Folder already gone — just skip
      removed++;
      Logger.log('[Cleanup] Folder missing for "' + name + '": ' + e.message);
    }
  }

  // Rewrite _index.json with only L2 accounts
  var root = _getCacheRootFolder();
  var files = root.getFilesByName('_index.json');
  var content = JSON.stringify(cleanIndex);
  if (files.hasNext()) {
    files.next().setContent(content);
  } else {
    root.createFile('_index.json', content, MimeType.PLAIN_TEXT);
  }

  // Clear cache
  try { CacheService.getScriptCache().remove('dashboard_accounts'); } catch (e) {}

  Logger.log('[Cleanup] Done. Kept: ' + kept + ', Removed: ' + removed + ', Backfilled: ' + backfilled);
}

// ── Get deliverables for an account ────────────────────────────────────

/**
 * Returns deliverables status for a company.
 * Aggregates from Deliverables tab and GVS submissions.
 * @param {string} companyName
 * @returns {Object[]} Array of { type, title, url, createdAt, createdBy }
 */
function getDeliverables(companyName) {
  if (!companyName) return [];
  var deliverables = [];

  // 1. Check Deliverables tab if it exists
  try {
    var ss    = SpreadsheetApp.openById(BOOKSCRUB_SPREADSHEET_ID);
    var sheet = ss.getSheetByName('Deliverables');
    if (sheet && sheet.getLastRow() > 1) {
      var data   = sheet.getDataRange().getValues();
      var target = companyName.toLowerCase();
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][0]).toLowerCase() === target) {
          deliverables.push({
            type:      data[i][1],
            title:     data[i][2],
            url:       data[i][3],
            createdAt: data[i][4],
            createdBy: data[i][5]
          });
        }
      }
    }
  } catch (e) {
    Logger.log('[Dashboard] Deliverables tab read error: ' + e.message);
  }

  // 2. Check GVS submissions as deliverables
  var gvs = getGVSHistory(companyName);
  if (gvs.length > 0) {
    deliverables.push({
      type:      'gvs_value_case',
      title:     'Value Case Assessment',
      url:       null,
      createdAt: gvs[gvs.length - 1].timestamp,
      createdBy: gvs[gvs.length - 1].user
    });
  }

  return deliverables;
}

// ── Generate AR directly (no trigger) ─────────────────────────────────

/**
 * Runs the full AR pipeline directly — no time-based trigger, no job queue.
 * Called via google.script.run from Dashboard.html.
 *
 * google.script.run has a 6-min client-side timeout, but the server-side
 * function continues running to completion regardless. The dashboard polls
 * Drive cache for results, so it doesn't depend on the callback.
 *
 * @param {string} companyName
 * @returns {{ status: string, briefUrl: string, fullUrl: string }}
 */
function generateARDirect(companyName) {
  if (!companyName) throw new Error('Company name required');
  Logger.log('[Dashboard] generateARDirect starting for: ' + companyName);

  var briefUrl = triggerGleanReport(companyName, null, false, '', '');
  var fullUrl = (_lastDocResult && _lastDocResult.fullUrl) || '';

  logToStatusSheet(companyName, false, 'done', briefUrl, '', fullUrl);
  Logger.log('[Dashboard] generateARDirect complete. Brief: ' + briefUrl);

  return { status: 'done', briefUrl: briefUrl, fullUrl: fullUrl };
}

// ── Log a deliverable ──────────────────────────────────────────────────

/**
 * Writes a deliverable record to the Deliverables tab.
 * Called after AR or GVS generates a deliverable.
 * @param {string} companyName
 * @param {string} type       e.g. 'ar_brief', 'ar_full', 'gvs_value_case'
 * @param {string} title
 * @param {string} url
 * @param {string} createdBy
 */
function logDeliverable(companyName, type, title, url, createdBy) {
  var ss    = SpreadsheetApp.openById(BOOKSCRUB_SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Deliverables');
  if (!sheet) {
    sheet = ss.insertSheet('Deliverables');
    sheet.appendRow(['companyName', 'type', 'title', 'url', 'createdAt', 'createdBy']);
    sheet.setFrozenRows(1);
  }

  // Upsert by companyName + type
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === companyName.toLowerCase() &&
        String(data[i][1]) === type) {
      sheet.getRange(i + 1, 1, 1, 6).setValues([[companyName, type, title, url || '', new Date(), createdBy || '']]);
      return;
    }
  }
  sheet.appendRow([companyName, type, title, url || '', new Date(), createdBy || '']);
}

// ── Get GVS web app URL ────────────────────────────────────────────────

/**
 * Returns the GVS web app URL for deep-linking.
 * @returns {string}
 */
function getGVSUrl() {
  return PropertiesService.getScriptProperties().getProperty('GVS_URL') || '';
}

// ── Get current user email ─────────────────────────────────────────────

/**
 * Returns the current user's email (for avatar initials).
 * @returns {string}
 */
function getUserEmail() {
  try { return Session.getActiveUser().getEmail(); }
  catch (e) { return ''; }
}

// ── Recent Activity (live Glean call) ──────────────────────────────────

/**
 * Returns recent activity feed for a company via Glean agent Branch 7.
 * Searches web, Slack, and Drive for activity in the last 7 days.
 * No caching — always live.
 * @param {string} companyName
 * @returns {string} JSON string of { recentActivity: [...] }
 */
function getRecentActivity(companyName) {
  if (!companyName) return JSON.stringify({ recentActivity: [] });

  // Get industry context from cached research or bookscrub
  var industry = '';
  try {
    var cached = getResearchCache(companyName);
    if (cached && cached.research && cached.research.data &&
        cached.research.data.context && cached.research.data.context.industry) {
      industry = cached.research.data.context.industry;
    }
    if (!industry) {
      var data = getCompanyData(companyName);
      if (data && data.context && data.context.industry) {
        industry = data.context.industry;
      }
    }
  } catch (e) {
    Logger.log('[Dashboard] getRecentActivity — industry lookup failed (non-fatal): ' + e.message);
  }

  // Get renewal + products context for relevance scoring
  var renewalMonths = '';
  var products = '';
  try {
    var cached = getResearchCache(companyName);
    if (cached && cached.research && cached.research.data) {
      var rd = cached.research.data;
      if (rd.contract && rd.contract.monthsLeft != null) renewalMonths = String(rd.contract.monthsLeft);
      if (rd.activeProducts && rd.activeProducts.length > 0) {
        products = rd.activeProducts.map(function(p) { return typeof p === 'string' ? p : (p.name || ''); }).join(', ');
      }
    }
  } catch (e) {
    Logger.log('[Dashboard] getRecentActivity — renewal/products lookup failed (non-fatal): ' + e.message);
  }

  // Build message and call Glean
  var msg = 'STEP: recent-activity\n\nCOMPANY: ' + companyName + '\nINDUSTRY: ' + (industry || 'Unknown') +
    '\nRENEWAL_MONTHS: ' + (renewalMonths || 'Unknown') + '\nPRODUCTS: ' + (products || 'Unknown');

  try {
    var responseText = _postToGleanStep('recent-activity', msg);
    var parsed = _parseStepJson(responseText, 'recent-activity');
    var items = parsed.recentActivity || [];
    Logger.log('[Dashboard] getRecentActivity for "' + companyName + '": ' + items.length + ' items');
    return JSON.stringify({ recentActivity: items });
  } catch (e) {
    Logger.log('[Dashboard] getRecentActivity failed for "' + companyName + '": ' + e.message);
    return JSON.stringify({ recentActivity: [] });
  }
}

// ── Similar Customers (live Glean call) ───────────────────────────────

/**
 * Returns similar Docusign customers via Glean agent Branch 6.
 * Searches for comparable customers in the same/adjacent industries.
 * No caching — always live.
 * @param {string} companyName
 * @returns {string} JSON string of { similarCustomers: [...] }
 */
function getSimilarCustomers(companyName) {
  if (!companyName) return JSON.stringify({ similarCustomers: [] });

  // ── Check Drive cache first ──
  try {
    var folder = _getCompanyFolder(companyName, false);
    if (folder) {
      var cached = _readJsonFile(folder, 'similar-customers.json');
      if (cached && cached.similarCustomers) {
        Logger.log('[Dashboard] getSimilarCustomers CACHE HIT for "' + companyName + '" — ' + cached.similarCustomers.length + ' customers');
        return JSON.stringify(cached);
      }
    }
  } catch (e) {
    Logger.log('[Dashboard] getSimilarCustomers cache read failed (non-fatal): ' + e.message);
  }

  // ── Cache miss — call Glean ──
  var industry = '';
  var products = '';
  try {
    var researchCache = getResearchCache(companyName);
    if (researchCache && researchCache.research && researchCache.research.data) {
      var d = researchCache.research.data;
      if (d.context && d.context.industry) industry = d.context.industry;
      if (d.activeProducts && d.activeProducts.length > 0) {
        products = d.activeProducts.map(function(p) { return typeof p === 'string' ? p : (p.name || ''); }).join(', ');
      }
    }
    if (!industry || !products) {
      var data = getCompanyData(companyName);
      if (data) {
        if (!industry && data.context && data.context.industry) industry = data.context.industry;
        if (!products && data.activeProducts && data.activeProducts.length > 0) {
          products = data.activeProducts.map(function(p) { return typeof p === 'string' ? p : (p.name || ''); }).join(', ');
        }
      }
    }
  } catch (e) {
    Logger.log('[Dashboard] getSimilarCustomers — context lookup failed (non-fatal): ' + e.message);
  }

  var msg = 'STEP: similar-customers\n\nCOMPANY: ' + companyName +
    '\nINDUSTRY: ' + (industry || 'Unknown') +
    '\nPRODUCTS: ' + (products || 'Unknown');

  try {
    var responseText = _postToGleanStep('similar-customers', msg);
    var parsed = _parseStepJson(responseText, 'similar-customers');
    var items = parsed.similarCustomers || [];
    Logger.log('[Dashboard] getSimilarCustomers for "' + companyName + '": ' + items.length + ' customers');

    // Write to Drive cache
    var result = { similarCustomers: items, generatedAt: new Date().toISOString() };
    try {
      var writeFolder = _getCompanyFolder(companyName, true);
      _writeJsonFile(writeFolder, 'similar-customers.json', result);
      Logger.log('[Dashboard] getSimilarCustomers cached for "' + companyName + '"');
    } catch (we) {
      Logger.log('[Dashboard] getSimilarCustomers cache write failed (non-fatal): ' + we.message);
    }

    return JSON.stringify(result);
  } catch (e) {
    Logger.log('[Dashboard] getSimilarCustomers failed for "' + companyName + '": ' + e.message);
    return JSON.stringify({ similarCustomers: [] });
  }
}

// ── GVS Results Cache Reader ──────────────────────────────────────────

/**
 * Returns cached GVS results for a company (gvs-results.json from Drive cache).
 * @param {string} companyName
 * @returns {string|null} JSON string or null if no cache exists
 */
function getGVSResults(companyName) {
  if (!companyName) return null;
  try {
    var folder = _getCompanyFolder(companyName, false);
    if (!folder) return null;
    var gvsFile = folder.getFilesByName('gvs-results.json');
    if (!gvsFile.hasNext()) return null;
    var content = gvsFile.next().getBlob().getDataAsString();
    Logger.log('[Dashboard] getGVSResults for "' + companyName + '": ' + content.length + ' chars');
    return content;
  } catch (e) {
    Logger.log('[Dashboard] getGVSResults failed for "' + companyName + '": ' + e.message);
    return null;
  }
}

// ── Check which accounts have cached data ────────────────────────────

/**
 * Checks which company names have AR cache folders (for similar customer cross-linking).
 * @param {string[]} names Array of company names to check
 * @returns {Object} Map of { companyName: true } for those that have cache
 */
function checkCachedAccounts(names) {
  if (!names || !names.length) return {};
  var result = {};
  try {
    var root = _getCacheRootFolder();
    for (var i = 0; i < names.length; i++) {
      var folders = root.getFoldersByName(names[i]);
      if (folders.hasNext()) {
        result[names[i]] = true;
      }
    }
  } catch (e) {
    Logger.log('[Dashboard] checkCachedAccounts failed: ' + e.message);
  }
  return result;
}

// ── Helpers ────────────────────────────────────────────────────────────

