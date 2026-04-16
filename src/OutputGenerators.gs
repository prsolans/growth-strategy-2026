/**
 * OutputGenerators — L3 output generators for the 3-layer architecture.
 *
 * Each generator reads cached L2 intelligence and produces a deliverable.
 * Most require a single LLM call. Some (brief, full report) just assemble
 * existing doc builders with no additional LLM call.
 *
 * Entry point:
 *   generateOutput(companyName, outputType, options)
 *
 * Generator registry:
 *   follow_up_email   — post-meeting follow-up email (1 LLM call, plain text)
 *   [future: ar_brief, ar_full, value_case, pov_deck, champion_brief]
 */

// ── Generator registry ──────────────────────────────────────────────────

var OUTPUT_GENERATORS = {
  follow_up_email: {
    label:    'Follow-Up Email',
    fn:       _generateFollowUpEmail,
    needsL1:  false
  },
  ar_brief: {
    label:    'Account Intelligence Brief',
    fn:       _generateARBrief,
    needsL1:  true
  },
  ar_full: {
    label:    'Full Account Research Report',
    fn:       _generateARFull,
    needsL1:  true
  },
  champion_brief: {
    label:    'Champion Brief',
    fn:       _generateChampionBrief,
    needsL1:  false
  }
};

// ── Universal entry point ───────────────────────────────────────────────

/**
 * Generates an output from cached intelligence.
 *
 * @param {string} companyName
 * @param {string} outputType   Key from OUTPUT_GENERATORS
 * @param {Object} [options]    Generator-specific options (e.g. meetingNotes, audience)
 * @returns {{ type: string, title: string, content: string, url: string|null }}
 */
function generateOutput(companyName, outputType, options) {
  var start = Date.now();
  options = options || {};

  var generator = OUTPUT_GENERATORS[outputType];
  if (!generator) {
    throw new Error('[OutputGenerators] Unknown output type: ' + outputType);
  }

  Logger.log('[OutputGenerators] Generating "' + outputType + '" for "' + companyName + '"');

  // Load L2 (required for all generators)
  var cachedL2 = getIntelligenceCache(companyName);
  if (!cachedL2 || !cachedL2.intelligence) {
    throw new Error('[OutputGenerators] No intelligence cache for "' + companyName + '" — run AR first');
  }

  // Load L1 if the generator needs it
  var cachedL1 = null;
  if (generator.needsL1) {
    cachedL1 = getResearchCache(companyName);
    if (!cachedL1 || !cachedL1.research) {
      throw new Error('[OutputGenerators] No research cache for "' + companyName + '" — run AR first');
    }
  }

  var result = generator.fn(companyName, cachedL2.intelligence, cachedL1 ? cachedL1.research : null, options);

  // Log deliverable
  try {
    if (result.url) {
      logDeliverable(companyName, outputType, result.title, result.url, 'Content Factory');
    }
  } catch (e) {
    Logger.log('[OutputGenerators] logDeliverable failed (non-fatal): ' + e.message);
  }

  var elapsed = ((Date.now() - start) / 1000).toFixed(1);
  Logger.log('[OutputGenerators] "' + outputType + '" for "' + companyName + '" complete (' + elapsed + 's)');

  return result;
}

// ── Follow-Up Email Generator ───────────────────────────────────────────

/**
 * Generates a post-meeting follow-up email using cached L2 intelligence.
 *
 * @param {string} companyName
 * @param {Object} intel       L2 intelligence (7 objects)
 * @param {Object} research    L1 research (unused for this generator)
 * @param {Object} options     { meetingNotes?: string, audience?: string, tone?: string }
 * @returns {{ type: string, title: string, content: string, url: null }}
 */
function _generateFollowUpEmail(companyName, intel, research, options) {
  var meetingNotes = options.meetingNotes || '';
  var audience     = options.audience || 'the customer';
  var tone         = options.tone || 'professional and consultative';

  var prompt = [
    'You are a senior enterprise account executive at Docusign.',
    'Write a follow-up email after a meeting with ' + companyName + '.',
    '',
    'Use the following intelligence to make the email specific and valuable:',
    '',
    '## Account Profile',
    JSON.stringify(intel.accountProfile || {}, null, 2),
    '',
    '## Priority Map',
    JSON.stringify(intel.priorityMap || {}, null, 2),
    '',
    '## Briefing',
    JSON.stringify(intel.briefing || {}, null, 2),
    '',
    '## Big Bets',
    JSON.stringify(intel.bigBets || {}, null, 2)
  ];

  if (meetingNotes) {
    prompt.push('', '## Meeting Notes (provided by the user)', meetingNotes);
  }

  prompt.push(
    '',
    '## Instructions',
    '- Audience: ' + audience,
    '- Tone: ' + tone,
    '- Reference specific company initiatives, priorities, or challenges from the intelligence',
    '- Suggest concrete next steps tied to Docusign capabilities that address their priorities',
    '- Keep it concise — 3-4 paragraphs max',
    '- Do NOT use placeholder brackets like [Name] — write a complete email',
    '- Subject line first, then the email body',
    '',
    'Output the email as plain text. Subject line on the first line, then a blank line, then the body.'
  );

  var promptStr = prompt.join('\n');
  Logger.log('[OutputGenerators] follow_up_email prompt size: ' + promptStr.length + ' chars');

  var emailText = _callLLM(promptStr);

  return {
    type:    'follow_up_email',
    title:   'Follow-Up Email — ' + companyName,
    content: emailText,
    url:     null
  };
}

// ── AR Brief Generator (no LLM) ─────────────────────────────────────────

/**
 * Generates an Account Intelligence Brief using the existing _buildBriefDoc builder.
 * No LLM call — just assembles cached data into the doc template.
 *
 * @param {string} companyName
 * @param {Object} intel       L2 intelligence (7 objects)
 * @param {Object} research    L1 research { data, productSignals, enrichment, gleanResearch }
 * @param {Object} options     (unused)
 * @returns {{ type: string, title: string, content: null, url: string }}
 */
function _generateARBrief(companyName, intel, research, options) {
  Logger.log('[OutputGenerators] ar_brief — building doc from cached data');

  var briefUrl = _buildBriefDoc(
    research.data, research.productSignals, research.enrichment,
    intel.accountProfile, intel.businessMap, intel.agreementLandscape,
    intel.contractCommerce, intel.priorityMap, intel.briefing, intel.bigBets,
    '', '', false, 'glean', null
  );

  return {
    type:    'ar_brief',
    title:   'Account Intelligence Brief — ' + companyName,
    content: null,
    url:     briefUrl
  };
}

// ── AR Full Report Generator (no LLM) ──────────────────────────────────

/**
 * Generates a Full Account Research Report using the existing _buildResearchDoc builder.
 * No LLM call — just assembles cached data into the doc template.
 *
 * @param {string} companyName
 * @param {Object} intel       L2 intelligence (7 objects)
 * @param {Object} research    L1 research { data, productSignals, enrichment, gleanResearch }
 * @param {Object} options     (unused)
 * @returns {{ type: string, title: string, content: null, url: string }}
 */
function _generateARFull(companyName, intel, research, options) {
  Logger.log('[OutputGenerators] ar_full — building doc from cached data');

  var result = _buildResearchDoc(
    research.data, research.productSignals, research.enrichment,
    intel.accountProfile, intel.businessMap, intel.agreementLandscape,
    intel.contractCommerce, intel.priorityMap, intel.briefing, intel.bigBets,
    '', '', false, 'glean'
  );

  return {
    type:    'ar_full',
    title:   'Full Account Research Report — ' + companyName,
    content: null,
    url:     result.fullUrl || result.briefUrl
  };
}

// ── Champion Brief Generator (1 LLM call) ──────────────────────────────

/**
 * Generates a Champion Brief — a concise doc to arm an internal champion
 * with talking points for selling Docusign internally at their company.
 *
 * @param {string} companyName
 * @param {Object} intel       L2 intelligence (7 objects)
 * @param {Object} research    L1 research (unused)
 * @param {Object} options     { championName?: string, championRole?: string }
 * @returns {{ type: string, title: string, content: string, url: null }}
 */
function _generateChampionBrief(companyName, intel, research, options) {
  var championName = options.championName || '';
  var championRole = options.championRole || '';

  var prompt = [
    'You are a senior enterprise account strategist at Docusign.',
    'Create a Champion Brief for ' + companyName + '.',
    '',
    'A Champion Brief is a document designed to arm an internal champion at the customer',
    'with the talking points and business case they need to advocate for Docusign internally.',
    ''
  ];

  if (championName || championRole) {
    prompt.push('## Champion');
    if (championName) prompt.push('- Name: ' + championName);
    if (championRole) prompt.push('- Role: ' + championRole);
    prompt.push('');
  }

  prompt.push(
    '## Account Profile',
    JSON.stringify(intel.accountProfile || {}, null, 2),
    '',
    '## Priority Map',
    JSON.stringify(intel.priorityMap || {}, null, 2),
    '',
    '## Big Bets',
    JSON.stringify(intel.bigBets || {}, null, 2),
    '',
    '## Briefing',
    JSON.stringify(intel.briefing || {}, null, 2),
    '',
    '## Instructions',
    'Create a Champion Brief with these sections:',
    '1. **Executive Summary** — 2-3 sentences on why Docusign matters for ' + companyName,
    '2. **Business Case** — 3-4 bullet points connecting their priorities to Docusign capabilities',
    '3. **Internal Talking Points** — What the champion should say to their leadership',
    '4. **Objection Handling** — Anticipated pushback and responses',
    '5. **Recommended Next Steps** — 2-3 concrete actions',
    '',
    'Write in a tone that a customer champion could use directly — not overly salesy,',
    'focused on business value and outcomes. Use plain text with markdown headers.'
  );

  var promptStr = prompt.join('\n');
  Logger.log('[OutputGenerators] champion_brief prompt size: ' + promptStr.length + ' chars');

  var briefText = _callLLM(promptStr);

  return {
    type:    'champion_brief',
    title:   'Champion Brief — ' + companyName,
    content: briefText,
    url:     null
  };
}

// ── LLM call helper ─────────────────────────────────────────────────────

/**
 * Sends a prompt to the Glean agent endpoint for LLM processing.
 * Uses the existing infra proxy with a 'generate' step.
 *
 * @param {string} prompt
 * @returns {string} LLM response text
 */
function _callLLM(prompt) {
  var apiKey  = getApiKey();
  var apiUser = getApiUser();

  if (!apiKey || !apiUser) {
    throw new Error('[OutputGenerators] Infra API credentials not configured');
  }

  var fetchOptions = {
    method:             'post',
    contentType:        'application/json',
    headers:            { 'DOCU-INFRA-IC-KEY': apiKey, 'DOCU-INFRA-IC-USER': apiUser },
    payload:            JSON.stringify({ step: 'generate', companyNameForResearch: prompt }),
    muteHttpExceptions: true
  };

  Logger.log('[OutputGenerators] LLM call — prompt size: ' + prompt.length + ' chars');
  var response = UrlFetchApp.fetch(GLEAN_ENDPOINT, fetchOptions);
  var code     = response.getResponseCode();
  var body     = response.getContentText();

  if (code !== 200) {
    Logger.log('[OutputGenerators] LLM call failed — HTTP ' + code + ': ' + body.substring(0, 500));
    throw new Error('[OutputGenerators] LLM call failed — HTTP ' + code);
  }

  var text = _extractResponseText(response, 'generate');
  Logger.log('[OutputGenerators] LLM response: ' + text.length + ' chars');
  return text;
}

// ── Dashboard server wrapper ────────────────────────────────────────────

/**
 * Called via google.script.run from Dashboard.html.
 * Wraps generateOutput() and returns JSON string.
 *
 * @param {string} companyName
 * @param {string} outputType
 * @param {Object} [options]
 * @returns {string} JSON string of result
 */
function generateOutputFromDashboard(companyName, outputType, options) {
  var result = generateOutput(companyName, outputType, options || {});
  return JSON.stringify(result);
}

// ── Test functions ──────────────────────────────────────────────────────

/**
 * Test: generate a follow-up email for the canary company.
 * Requires L2 cache to exist (run testSynthesizeFromCache first).
 */
function testFollowUpEmail() {
  var companyName = 'Merck Sharp & Dohme LLC';
  Logger.log('[TEST] Generating follow-up email for: ' + companyName);
  try {
    var result = generateOutput(companyName, 'follow_up_email', {
      meetingNotes: 'Discussed their digital transformation initiative and contract lifecycle management needs. They mentioned pain points with manual signature routing across 50+ subsidiaries.',
      audience: 'VP of Procurement',
      tone: 'professional and consultative'
    });
    if (!result.content || result.content.length < 100) {
      Logger.log('FAIL: email content too short or missing');
      return;
    }
    Logger.log('[TEST] Email generated (' + result.content.length + ' chars):');
    Logger.log(result.content);
    Logger.log('PASS: follow-up email generated successfully');
  } catch (e) {
    Logger.log('FAIL: ' + e.message);
  }
}

/**
 * Test: generate an AR Brief from cache (no LLM call).
 * Requires L1 + L2 cache for Merck.
 */
function testARBrief() {
  var companyName = 'Merck Sharp & Dohme LLC';
  Logger.log('[TEST] Generating AR Brief for: ' + companyName);
  try {
    var result = generateOutput(companyName, 'ar_brief', {});
    if (!result.url) { Logger.log('FAIL: no doc URL returned'); return; }
    Logger.log('[TEST] Brief URL: ' + result.url);
    Logger.log('PASS: AR Brief generated');
  } catch (e) {
    Logger.log('FAIL: ' + e.message);
  }
}

/**
 * Test: generate a Full AR Report from cache (no LLM call).
 * Requires L1 + L2 cache for Merck.
 */
function testARFull() {
  var companyName = 'Merck Sharp & Dohme LLC';
  Logger.log('[TEST] Generating Full Report for: ' + companyName);
  try {
    var result = generateOutput(companyName, 'ar_full', {});
    if (!result.url) { Logger.log('FAIL: no doc URL returned'); return; }
    Logger.log('[TEST] Full Report URL: ' + result.url);
    Logger.log('PASS: Full Report generated');
  } catch (e) {
    Logger.log('FAIL: ' + e.message);
  }
}

/**
 * Test: generate a Champion Brief from cache (1 LLM call).
 * Requires L2 cache for Merck.
 */
function testChampionBrief() {
  var companyName = 'Merck Sharp & Dohme LLC';
  Logger.log('[TEST] Generating Champion Brief for: ' + companyName);
  try {
    var result = generateOutput(companyName, 'champion_brief', {
      championName: 'Sarah Chen',
      championRole: 'VP of Digital Transformation'
    });
    if (!result.content || result.content.length < 100) {
      Logger.log('FAIL: champion brief content too short or missing');
      return;
    }
    Logger.log('[TEST] Champion Brief (' + result.content.length + ' chars):');
    Logger.log(result.content.substring(0, 1000));
    Logger.log('PASS: Champion Brief generated');
  } catch (e) {
    Logger.log('FAIL: ' + e.message);
  }
}

/**
 * Test: verify error handling when no cache exists.
 */
function testOutputNoCacheError() {
  try {
    generateOutput('__NONEXISTENT_COMPANY__', 'follow_up_email', {});
    Logger.log('FAIL: should have thrown an error');
  } catch (e) {
    if (e.message.indexOf('No intelligence cache') >= 0) {
      Logger.log('PASS: correct error for missing cache');
    } else {
      Logger.log('FAIL: unexpected error: ' + e.message);
    }
  }
}
