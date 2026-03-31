/**
 * GleanTrigger — GAS side of the Glean agent integration.
 *
 * Responsibility boundary:
 *   GAS  → extract bookscrub data + run enrichment (EDGAR / Wikipedia / Wikidata)
 *   Glean → external research, synthesis, document creation
 *
 * Entry points (called from Menu.gs):
 *   generateAndLogViaGlean(companyName, isProspect)   — single account
 *   generateAndLogGroupViaGlean(gtmGroupId)            — GTM group
 *
 * Script properties required:
 *   GLEAN_API_BASE   e.g. https://yourco.glean.com/api/v1
 *   GLEAN_API_KEY    Glean API key with agent chat permissions
 *   GLEAN_AGENT_ID   Agent ID from the Glean agent configuration page
 */

var PROP_GLEAN_API_BASE = 'GLEAN_API_BASE';
var PROP_GLEAN_API_KEY  = 'GLEAN_API_KEY';
var PROP_GLEAN_AGENT_ID = 'GLEAN_AGENT_ID';

// ── Public entry points ────────────────────────────────────────────────

/**
 * Called by the Glean company picker dialog.
 * Extracts data + enrichment, hands off to Glean, logs and returns doc URL.
 *
 * @param {string}  companyName
 * @param {boolean} isProspect
 * @returns {string} Google Doc URL
 */
function generateAndLogViaGlean(companyName, isProspect) {
  try {
    var docUrl = triggerGleanReport(companyName, null, isProspect);
    logToStatusSheet(companyName, isProspect, 'done', docUrl, '');
    return docUrl;
  } catch (e) {
    logToStatusSheet(companyName, isProspect, 'error', '', e.message || String(e));
    throw e;
  }
}

/**
 * Called by the Glean GTM group picker dialog.
 * Aggregates group data + enrichment, hands off to Glean, logs and returns doc URL.
 *
 * @param {string} gtmGroupId  Value of the GTM_GROUP column (Salesforce group ID)
 * @returns {string} Google Doc URL
 */
function generateAndLogGroupViaGlean(gtmGroupId) {
  try {
    var groupData = getGtmGroupData(gtmGroupId);
    var docUrl    = triggerGleanReport(groupData.identity.name, groupData, false);
    logToStatusSheet('[GTM] ' + gtmGroupId, false, 'done', docUrl, '');
    return docUrl;
  } catch (e) {
    logToStatusSheet('[GTM] ' + gtmGroupId, false, 'error', '', e.message || String(e));
    throw e;
  }
}

// ── Core pipeline ──────────────────────────────────────────────────────

/**
 * Extract internal data + enrichment, package as JSON, POST to Glean agent,
 * receive analysis JSON, and hand off to GAS doc builder.
 *
 * @param {string}       companyName  Cleaned company name (used as identity for prospect mode)
 * @param {Object|null}  prebuiltData Optional pre-built group data from getGtmGroupData()
 * @param {boolean}      isProspect
 * @param {string}       email        Optional — for Slack progress notifications
 * @param {string}       channelId    Optional — for Slack progress notifications
 * @returns {string} Google Doc URL produced by GAS
 */
function triggerGleanReport(companyName, prebuiltData, isProspect, email, channelId) {
  Logger.log('[Glean] Starting report for: ' + companyName +
    (prebuiltData && prebuiltData.isGtmGroup ? ' [GTM GROUP]' : '') +
    (isProspect ? ' [PROSPECT]' : ''));

  // ── 1. Extract internal bookscrub data ───────────────────────────
  var data = prebuiltData || getCompanyData(companyName, isProspect);

  // ── 2. Run signal matching (same as GAS path) ────────────────────
  var productSignals = generateProductSignals(data);

  // ── 3. Run enrichment: Wikidata + Wikipedia + SEC EDGAR ──────────
  var enrichment = {};
  try {
    enrichment = enrichCompanyData(data.identity.name, data.context.industry);
    Logger.log('[Glean] Enrichment fields: ' + Object.keys(enrichment).filter(function(k) {
      return k.charAt(0) !== '_';
    }).join(', '));
  } catch (e) {
    Logger.log('[Glean] Enrichment failed (non-fatal): ' + e.message);
  }

  // ── 4. Call Glean via infra proxy ────────────────────────────────
  var payload = { account: data, productSignals: productSignals, enrichment: enrichment };
  Logger.log('[Glean] Payload size: ' + JSON.stringify(payload).length + ' chars');

  var gleanAnalysis = callGleanAgentApi(payload);

  // ── 5. Build the Google Doc from the Glean analysis JSON ─────────
  return generateGrowthStrategyDocFromGlean(
    data.identity.name, gleanAnalysis, data, productSignals, enrichment,
    email || '', channelId || '', isProspect
  );
}

// ── Prompt builder ─────────────────────────────────────────────────────

/**
 * Build the message sent to the Glean agent.
 * Embeds internal data + product signals + enrichment as a labelled JSON block.
 * Glean handles everything from here: research, synthesis, doc creation.
 */
function buildGleanPrompt(data, productSignals, enrichment, isProspect) {
  var companyName = data.identity.name;
  var isGroup     = !!(data.isGtmGroup);

  var header;
  if (isGroup) {
    header = 'Generate a Growth Strategy report for the GTM group: **' + companyName +
      '** (Group ID: ' + (data.context.gtmGroup || 'unknown') + ').';
  } else if (isProspect) {
    header = 'Generate a Growth Strategy report for prospect: **' + companyName +
      '**. This company does not have a Docusign account — skip the Docusign Footprint ' +
      'and Account Health sections. Focus on external research and expansion opportunity.';
  } else {
    header = 'Generate a Growth Strategy report for: **' + companyName + '**.';
  }

  var payload = {
    account:        data,
    productSignals: productSignals,
    enrichment:     enrichment
  };

  return header + '\n\n' +
    'The following internal account data has been pre-extracted from the Docusign bookscrub ' +
    'and enriched with SEC EDGAR, Wikipedia, and Wikidata. Use it as the authoritative source ' +
    'for all internal usage sections — do not attempt to re-fetch it.\n\n' +
    '```json\nINTERNAL_DATA\n' + JSON.stringify(payload, null, 2) + '\n```\n\n' +
    'Generate the complete Growth Strategy analysis using your standard workflow. ' +
    'Return the structured JSON output only — do not create a Google Doc.';
}

// ── Glean API caller ───────────────────────────────────────────────────

/**
 * POST internal account data to the Glean agent via the infra proxy.
 * Returns the structured JSON analysis object from the response.
 *
 * @param {Object} payload  { account, productSignals, enrichment }
 * @returns {Object} Glean analysis JSON (accountProfile, businessMap, agreementLandscape,
 *                   contractCommerce, priorityMap, briefing, bigBets)
 */
function callGleanAgentApi(payload) {
  var apiKey  = getApiKey();
  var apiUser = getApiUser();

  if (!apiKey || !apiUser) {
    throw new Error(
      'Infra API credentials not configured. Use Growth Strategy > Settings to set ' +
      'INFRA_API_KEY and INFRA_API_USER.'
    );
  }

  var body = { companyNameForResearch: JSON.stringify(payload) };

  Logger.log('[Glean] POSTing to: ' + GLEAN_ENDPOINT);
  var bodyStr = JSON.stringify(body);
  var chunkSize = 3000;
  for (var ci = 0; ci < bodyStr.length; ci += chunkSize) {
    Logger.log('[Glean] Request body [' + ci + '-' + Math.min(ci + chunkSize, bodyStr.length) + ']: ' +
      bodyStr.substring(ci, ci + chunkSize));
  }

  var fetchOptions = {
    method:             'post',
    contentType:        'application/json',
    headers:            {
      'DOCU-INFRA-IC-KEY':  apiKey,
      'DOCU-INFRA-IC-USER': apiUser
    },
    payload:            JSON.stringify(body),
    muteHttpExceptions: true
  };

  var code, responseBody, response;
  var maxAttempts = 3;
  for (var attempt = 1; attempt <= maxAttempts; attempt++) {
    response     = UrlFetchApp.fetch(GLEAN_ENDPOINT, fetchOptions);
    code         = response.getResponseCode();
    responseBody = response.getContentText();
    Logger.log('[Glean] Attempt ' + attempt + ' — HTTP ' + code + ' | Body length: ' + responseBody.length + ' chars');

    if (code === 200) break;

    if (code === 502 && attempt < maxAttempts) {
      Logger.log('[Glean] 502 received — waiting 30s before retry ' + (attempt + 1) + '/' + maxAttempts);
      Utilities.sleep(30000);
    } else {
      Logger.log('[Glean] Error body: ' + responseBody.substring(0, 1000));
      throw new Error('Glean API returned HTTP ' + code + ': ' + responseBody.substring(0, 500));
    }
  }

  // Extract the response text from the Glean API envelope
  var parsed       = JSON.parse(responseBody);

  if (parsed.Success === true && parsed.Result === null) {
    throw new Error('Glean agent returned Success=true but Result=null — agent may not be configured or did not produce output.');
  }

  var responseText = parsed.Result ||
                     parsed.message ||
                     parsed.content ||
                     (parsed.messages && parsed.messages[0] && parsed.messages[0].content) ||
                     responseBody;

  Logger.log('[Glean] Response text length: ' + String(responseText).length + ' chars');

  // Extract JSON from a ```json ... ``` code block (V3 agent returns this format)
  var jsonStr;
  var blockMatch = String(responseText).match(/```json\s*([\s\S]*?)\s*```/);
  if (blockMatch) {
    jsonStr = blockMatch[1];
  } else {
    // Fall back to the full response text (may already be raw JSON)
    jsonStr = String(responseText);
  }

  // Parse — use tryParseJson for robustness (handles nested envelopes, etc.)
  var analysis = tryParseJson(jsonStr);
  if (!analysis || typeof analysis !== 'object') {
    Logger.log('[Glean] Raw response text (first 3000 chars): ' + String(responseText).substring(0, 3000));
    throw new Error(
      'Glean returned a response but the JSON could not be parsed. ' +
      'Check the Glean agent chat history for the raw output.'
    );
  }

  Logger.log('[Glean] Analysis JSON parsed. Top-level keys: ' + Object.keys(analysis).join(', '));
  return analysis;
}

// ── Script property helpers ────────────────────────────────────────────

function promptGleanApiBase() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.prompt('Glean API Base URL', 'e.g. https://yourco.glean.com/api/v1', ui.ButtonSet.OK_CANCEL);
  if (result.getSelectedButton() === ui.Button.OK) {
    PropertiesService.getScriptProperties().setProperty(PROP_GLEAN_API_BASE, result.getResponseText().trim());
    ui.alert('Glean API Base URL saved.');
  }
}

function promptGleanApiKey() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.prompt('Glean API Key', 'Enter your Glean API key:', ui.ButtonSet.OK_CANCEL);
  if (result.getSelectedButton() === ui.Button.OK) {
    PropertiesService.getScriptProperties().setProperty(PROP_GLEAN_API_KEY, result.getResponseText().trim());
    ui.alert('Glean API Key saved.');
  }
}

function promptGleanAgentId() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.prompt('Glean Agent ID', 'Enter the Agent ID from the Glean agent settings page:', ui.ButtonSet.OK_CANCEL);
  if (result.getSelectedButton() === ui.Button.OK) {
    PropertiesService.getScriptProperties().setProperty(PROP_GLEAN_AGENT_ID, result.getResponseText().trim());
    ui.alert('Glean Agent ID saved.');
  }
}

// ── Test runner ────────────────────────────────────────────────────────

/**
 * Test Glean path for a single account.
 * Run from the Apps Script editor — check Execution Log for the doc URL.
 */
function testGleanGenerate() {
  var companyName = 'Merck Sharp & Dohme LLC';  // <-- change to any company in your sheet
  Logger.log('[TEST] Glean report for: ' + companyName);
  var url = generateAndLogViaGlean(companyName, false);
  Logger.log('[TEST] Done. Doc URL: ' + url);
}

/**
 * Test Glean path for a GTM group.
 */
function testGleanGenerateGroup() {
  var gtmGroupId = 'aSr1W000000Arp3SAC';  // <-- change to any GTM_GROUP ID
  Logger.log('[TEST] Glean GTM group report for: ' + gtmGroupId);
  var url = generateAndLogGroupViaGlean(gtmGroupId);
  Logger.log('[TEST] Done. Doc URL: ' + url);
}

// ── INTERNAL_DATA Export ───────────────────────────────────────────────

/**
 * Export the INTERNAL_DATA JSON for any company in the sheet.
 * Run from the Apps Script editor — output is written to a Google Doc
 * in your Output Folder so you can copy/paste it into Glean for testing.
 *
 * Change companyName below to any company in your sheet.
 */
function exportInternalDataJson() {
  var companyName = 'Merck Sharp & Dohme LLC';  // <-- change this
  exportInternalDataJsonFor(companyName, false);
}

/**
 * Export INTERNAL_DATA for a GTM group.
 * Change gtmGroupId below to any GTM_GROUP ID in your sheet.
 */
function exportInternalDataJsonForGroup() {
  var gtmGroupId = 'aSr1W000000Arp3SAC';  // <-- change this
  var groupData = getGtmGroupData(gtmGroupId);
  _writeInternalDataDoc(groupData, groupData.identity.name + ' [GTM GROUP]');
}

/**
 * Core export logic for a single account.
 * @param {string}  companyName
 * @param {boolean} isProspect
 */
function exportInternalDataJsonFor(companyName, isProspect) {
  Logger.log('[Export] Building INTERNAL_DATA for: ' + companyName);

  var data = getCompanyData(companyName, isProspect);
  var productSignals = generateProductSignals(data);

  var enrichment = {};
  try {
    enrichment = enrichCompanyData(data.identity.name, data.context.industry);
    Logger.log('[Export] Enrichment fields: ' + Object.keys(enrichment).filter(function(k) {
      return k.charAt(0) !== '_';
    }).join(', '));
  } catch (e) {
    Logger.log('[Export] Enrichment failed (non-fatal): ' + e.message);
  }

  var payload = { account: data, productSignals: productSignals, enrichment: enrichment };
  _writeInternalDataDoc(data, companyName, payload);
}

/**
 * Write the INTERNAL_DATA JSON to a Google Doc in the Output Folder.
 * @param {Object} data     The account data object (for title)
 * @param {string} label    Display label for the doc title
 * @param {Object} payload  The full { account, productSignals, enrichment } object
 */
function _writeInternalDataDoc(data, label, payload) {
  if (!payload) {
    // called from group path without payload — build it
    var productSignals = generateProductSignals(data);
    var enrichment = {};
    try { enrichment = enrichCompanyData(data.identity.name, data.context.industry); } catch (e) {}
    payload = { account: data, productSignals: productSignals, enrichment: enrichment };
  }

  var json = JSON.stringify(payload, null, 2);
  var prompt = buildGleanPrompt(data, payload.productSignals, payload.enrichment,
    !!(data.isProspect));

  var docTitle = 'INTERNAL_DATA — ' + label + ' — ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');

  // Write to a Google Doc
  var folderId = PropertiesService.getScriptProperties().getProperty(PROP_OUTPUT_FOLDER);
  var doc = folderId
    ? DocumentApp.create(docTitle)
    : DocumentApp.create(docTitle);

  // Move to output folder if configured
  if (folderId) {
    try {
      var file = DriveApp.getFileById(doc.getId());
      DriveApp.getFolderById(folderId).addFile(file);
      DriveApp.getRootFolder().removeFile(file);
    } catch (e) {
      Logger.log('[Export] Could not move to output folder: ' + e.message);
    }
  }

  var body = doc.getBody();

  // Section 1: ready-to-paste Glean message
  body.appendParagraph('GLEAN TEST PROMPT').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('Paste everything below this line into the Glean agent chat:');
  body.appendParagraph('─'.repeat(60));
  body.appendParagraph(prompt);
  body.appendParagraph('─'.repeat(60));

  // Section 2: raw JSON for reference
  body.appendParagraph('RAW JSON (for reference)').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(json);

  doc.saveAndClose();

  var docUrl = 'https://docs.google.com/document/d/' + doc.getId();
  Logger.log('[Export] Done. Open this doc to copy the Glean prompt:\n' + docUrl);

  SpreadsheetApp.getActiveSpreadsheet().toast(
    'INTERNAL_DATA exported. Open the doc to copy the Glean test prompt.',
    'Export Ready',
    20
  );

  // Also alert with the link so it's easy to find
  SpreadsheetApp.getUi().alert(
    'INTERNAL_DATA exported for: ' + label + '\n\nOpen to copy the Glean prompt:\n' + docUrl
  );
}
