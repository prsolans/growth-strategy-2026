/**
 * GleanTrigger — GAS orchestration for the Glean agent multi-step workflow (V5).
 *
 * Architecture (V5):
 *   GAS drives 5 sequential calls to one Glean agent endpoint.
 *   Each call passes a STEP: marker so Glean routes to the correct branch.
 *
 *   Steps 1+2 — PARALLEL: company-search + web-search (research, lightweight)
 *   Step 3     — think1: Company Profile Synthesis → accountProfile JSON
 *   Step 4     — think2: Business Map + Agreements + Commerce → appendix JSON
 *   Step 5     — think3: Docusign Strategy → briefing + bigBets JSON
 *
 *   GAS assembles all results and calls generateGrowthStrategyDocFromGlean().
 *
 * Entry points (called from Menu.gs):
 *   generateAndLogViaGlean(companyName, isProspect)   — single account
 *   generateAndLogGroupViaGlean(gtmGroupId)            — GTM group
 *
 * Script properties required:
 *   INFRA_API_KEY    Infra proxy API key
 *   INFRA_API_USER   Infra proxy API user
 */

var PROP_GLEAN_API_BASE = 'GLEAN_API_BASE';
var PROP_GLEAN_API_KEY  = 'GLEAN_API_KEY';
var PROP_GLEAN_AGENT_ID = 'GLEAN_AGENT_ID';

// ── Public entry points ────────────────────────────────────────────────

/**
 * Called by the Glean company picker dialog.
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
 * Orchestrates 5 Glean calls, accumulates results, builds the Google Doc.
 *
 * @param {string}       companyName   Display name
 * @param {Object|null}  prebuiltData  Optional pre-built group data
 * @param {boolean}      isProspect
 * @param {string}       email         Optional — for Slack progress notifications
 * @param {string}       channelId     Optional — for Slack progress notifications
 * @returns {string} Google Doc URL
 */
function triggerGleanReport(companyName, prebuiltData, isProspect, email, channelId) {
  Logger.log('[Glean] Starting V5 multi-step report for: ' + companyName +
    (prebuiltData && prebuiltData.isGtmGroup ? ' [GTM GROUP]' : '') +
    (isProspect ? ' [PROSPECT]' : ''));

  // ── 1. Extract internal bookscrub data ───────────────────────────
  var data = prebuiltData || getCompanyData(companyName, isProspect);

  // ── 2. Run signal matching ───────────────────────────────────────
  var productSignals = generateProductSignals(data);

  // ── 3. Run enrichment ────────────────────────────────────────────
  var enrichment = {};
  try {
    enrichment = enrichCompanyData(data.identity.name, data.context.industry);
    Logger.log('[Glean] Enrichment fields: ' + Object.keys(enrichment).filter(function(k) {
      return k.charAt(0) !== '_';
    }).join(', '));
  } catch (e) {
    Logger.log('[Glean] Enrichment failed (non-fatal): ' + e.message);
  }

  var payload    = { account: data, productSignals: productSignals, enrichment: enrichment };
  var payloadStr = JSON.stringify(payload);
  Logger.log('[Glean] Payload size: ' + payloadStr.length + ' chars');

  var companyName_ = data.identity.name;
  var industry     = data.context.industry;

  // ── Steps 1+2: Research — PARALLEL ──────────────────────────────
  Logger.log('[Glean] Steps 1+2: company-search + web-search (parallel)...');
  var internalResearch = '';
  var externalResearch = '';
  try {
    var research     = _runResearchParallel(companyName_, industry);
    internalResearch = research.internal;
    externalResearch = research.external;
    Logger.log('[Glean] Research done. Internal: ' + internalResearch.length +
      ' chars | External: ' + externalResearch.length + ' chars');
  } catch (e) {
    Logger.log('[Glean] Research steps failed (non-fatal): ' + e.message);
  }

  // ── Step 3: Think 1 — Company Profile ───────────────────────────
  Logger.log('[Glean] Step 3: think1 — Company Profile...');
  var think1Text = _postToGleanStep('think1',
    _buildThink1Message(payloadStr, internalResearch, externalResearch, isProspect));
  var think1Data = _parseStepJson(think1Text, 'think1');
  var accountProfile = think1Data.accountProfile || {};
  Logger.log('[Glean] think1 done. accountProfile keys: ' + Object.keys(accountProfile).join(', '));

  // ── Step 4: Think 2 — Business Map + Agreements + Commerce ──────
  Logger.log('[Glean] Step 4: think2 — Business Map + Agreements + Commerce...');
  var think2Text = _postToGleanStep('think2',
    _buildThink2Message(payloadStr, accountProfile, isProspect));
  var think2Data = _parseStepJson(think2Text, 'think2');
  Logger.log('[Glean] think2 done. Keys: ' + Object.keys(think2Data).join(', '));

  // ── Step 5: Think 3 — Docusign Strategy ─────────────────────────
  Logger.log('[Glean] Step 5: think3 — Docusign Strategy...');
  var think3Text = _postToGleanStep('think3',
    _buildThink3Message(payloadStr, accountProfile, think2Data, isProspect));
  var think3Data = _parseStepJson(think3Text, 'think3');
  Logger.log('[Glean] think3 done. Keys: ' + Object.keys(think3Data).join(', '));

  // ── Assemble full analysis ───────────────────────────────────────
  var gleanAnalysis = {
    accountProfile:     accountProfile,
    businessMap:        think2Data.businessMap         || {},
    agreementLandscape: think2Data.agreementLandscape  || {},
    contractCommerce:   think2Data.contractCommerce    || {},
    briefing:           think3Data.briefing            || {},
    bigBets:            think3Data.bigBets             || {}
  };

  Logger.log('[Glean] Analysis assembled. agreementLandscape count: ' +
    ((gleanAnalysis.agreementLandscape.agreements || []).length));

  // ── Build the Google Doc ─────────────────────────────────────────
  return generateGrowthStrategyDocFromGlean(
    data.identity.name, gleanAnalysis, data, productSignals, enrichment,
    email || '', channelId || '', isProspect
  );
}

// ── Step runners ───────────────────────────────────────────────────────

/**
 * Fire company-search and web-search in parallel using fetchAll.
 * Research failures are non-fatal — Think steps degrade gracefully with empty strings.
 */
function _runResearchParallel(companyName, industry) {
  var apiKey  = getApiKey();
  var apiUser = getApiUser();
  var headers = { 'DOCU-INFRA-IC-KEY': apiKey, 'DOCU-INFRA-IC-USER': apiUser };

  var makeReq = function(step, msg) {
    return {
      url:              GLEAN_ENDPOINT,
      method:           'post',
      contentType:      'application/json',
      headers:          headers,
      payload:          JSON.stringify({ step: step, companyNameForResearch: msg }),
      muteHttpExceptions: true
    };
  };

  var msg1 = 'STEP: company-search\n\nCOMPANY: ' + companyName + '\nINDUSTRY: ' + industry;
  var msg2 = 'STEP: web-search\n\nCOMPANY: ' + companyName + '\nINDUSTRY: ' + industry;

  var responses = UrlFetchApp.fetchAll([makeReq('company-search', msg1), makeReq('web-search', msg2)]);

  return {
    internal: _extractResponseText(responses[0], 'company-search'),
    external: _extractResponseText(responses[1], 'web-search')
  };
}

/**
 * POST a single step to the Glean agent. Retries on 500/502.
 * @param {string} stepName       e.g. 'think1'
 * @param {string} messageContent Full message string (starts with STEP: ...)
 * @returns {string} Raw response text from Glean
 */
function _postToGleanStep(stepName, messageContent) {
  var apiKey  = getApiKey();
  var apiUser = getApiUser();

  if (!apiKey || !apiUser) {
    throw new Error(
      'Infra API credentials not configured. Use Growth Strategy > Settings to set ' +
      'INFRA_API_KEY and INFRA_API_USER.'
    );
  }

  Logger.log('[Glean] ' + stepName + ' — payload size: ' + messageContent.length + ' chars');
  Logger.log('[Glean] ' + stepName + ' — message prefix: ' +
    JSON.stringify(messageContent.substring(0, 80)));

  var fetchOptions = {
    method:             'post',
    contentType:        'application/json',
    headers:            { 'DOCU-INFRA-IC-KEY': apiKey, 'DOCU-INFRA-IC-USER': apiUser },
    payload:            JSON.stringify({ step: stepName, companyNameForResearch: messageContent }),
    muteHttpExceptions: true
  };

  var maxAttempts = 3;
  var code, responseBody, response;

  for (var attempt = 1; attempt <= maxAttempts; attempt++) {
    Logger.log('[Glean] ' + stepName + ' — attempt ' + attempt + ' — POSTing to ' + GLEAN_ENDPOINT);
    response     = UrlFetchApp.fetch(GLEAN_ENDPOINT, fetchOptions);
    code         = response.getResponseCode();
    responseBody = response.getContentText();
    Logger.log('[Glean] ' + stepName + ' — HTTP ' + code +
      ' | Body length: ' + responseBody.length + ' chars');

    if (code === 200) break;

    if ((code === 500 || code === 502) && attempt < maxAttempts) {
      Logger.log('[Glean] ' + stepName + ' — HTTP ' + code +
        ' — waiting 60s before retry ' + (attempt + 1) + '/' + maxAttempts);
      Utilities.sleep(60000);
    } else {
      Logger.log('[Glean] ' + stepName + ' error body: ' + responseBody.substring(0, 1000));
      throw new Error('[' + stepName + '] Glean API returned HTTP ' + code +
        ': ' + responseBody.substring(0, 500));
    }
  }

  return _extractResponseText(response, stepName);
}

/**
 * Unwrap the Glean proxy response envelope and return the text content.
 * Handles both HTTPResponse objects (from fetch) and raw response bodies (from fetchAll).
 */
function _extractResponseText(responseOrBody, stepName) {
  var code, bodyStr;

  if (typeof responseOrBody === 'string') {
    // Raw string (legacy path)
    bodyStr = responseOrBody;
    code    = 200;
  } else {
    // HTTPResponse object
    code    = responseOrBody.getResponseCode();
    bodyStr = responseOrBody.getContentText();
  }

  if (code !== 200) {
    Logger.log('[Glean] ' + stepName + ' — non-200 (' + code + '): ' + bodyStr.substring(0, 500));
    return '';
  }

  var parsed;
  try {
    parsed = JSON.parse(bodyStr);
  } catch (e) {
    Logger.log('[Glean] ' + stepName + ' — response is not JSON, using as plain text');
    return String(bodyStr);
  }

  if (parsed.Success === true && parsed.Result === null) {
    Logger.log('[Glean] ' + stepName + ' — Result is null');
    return '';
  }

  var text = parsed.Result ||
             parsed.message ||
             parsed.content ||
             (parsed.messages && parsed.messages[0] && parsed.messages[0].content) ||
             bodyStr;

  Logger.log('[Glean] ' + stepName + ' — response text length: ' + String(text).length + ' chars');
  return String(text);
}

/**
 * Extract a JSON object from a Glean step response.
 * Handles ```json ... ``` fenced blocks and raw JSON.
 * Returns {} on any parse failure (non-fatal — doc sections degrade gracefully).
 */
function _parseStepJson(responseText, stepName) {
  if (!responseText) {
    Logger.log('[Glean] ' + stepName + ' — empty response, returning {}');
    return {};
  }

  var blockMatch = String(responseText).match(/```json\s*([\s\S]*?)\s*```/);
  var jsonStr    = blockMatch ? blockMatch[1] : String(responseText);

  var parsed = tryParseJson(jsonStr);
  if (!parsed || typeof parsed !== 'object') {
    Logger.log('[Glean] ' + stepName + ' — JSON parse failed. First 2000 chars: ' +
      jsonStr.substring(0, 2000));
    return {};
  }

  Logger.log('[Glean] ' + stepName + ' — parsed OK. Keys: ' + Object.keys(parsed).join(', '));
  return parsed;
}

// ── Message builders ───────────────────────────────────────────────────

/**
 * Think 1 message: parse internal data + synthesize company profile.
 * Receives full payload + both research summaries.
 *
 * Field labels match V5 prompt instructions:
 *   companyNameForResearch: — account payload JSON
 *   INTERNAL_RESEARCH:      — Glean company search summary
 *   EXTERNAL_RESEARCH:      — web search results
 */
function _buildThink1Message(payloadStr, internalResearch, externalResearch, isProspect) {
  var lines = ['STEP: think1', ''];
  if (isProspect) {
    lines.push('NOTE: This is a PROSPECT account — no Docusign usage data exists. ' +
      'Skip account health indicators. Focus on external research for the profile.', '');
  }
  lines.push('companyNameForResearch:', payloadStr, '');
  if (internalResearch) {
    lines.push('INTERNAL_RESEARCH:', internalResearch, '');
  }
  if (externalResearch) {
    // Cap external research to keep total message under proxy size limit.
    // Web-search Respond now returns compact JSON (~3K), so this cap is
    // a safety net against unexpectedly verbose responses.
    var MAX_RESEARCH = 5000;
    var truncated = externalResearch.length > MAX_RESEARCH
      ? externalResearch.substring(0, MAX_RESEARCH) + '\n[truncated]'
      : externalResearch;
    if (externalResearch.length > MAX_RESEARCH) {
      Logger.log('[Glean] think1 — external research truncated from ' +
        externalResearch.length + ' to ' + MAX_RESEARCH + ' chars');
    }
    lines.push('EXTERNAL_RESEARCH:', truncated);
  }
  return lines.join('\n');
}

/**
 * Think 2 message: build business map, agreement landscape, and contract commerce.
 * Receives full payload (for enrichment.financials) + accountProfile from Think 1.
 *
 * Field labels match V5 prompt instructions:
 *   companyNameForResearch: — full account payload (use enrichment.financials)
 *   ACCOUNT_PROFILE:        — accountProfile JSON from Think 1
 */
function _buildThink2Message(payloadStr, accountProfile, isProspect) {
  var lines = ['STEP: think2', ''];
  if (isProspect) {
    lines.push('NOTE: This is a PROSPECT account.', '');
  }
  lines.push('companyNameForResearch:', payloadStr, '');
  if (accountProfile && Object.keys(accountProfile).length > 0) {
    lines.push('ACCOUNT_PROFILE:', JSON.stringify(accountProfile, null, 2));
  }
  return lines.join('\n');
}

/**
 * Think 3 message: synthesize Docusign strategy (briefing + bigBets).
 * Receives full payload (for productSignals) + accountProfile + appendix data from Think 2.
 *
 * Field labels match V5 prompt instructions:
 *   companyNameForResearch: — full account payload (use productSignals from here)
 *   ACCOUNT_PROFILE:        — accountProfile JSON from Think 1
 *   APPENDIX_DATA:          — businessMap + agreementLandscape + contractCommerce from Think 2
 */
function _buildThink3Message(payloadStr, accountProfile, appendixData, isProspect) {
  var lines = ['STEP: think3', ''];
  if (isProspect) {
    lines.push('NOTE: This is a PROSPECT account — no Docusign usage data. ' +
      'productSignals may be empty. Focus on external signals and company initiatives.', '');
  }
  lines.push('companyNameForResearch:', payloadStr, '');
  if (accountProfile && Object.keys(accountProfile).length > 0) {
    lines.push('ACCOUNT_PROFILE:', JSON.stringify(accountProfile, null, 2), '');
  }
  if (appendixData && Object.keys(appendixData).length > 0) {
    lines.push('APPENDIX_DATA:', JSON.stringify(appendixData, null, 2));
  }
  return lines.join('\n');
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

// ── Test runners ───────────────────────────────────────────────────────

/**
 * Test Glean V5 path for a single account.
 * Run from the Apps Script editor — check Execution Log for the doc URL.
 */
function testGleanGenerate() {
  var companyName = 'Merck Sharp & Dohme LLC';  // <-- change to any company in your sheet
  Logger.log('[TEST] Glean V5 report for: ' + companyName);
  var url = generateAndLogViaGlean(companyName, false);
  Logger.log('[TEST] Done. Doc URL: ' + url);
}

/**
 * Test Glean V5 path for a GTM group.
 */
function testGleanGenerateGroup() {
  var gtmGroupId = 'aSr1W000000Arp3SAC';  // <-- change to any GTM_GROUP ID
  Logger.log('[TEST] Glean V5 GTM group report for: ' + gtmGroupId);
  var url = generateAndLogGroupViaGlean(gtmGroupId);
  Logger.log('[TEST] Done. Doc URL: ' + url);
}

/**
 * Test just the research steps (company-search + web-search in parallel).
 * Useful for verifying branch routing before running full pipeline.
 */
function testGleanResearchSteps() {
  var companyName = 'Merck Sharp & Dohme LLC';  // <-- change this
  var industry    = 'Healthcare';               // <-- change this
  Logger.log('[TEST] Running research steps for: ' + companyName);
  var research = _runResearchParallel(companyName, industry);
  Logger.log('[TEST] Internal research (' + research.internal.length + ' chars):\n' +
    research.internal.substring(0, 1000));
  Logger.log('[TEST] External research (' + research.external.length + ' chars):\n' +
    research.external.substring(0, 1000));
}

/**
 * Minimal branch routing test for the Think steps.
 * Sends a tiny think1 message (no payload, no research) to verify that
 * the Glean branch condition "Message starts with STEP: think1" is working.
 * Expected response: a valid JSON object with an accountProfile key (even if empty/minimal).
 * If you get conversational text back, the branch condition isn't matching.
 */
function testGleanThinkBranchRouting() {
  Logger.log('[TEST] Sending minimal STEP: think1 message to verify branch routing...');
  var minimalMessage = [
    'STEP: think1',
    '',
    'companyNameForResearch:',
    JSON.stringify({
      account: {
        identity: { name: 'Test Company' },
        context: { industry: 'Technology' }
      },
      productSignals: {},
      enrichment: {}
    }),
    '',
    'INTERNAL_RESEARCH: No internal results found.',
    '',
    'EXTERNAL_RESEARCH: Test Company is a mid-size technology firm.'
  ].join('\n');

  Logger.log('[TEST] Sending think1 (minimal). First 100 chars: ' +
    minimalMessage.substring(0, 100));
  var responseText = _postToGleanStep('think1-routing-test', minimalMessage);
  Logger.log('[TEST] Response (' + responseText.length + ' chars):\n' +
    responseText.substring(0, 2000));

  var parsed = _parseStepJson(responseText, 'think1-routing-test');
  if (parsed && parsed.accountProfile) {
    Logger.log('[TEST] ✅ Branch routing WORKS — got accountProfile key');
  } else {
    Logger.log('[TEST] ❌ Branch routing FAILED — no accountProfile in response');
    Logger.log('[TEST] Verify the Glean agent has a branch with condition:');
    Logger.log('[TEST]   "Message starts with STEP: think1"');
  }
}

// ── INTERNAL_DATA Export ───────────────────────────────────────────────

/**
 * Export the INTERNAL_DATA JSON for any company in the sheet.
 * Writes a Google Doc with all 5 step messages so you can paste each
 * into the Glean agent chat for manual testing.
 */
function exportInternalDataJson() {
  var companyName = 'Merck Sharp & Dohme LLC';  // <-- change this
  exportInternalDataJsonFor(companyName, false);
}

/**
 * Export INTERNAL_DATA for a GTM group.
 */
function exportInternalDataJsonForGroup() {
  var gtmGroupId = 'aSr1W000000Arp3SAC';  // <-- change this
  var groupData = getGtmGroupData(gtmGroupId);
  _writeInternalDataDoc(groupData, groupData.identity.name + ' [GTM GROUP]');
}

/**
 * Core export logic for a single account.
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
  _writeInternalDataDoc(data, companyName, payload, isProspect);
}

/**
 * Write all 5 Glean step messages to a Google Doc for manual testing.
 */
function _writeInternalDataDoc(data, label, payload, isProspect) {
  if (!payload) {
    var ps = generateProductSignals(data);
    var en = {};
    try { en = enrichCompanyData(data.identity.name, data.context.industry); } catch (e) {}
    payload = { account: data, productSignals: ps, enrichment: en };
  }

  var payloadStr       = JSON.stringify(payload, null, 2);
  var companyName_     = data.identity.name;
  var industry         = data.context.industry;
  var isProspect_      = !!(isProspect || data.isProspect);

  var docTitle = 'INTERNAL_DATA — ' + label + ' — ' +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');

  var doc = DocumentApp.create(docTitle);
  var folderId = PropertiesService.getScriptProperties().getProperty(PROP_OUTPUT_FOLDER);
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

  var addSection = function(title, content) {
    body.appendParagraph(title).setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph('Paste everything below this line into the Glean agent chat:');
    body.appendParagraph('─'.repeat(60));
    body.appendParagraph(content);
    body.appendParagraph('─'.repeat(60));
  };

  addSection('Step 1 — STEP: company-search',
    'STEP: company-search\n\nCOMPANY: ' + companyName_ + '\nINDUSTRY: ' + industry);

  addSection('Step 2 — STEP: web-search',
    'STEP: web-search\n\nCOMPANY: ' + companyName_ + '\nINDUSTRY: ' + industry);

  addSection('Step 3 — STEP: think1',
    _buildThink1Message(payloadStr,
      '[paste internal research from Step 1 here]',
      '[paste external research from Step 2 here]',
      isProspect_));

  addSection('Step 4 — STEP: think2',
    _buildThink2Message(payloadStr,
      { _note: 'paste accountProfile JSON from Step 3 response here' },
      isProspect_));

  addSection('Step 5 — STEP: think3',
    _buildThink3Message(payloadStr,
      { _note: 'paste accountProfile JSON from Step 3 response here' },
      { _note: 'paste businessMap + agreementLandscape + contractCommerce JSON from Step 4 here' },
      isProspect_));

  body.appendParagraph('RAW PAYLOAD JSON').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(payloadStr);

  doc.saveAndClose();

  var docUrl = 'https://docs.google.com/document/d/' + doc.getId();
  Logger.log('[Export] Done. Open this doc to copy the Glean step messages:\n' + docUrl);

  SpreadsheetApp.getActiveSpreadsheet().toast(
    'INTERNAL_DATA exported. Open the doc to copy the step messages.',
    'Export Ready',
    20
  );

  try {
    SpreadsheetApp.getUi().alert(
      'INTERNAL_DATA exported for: ' + label + '\n\nOpen to copy the Glean step messages:\n' + docUrl
    );
  } catch (e) {
    // getUi() is unavailable when run from the script editor — URL already logged above
  }
}
