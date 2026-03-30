/**
 * Sheet UI: custom menu, company picker, and entry points.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Growth Strategy')
    .addItem('Generate for Company...', 'showCompanyPicker')
    .addItem('Generate for GTM Group...', 'showGtmGroupPicker')
    .addItem('Generate for Prospect...', 'showProspectDialog')
    .addSeparator()
    .addItem('Generate via Glean (Company)...', 'showGleanCompanyPicker')
    .addItem('Generate via Glean (GTM Group)...', 'showGleanGtmGroupPicker')
    .addSeparator()
    .addItem('Refresh Company Names', 'refreshCompanyNames')
    .addItem('Batch Generate All...', 'batchGenerateAll')
    .addItem('Stop Batch', 'stopBatch')
    .addSeparator()
    .addItem('Set API Key', 'promptApiKey')
    .addItem('Set API User', 'promptApiUser')
    .addItem('Set Output Folder ID', 'promptOutputFolder')
    .addSeparator()
    .addItem('Glean: Set API Base URL', 'promptGleanApiBase')
    .addItem('Glean: Set API Key', 'promptGleanApiKey')
    .addItem('Glean: Set Agent ID', 'promptGleanAgentId')
    .addSeparator()
    .addItem('Glean: Export Test Data (Company)...', 'showGleanExportPicker')
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
    '    .generateAndLog(selected, false);' +
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
 * Show a dialog to enter a prospect company name (not in the sheet).
 * Calls generateGrowthStrategyDoc(name, true) with isProspect = true.
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
    '    .withSuccessHandler(function(url) {' +
    '      document.getElementById("status").innerHTML = ' +
    '        \'Done! <a href="\' + url + \'" target="_blank">Open Document</a>\';' +
    '      btnEl.disabled = false;' +
    '    })' +
    '    .withFailureHandler(function(err) {' +
    '      document.getElementById("status").innerText = "Error: " + err.message;' +
    '      btnEl.disabled = false;' +
    '    })' +
    '    .generateAndLog(name, true);' +
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
 * Identical UI to showCompanyPicker() but calls generateAndLogViaGlean().
 */
function showGleanCompanyPicker() {
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
    'button { background: #0A6EBD; color: white; border: none; padding: 10px 24px; ' +
    '  font-size: 14px; cursor: pointer; border-radius: 4px; margin-top: 12px; width: 100%; }' +
    'button:hover { background: #0857A0; }' +
    'button:disabled { background: #999; cursor: default; }' +
    '.status { color: #666; font-size: 12px; margin-top: 8px; }' +
    '.count { color: #999; font-size: 11px; margin-top: 4px; }' +
    '.badge { display: inline-block; background: #E8F4FD; color: #0A6EBD; ' +
    '  font-size: 11px; padding: 2px 7px; border-radius: 10px; margin-bottom: 10px; }' +
    '</style>' +
    '<div>' +
    '<div class="badge">⚡ Glean Agent</div>' +
    '<label><b>Type to search:</b></label>' +
    '<div class="search-wrap">' +
    '  <input type="text" id="search" placeholder="Start typing a company name..." autocomplete="off" />' +
    '  <div id="results"></div>' +
    '</div>' +
    '<div class="count" id="count"></div>' +
    '<button id="btn" onclick="generate()" disabled>Generate via Glean</button>' +
    '<div id="status" class="status"></div>' +
    '</div>' +
    '<script>' +
    'var ALL_NAMES = ' + namesJson + ';' +
    'var selected = "";' +
    'var activeIdx = -1;' +
    'var filtered = [];' +
    'var searchEl = document.getElementById("search");' +
    'var resultsEl = document.getElementById("results");' +
    'var btnEl = document.getElementById("btn");' +
    'var countEl = document.getElementById("count");' +
    'countEl.innerText = ALL_NAMES.length + " companies in sheet";' +
    'searchEl.addEventListener("input", function() {' +
    '  var q = this.value.toLowerCase(); selected = ""; btnEl.disabled = true; activeIdx = -1;' +
    '  if (q.length < 1) { resultsEl.style.display = "none"; return; }' +
    '  filtered = ALL_NAMES.filter(function(n) { return n.toLowerCase().indexOf(q) !== -1; });' +
    '  resultsEl.innerHTML = filtered.length === 0 ? "<div style=\\"color:#999\\">No matches</div>" :' +
    '    filtered.slice(0, 50).map(function(n, i) { return "<div data-idx=\\"" + i + "\\" onclick=\\"pick(this)\\">" + esc(n) + "</div>"; }).join("");' +
    '  resultsEl.style.display = "block";' +
    '});' +
    'searchEl.addEventListener("keydown", function(e) {' +
    '  var items = resultsEl.querySelectorAll("div[data-idx]");' +
    '  if (e.key === "ArrowDown") { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, items.length - 1); highlight(items); }' +
    '  else if (e.key === "ArrowUp") { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); highlight(items); }' +
    '  else if (e.key === "Enter" && activeIdx >= 0 && items[activeIdx]) { e.preventDefault(); pick(items[activeIdx]); }' +
    '});' +
    'function highlight(items) {' +
    '  for (var i = 0; i < items.length; i++) items[i].classList.remove("active");' +
    '  if (items[activeIdx]) { items[activeIdx].classList.add("active"); items[activeIdx].scrollIntoView({block:"nearest"}); }' +
    '}' +
    'function pick(el) { selected = filtered[parseInt(el.getAttribute("data-idx"))]; searchEl.value = selected; resultsEl.style.display = "none"; btnEl.disabled = false; activeIdx = -1; }' +
    'function esc(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }' +
    'function generate() {' +
    '  if (!selected) return;' +
    '  document.getElementById("status").innerText = "Sending to Glean... this may take 2-3 minutes.";' +
    '  btnEl.disabled = true;' +
    '  google.script.run' +
    '    .withSuccessHandler(function(url) {' +
    '      document.getElementById("status").innerHTML = \'Done! <a href="\' + url + \'" target="_blank">Open Document</a>\';' +
    '      btnEl.disabled = false;' +
    '    })' +
    '    .withFailureHandler(function(err) {' +
    '      document.getElementById("status").innerText = "Error: " + err.message;' +
    '      btnEl.disabled = false;' +
    '    })' +
    '    .generateAndLogViaGlean(selected, false);' +
    '}' +
    'searchEl.focus();' +
    '</script>';

  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(450).setHeight(290).setTitle('Growth Strategy via Glean'),
    'Growth Strategy via Glean'
  );
}

/**
 * GTM group picker that routes to the Glean agent.
 */
function showGleanGtmGroupPicker() {
  var ids = getGtmGroupIds();
  if (ids.length === 0) {
    SpreadsheetApp.getUi().alert('No GTM_GROUP IDs found in the sheet.');
    return;
  }

  var idsJson = JSON.stringify(ids);

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
    'button { background: #0A6EBD; color: white; border: none; padding: 10px 24px; ' +
    '  font-size: 14px; cursor: pointer; border-radius: 4px; margin-top: 12px; width: 100%; }' +
    'button:hover { background: #0857A0; }' +
    'button:disabled { background: #999; cursor: default; }' +
    '.status { color: #666; font-size: 12px; margin-top: 8px; }' +
    '.count { color: #999; font-size: 11px; margin-top: 4px; }' +
    '.badge { display: inline-block; background: #E8F4FD; color: #0A6EBD; ' +
    '  font-size: 11px; padding: 2px 7px; border-radius: 10px; margin-bottom: 10px; }' +
    '</style>' +
    '<div>' +
    '<div class="badge">⚡ Glean Agent</div>' +
    '<label><b>Type to search GTM groups:</b></label>' +
    '<div class="search-wrap">' +
    '  <input type="text" id="search" placeholder="Start typing a GTM group ID..." autocomplete="off" />' +
    '  <div id="results"></div>' +
    '</div>' +
    '<div class="count" id="count"></div>' +
    '<button id="btn" onclick="generate()" disabled>Generate Group via Glean</button>' +
    '<div id="status" class="status"></div>' +
    '</div>' +
    '<script>' +
    'var ALL_NAMES = ' + idsJson + ';' +
    'var selected = "";' +
    'var activeIdx = -1;' +
    'var filtered = [];' +
    'var searchEl = document.getElementById("search");' +
    'var resultsEl = document.getElementById("results");' +
    'var btnEl = document.getElementById("btn");' +
    'var countEl = document.getElementById("count");' +
    'countEl.innerText = ALL_NAMES.length + " GTM groups in sheet";' +
    'searchEl.addEventListener("input", function() {' +
    '  var q = this.value.toLowerCase(); selected = ""; btnEl.disabled = true; activeIdx = -1;' +
    '  if (q.length < 1) { resultsEl.style.display = "none"; return; }' +
    '  filtered = ALL_NAMES.filter(function(n) { return n.toLowerCase().indexOf(q) !== -1; });' +
    '  resultsEl.innerHTML = filtered.length === 0 ? "<div style=\\"color:#999\\">No matches</div>" :' +
    '    filtered.slice(0, 50).map(function(n, i) { return "<div data-idx=\\"" + i + "\\" onclick=\\"pick(this)\\">" + esc(n) + "</div>"; }).join("");' +
    '  resultsEl.style.display = "block";' +
    '});' +
    'searchEl.addEventListener("keydown", function(e) {' +
    '  var items = resultsEl.querySelectorAll("div[data-idx]");' +
    '  if (e.key === "ArrowDown") { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, items.length - 1); highlight(items); }' +
    '  else if (e.key === "ArrowUp") { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); highlight(items); }' +
    '  else if (e.key === "Enter" && activeIdx >= 0 && items[activeIdx]) { e.preventDefault(); pick(items[activeIdx]); }' +
    '});' +
    'function highlight(items) {' +
    '  for (var i = 0; i < items.length; i++) items[i].classList.remove("active");' +
    '  if (items[activeIdx]) { items[activeIdx].classList.add("active"); items[activeIdx].scrollIntoView({block:"nearest"}); }' +
    '}' +
    'function pick(el) { selected = filtered[parseInt(el.getAttribute("data-idx"))]; searchEl.value = selected; resultsEl.style.display = "none"; btnEl.disabled = false; activeIdx = -1; }' +
    'function esc(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }' +
    'function generate() {' +
    '  if (!selected) return;' +
    '  document.getElementById("status").innerText = "Sending to Glean... this may take 2-3 minutes.";' +
    '  btnEl.disabled = true;' +
    '  google.script.run' +
    '    .withSuccessHandler(function(url) {' +
    '      document.getElementById("status").innerHTML = \'Done! <a href="\' + url + \'" target="_blank">Open Document</a>\';' +
    '      btnEl.disabled = false;' +
    '    })' +
    '    .withFailureHandler(function(err) {' +
    '      document.getElementById("status").innerText = "Error: " + err.message;' +
    '      btnEl.disabled = false;' +
    '    })' +
    '    .generateAndLogGroupViaGlean(selected);' +
    '}' +
    'searchEl.focus();' +
    '</script>';

  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(480).setHeight(290).setTitle('GTM Group via Glean'),
    'GTM Group via Glean'
  );
}

// ── GTM Group Picker ───────────────────────────────────────────────────

/**
 * Show a searchable dialog to pick a GTM group and generate a combined report.
 */
function showGtmGroupPicker() {
  var names = getGtmGroupIds();
  if (names.length === 0) {
    SpreadsheetApp.getUi().alert('No GTM_GROUP IDs found in the sheet.');
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
    '<label><b>Type to search GTM groups:</b></label>' +
    '<div class="search-wrap">' +
    '  <input type="text" id="search" placeholder="Start typing a GTM group name..." autocomplete="off" />' +
    '  <div id="results"></div>' +
    '</div>' +
    '<div class="count" id="count"></div>' +
    '<button id="btn" onclick="generate()" disabled>Generate Group Strategy</button>' +
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
    'countEl.innerText = ALL_NAMES.length + " GTM groups in sheet";' +
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
    '  document.getElementById("status").innerText = "Generating... this may take a few minutes.";' +
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
    '    .generateAndLogGroup(selected);' +
    '}' +
    '' +
    'searchEl.focus();' +
    '</script>';

  var ui = HtmlService.createHtmlOutput(html)
    .setWidth(480)
    .setHeight(280)
    .setTitle('Generate for GTM Group');

  SpreadsheetApp.getUi().showModalDialog(ui, 'Generate for GTM Group');
}

/**
 * Wrapper called by the GTM group picker dialog.
 * Delegates to generateGrowthStrategyDocForGroup() and logs the result.
 * @param {string} gtmGroupId  Value of the GTM_GROUP column (Salesforce group ID)
 * @returns {string} doc URL
 */
function generateAndLogGroup(gtmGroupId) {
  var docUrl, errorMsg;
  try {
    docUrl = generateGrowthStrategyDocForGroup(gtmGroupId, '', '');
    logToStatusSheet('[GTM] ' + gtmGroupId, false, 'done', docUrl, '');
    return docUrl;
  } catch (e) {
    errorMsg = e.message || String(e);
    logToStatusSheet('[GTM] ' + gtmGroupId, false, 'error', '', errorMsg);
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
  SpreadsheetApp.getActiveSpreadsheet().toast(
    'COMPANY_NAME column refreshed. ' + count + ' rows — review col ' +
    columnLetter(nameCol + 1) + ' before running the batch.',
    'Company Names Ready',
    8
  );
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
 * Delegates to generateGrowthStrategyDoc() and logs the result to Batch Status.
 *
 * @param {string}  companyName
 * @param {boolean} isProspect
 * @returns {string} doc URL
 */
function generateAndLog(companyName, isProspect) {
  var docUrl, errorMsg;
  try {
    docUrl = generateGrowthStrategyDoc(companyName, "", "", isProspect);
    logToStatusSheet(companyName, isProspect, 'done', docUrl, '');
    return docUrl;
  } catch (e) {
    errorMsg = e.message || String(e);
    logToStatusSheet(companyName, isProspect, 'error', '', errorMsg);
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
 * @param {string}  status      'done' | 'error'
 * @param {string}  docUrl
 * @param {string}  error
 */
function logToStatusSheet(companyName, isProspect, status, docUrl, error) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(BATCH_SHEET_NAME);

  // Create the sheet with the standard header if it doesn't exist yet
  if (!sheet) {
    sheet = ss.insertSheet(BATCH_SHEET_NAME);
    var hdr = sheet.getRange(1, 1, 1, 5);
    hdr.setValues([['COMPANY_NAME', 'STATUS', 'DOC_URL', 'RUN_AT', 'ERROR']]);
    hdr.setFontWeight('bold');
    hdr.setBackground('#1B0B3B');
    hdr.setFontColor('#FFFFFF');
    sheet.setColumnWidth(BATCH_COL_COMPANY, 280);
    sheet.setColumnWidth(BATCH_COL_STATUS,  90);
    sheet.setColumnWidth(BATCH_COL_DOC_URL, 320);
    sheet.setColumnWidth(BATCH_COL_RUN_AT,  160);
    sheet.setColumnWidth(BATCH_COL_ERROR,   300);
    sheet.setFrozenRows(1);
  }

  var displayName = isProspect ? '[PROSPECT] ' + companyName : companyName;
  var runAt = new Date();
  var lastRow = sheet.getLastRow();

  var newRow = [displayName, status, docUrl, runAt, error];

  if (lastRow > 1) {
    var names = sheet.getRange(2, BATCH_COL_COMPANY, lastRow - 1, 1).getValues();

    // Update existing row in place (name unchanged, so position stays correct)
    for (var i = 0; i < names.length; i++) {
      if (String(names[i][0]).trim() === displayName) {
        sheet.getRange(i + 2, 1, 1, 5).setValues([newRow]);
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
    sheet.getRange(insertAt, 1, 1, 5).setValues([newRow]);
  } else {
    // Sheet is empty (header only) — just write to row 2
    sheet.getRange(2, 1, 1, 5).setValues([newRow]);
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
  var url = generateGrowthStrategyDoc(companyName);
  Logger.log('[TEST] Done. Doc URL: ' + url);
}

/**
 * Run this directly from the Apps Script editor to test prospect mode.
 * Uses a company name that is NOT in the sheet.
 */
function testGenerateProspect() {
  var companyName = 'Stripe';  // <-- change to any prospect company name
  Logger.log('[TEST] Starting prospect test for: ' + companyName);
  var url = generateGrowthStrategyDoc(companyName, true);
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

// ── Glean Export Picker ────────────────────────────────────────────────

/**
 * Picker dialog that exports INTERNAL_DATA JSON + ready-to-paste Glean prompt
 * to a Google Doc for any company in the sheet.
 */
function showGleanExportPicker() {
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
    'button { background: #1B6B3A; color: white; border: none; padding: 10px 24px; ' +
    '  font-size: 14px; cursor: pointer; border-radius: 4px; margin-top: 12px; width: 100%; }' +
    'button:hover { background: #145530; }' +
    'button:disabled { background: #999; cursor: default; }' +
    '.status { color: #666; font-size: 12px; margin-top: 8px; }' +
    '.count { color: #999; font-size: 11px; margin-top: 4px; }' +
    '.badge { display: inline-block; background: #E8F5EE; color: #1B6B3A; ' +
    '  font-size: 11px; padding: 2px 7px; border-radius: 10px; margin-bottom: 10px; }' +
    '.note { color: #888; font-size: 11px; margin-top: 6px; }' +
    '</style>' +
    '<div>' +
    '<div class="badge">📋 Export Test Data</div>' +
    '<label><b>Type to search:</b></label>' +
    '<div class="search-wrap">' +
    '  <input type="text" id="search" placeholder="Start typing a company name..." autocomplete="off" />' +
    '  <div id="results"></div>' +
    '</div>' +
    '<div class="count" id="count"></div>' +
    '<button id="btn" onclick="run()" disabled>Export INTERNAL_DATA</button>' +
    '<div id="status" class="status"></div>' +
    '<div class="note">Exports bookscrub data + enrichment as a ready-to-paste Glean prompt to a Google Doc.</div>' +
    '</div>' +
    '<script>' +
    'var ALL_NAMES = ' + namesJson + ';' +
    'var selected = "";' +
    'var activeIdx = -1;' +
    'var filtered = [];' +
    'var searchEl = document.getElementById("search");' +
    'var resultsEl = document.getElementById("results");' +
    'var btnEl = document.getElementById("btn");' +
    'var countEl = document.getElementById("count");' +
    'countEl.innerText = ALL_NAMES.length + " companies in sheet";' +
    'searchEl.addEventListener("input", function() {' +
    '  var q = this.value.toLowerCase(); selected = ""; btnEl.disabled = true; activeIdx = -1;' +
    '  if (q.length < 1) { resultsEl.style.display = "none"; return; }' +
    '  filtered = ALL_NAMES.filter(function(n) { return n.toLowerCase().indexOf(q) !== -1; });' +
    '  resultsEl.innerHTML = filtered.length === 0 ? "<div style=\\"color:#999\\">No matches</div>" :' +
    '    filtered.slice(0, 50).map(function(n, i) { return "<div data-idx=\\"" + i + "\\" onclick=\\"pick(this)\\">" + esc(n) + "</div>"; }).join("");' +
    '  resultsEl.style.display = "block";' +
    '});' +
    'searchEl.addEventListener("keydown", function(e) {' +
    '  var items = resultsEl.querySelectorAll("div[data-idx]");' +
    '  if (e.key === "ArrowDown") { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, items.length - 1); highlight(items); }' +
    '  else if (e.key === "ArrowUp") { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); highlight(items); }' +
    '  else if (e.key === "Enter" && activeIdx >= 0 && items[activeIdx]) { e.preventDefault(); pick(items[activeIdx]); }' +
    '});' +
    'function highlight(items) {' +
    '  for (var i = 0; i < items.length; i++) items[i].classList.remove("active");' +
    '  if (items[activeIdx]) { items[activeIdx].classList.add("active"); items[activeIdx].scrollIntoView({block:"nearest"}); }' +
    '}' +
    'function pick(el) { selected = filtered[parseInt(el.getAttribute("data-idx"))]; searchEl.value = selected; resultsEl.style.display = "none"; btnEl.disabled = false; activeIdx = -1; }' +
    'function esc(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }' +
    'function run() {' +
    '  if (!selected) return;' +
    '  document.getElementById("status").innerText = "Extracting data + running enrichment... ~30 seconds.";' +
    '  btnEl.disabled = true;' +
    '  google.script.run' +
    '    .withSuccessHandler(function() {' +
    '      document.getElementById("status").innerText = "Done! Check the alert for the doc link.";' +
    '      btnEl.disabled = false;' +
    '    })' +
    '    .withFailureHandler(function(err) {' +
    '      document.getElementById("status").innerText = "Error: " + err.message;' +
    '      btnEl.disabled = false;' +
    '    })' +
    '    .exportInternalDataJsonFor(selected, false);' +
    '}' +
    'searchEl.focus();' +
    '</script>';

  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(450).setHeight(300).setTitle('Export Glean Test Data'),
    'Export Glean Test Data'
  );
}
