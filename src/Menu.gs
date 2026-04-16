/**
 * Sheet UI: custom menu, company picker, and entry points.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Account Research')
    .addItem('Generate for Company...', 'showGleanCompanyPicker')
    .addItem('Generate for GTM Group...', 'showGleanGtmGroupPicker')
    .addItem('Generate for Prospect...', 'showProspectDialog')
    .addSeparator()
    .addItem('Refresh Company Names', 'refreshCompanyNames')
    .addItem('Batch Generate All...', 'batchGenerateAll')
    .addItem('Stop Batch', 'stopBatch')
    .addSeparator()
    .addItem('Set API Key', 'promptApiKey')
    .addItem('Set API User', 'promptApiUser')
    .addItem('Set Output Folder ID', 'promptOutputFolder')
    .addItem('Set Cache Folder ID', 'promptCacheFolder')
    .addSeparator()
    .addItem('Glean: Set API Base URL', 'promptGleanApiBase')
    .addItem('Glean: Set API Key', 'promptGleanApiKey')
    .addItem('Glean: Set Agent ID', 'promptGleanAgentId')
    .addSeparator()
    .addItem('[Legacy] Generate via INFRA (Company)...', 'showCompanyPicker')
    .addItem('[Legacy] Generate via INFRA (GTM Group)...', 'showGtmGroupPicker')
    .addItem('Export Glean Test Data (Company)...', 'showGleanExportPicker')
    .addToUi();
}

// ── Shared picker HTML builder ─────────────────────────────────────────

/**
 * Build the HTML for a searchable picker dialog.
 * The dialog opens immediately; names are loaded async via google.script.run.
 *
 * @param {Object} opts
 *   badge         {string|null}  Badge text (null = no badge)
 *   badgeBg       {string}       Badge background color  (default #E8F4FD)
 *   badgeFg       {string}       Badge text color        (default #0A6EBD)
 *   label         {string}       Input label
 *   placeholder   {string}       Input placeholder text
 *   buttonText    {string}       Submit button label
 *   buttonColor   {string}       Button background color
 *   buttonHover   {string}       Button hover color
 *   serverFetchFn {string}       GAS function name → returns string[]
 *   countSuffix   {string}       e.g. "companies in sheet"
 *   generateFn    {string}       GAS function to call on submit
 *   generateArgs  {string}       JS arg expression e.g. "selected, false"
 *   statusMsg     {string}       Message shown while generating
 *   returnsUrl    {boolean}      true = success handler renders link; false = plain "Done!"
 *   note          {string|null}  Optional small note below button
 */
function _buildPickerHtml(opts) {
  var badge = opts.badge ? (
    '<div style="display:inline-block;background:' + (opts.badgeBg || '#E8F4FD') + ';color:' +
    (opts.badgeFg || '#0A6EBD') + ';font-size:11px;padding:2px 7px;border-radius:10px;margin-bottom:10px">' +
    opts.badge + '</div>'
  ) : '';
  var note = opts.note
    ? '<div style="color:#888;font-size:11px;margin-top:6px">' + opts.note + '</div>'
    : '';
  var successBody;
  if (opts.returnsUrl === false) {
    successBody = '"Done! Check the alert for the doc link."';
  } else if (opts.returnsBothUrls) {
    // generateAndLog now returns JSON with briefUrl + fullUrl
    successBody = '(function(){try{var r=JSON.parse(url);return \'Done! <a href="\'+r.briefUrl+\'" target="_blank">Open Brief</a> · <a href="\'+r.fullUrl+\'" target="_blank">Open Full Report</a>\';}catch(e){return \'Done! <a href="\'+url+\'" target="_blank">Open Document</a>\';}})()';
  } else {
    successBody = '\'Done! <a href="\'+url+\'" target="_blank">Open Document</a>\'';
  }

  return '<style>' +
    'body{font-family:Arial,sans-serif;padding:16px}' +
    '.w{position:relative}' +
    '#s{width:100%;padding:10px 12px;font-size:14px;border:2px solid #ccc;border-radius:6px;box-sizing:border-box;outline:none}' +
    '#s:focus{border-color:#1B0B3B}' +
    '#s:disabled{background:#f5f5f5;color:#aaa}' +
    '#r{position:absolute;top:100%;left:0;right:0;max-height:180px;overflow-y:auto;background:white;' +
    'border:1px solid #ddd;border-top:none;border-radius:0 0 6px 6px;' +
    'box-shadow:0 4px 12px rgba(0,0,0,.1);display:none;z-index:10}' +
    '#r div{padding:8px 12px;cursor:pointer;font-size:13px}' +
    '#r div:hover,#r div.a{background:#F5F3F7}' +
    '#r div.a{background:#E8E4EF}' +
    '#b{background:' + opts.buttonColor + ';color:white;border:none;padding:10px 24px;' +
    'font-size:14px;cursor:pointer;border-radius:4px;margin-top:12px;width:100%}' +
    '#b:hover{background:' + opts.buttonHover + '}' +
    '#b:disabled{background:#999;cursor:default}' +
    '.st{color:#666;font-size:12px;margin-top:8px}' +
    '.ct{color:#999;font-size:11px;margin-top:4px}' +
    '</style>' +
    '<div>' +
    badge +
    '<label><b>' + opts.label + '</b></label>' +
    '<div class="w"><input type="text" id="s" placeholder="' + opts.placeholder + '" autocomplete="off" disabled>' +
    '<div id="r"></div></div>' +
    '<div class="ct" id="ct">Loading...</div>' +
    '<button id="b" onclick="go()" disabled>' + opts.buttonText + '</button>' +
    '<div id="st" class="st"></div>' +
    note +
    '</div>' +
    '<script>' +
    'var N=[],sel="",ai=-1,flt=[];' +
    'var se=document.getElementById("s"),re=document.getElementById("r"),' +
    'be=document.getElementById("b"),ce=document.getElementById("ct");' +
    'function loadNames(){' +
    '  google.script.run' +
    '    .withSuccessHandler(function(list){' +
    '      N=list;ce.innerText=list.length+" ' + opts.countSuffix + '";' +
    '      se.disabled=false;se.focus();' +
    '    })' +
    '    .withFailureHandler(function(err){' +
    '      ce.style.color="#c00";ce.innerText="Error loading: "+err.message;' +
    '    })' +
    '    .' + opts.serverFetchFn + '();' +
    '}' +
    'window.onload=function(){setTimeout(loadNames,0);};' +
    'se.addEventListener("input",function(){' +
    '  var q=this.value.toLowerCase();sel="";be.disabled=true;ai=-1;' +
    '  if(q.length<1){re.style.display="none";return;}' +
    '  flt=N.filter(function(n){return n.toLowerCase().indexOf(q)!==-1;});' +
    '  re.innerHTML=flt.length===0?"<div style=\\"color:#999\\">No matches</div>"' +
    '    :flt.slice(0,50).map(function(n,i){return"<div data-i=\\""+i+"\\" onclick=\\"pick(this)\\">"+esc(n)+"</div>";}).join("");' +
    '  re.style.display="block";' +
    '});' +
    'se.addEventListener("keydown",function(e){' +
    '  var it=re.querySelectorAll("div[data-i]");' +
    '  if(e.key==="ArrowDown"){e.preventDefault();ai=Math.min(ai+1,it.length-1);hl(it);}' +
    '  else if(e.key==="ArrowUp"){e.preventDefault();ai=Math.max(ai-1,0);hl(it);}' +
    '  else if(e.key==="Enter"&&ai>=0&&it[ai]){e.preventDefault();pick(it[ai]);}' +
    '});' +
    'function hl(it){for(var i=0;i<it.length;i++)it[i].classList.remove("a");' +
    '  if(it[ai]){it[ai].classList.add("a");it[ai].scrollIntoView({block:"nearest"});}}' +
    'function pick(el){sel=flt[parseInt(el.getAttribute("data-i"))];se.value=sel;re.style.display="none";be.disabled=false;ai=-1;}' +
    'function esc(s){var d=document.createElement("div");d.textContent=s;return d.innerHTML;}' +
    'function go(){' +
    '  if(!sel)return;' +
    '  document.getElementById("st").innerText="' + opts.statusMsg + '";' +
    '  be.disabled=true;' +
    '  google.script.run' +
    '    .withSuccessHandler(function(url){' +
    '      document.getElementById("st").innerHTML=' + successBody + ';' +
    '      be.disabled=false;' +
    '    })' +
    '    .withFailureHandler(function(e){' +
    '      document.getElementById("st").innerText="Error: "+e.message;' +
    '      be.disabled=false;' +
    '    })' +
    '    .' + opts.generateFn + '(' + opts.generateArgs + ');' +
    '}' +
    '</script>';
}

// ── Picker dialogs ──────────────────────────────────────────────────────

/**
 * Show a dialog to pick a company name from the sheet.
 * Names are loaded asynchronously after the dialog opens — no "Running Script" wait.
 */
function showCompanyPicker() {
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(_buildPickerHtml({
      badge: null, label: 'Type to search:', placeholder: 'Start typing a company name...',
      buttonText: 'Generate Account Research', buttonColor: '#1B0B3B', buttonHover: '#2D1B5E',
      serverFetchFn: 'getCompanyNames', countSuffix: 'companies in sheet',
      generateFn: 'generateAndLog', generateArgs: 'sel, false',
      statusMsg: 'Generating... this may take a minute.', returnsUrl: true, returnsBothUrls: true
    })).setWidth(450).setHeight(280),
    'Account Research Generator'
  );
}

/**
 * Show a dialog to enter a prospect company name (not in the sheet).
 * Calls generateAccountResearchDoc(name, true) with isProspect = true.
 */
function showProspectDialog() {
  var html = '<style>' +
    'body { font-family: Arial, sans-serif; padding: 16px; }' +
    'label { font-weight: bold; display: block; margin-bottom: 6px; }' +
    '#name { width: 100%; padding: 10px 12px; font-size: 14px; border: 2px solid #ccc; ' +
    '  border-radius: 6px; box-sizing: border-box; outline: none; }' +
    '#name:focus { border-color: #1B0B3B; }' +
    'button { background: #1B0B3B; color: white; border: none; padding: 10px 24px; ' +
    '  font-size: 14px; cursor: pointer; border-radius: 4px; margin-top: 12px; width: 100%; }' +
    'button:hover { background: #2D1B5E; }' +
    'button:disabled { background: #999; cursor: default; }' +
    '.status { color: #666; font-size: 12px; margin-top: 8px; }' +
    '.note { color: #999; font-size: 11px; margin-top: 4px; }' +
    '</style>' +
    '<div>' +
    '<label>Prospect company name:</label>' +
    '<input type="text" id="name" placeholder="e.g. Stripe, Airbnb, Palantir..." autocomplete="off" />' +
    '<div class="note">This company does not need to exist in the sheet.</div>' +
    '<button id="btn" onclick="generate()" disabled>Generate Prospect Strategy</button>' +
    '<div id="status" class="status"></div>' +
    '</div>' +
    '<script>' +
    'var nameEl = document.getElementById("name");' +
    'var btnEl = document.getElementById("btn");' +
    '' +
    'nameEl.addEventListener("input", function() {' +
    '  btnEl.disabled = this.value.trim().length === 0;' +
    '});' +
    '' +
    'nameEl.addEventListener("keydown", function(e) {' +
    '  if (e.key === "Enter" && !btnEl.disabled) generate();' +
    '});' +
    '' +
    'function generate() {' +
    '  var name = nameEl.value.trim();' +
    '  if (!name) return;' +
    '  document.getElementById("status").innerText = "Generating... this may take a minute.";' +
    '  btnEl.disabled = true;' +
    '  google.script.run' +
    '    .withSuccessHandler(function(resp) {' +
    '      try{var r=JSON.parse(resp);document.getElementById("status").innerHTML=' +
    '        \'Done! <a href="\'+r.briefUrl+\'" target="_blank">Open Brief</a>' +
    '         · <a href="\'+r.fullUrl+\'" target="_blank">Open Full Report</a>\';}' +
    '      catch(e){document.getElementById("status").innerHTML=' +
    '        \'Done! <a href="\'+resp+\'" target="_blank">Open Document</a>\';}' +
    '      btnEl.disabled = false;' +
    '    })' +
    '    .withFailureHandler(function(err) {' +
    '      document.getElementById("status").innerText = "Error: " + err.message;' +
    '      btnEl.disabled = false;' +
    '    })' +
    '    .generateAndLogViaGlean(name, true);' +
    '}' +
    '' +
    'nameEl.focus();' +
    '</script>';

  var ui = HtmlService.createHtmlOutput(html)
    .setWidth(450)
    .setHeight(240)
    .setTitle('Prospect Strategy Generator');

  SpreadsheetApp.getUi().showModalDialog(ui, 'Prospect Strategy Generator');
}

// ── Glean Pickers ──────────────────────────────────────────────────────

/**
 * Company picker that routes to the Glean agent instead of the GAS LLM path.
 */
function showGleanCompanyPicker() {
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(_buildPickerHtml({
      badge: 'Glean-powered', label: 'Type to search:', placeholder: 'Start typing a company name...',
      buttonText: 'Generate Account Research', buttonColor: '#1B0B3B', buttonHover: '#2D1B5E',
      serverFetchFn: 'getCompanyNames', countSuffix: 'companies in sheet',
      generateFn: 'generateAndLogViaGlean', generateArgs: 'sel, false',
      statusMsg: 'Generating... this may take 2-3 minutes.', returnsUrl: true, returnsBothUrls: true
    })).setWidth(450).setHeight(280),
    'Account Research Generator'
  );
}

/**
 * GTM group picker that routes to the Glean agent.
 */
function showGleanGtmGroupPicker() {
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(_buildPickerHtml({
      badge: 'Glean-powered', label: 'Type to search GTM groups:', placeholder: 'Start typing a GTM group ID...',
      buttonText: 'Generate Group Strategy', buttonColor: '#1B0B3B', buttonHover: '#2D1B5E',
      serverFetchFn: 'getGtmGroupIds', countSuffix: 'GTM groups in sheet',
      generateFn: 'generateAndLogGroupViaGlean', generateArgs: 'sel',
      statusMsg: 'Generating... this may take 2-3 minutes.', returnsUrl: true, returnsBothUrls: true
    })).setWidth(480).setHeight(280),
    'Generate for GTM Group'
  );
}

// ── GTM Group Picker ───────────────────────────────────────────────────

/**
 * Show a searchable dialog to pick a GTM group and generate a combined report.
 */
function showGtmGroupPicker() {
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(_buildPickerHtml({
      badge: null, label: 'Type to search GTM groups:', placeholder: 'Start typing a GTM group ID...',
      buttonText: 'Generate Group Strategy', buttonColor: '#1B0B3B', buttonHover: '#2D1B5E',
      serverFetchFn: 'getGtmGroupIds', countSuffix: 'GTM groups in sheet',
      generateFn: 'generateAndLogGroup', generateArgs: 'sel',
      statusMsg: 'Generating... this may take a few minutes.', returnsUrl: true, returnsBothUrls: true
    })).setWidth(480).setHeight(280),
    'Generate for GTM Group'
  );
}

/**
 * Wrapper called by the GTM group picker dialog.
 * Delegates to generateAccountResearchDocForGroup() and logs the result.
 * @param {string} gtmGroupId  Value of the GTM_GROUP column (Salesforce group ID)
 * @returns {string} doc URL
 */
function generateAndLogGroup(gtmGroupId) {
  var briefUrl, errorMsg;
  try {
    briefUrl = generateAccountResearchDocForGroup(gtmGroupId, '', '');
    var fullUrl = (_lastDocResult && _lastDocResult.fullUrl) || '';
    logToStatusSheet('[GTM] ' + gtmGroupId, false, 'done', briefUrl, '', fullUrl);
    return JSON.stringify({ briefUrl: briefUrl, fullUrl: fullUrl });
  } catch (e) {
    errorMsg = e.message || String(e);
    logToStatusSheet('[GTM] ' + gtmGroupId, false, 'error', '', errorMsg, '');
    throw e;
  }
}

// ── Company Name Refresh ───────────────────────────────────────────────

/**
 * Populate (or backfill) the COMPANY_NAME column for all rows in the active sheet.
 * Blank cells are filled by parsing ACCOUNT_NAME_PLAN_TERM; manually-edited cells
 * (non-blank) are left untouched.
 *
 * Use this before a batch run to auto-generate names, review/correct them in col HV,
 * then kick off Batch Generate All.
 */
function refreshCompanyNames() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BOOKSCRUB_SHEET_NAME);
  var headerIndex = buildHeaderIndex(sheet);
  ensureCompanyNameColumn(sheet, headerIndex);
  var nameCol = headerIndex[COMPANY_NAME_COL];
  var count = sheet.getLastRow() - 1;
  invalidatePickerCache(); // clear stale name list from CacheService

  // Rebuild the autocomplete cache spreadsheet
  try {
    buildCompanyNameCache();
    SpreadsheetApp.getActiveSpreadsheet().toast(
      'COMPANY_NAME column refreshed and autocomplete cache rebuilt. ' + count + ' rows.',
      'Company Names Ready',
      8
    );
  } catch(e) {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      'COMPANY_NAME column refreshed (' + count + ' rows) but cache rebuild failed: ' + e.message,
      'Company Names — Cache Error',
      12
    );
  }
}

/**
 * Convert a 1-based column number to a letter (e.g. 234 → "HV").
 * @param {number} n  1-based column number
 * @returns {string}
 */
function columnLetter(n) {
  var s = '';
  while (n > 0) {
    var rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// ── Single-generation logging ──────────────────────────────────────────

/**
 * Wrapper called by the company picker and prospect dialogs.
 * Delegates to generateAccountResearchDoc() and logs the result to Batch Status.
 * Returns a JSON string with both URLs so the picker dialog can show both links.
 *
 * @param {string}  companyName
 * @param {boolean} isProspect
 * @returns {string} JSON string: { briefUrl, fullUrl }
 */
function generateAndLog(companyName, isProspect) {
  var briefUrl, errorMsg;
  try {
    briefUrl = generateAccountResearchDoc(companyName, "", "", isProspect);
    var fullUrl = (_lastDocResult && _lastDocResult.fullUrl) || '';
    logToStatusSheet(companyName, isProspect, 'done', briefUrl, '', fullUrl);
    return JSON.stringify({ briefUrl: briefUrl, fullUrl: fullUrl });
  } catch (e) {
    errorMsg = e.message || String(e);
    logToStatusSheet(companyName, isProspect, 'error', '', errorMsg, '');
    throw e;
  }
}

/**
 * Upsert a row in the Batch Status sheet for a single-run generation.
 * If a row already exists for this company it is updated in place; otherwise a new row is appended.
 * Creates the sheet with the standard header if it doesn't exist yet.
 *
 * @param {string}  companyName
 * @param {boolean} isProspect
 * @param {string}  status       'done' | 'error'
 * @param {string}  briefUrl     URL of the Account Brief
 * @param {string}  error
 * @param {string}  fullUrl      URL of the Full Report
 */
function logToStatusSheet(companyName, isProspect, status, briefUrl, error, fullUrl) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(BATCH_SHEET_NAME);
  var NUM_COLS = 6;

  // Create the sheet with the standard header if it doesn't exist yet
  if (!sheet) {
    sheet = ss.insertSheet(BATCH_SHEET_NAME);
    var hdr = sheet.getRange(1, 1, 1, NUM_COLS);
    hdr.setValues([['COMPANY_NAME', 'STATUS', 'BRIEF_URL', 'FULL_URL', 'RUN_AT', 'ERROR']]);
    hdr.setFontWeight('bold');
    hdr.setBackground('#1B0B3B');
    hdr.setFontColor('#FFFFFF');
    sheet.setColumnWidth(BATCH_COL_COMPANY, 280);
    sheet.setColumnWidth(BATCH_COL_STATUS,  90);
    sheet.setColumnWidth(BATCH_COL_DOC_URL, 320);
    sheet.setColumnWidth(BATCH_COL_FULL_URL, 320);
    sheet.setColumnWidth(BATCH_COL_RUN_AT,   160);
    sheet.setColumnWidth(BATCH_COL_ERROR,    300);
    sheet.setFrozenRows(1);
  }

  var displayName = isProspect ? '[PROSPECT] ' + companyName : companyName;
  var runAt = new Date();
  var lastRow = sheet.getLastRow();

  var newRow = [displayName, status, briefUrl || '', fullUrl || '', runAt, error];

  if (lastRow > 1) {
    var names = sheet.getRange(2, BATCH_COL_COMPANY, lastRow - 1, 1).getValues();

    // Update existing row in place (name unchanged, so position stays correct)
    for (var i = 0; i < names.length; i++) {
      if (String(names[i][0]).trim() === displayName) {
        sheet.getRange(i + 2, 1, 1, NUM_COLS).setValues([newRow]);
        return;
      }
    }

    // Insert at the correct alphabetical position
    var insertAt = lastRow + 1; // default: after last row
    var key = displayName.toLowerCase();
    for (var j = 0; j < names.length; j++) {
      if (String(names[j][0]).toLowerCase() > key) {
        insertAt = j + 2;
        break;
      }
    }
    sheet.insertRowBefore(insertAt);
    sheet.getRange(insertAt, 1, 1, NUM_COLS).setValues([newRow]);
  } else {
    // Sheet is empty (header only) — just write to row 2
    sheet.getRange(2, 1, 1, NUM_COLS).setValues([newRow]);
  }
}

// ── Batch Generation ───────────────────────────────────────────────────

/**
 * Entry point for batch generation. Shows a confirmation dialog,
 * then delegates to initBatch() in BatchRunner.gs.
 *
 * Already-completed rows (status = 'done') are preserved and skipped on re-run.
 */
function batchGenerateAll() {
  var ui = SpreadsheetApp.getUi();
  var names = getCompanyNames();
  var result = ui.alert(
    'Batch Generate All',
    'This will queue all ' + names.length + ' companies for generation.\n\n' +
    'Processing runs in the background at ' + BATCH_CHUNK_SIZE + ' companies every ' +
    BATCH_TRIGGER_INTERVAL_MINS + ' minutes (~' + Math.ceil(names.length / BATCH_CHUNK_SIZE * BATCH_TRIGGER_INTERVAL_MINS) +
    ' min total).\n\n' +
    'Companies already marked "done" will be skipped.\n\n' +
    'Continue?',
    ui.ButtonSet.YES_NO
  );
  if (result !== ui.Button.YES) return;
  initBatch();
}

/**
 * Cancel the running batch. Removes the trigger and resets any
 * in-progress rows back to 'pending'. Delegates to cancelBatch() in BatchRunner.gs.
 */
function stopBatch() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.alert(
    'Stop Batch',
    'Are you sure you want to stop the batch? Any in-progress rows will be reset to pending.',
    ui.ButtonSet.YES_NO
  );
  if (result !== ui.Button.YES) return;
  cancelBatch();
}

/**
 * Escape HTML special characters.
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Test Runner ───────────────────────────────────────────────────────

/**
 * Run this directly from the Apps Script editor to test.
 * Change the company name to match a row in your sheet.
 */
function testGenerate() {
  var companyName = 'Merck Sharp & Dohme LLC';  // <-- change to any company name in your sheet
  Logger.log('[TEST] Starting test for: ' + companyName);
  var url = generateAccountResearchDoc(companyName);
  Logger.log('[TEST] Done. Doc URL: ' + url);
}

/**
 * Run this directly from the Apps Script editor to test prospect mode.
 * Uses a company name that is NOT in the sheet.
 */
function testGenerateProspect() {
  var companyName = 'Stripe';  // <-- change to any prospect company name
  Logger.log('[TEST] Starting prospect test for: ' + companyName);
  var url = generateAccountResearchDoc(companyName, true);
  Logger.log('[TEST] Done. Doc URL: ' + url);
}

/**
 * Quick test: just list the company names found in the sheet.
 * Use this to verify the name parsing works before running the full generation.
 */
function testListCompanies() {
  var names = getCompanyNames();
  Logger.log('[TEST] Found ' + names.length + ' companies:');
  names.forEach(function(name, i) {
    Logger.log('  ' + (i + 1) + '. ' + name);
  });
}

/**
 * Test GTM group data extraction without running any LLM calls.
 * Set gtmGroupId to any GTM_GROUP ID from the sheet and run from the editor.
 * Check Execution Log for results.
 */
function testGtmGroupData() {
  var gtmGroupId = 'aSr1W000000Arp3SAC';
  Logger.log('[TEST] Fetching GTM group data for ID: ' + gtmGroupId);

  var data = getGtmGroupData(gtmGroupId);

  Logger.log('[TEST] identity.name (used for LLM research): ' + data.identity.name);
  Logger.log('[TEST] Account count: ' + data.accounts.length);
  data.accounts.forEach(function(acc, i) {
    Logger.log('[TEST] Account ' + (i + 1) + ': ' + acc.identity.name +
      ' | ACV: $' + acc.financial.acv.toLocaleString() +
      ' | Plan: ' + acc.contract.plan +
      ' | Envelopes: ' + acc.consumption.envelopesSent + '/' + acc.consumption.envelopesPurchased +
      ' | Seats: ' + acc.seats.active + '/' + acc.seats.purchased);
  });

  var productCounts = {};
  data.accounts.forEach(function(acc) {
    acc.activeProducts.forEach(function(p) {
      productCounts[p] = (productCounts[p] || 0) + 1;
    });
  });
  var productSummary = Object.keys(productCounts).sort().map(function(p) {
    return p + '(' + productCounts[p] + ')';
  }).join(', ');
  Logger.log('[TEST] Active products: ' + productSummary);

  var totalAcv         = data.accounts.reduce(function(t, a) { return t + (a.financial.acv || 0); }, 0);
  var totalEnvSent     = data.accounts.reduce(function(t, a) { return t + (a.consumption.envelopesSent || 0); }, 0);
  var totalEnvPurch    = data.accounts.reduce(function(t, a) { return t + (a.consumption.envelopesPurchased || 0); }, 0);
  var totalSeatsActive = data.accounts.reduce(function(t, a) { return t + (a.seats.active || 0); }, 0);
  var totalSeatsPurch  = data.accounts.reduce(function(t, a) { return t + (a.seats.purchased || 0); }, 0);

  Logger.log('[TEST] TOTALS' +
    ' | ACV: $' + totalAcv.toLocaleString() +
    ' | Envelopes: ' + totalEnvSent.toLocaleString() + '/' + totalEnvPurch.toLocaleString() +
    ' | Seats: ' + totalSeatsActive.toLocaleString() + '/' + totalSeatsPurch.toLocaleString());
}

// ── Script Property Setup Helpers ─────────────────────────────────────

function promptApiKey() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.prompt('Set API Key', 'Enter your DOCU-INFRA-IC-KEY:', ui.ButtonSet.OK_CANCEL);
  if (result.getSelectedButton() === ui.Button.OK) {
    PropertiesService.getScriptProperties().setProperty(PROP_API_KEY, result.getResponseText().trim());
    ui.alert('API Key saved.');
  }
}

function promptApiUser() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.prompt('Set API User', 'Enter your DOCU-INFRA-IC-USER email:', ui.ButtonSet.OK_CANCEL);
  if (result.getSelectedButton() === ui.Button.OK) {
    PropertiesService.getScriptProperties().setProperty(PROP_API_USER, result.getResponseText().trim());
    ui.alert('API User saved.');
  }
}

function promptOutputFolder() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.prompt(
    'Set Output Folder',
    'Enter the Google Drive folder ID where docs should be saved:',
    ui.ButtonSet.OK_CANCEL
  );
  if (result.getSelectedButton() === ui.Button.OK) {
    PropertiesService.getScriptProperties().setProperty(PROP_OUTPUT_FOLDER, result.getResponseText().trim());
    ui.alert('Output folder saved.');
  }
}

function promptCacheFolder() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.prompt(
    'Set Intelligence Cache Folder',
    'Enter the Google Drive folder ID for the intelligence cache:',
    ui.ButtonSet.OK_CANCEL
  );
  if (result.getSelectedButton() === ui.Button.OK) {
    var folderId = result.getResponseText().trim();
    try {
      var folder = DriveApp.getFolderById(folderId);
      PropertiesService.getScriptProperties().setProperty(PROP_CACHE_FOLDER, folderId);
      Logger.log('[Config] INTELLIGENCE_CACHE_FOLDER_ID set to: ' + folderId + ' (' + folder.getName() + ')');
      ui.alert('Cache folder saved: ' + folder.getName());
    } catch (e) {
      ui.alert('Error: Could not access folder ' + folderId + '. ' + e.message);
    }
  }
}

// ── Glean Export Picker ────────────────────────────────────────────────

/**
 * Picker dialog that exports INTERNAL_DATA JSON + ready-to-paste Glean prompt
 * to a Google Doc for any company in the sheet.
 */
function showGleanExportPicker() {
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(_buildPickerHtml({
      badge: '📋 Export Test Data', badgeBg: '#E8F5EE', badgeFg: '#1B6B3A',
      label: 'Type to search:', placeholder: 'Start typing a company name...',
      buttonText: 'Export INTERNAL_DATA', buttonColor: '#1B6B3A', buttonHover: '#145530',
      serverFetchFn: 'getCompanyNames', countSuffix: 'companies in sheet',
      generateFn: 'exportInternalDataJsonFor', generateArgs: 'sel, false',
      statusMsg: 'Extracting data + running enrichment... ~30 seconds.',
      returnsUrl: false,
      note: 'Exports bookscrub data + enrichment as a ready-to-paste Glean prompt to a Google Doc.'
    })).setWidth(450).setHeight(300),
    'Export Glean Test Data'
  );
}
