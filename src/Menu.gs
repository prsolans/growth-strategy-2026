/**
 * Sheet UI: custom menu, company picker, and entry points.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Growth Strategy')
    .addItem('Generate for Company...', 'showCompanyPicker')
    .addSeparator()
    .addItem('Set API Key', 'promptApiKey')
    .addItem('Set API User', 'promptApiUser')
    .addItem('Set Output Folder ID', 'promptOutputFolder')
    .addToUi();
}

/**
 * Show a dialog to pick a company name from the sheet.
 */
function showCompanyPicker() {
  var names = getCompanyNames();
  if (names.length === 0) {
    SpreadsheetApp.getUi().alert('No company names found in column ACCOUNT_NAME_PLAN_TERM.');
    return;
  }

  var namesJson = JSON.stringify(names);

  var html = '<style>' +
    'body { font-family: Arial, sans-serif; padding: 16px; }' +
    '.search-wrap { position: relative; }' +
    '#search { width: 100%; padding: 10px 12px; font-size: 14px; border: 2px solid #ccc; ' +
    '  border-radius: 6px; box-sizing: border-box; outline: none; }' +
    '#search:focus { border-color: #1B0B3B; }' +
    '#results { position: absolute; top: 100%; left: 0; right: 0; max-height: 180px; ' +
    '  overflow-y: auto; background: white; border: 1px solid #ddd; border-top: none; ' +
    '  border-radius: 0 0 6px 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); display: none; z-index: 10; }' +
    '#results div { padding: 8px 12px; cursor: pointer; font-size: 13px; }' +
    '#results div:hover, #results div.active { background: #F5F3F7; }' +
    '#results div.active { background: #E8E4EF; }' +
    'button { background: #1B0B3B; color: white; border: none; padding: 10px 24px; ' +
    '  font-size: 14px; cursor: pointer; border-radius: 4px; margin-top: 12px; width: 100%; }' +
    'button:hover { background: #2D1B5E; }' +
    'button:disabled { background: #999; cursor: default; }' +
    '.status { color: #666; font-size: 12px; margin-top: 8px; }' +
    '.count { color: #999; font-size: 11px; margin-top: 4px; }' +
    '</style>' +
    '<div>' +
    '<label><b>Type to search:</b></label>' +
    '<div class="search-wrap">' +
    '  <input type="text" id="search" placeholder="Start typing a company name..." autocomplete="off" />' +
    '  <div id="results"></div>' +
    '</div>' +
    '<div class="count" id="count"></div>' +
    '<button id="btn" onclick="generate()" disabled>Generate Growth Strategy</button>' +
    '<div id="status" class="status"></div>' +
    '</div>' +
    '<script>' +
    'var ALL_NAMES = ' + namesJson + ';' +
    'var selected = "";' +
    'var activeIdx = -1;' +
    'var filtered = [];' +
    '' +
    'var searchEl = document.getElementById("search");' +
    'var resultsEl = document.getElementById("results");' +
    'var btnEl = document.getElementById("btn");' +
    'var countEl = document.getElementById("count");' +
    '' +
    'countEl.innerText = ALL_NAMES.length + " companies in sheet";' +
    '' +
    'searchEl.addEventListener("input", function() {' +
    '  var q = this.value.toLowerCase();' +
    '  selected = "";' +
    '  btnEl.disabled = true;' +
    '  activeIdx = -1;' +
    '  if (q.length < 1) { resultsEl.style.display = "none"; return; }' +
    '  filtered = ALL_NAMES.filter(function(n) { return n.toLowerCase().indexOf(q) !== -1; });' +
    '  if (filtered.length === 0) {' +
    '    resultsEl.innerHTML = "<div style=\\"color:#999\\">No matches</div>";' +
    '  } else {' +
    '    resultsEl.innerHTML = filtered.slice(0, 50).map(function(n, i) {' +
    '      return "<div data-idx=\\"" + i + "\\" onclick=\\"pick(this)\\">" + esc(n) + "</div>";' +
    '    }).join("");' +
    '  }' +
    '  resultsEl.style.display = "block";' +
    '});' +
    '' +
    'searchEl.addEventListener("keydown", function(e) {' +
    '  var items = resultsEl.querySelectorAll("div[data-idx]");' +
    '  if (e.key === "ArrowDown") { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, items.length - 1); highlight(items); }' +
    '  else if (e.key === "ArrowUp") { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); highlight(items); }' +
    '  else if (e.key === "Enter" && activeIdx >= 0 && items[activeIdx]) { e.preventDefault(); pick(items[activeIdx]); }' +
    '});' +
    '' +
    'function highlight(items) {' +
    '  for (var i = 0; i < items.length; i++) items[i].classList.remove("active");' +
    '  if (items[activeIdx]) { items[activeIdx].classList.add("active"); items[activeIdx].scrollIntoView({block:"nearest"}); }' +
    '}' +
    '' +
    'function pick(el) {' +
    '  selected = filtered[parseInt(el.getAttribute("data-idx"))];' +
    '  searchEl.value = selected;' +
    '  resultsEl.style.display = "none";' +
    '  btnEl.disabled = false;' +
    '  activeIdx = -1;' +
    '}' +
    '' +
    'function esc(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }' +
    '' +
    'function generate() {' +
    '  if (!selected) return;' +
    '  document.getElementById("status").innerText = "Generating... this may take a minute.";' +
    '  btnEl.disabled = true;' +
    '  google.script.run' +
    '    .withSuccessHandler(function(url) {' +
    '      document.getElementById("status").innerHTML = ' +
    '        \'Done! <a href="\' + url + \'" target="_blank">Open Document</a>\';' +
    '      btnEl.disabled = false;' +
    '    })' +
    '    .withFailureHandler(function(err) {' +
    '      document.getElementById("status").innerText = "Error: " + err.message;' +
    '      btnEl.disabled = false;' +
    '    })' +
    '    .generateGrowthStrategyDoc(selected);' +
    '}' +
    '' +
    'searchEl.focus();' +
    '</script>';

  var ui = HtmlService.createHtmlOutput(html)
    .setWidth(450)
    .setHeight(280)
    .setTitle('Growth Strategy Generator');

  SpreadsheetApp.getUi().showModalDialog(ui, 'Growth Strategy Generator');
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
  var companyName = 'Everbright, LLC';  // <-- change to any company name in your sheet
  Logger.log('[TEST] Starting test for: ' + companyName);
  var url = generateGrowthStrategyDoc(companyName);
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
