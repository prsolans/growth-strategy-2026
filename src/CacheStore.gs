/**
 * CacheStore — Drive-based intelligence cache for the 3-layer architecture.
 *
 * Storage layout:
 *   📁 {INTELLIGENCE_CACHE_FOLDER_ID}/
 *     _index.json           ← company name → folder ID (O(1) lookups)
 *     📁 Acme Corp/
 *       research.json       ← L1: bookscrub + enrichment + Glean + productSignals
 *       intelligence.json   ← L2: 7 synthesized objects
 *       meta.json           ← timestamps, staleness, pipeline version
 */

// ── Root folder ───────────────────────────────────────────────────────

/**
 * Returns the Drive folder for the intelligence cache.
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function _getCacheRootFolder() {
  var folderId = PropertiesService.getScriptProperties().getProperty(PROP_CACHE_FOLDER);
  if (!folderId) throw new Error('[CacheStore] INTELLIGENCE_CACHE_FOLDER_ID not set');
  return DriveApp.getFolderById(folderId);
}

// ── Index (O(1) company lookups) ──────────────────────────────────────

/**
 * Reads _index.json from the root folder.
 * @returns {Object} { companyName: folderId, ... }
 */
function _readIndex() {
  var root = _getCacheRootFolder();
  var files = root.getFilesByName('_index.json');
  if (!files.hasNext()) return {};
  try {
    return JSON.parse(files.next().getBlob().getDataAsString());
  } catch (e) {
    Logger.log('[CacheStore] WARN _index.json parse error: ' + e.message);
    return {};
  }
}

/**
 * Adds or updates an entry in _index.json.
 * @param {string} companyName
 * @param {string} folderId
 */
function _updateIndex(companyName, folderId) {
  var root = _getCacheRootFolder();
  var index = _readIndex();
  index[companyName] = folderId;
  var files = root.getFilesByName('_index.json');
  var content = JSON.stringify(index);
  if (files.hasNext()) {
    files.next().setContent(content);
  } else {
    root.createFile('_index.json', content, MimeType.PLAIN_TEXT);
  }
  Logger.log('[CacheStore] INDEX updated: ' + Object.keys(index).length + ' companies');
}

/**
 * Removes a company from the cache: trashes the folder and removes from _index.json.
 * @param {string} companyName
 * @returns {boolean} true if removed
 */
function removeCompanyCache(companyName) {
  var root = _getCacheRootFolder();
  var index = _readIndex();
  if (index[companyName]) {
    try {
      DriveApp.getFolderById(index[companyName]).setTrashed(true);
    } catch (e) {
      Logger.log('[CacheStore] WARN folder trash failed for "' + companyName + '": ' + e.message);
    }
    delete index[companyName];
    var files = root.getFilesByName('_index.json');
    var content = JSON.stringify(index);
    if (files.hasNext()) {
      files.next().setContent(content);
    }
    Logger.log('[CacheStore] Removed "' + companyName + '" — ' + Object.keys(index).length + ' companies remain');
    return true;
  }
  return false;
}

// ── Company folder ────────────────────────────────────────────────────

/**
 * Finds or creates a company subfolder. Uses _index.json for O(1) lookup.
 * @param {string} companyName
 * @param {boolean} create  If true, creates the folder if it doesn't exist
 * @returns {GoogleAppsScript.Drive.Folder|null}
 */
function _getCompanyFolder(companyName, create) {
  var index = _readIndex();
  if (index[companyName]) {
    try {
      return DriveApp.getFolderById(index[companyName]);
    } catch (e) {
      Logger.log('[CacheStore] WARN indexed folder not found for "' + companyName + '", re-scanning');
    }
  }
  // Fallback: scan by name
  var root = _getCacheRootFolder();
  var folders = root.getFoldersByName(companyName);
  if (folders.hasNext()) {
    var folder = folders.next();
    _updateIndex(companyName, folder.getId());
    return folder;
  }
  if (!create) return null;
  var newFolder = root.createFolder(companyName);
  _updateIndex(companyName, newFolder.getId());
  return newFolder;
}

// ── JSON file read/write ──────────────────────────────────────────────

/**
 * Reads and parses a JSON file from a Drive folder.
 * @param {GoogleAppsScript.Drive.Folder} folder
 * @param {string} fileName
 * @returns {Object|null}
 */
function _readJsonFile(folder, fileName) {
  var files = folder.getFilesByName(fileName);
  if (!files.hasNext()) return null;
  try {
    var content = files.next().getBlob().getDataAsString();
    return JSON.parse(content);
  } catch (e) {
    Logger.log('[CacheStore] WARN parse error for ' + fileName + ': ' + e.message);
    return null;
  }
}

/**
 * Creates or overwrites a JSON file in a Drive folder.
 * @param {GoogleAppsScript.Drive.Folder} folder
 * @param {string} fileName
 * @param {Object} obj
 * @returns {number} Size in bytes
 */
function _writeJsonFile(folder, fileName, obj) {
  var content = JSON.stringify(obj);
  var sizeBytes = content.length;
  var files = folder.getFilesByName(fileName);
  if (files.hasNext()) {
    files.next().setContent(content);
  } else {
    folder.createFile(fileName, content, MimeType.PLAIN_TEXT);
  }
  return sizeBytes;
}

// ── Locking ───────────────────────────────────────────────────────────

/**
 * Wraps a function in a script-level lock (30s timeout).
 * @param {Function} fn
 * @returns {*} Return value of fn
 */
function _withLock(fn) {
  var lock = LockService.getScriptLock();
  var startWait = Date.now();
  lock.waitLock(30000);
  var waited = Date.now() - startWait;
  Logger.log('[CacheStore] LOCK acquired (waited ' + waited + 'ms)');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ── Research cache (L1) ───────────────────────────────────────────────

/**
 * Returns cached L1 research for a company.
 * @param {string} companyName
 * @returns {{ research: Object, meta: Object }|null}
 */
function getResearchCache(companyName) {
  var start = Date.now();
  var folder = _getCompanyFolder(companyName, false);
  if (!folder) {
    Logger.log('[CacheStore] MISS research.json for "' + companyName + '" (no folder)');
    return null;
  }
  var research = _readJsonFile(folder, 'research.json');
  if (!research) {
    Logger.log('[CacheStore] MISS research.json for "' + companyName + '" (no file)');
    return null;
  }
  var meta = _readJsonFile(folder, 'meta.json') || {};
  var elapsed = ((Date.now() - start) / 1000).toFixed(1);
  var sizeKB = Math.round(JSON.stringify(research).length / 1024);
  Logger.log('[CacheStore] READ  research.json for "' + companyName + '" (HIT, ' + sizeKB + 'KB, ' + elapsed + 's)');
  return { research: research, meta: meta };
}

/**
 * Writes L1 research to Drive cache. Locked to prevent concurrent corruption.
 * @param {string} companyName
 * @param {Object} obj  The research payload { data, productSignals, enrichment, gleanResearch }
 * @param {string} pipeline  'glean' or 'infra'
 */
function writeResearchCache(companyName, obj, pipeline) {
  _withLock(function() {
    var start = Date.now();
    var folder = _getCompanyFolder(companyName, true);
    var sizeBytes = _writeJsonFile(folder, 'research.json', obj);
    var sizeKB = Math.round(sizeBytes / 1024);
    if (sizeKB > 500) {
      Logger.log('[CacheStore] WARN research.json for "' + companyName + '" is ' + sizeKB + 'KB — unexpectedly large');
    }

    // Update meta
    var meta = _readJsonFile(folder, 'meta.json') || {};
    meta.companyName = companyName;
    meta.l1GeneratedAt = new Date().toISOString();
    meta.l1Pipeline = pipeline;
    meta.l1SizeBytes = sizeBytes;
    meta.version = meta.version || 1;
    _writeJsonFile(folder, 'meta.json', meta);

    // Invalidate dashboard landing page cache
    try { CacheService.getScriptCache().remove('dashboard_accounts'); } catch (ce) { /* non-fatal */ }

    var elapsed = ((Date.now() - start) / 1000).toFixed(1);
    Logger.log('[CacheStore] WRITE research.json for "' + companyName + '" (' + sizeKB + 'KB, ' + elapsed + 's)');
  });
}

// ── Intelligence cache (L2) ───────────────────────────────────────────

/**
 * Returns cached L2 intelligence for a company.
 * @param {string} companyName
 * @returns {{ intelligence: Object, meta: Object }|null}
 */
function getIntelligenceCache(companyName) {
  var start = Date.now();
  var folder = _getCompanyFolder(companyName, false);
  if (!folder) {
    Logger.log('[CacheStore] MISS intelligence.json for "' + companyName + '" (no folder)');
    return null;
  }
  var intelligence = _readJsonFile(folder, 'intelligence.json');
  if (!intelligence) {
    Logger.log('[CacheStore] MISS intelligence.json for "' + companyName + '" (no file)');
    return null;
  }
  var meta = _readJsonFile(folder, 'meta.json') || {};
  var elapsed = ((Date.now() - start) / 1000).toFixed(1);
  var sizeKB = Math.round(JSON.stringify(intelligence).length / 1024);
  Logger.log('[CacheStore] READ  intelligence.json for "' + companyName + '" (HIT, ' + sizeKB + 'KB, ' + elapsed + 's)');
  return { intelligence: intelligence, meta: meta };
}

/**
 * Writes L2 intelligence to Drive cache. Locked to prevent concurrent corruption.
 * @param {string} companyName
 * @param {Object} obj  The 7 intelligence objects
 * @param {string} pipeline  'glean' or 'infra'
 */
function writeIntelligenceCache(companyName, obj, pipeline) {
  _withLock(function() {
    var start = Date.now();
    var folder = _getCompanyFolder(companyName, true);
    var sizeBytes = _writeJsonFile(folder, 'intelligence.json', obj);
    var sizeKB = Math.round(sizeBytes / 1024);

    // Update meta
    var meta = _readJsonFile(folder, 'meta.json') || {};
    meta.companyName = companyName;
    meta.l2GeneratedAt = new Date().toISOString();
    meta.l2Pipeline = pipeline;
    meta.l2SizeBytes = sizeBytes;
    meta.version = meta.version || 1;
    _writeJsonFile(folder, 'meta.json', meta);

    // Invalidate dashboard landing page cache so new account appears immediately
    try { CacheService.getScriptCache().remove('dashboard_accounts'); } catch (ce) { /* non-fatal */ }

    var elapsed = ((Date.now() - start) / 1000).toFixed(1);
    Logger.log('[CacheStore] WRITE intelligence.json for "' + companyName + '" (' + sizeKB + 'KB, ' + elapsed + 's)');
  });
}

// ── Staleness checks ──────────────────────────────────────────────────

/**
 * Returns true if L1 research is missing or older than maxAgeDays.
 * @param {string} companyName
 * @param {number} [maxAgeDays]  Default: CACHE_STALE_DAYS (7)
 * @returns {boolean}
 */
function isResearchStale(companyName, maxAgeDays) {
  var days = maxAgeDays || CACHE_STALE_DAYS;
  var folder = _getCompanyFolder(companyName, false);
  if (!folder) return true;
  var meta = _readJsonFile(folder, 'meta.json');
  if (!meta || !meta.l1GeneratedAt) return true;
  var ageMs = Date.now() - new Date(meta.l1GeneratedAt).getTime();
  var ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays > days) {
    Logger.log('[CacheStore] STALE research.json for "' + companyName + '" (' + ageDays.toFixed(1) + ' days old, threshold ' + days + ')');
    return true;
  }
  return false;
}

/**
 * Returns true if L2 intelligence is missing or if L1 is newer than L2.
 * @param {string} companyName
 * @returns {boolean}
 */
function isIntelligenceStale(companyName) {
  var folder = _getCompanyFolder(companyName, false);
  if (!folder) return true;
  var meta = _readJsonFile(folder, 'meta.json');
  if (!meta || !meta.l2GeneratedAt) return true;
  // L2 is stale if L1 was regenerated after L2
  if (meta.l1GeneratedAt && new Date(meta.l1GeneratedAt) > new Date(meta.l2GeneratedAt)) {
    Logger.log('[CacheStore] STALE intelligence.json for "' + companyName + '" (L1 newer than L2)');
    return true;
  }
  return false;
}

// ── Test functions ────────────────────────────────────────────────────

/**
 * Test: verify cache folder is accessible.
 * Run from the Apps Script editor.
 */
function testCacheConfig() {
  try {
    var folderId = PropertiesService.getScriptProperties().getProperty(PROP_CACHE_FOLDER);
    if (!folderId) { Logger.log('FAIL: INTELLIGENCE_CACHE_FOLDER_ID not set'); return; }
    var folder = DriveApp.getFolderById(folderId);
    var subfolders = folder.getFolders();
    var count = 0;
    while (subfolders.hasNext()) { subfolders.next(); count++; }
    Logger.log('PASS: Cache folder "' + folder.getName() + '" accessible (' + count + ' subfolders)');
  } catch (e) {
    Logger.log('FAIL: ' + e.message);
  }
}

/**
 * Test: verify Drive folder is writable.
 * Creates a test subfolder, writes/reads JSON, then cleans up.
 */
function testFolderStructure() {
  try {
    var root = _getCacheRootFolder();
    var testFolder = root.createFolder('__TEST__');
    var testObj = { test: true, timestamp: new Date().toISOString() };
    _writeJsonFile(testFolder, 'test.json', testObj);
    var readBack = _readJsonFile(testFolder, 'test.json');
    if (!readBack || readBack.test !== true) {
      Logger.log('FAIL: read/write mismatch');
      testFolder.setTrashed(true);
      return;
    }
    testFolder.setTrashed(true);
    Logger.log('PASS: Drive folder is writable and structured correctly');
  } catch (e) {
    Logger.log('FAIL: ' + e.message);
  }
}

/**
 * Test: full cache roundtrip — write, read, index, staleness.
 * Cleans up after itself.
 */
function testCacheStoreRoundtrip() {
  var testCompany = '__TEST_COMPANY__';
  try {
    // Write research
    var researchObj = { data: { test: true }, productSignals: {}, enrichment: {}, gleanResearch: {} };
    writeResearchCache(testCompany, researchObj, 'test');

    // Read it back
    var cached = getResearchCache(testCompany);
    if (!cached || !cached.research || !cached.research.data || cached.research.data.test !== true) {
      Logger.log('FAIL: research roundtrip mismatch'); return;
    }

    // Check index
    var index = _readIndex();
    if (!index[testCompany]) { Logger.log('FAIL: _index.json missing entry'); return; }

    // Check staleness — just written, should NOT be stale
    if (isResearchStale(testCompany)) { Logger.log('FAIL: fresh research reported as stale'); return; }

    // Write intelligence
    var intelObj = { accountProfile: {}, businessMap: {}, agreementLandscape: {},
                     contractCommerce: {}, priorityMap: {}, briefing: {}, bigBets: {} };
    writeIntelligenceCache(testCompany, intelObj, 'test');

    // Check intelligence staleness — just written, L1 not newer, should NOT be stale
    if (isIntelligenceStale(testCompany)) { Logger.log('FAIL: fresh intelligence reported as stale'); return; }

    // Verify meta
    var folder = _getCompanyFolder(testCompany, false);
    var meta = _readJsonFile(folder, 'meta.json');
    if (!meta.l1GeneratedAt || !meta.l2GeneratedAt || !meta.l1SizeBytes || !meta.l2SizeBytes) {
      Logger.log('FAIL: meta.json incomplete'); return;
    }

    // Cleanup
    folder.setTrashed(true);
    // Remove from index
    var idx = _readIndex();
    delete idx[testCompany];
    var root = _getCacheRootFolder();
    var files = root.getFilesByName('_index.json');
    if (files.hasNext()) files.next().setContent(JSON.stringify(idx));

    Logger.log('PASS: write → read → index → staleness all work');
  } catch (e) {
    Logger.log('FAIL: ' + e.message);
    // Attempt cleanup
    try {
      var f = _getCompanyFolder(testCompany, false);
      if (f) f.setTrashed(true);
    } catch (ignore) {}
  }
}

/**
 * Test: verify LockService wrapper works.
 */
function testCacheLocking() {
  try {
    var result = _withLock(function() {
      Utilities.sleep(1000);
      return 'locked-ok';
    });
    if (result !== 'locked-ok') { Logger.log('FAIL: lock returned wrong value'); return; }
    Logger.log('PASS: lock acquired, function executed, lock released');
  } catch (e) {
    Logger.log('FAIL: ' + e.message);
  }
}
