/**
 * Batch generation runner for processing all companies unattended.
 *
 * Architecture:
 *   batchGenerateAll() (Menu.gs)  → calls initBatch()
 *     - Creates/resets "Batch Status" sheet tab
 *     - Sets all non-done rows to 'pending'
 *     - Registers a time-driven trigger → batchGenerateChunk() every 5 min
 *
 *   batchGenerateChunk()  (called by trigger)
 *     - Scans Batch Status sheet for next N 'pending'/'running' rows
 *     - Calls generateGrowthStrategyDoc() per company
 *     - Writes status, doc URL, timestamp, and any error back to the sheet
 *     - When no pending rows remain: deletes trigger, shows completion toast
 *
 *   cancelBatch() (Menu.gs → stopBatch())
 *     - Deletes the trigger
 *     - Resets any 'running' rows back to 'pending'
 */

// ── Constants ──────────────────────────────────────────────────────────

var BATCH_SHEET_NAME           = 'Batch Status';
var BATCH_CHUNK_SIZE           = 3;     // companies per trigger fire (~90s each, safe under 6-min limit)
var BATCH_TRIGGER_INTERVAL_MINS = 5;    // minutes between trigger fires

var PROP_BATCH_TRIGGER = 'BATCH_TRIGGER_ID';

// Column positions in Batch Status sheet (1-based)
var BATCH_COL_COMPANY = 1;
var BATCH_COL_STATUS  = 2;
var BATCH_COL_DOC_URL = 3;
var BATCH_COL_RUN_AT  = 4;
var BATCH_COL_ERROR   = 5;

// ── Public: Init ───────────────────────────────────────────────────────

/**
 * Initialize batch run. Called by batchGenerateAll() in Menu.gs.
 *
 * - Creates or resets the "Batch Status" sheet tab
 * - Preserves 'done' rows from a previous run (skips them)
 * - Sets everything else to 'pending'
 * - Registers a time-driven trigger to call batchGenerateChunk()
 */
function initBatch() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var names = getCompanyNames();

  if (names.length === 0) {
    SpreadsheetApp.getUi().alert('No company names found in the sheet.');
    return;
  }

  // Read existing statuses (preserve 'done' rows across re-runs)
  var existingStatus = {};
  var batchSheet = ss.getSheetByName(BATCH_SHEET_NAME);

  if (batchSheet) {
    var lastRow = batchSheet.getLastRow();
    if (lastRow > 1) {
      var existingData = batchSheet.getRange(2, 1, lastRow - 1, 5).getValues();
      for (var i = 0; i < existingData.length; i++) {
        var name = String(existingData[i][0]).trim();
        if (name) {
          existingStatus[name] = {
            status: String(existingData[i][1]).trim(),
            docUrl: existingData[i][2],
            runAt:  existingData[i][3],
            error:  existingData[i][4]
          };
        }
      }
    }
    batchSheet.clear();
  } else {
    batchSheet = ss.insertSheet(BATCH_SHEET_NAME);
  }

  // Write header
  var headerRange = batchSheet.getRange(1, 1, 1, 5);
  headerRange.setValues([['COMPANY_NAME', 'STATUS', 'DOC_URL', 'RUN_AT', 'ERROR']]);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#1B0B3B');
  headerRange.setFontColor('#FFFFFF');
  batchSheet.setColumnWidth(BATCH_COL_COMPANY, 280);
  batchSheet.setColumnWidth(BATCH_COL_STATUS,  90);
  batchSheet.setColumnWidth(BATCH_COL_DOC_URL, 320);
  batchSheet.setColumnWidth(BATCH_COL_RUN_AT,  160);
  batchSheet.setColumnWidth(BATCH_COL_ERROR,   300);
  batchSheet.setFrozenRows(1);

  // Write data rows (preserve done, reset everything else to pending)
  var rows = names.map(function(n) {
    var prev = existingStatus[n];
    if (prev && prev.status === 'done') {
      return [n, 'done', prev.docUrl, prev.runAt, ''];
    }
    return [n, 'pending', '', '', ''];
  });

  if (rows.length > 0) {
    batchSheet.getRange(2, 1, rows.length, 5).setValues(rows);
    batchSheet.getRange(2, 1, rows.length, 5).setVerticalAlignment('middle');
  }

  SpreadsheetApp.flush();

  // Remove any stale trigger from a previous batch before registering a new one
  removeBatchTrigger();

  // Register time-driven trigger
  var trigger = ScriptApp.newTrigger('batchGenerateChunk')
    .timeBased()
    .everyMinutes(BATCH_TRIGGER_INTERVAL_MINS)
    .create();

  PropertiesService.getScriptProperties().setProperty(PROP_BATCH_TRIGGER, trigger.getUniqueId());

  var pendingCount = rows.filter(function(r) { return r[1] === 'pending'; }).length;
  var doneCount    = rows.filter(function(r) { return r[1] === 'done';    }).length;

  Logger.log('[Batch] Initialized. Pending: ' + pendingCount + ', Already done: ' + doneCount +
    '. Trigger ID: ' + trigger.getUniqueId());

  ss.toast(
    pendingCount + ' companies queued (' + doneCount + ' already done, skipped). ' +
    'Processing ' + BATCH_CHUNK_SIZE + ' per run every ' + BATCH_TRIGGER_INTERVAL_MINS + ' minutes. ' +
    'See "Batch Status" tab for progress.',
    'Batch Started',
    15
  );
}

// ── Public: Chunk Processor ────────────────────────────────────────────

/**
 * Process the next chunk of pending companies.
 * Called automatically by the time-driven trigger registered in initBatch().
 *
 * Scans the Batch Status sheet for 'pending' (or stuck 'running') rows,
 * processes up to BATCH_CHUNK_SIZE companies, then writes results back.
 * Deletes the trigger when no pending rows remain.
 */
function batchGenerateChunk() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var batchSheet = ss.getSheetByName(BATCH_SHEET_NAME);

  if (!batchSheet) {
    Logger.log('[Batch] ERROR: Batch Status sheet not found — removing trigger.');
    removeBatchTrigger();
    return;
  }

  var lastRow = batchSheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('[Batch] No data rows in Batch Status sheet — removing trigger.');
    removeBatchTrigger();
    return;
  }

  var allRows = batchSheet.getRange(2, 1, lastRow - 1, 5).getValues();
  var processedThisChunk = 0;

  for (var r = 0; r < allRows.length && processedThisChunk < BATCH_CHUNK_SIZE; r++) {
    var status      = String(allRows[r][BATCH_COL_STATUS - 1]).trim();
    var companyName = String(allRows[r][BATCH_COL_COMPANY - 1]).trim();

    // Process 'pending' rows; re-process 'running' (interrupted by a prior timeout)
    if (status !== 'pending' && status !== 'running') continue;
    if (!companyName) continue;

    var rowNum = r + 2; // 1-based row in sheet (offset by 1 header row)

    // Mark as running before starting (visible progress in sheet)
    batchSheet.getRange(rowNum, BATCH_COL_STATUS).setValue('running');
    batchSheet.getRange(rowNum, BATCH_COL_ERROR).setValue('');
    SpreadsheetApp.flush();

    Logger.log('[Batch] Processing row ' + rowNum + ': ' + companyName);

    try {
      var docUrl = generateGrowthStrategyDoc(companyName);
      batchSheet.getRange(rowNum, BATCH_COL_STATUS).setValue('done');
      batchSheet.getRange(rowNum, BATCH_COL_DOC_URL).setValue(docUrl);
      batchSheet.getRange(rowNum, BATCH_COL_RUN_AT).setValue(new Date());
      batchSheet.getRange(rowNum, BATCH_COL_ERROR).setValue('');
      Logger.log('[Batch] Done: ' + companyName + ' → ' + docUrl);
    } catch (e) {
      var errMsg = e.message || String(e);
      batchSheet.getRange(rowNum, BATCH_COL_STATUS).setValue('failed');
      batchSheet.getRange(rowNum, BATCH_COL_RUN_AT).setValue(new Date());
      batchSheet.getRange(rowNum, BATCH_COL_ERROR).setValue(errMsg);
      Logger.log('[Batch] FAILED: ' + companyName + ' — ' + errMsg);
    }

    SpreadsheetApp.flush();
    processedThisChunk++;
  }

  // Re-read to count remaining pending/running
  var updatedRows = batchSheet.getRange(2, 1, lastRow - 1, 5).getValues();
  var remaining = 0;
  var totalDone   = 0;
  var totalFailed = 0;

  for (var i = 0; i < updatedRows.length; i++) {
    var s = String(updatedRows[i][BATCH_COL_STATUS - 1]).trim();
    if (s === 'pending' || s === 'running') remaining++;
    else if (s === 'done')   totalDone++;
    else if (s === 'failed') totalFailed++;
  }

  Logger.log('[Batch] Chunk complete. Processed: ' + processedThisChunk +
    ', Remaining: ' + remaining + ', Done: ' + totalDone + ', Failed: ' + totalFailed);

  if (remaining === 0) {
    removeBatchTrigger();
    ss.toast(
      'Batch complete! ' + totalDone + ' done, ' + totalFailed + ' failed. See "Batch Status" tab.',
      'Batch Finished',
      30
    );
    Logger.log('[Batch] ALL DONE. Done: ' + totalDone + ', Failed: ' + totalFailed);
  } else {
    ss.toast(
      remaining + ' companies still pending — next chunk in ' + BATCH_TRIGGER_INTERVAL_MINS + ' min.',
      'Batch In Progress',
      5
    );
  }
}

// ── Public: Stop ───────────────────────────────────────────────────────

/**
 * Cancel the batch run. Called by stopBatch() in Menu.gs.
 *
 * - Removes the time-driven trigger
 * - Resets any 'running' rows back to 'pending' so they can be resumed
 */
function cancelBatch() {
  removeBatchTrigger();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var batchSheet = ss.getSheetByName(BATCH_SHEET_NAME);

  if (batchSheet && batchSheet.getLastRow() > 1) {
    var lastRow = batchSheet.getLastRow();
    var allRows = batchSheet.getRange(2, 1, lastRow - 1, 5).getValues();
    for (var r = 0; r < allRows.length; r++) {
      if (String(allRows[r][BATCH_COL_STATUS - 1]).trim() === 'running') {
        batchSheet.getRange(r + 2, BATCH_COL_STATUS).setValue('pending');
      }
    }
    SpreadsheetApp.flush();
  }

  Logger.log('[Batch] Stopped by user.');
  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Batch stopped. Any in-progress rows reset to pending. Run "Batch Generate All" to resume.',
    'Batch Stopped',
    10
  );
}

// ── Internal Helper ────────────────────────────────────────────────────

/**
 * Delete the time-driven trigger registered by initBatch().
 * Reads the trigger ID from Script Properties and removes it from the project.
 */
function removeBatchTrigger() {
  var props = PropertiesService.getScriptProperties();
  var triggerId = props.getProperty(PROP_BATCH_TRIGGER);
  if (!triggerId) return;

  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getUniqueId() === triggerId) {
      ScriptApp.deleteTrigger(triggers[i]);
      Logger.log('[Batch] Deleted trigger: ' + triggerId);
      break;
    }
  }
  props.deleteProperty(PROP_BATCH_TRIGGER);
}
