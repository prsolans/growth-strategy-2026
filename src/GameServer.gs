/**
 * GBIS Game Experience — Server-side functions for the rep coaching game.
 *
 * All game functions live here alongside AR generation — no inter-project
 * communication needed. generateAccountResearchDoc() is called directly.
 *
 * Tabs added to the Bookscrub sheet:
 *   Questions   — question bank
 *   Leaderboard — score history
 *   Config      — game tuning values
 *
 * Setup (run once):
 *   Run seedGameTabs() to create and populate the three tabs.
 */

// ── Sheet tab names ────────────────────────────────────────────────────────

var GAME_SHEET_QUESTIONS   = 'Questions';
var GAME_SHEET_LEADERBOARD = 'Leaderboard';
var GAME_SHEET_CONFIG      = 'Config';

// ── doGet ─────────────────────────────────────────────────────────────────

/**
 * Serves the game HTML page.
 * URL params: ?user=Jane+Smith&email=jsmith@docusign.com
 */
function doGet(e) {
  var view = (e && e.parameter && e.parameter.view) || 'game';
  if (view === 'dashboard') {
    return HtmlService.createTemplateFromFile('Dashboard').evaluate()
      .setTitle('Command Center — Genius Bar');
  }
  return HtmlService
    .createHtmlOutputFromFile('Game')
    .setTitle('Genius Bar — Account Research');
}

/** Include an HTML partial (used by <?!= include('file') ?> in templates). */
function include(filename) {
  return HtmlService.createTemplateFromFile(filename).getRawContent();
}

// ── Account name autocomplete ─────────────────────────────────────────────

var PROP_NAME_CACHE_ID  = 'COMPANY_NAME_CACHE_ID';
var NAME_CACHE_LETTERS  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0';

/**
 * Reads the pre-built cache spreadsheet and returns the names for a given
 * first letter. Falls back to scanning the bookscrub sheet if the cache
 * hasn't been built yet.
 *
 * @param {string} letter  Single uppercase letter A–Z, or '0' for digits.
 * @returns {string[]}
 */
function getCompanyNameChunk(letter) {
  var cacheId = PropertiesService.getScriptProperties().getProperty(PROP_NAME_CACHE_ID);
  if (cacheId) {
    try {
      var cacheSheet = SpreadsheetApp.openById(cacheId).getSheetByName(letter);
      if (cacheSheet && cacheSheet.getLastRow() > 1) {
        var vals = cacheSheet.getRange(2, 1, cacheSheet.getLastRow() - 1, 1).getValues();
        return vals.map(function(r) { return String(r[0]); }).filter(Boolean);
      }
    } catch(e) {
      Logger.log('[getCompanyNameChunk] Cache read failed, falling back: ' + e.message);
    }
  }
  // Fallback: scan bookscrub directly (slow but safe)
  return _getCompanyNameChunkFromBookscrub(letter);
}

/**
 * Builds (or rebuilds) the company name cache spreadsheet.
 * Creates the spreadsheet on first run and stores its ID in Script Properties.
 * Each tab is named A–Z or 0, containing deduplicated sorted names for that prefix.
 * Safe to re-run; overwrites existing tab data.
 */
function buildCompanyNameCache() {
  var props   = PropertiesService.getScriptProperties();
  var cacheId = props.getProperty(PROP_NAME_CACHE_ID);
  var ss;

  if (cacheId) {
    try { ss = SpreadsheetApp.openById(cacheId); }
    catch(e) { cacheId = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create('Account Research — Company Name Cache');
    props.setProperty(PROP_NAME_CACHE_ID, ss.getId());
    Logger.log('[buildCompanyNameCache] Created new cache sheet: ' + ss.getId());
  }

  // Read all names from bookscrub once
  var bookscrub = SpreadsheetApp.openById(BOOKSCRUB_SPREADSHEET_ID).getSheetByName(BOOKSCRUB_SHEET_NAME);
  if (!bookscrub) throw new Error('Bookscrub sheet not found');
  var headers = bookscrub.getRange(1, 1, 1, bookscrub.getLastColumn()).getValues()[0];
  var colIdx  = headers.indexOf(COMPANY_NAME_COL);
  if (colIdx < 0) throw new Error('COMPANY_NAME column not found');
  var lastRow = bookscrub.getLastRow();
  if (lastRow < 2) return;
  var raw = bookscrub.getRange(2, colIdx + 1, lastRow - 1, 1).getValues();

  // Bucket into chunks
  var chunks = {};
  NAME_CACHE_LETTERS.split('').forEach(function(l) { chunks[l] = {}; });
  raw.forEach(function(row) {
    var name  = String(row[0]).trim();
    if (!name) return;
    var first = name.charAt(0).toUpperCase();
    var key   = (first >= '0' && first <= '9') ? '0' : first;
    if (chunks[key]) chunks[key][name] = true;
  });

  // Write each chunk to its tab
  NAME_CACHE_LETTERS.split('').forEach(function(letter) {
    var names = Object.keys(chunks[letter]).sort();
    var tab   = ss.getSheetByName(letter);
    if (!tab) {
      tab = ss.insertSheet(letter);
    } else {
      tab.clearContents();
    }
    tab.getRange(1, 1).setValue('name');
    if (names.length) {
      tab.getRange(2, 1, names.length, 1).setValues(names.map(function(n) { return [n]; }));
    }
  });

  // Remove the default blank Sheet1 if still present
  var blank = ss.getSheetByName('Sheet1');
  if (blank && ss.getSheets().length > 1) ss.deleteSheet(blank);

  Logger.log('[buildCompanyNameCache] Done. ' + lastRow + ' rows bucketed into ' +
    NAME_CACHE_LETTERS.length + ' tabs. Sheet ID: ' + ss.getId());
}

/**
 * Fallback: scan bookscrub directly (used when cache hasn't been built).
 */
function _getCompanyNameChunkFromBookscrub(letter) {
  var ss    = SpreadsheetApp.openById(BOOKSCRUB_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(BOOKSCRUB_SHEET_NAME);
  if (!sheet) return [];
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colIdx  = headers.indexOf(COMPANY_NAME_COL);
  if (colIdx < 0) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values  = sheet.getRange(2, colIdx + 1, lastRow - 1, 1).getValues();
  var isDigit = (letter === '0');
  var seen    = {};
  var names   = [];
  values.forEach(function(row) {
    var name  = String(row[0]).trim();
    if (!name) return;
    var first = name.charAt(0).toUpperCase();
    var match = isDigit ? (first >= '0' && first <= '9') : (first === letter);
    if (match && !seen[name]) { seen[name] = true; names.push(name); }
  });
  return names.sort();
}

// ── AR trigger (direct call — same project) ───────────────────────────────

/**
 * Kicks off AR generation via a one-second time trigger.
 * Returns { jobId } immediately — does not block.
 */
function triggerAR(companyName, email) {
  var jobId = Utilities.getUuid();

  // Write pending row to Jobs sheet so checkJobStatus can find it
  _gameGetJobsSheet().appendRow([jobId, companyName, email, 'running', '', new Date(), '']);

  // Store payload for the trigger handler
  PropertiesService.getScriptProperties().setProperty(
    'GAME_PENDING_JOB',
    JSON.stringify({ jobId: jobId, companyName: companyName, email: email })
  );

  ScriptApp.newTrigger('runGameARJob').timeBased().after(1000).create();

  Logger.log('[Game] Job queued: ' + jobId + ' for ' + companyName);
  return { jobId: jobId };
}

/**
 * Trigger handler — runs AR generation and updates the Jobs row.
 */
function runGameARJob() {
  _deleteTrigger('runGameARJob');

  var raw = PropertiesService.getScriptProperties().getProperty('GAME_PENDING_JOB');
  if (!raw) { Logger.log('[runGameARJob] No pending job.'); return; }

  var job;
  try { job = JSON.parse(raw); } catch(e) { Logger.log('[runGameARJob] Parse error.'); return; }
  PropertiesService.getScriptProperties().deleteProperty('GAME_PENDING_JOB');

  try {
    var docUrl;
    if (job.isGtm) {
      Logger.log('[runGameARJob] GTM group: ' + job.gtmGroupId);
      var groupData = getGtmGroupData(job.gtmGroupId);
      docUrl = triggerGleanReport(groupData.identity.name, groupData, false, job.email, '');
    } else {
      Logger.log('[runGameARJob] Starting: ' + job.companyName + (job.isProspect ? ' [prospect]' : ''));
      docUrl = triggerGleanReport(job.companyName, null, !!job.isProspect, job.email, '');
    }
    // docUrl is the brief URL; stash both for the job row
    var fullUrl = (_lastDocResult && _lastDocResult.fullUrl) || '';
    _gameUpdateJobRow(job.jobId, 'done', docUrl, fullUrl);
    Logger.log('[runGameARJob] Done: ' + docUrl);
  } catch(err) {
    Logger.log('[runGameARJob] FAILED: ' + err.message);
    _gameUpdateJobRow(job.jobId, 'error', err.message);
  }
}

/**
 * Kicks off AR generation for a prospect (no bookscrub data).
 * @param {string} companyName
 * @param {string} email
 * @returns {{ jobId: string }}
 */
function triggerProspectAR(companyName, email) {
  var jobId = Utilities.getUuid();
  _gameGetJobsSheet().appendRow([jobId, companyName + ' [prospect]', email, 'running', '', new Date(), '']);
  PropertiesService.getScriptProperties().setProperty(
    'GAME_PENDING_JOB',
    JSON.stringify({ jobId: jobId, companyName: companyName, email: email, isProspect: true })
  );
  ScriptApp.newTrigger('runGameARJob').timeBased().after(1000).create();
  Logger.log('[Game] Prospect job queued: ' + jobId + ' for ' + companyName);
  return { jobId: jobId };
}

/**
 * Kicks off AR generation for a GTM group.
 * @param {string} gtmGroupId  Salesforce GTM Group ID
 * @param {string} email
 * @returns {{ jobId: string }}
 */
function triggerGtmGroupAR(gtmGroupId, email) {
  var jobId = Utilities.getUuid();
  _gameGetJobsSheet().appendRow([jobId, 'GTM: ' + gtmGroupId, email, 'running', '', new Date(), '']);
  PropertiesService.getScriptProperties().setProperty(
    'GAME_PENDING_JOB',
    JSON.stringify({ jobId: jobId, gtmGroupId: gtmGroupId, email: email, isGtm: true })
  );
  ScriptApp.newTrigger('runGameARJob').timeBased().after(1000).create();
  Logger.log('[Game] GTM group job queued: ' + jobId + ' for ' + gtmGroupId);
  return { jobId: jobId };
}

// ── Star system ───────────────────────────────────────────────────────────

var GAME_SHEET_STARS = 'Stars';

/**
 * Returns the lifetime star count for a user (by email).
 * @param {string} email
 * @returns {number}
 */
function getStarCount(email) {
  if (!email) return 0;
  var sheet = _getOrCreateStarsSheet();
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === email.toLowerCase()) {
      return Number(data[i][2]) || 0;
    }
  }
  return 0;
}

/**
 * Increments the star count for a user. Creates a row if the user is new.
 * @param {string} email
 * @param {string} name
 */
function addStar(email, name) {
  if (!email) return;
  var sheet = _getOrCreateStarsSheet();
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === email.toLowerCase()) {
      var current = Number(data[i][2]) || 0;
      sheet.getRange(i + 1, 3).setValue(current + 1);
      sheet.getRange(i + 1, 4).setValue(new Date());
      return;
    }
  }
  // New user
  sheet.appendRow([email, name || '', 1, new Date()]);
}

/**
 * Gets or creates the Stars sheet in the bookscrub spreadsheet.
 */
function _getOrCreateStarsSheet() {
  var ss    = SpreadsheetApp.openById(BOOKSCRUB_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(GAME_SHEET_STARS);
  if (!sheet) {
    sheet = ss.insertSheet(GAME_SHEET_STARS);
    sheet.appendRow(['email', 'name', 'total_stars', 'last_updated']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * Reads job status from the Jobs sheet.
 */
function checkJobStatus(jobId) {
  var sheet = _gameGetJobsSheet();
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(jobId)) {
      return {
        status:  data[i][3] || 'unknown',
        docUrl:  data[i][4] || '',   // brief URL
        fullUrl: data[i][7] || ''    // full report URL (col 8, 0-indexed = 7)
      };
    }
  }
  return { status: 'unknown', docUrl: '', fullUrl: '' };
}

// ── Questions ──────────────────────────────────────────────────────────────

function getQuestions(n) {
  var sheet = _gameGetSheet(GAME_SHEET_QUESTIONS);
  var data  = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  var rows = data.slice(1).filter(function(r) { return r[0]; });
  rows = _gameShuffle(rows);

  return rows.slice(0, Math.min(n || 10, rows.length)).map(function(r) {
    var labels = ['A','B','C','D'];
    var vals   = [r[1], r[2], r[3], r[4]];
    var correctVal = vals[labels.indexOf(String(r[5]).trim().toUpperCase())];

    // Shuffle options so the correct answer isn't always in the same position
    for (var i = 3; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = vals[i]; vals[i] = vals[j]; vals[j] = tmp;
    }

    return {
      question:   r[0],
      a:          vals[0],
      b:          vals[1],
      c:          vals[2],
      d:          vals[3],
      answer:     labels[vals.indexOf(correctVal)],
      category:   r[6] || '',
      difficulty: r[7] || ''
    };
  });
}

// ── Leaderboard ────────────────────────────────────────────────────────────

function submitScore(payload) {
  _gameGetSheet(GAME_SHEET_LEADERBOARD).appendRow([
    new Date(),
    payload.name         || '',
    payload.email        || '',
    payload.score        || 0,
    payload.correct      || 0,
    payload.total        || 0,
    payload.company      || '',
    payload.durationSecs || 0,
    payload.diveCount    || 0,
    payload.cardsRead    || 0
  ]);
}

function getLeaderboard() {
  var cfg  = getGameConfig();
  var topN = parseInt(cfg.leaderboard_top_n || '10', 10);

  var sheet = _gameGetSheet(GAME_SHEET_LEADERBOARD);
  var data  = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  var rows = data.slice(1).filter(function(r) { return r[1]; });
  rows.sort(function(a, b) { return Number(b[3]) - Number(a[3]); });

  return rows.slice(0, topN).map(function(r, i) {
    return { rank: i + 1, name: r[1], score: r[3], correct: r[4], total: r[5] };
  });
}

// ── Config ─────────────────────────────────────────────────────────────────

function getGameConfig() {
  var sheet = _gameGetSheet(GAME_SHEET_CONFIG);
  var data  = sheet.getDataRange().getValues();
  var cfg   = {};
  for (var i = 0; i < data.length; i++) {
    var key = String(data[i][0]).trim();
    if (key) cfg[key] = data[i][1];
  }
  return cfg;
}

// ── Sheet helpers ──────────────────────────────────────────────────────────

function _gameGetSheet(name) {
  var ss    = SpreadsheetApp.openById(BOOKSCRUB_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Sheet tab "' + name + '" not found — run seedGameTabs() first.');
  return sheet;
}

function _gameGetJobsSheet() {
  var ss    = SpreadsheetApp.openById(BOOKSCRUB_SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Jobs');
  if (!sheet) {
    sheet = ss.insertSheet('Jobs');
    sheet.appendRow(['jobId', 'companyName', 'email', 'status', 'docUrl', 'createdAt', 'completedAt']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function _gameUpdateJobRow(jobId, status, docUrl, fullUrl) {
  var sheet = _gameGetJobsSheet();
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(jobId)) {
      sheet.getRange(i + 1, 4).setValue(status);
      sheet.getRange(i + 1, 5).setValue(docUrl || '');   // brief URL
      sheet.getRange(i + 1, 7).setValue(new Date());
      if (fullUrl) {
        sheet.getRange(i + 1, 8).setValue(fullUrl);      // full report URL
      }
      return;
    }
  }
}

function _deleteTrigger(functionName) {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === functionName) ScriptApp.deleteTrigger(t);
  });
}

function _gameShuffle(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

// ── One-time setup ─────────────────────────────────────────────────────────

/**
 * Creates Questions, Leaderboard, and Config tabs in the Bookscrub sheet
 * and seeds them with default data. Run once from the AR Apps Script editor.
 */
function seedGameTabs() {
  var ss = SpreadsheetApp.openById(BOOKSCRUB_SPREADSHEET_ID);

  _seedTab(ss, GAME_SHEET_LEADERBOARD,
    ['Timestamp', 'Name', 'Email', 'Score', 'Correct', 'Total', 'Company', 'DurationSecs'], []);

  _seedTab(ss, GAME_SHEET_CONFIG,
    ['Key', 'Value'], [
      ['question_timer_seconds', 15],
      ['points_per_correct',     10],
      ['speed_bonus_max',         5],
      ['leaderboard_top_n',      10]
    ]);

  _seedQuestions(ss);

  Logger.log('seedGameTabs() complete.');
}

function _seedTab(ss, name, headers, rows) {
  if (ss.getSheetByName(name)) { Logger.log('Tab already exists: ' + name); return; }
  var sheet = ss.insertSheet(name);
  var hRange = sheet.getRange(1, 1, 1, headers.length);
  hRange.setValues([headers]);
  hRange.setFontWeight('bold');
  hRange.setBackground('#1B0B3B');
  hRange.setFontColor('#FFFFFF');
  sheet.setFrozenRows(1);
  if (rows.length) sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

function _seedQuestions(ss) {
  if (ss.getSheetByName(GAME_SHEET_QUESTIONS)) { Logger.log('Questions tab already exists.'); return; }
  var sheet = ss.insertSheet(GAME_SHEET_QUESTIONS);
  var headers = ['Question', 'A', 'B', 'C', 'D', 'Answer', 'Category', 'Difficulty'];
  var hRange = sheet.getRange(1, 1, 1, headers.length);
  hRange.setValues([headers]);
  hRange.setFontWeight('bold');
  hRange.setBackground('#1B0B3B');
  hRange.setFontColor('#FFFFFF');
  sheet.setFrozenRows(1);

  var Q = [
    ["A rep says their AE spends most of the day chasing signatures and manually tracking contract status. Which Docusign capability directly addresses this pain?","Intelligent Insights reporting","Agreement Actions for automated workflows","Contract Lifecycle Management","Notary for remote notarization","B","Discovery","Medium"],
    ["During discovery, your prospect mentions that their legal team reviews every contract manually, creating multi-week delays. What is the best first question to ask?","How many contracts do you process per month?","What does a one-week delay in a contract cost your business in revenue?","Have you evaluated any CLM vendors?","Do you use Salesforce?","B","Discovery","Medium"],
    ["Which symptom most strongly signals that a customer is a candidate for Docusign IAM solutions?","They send high volumes of NDAs","Their employees struggle to remember which vendor systems require separate logins","Contracts are approved by a single decision-maker","They have more than 1,000 employees","B","Discovery","Hard"],
    ["An AE hears: 'Our onboarding process requires HR, Legal, and Finance to each sign off in a specific order.' What Docusign capability is the strongest fit?","Bulk Send","PowerForms","Sequential signing workflows in eSignature","Notary","C","Discovery","Easy"],
    ["Which pain statement best indicates an opportunity for Docusign Agreement Analytics?","We sign too many contracts and need to slow down","We can't easily find or extract key terms from our existing contract library","Our sales cycle is too long","We don't have enough storage for our documents","B","Discovery","Medium"],
    ["A prospect says their field reps spend time on paperwork instead of selling. According to Docusign research, approximately how much of a sales rep's time is spent on non-selling activities?","20%","35%","50%","65%","D","Discovery","Hard"],
    ["Docusign CLM primarily addresses which stage of the agreement process?","Signature and notarization","Pre-signature authoring, negotiation, and post-signature obligation tracking","Identity verification for high-risk signers","Electronic notarization for real estate","B","Product Knowledge","Medium"],
    ["What differentiates Docusign IAM from a standard eSignature product?","It supports more file formats","It orchestrates identity, workflow, and agreement data across the entire agreement lifecycle","It is cheaper for small businesses","It integrates only with Salesforce","B","Product Knowledge","Medium"],
    ["A customer wants to send the same contract to 500 recipients simultaneously with individual personalisation. Which Docusign feature handles this?","Sequential Routing","Bulk Send","PowerForms","Agreement Actions","B","Product Knowledge","Easy"],
    ["Docusign Notary is best suited for which customer scenario?","A company that wants to automate contract renewals","An organization that requires a legally valid notarization conducted remotely over video","A business that needs to extract data from scanned PDFs","A team that wants to track who opened an email","B","Product Knowledge","Easy"],
    ["Which Docusign product uses AI to identify risky or unusual clauses in a large contract library?","eSignature Advanced","CLM+","Agreement Analytics / AI Contract Analysis","Identify","C","Product Knowledge","Hard"],
    ["Docusign's integration with Salesforce primarily provides value by:","Replacing Salesforce CPQ entirely","Letting reps send, track, and receive signed agreements without leaving Salesforce","Syncing email threads into Docusign","Generating Salesforce Opportunity records automatically","B","Product Knowledge","Easy"],
    ["What is the main purpose of Docusign PowerForms?","Sending bulk agreements to thousands of recipients","Generating self-service, on-demand signing links that don't require a sender to initiate each time","Creating legally binding electronic notarizations","Extracting structured data from signed PDFs","B","Product Knowledge","Medium"],
    ["Docusign Identify (ID Verification) is most relevant when:","A customer wants to reduce the number of signature fields on a contract","The signer's identity must be verified with a government-issued ID before signing","A large batch of documents needs to be sent simultaneously","An organization wants AI to summarise contract risk","B","Product Knowledge","Medium"],
    ["According to Docusign research, what percentage of deals are lost or delayed due to friction in the contracting process?","5%","12%","20%","30%","C","Value Drivers","Hard"],
    ["Which statistic best supports the ROI case for automating contract workflows?","Docusign has over 1 million customers worldwide","Manual contract processes cost organisations an average of $2K-$5K per contract in staff time","eSignature reduces paper usage by 80%","Docusign integrates with over 400 apps","B","Value Drivers","Medium"],
    ["When building a value case with a CFO, which metric is most compelling for justifying Docusign investment?","Number of signature fields eliminated","Days-Sales-Outstanding (DSO) reduction from faster contract completion","Number of supported file formats","Uptime SLA percentage","B","Value Drivers","Medium"],
    ["A customer's legal team spends 4 hours reviewing each contract. Docusign CLM reduces this by 60%. They process 200 contracts/month at $75/hour fully-loaded. What is the monthly savings?","$18,000","$36,000","$60,000","$9,000","B","Value Drivers","Hard"],
    ["Which value driver is most relevant when selling to a VP of Sales?","Reduced IT ticket volume","Faster deal cycles and higher win rates from removing contracting friction","Lower paper and printing costs","Improved audit trail for compliance teams","B","Value Drivers","Medium"],
    ["Docusign's Why Change Map highlights that inefficient agreement processes directly impact which business outcomes?","Server costs and infrastructure spend","Revenue velocity, employee experience, and customer experience simultaneously","Headcount ratios in legal departments","Number of software vendors required","B","Value Drivers","Hard"],
    ["A mid-market insurance company has 50 agents collecting signatures on tablets in the field, often without internet. What is the best Docusign capability to recommend?","Bulk Send","PowerForms with offline signing capability","Docusign Notary","Agreement Analytics","B","Customer Scenarios","Hard"],
    ["A fast-growing SaaS company needs contracts signed by customers who may be resistant to new tools. Which Docusign strength should you lead with?","Number of API endpoints available","The simplest, most consumer-friendly signing experience in the market (no account required)","The length of the audit trail","AI contract analysis capabilities","B","Customer Scenarios","Easy"],
    ["A hospital network must verify the identity of vendors before they sign supplier agreements, per compliance requirements. Which product addresses this?","CLM for obligation tracking","Docusign Identify / ID Verification","Bulk Send for volume efficiency","eSignature Basic tier","B","Customer Scenarios","Medium"],
    ["A regional bank generates 3,000 loan documents per month. Their compliance team needs a complete audit trail. What Docusign feature supports this?","PowerForms","Docusign Certificate of Completion and full envelope history","Bulk Send","Notary","B","Customer Scenarios","Medium"],
    ["A global manufacturer's procurement team manually copies contract data into their ERP after each signing — 2 hours per contract. What Docusign capability eliminates this?","Sequential routing with multiple signers","Agreement Actions / post-sign data extraction to connected systems","Docusign Notary for high-value contracts","ID Verification for vendor identity","B","Customer Scenarios","Hard"]
  ];

  sheet.getRange(2, 1, Q.length, Q[0].length).setValues(Q);
  sheet.setColumnWidth(1, 480);
  [2,3,4,5].forEach(function(c) { sheet.setColumnWidth(c, 220); });
}
