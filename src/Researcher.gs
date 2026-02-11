/**
 * LLM research functions using the internal OpenAI endpoint with Bing grounding.
 */

/**
 * Call the internal LLM endpoint.
 * @param {string} systemPrompt  The system role content
 * @param {string} userPrompt    The user role content
 * @returns {string} The LLM response text
 */
function callLLM(systemPrompt, userPrompt) {
  Logger.log('[LLM] Calling endpoint: ' + LLM_ENDPOINT);
  Logger.log('[LLM] System prompt length: ' + systemPrompt.length + ' chars');
  Logger.log('[LLM] User prompt length: ' + userPrompt.length + ' chars');

  var payload = {
    v:  LLM_MODEL,
    sr: systemPrompt,
    ur: userPrompt
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'DOCU-INFRA-IC-KEY':  getApiKey(),
      'DOCU-INFRA-IC-USER': getApiUser()
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  Logger.log('[LLM] Sending request...');
  var response = UrlFetchApp.fetch(LLM_ENDPOINT, options);
  var code = response.getResponseCode();
  var body = response.getContentText();

  Logger.log('[LLM] Response HTTP ' + code + ' | Body length: ' + body.length + ' chars');
  if (code !== 200) {
    Logger.log('[LLM] ERROR response body: ' + body.substring(0, 1000));
    throw new Error('LLM API returned HTTP ' + code + ': ' + body.substring(0, 500));
  }

  Logger.log('[LLM] Response preview: ' + body.substring(0, 300) + '...');
  return body;
}

/**
 * Call LLM and parse the response as JSON.
 * Handles cases where the LLM wraps JSON in markdown code fences.
 * Retries once on parse failure with a nudge to return valid JSON.
 *
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @returns {Object} parsed JSON
 */
function callLLMJson(systemPrompt, userPrompt) {
  var raw = callLLM(systemPrompt, userPrompt);
  Logger.log('[LLM-JSON] Attempting to parse response...');
  var parsed = tryParseJson(raw);
  if (parsed) {
    Logger.log('[LLM-JSON] Parse succeeded. Top-level keys: ' + Object.keys(parsed).join(', '));
    return parsed;
  }

  // Retry with explicit nudge
  Logger.log('[LLM-JSON] Parse FAILED on first attempt. Raw starts with: ' + raw.substring(0, 200));
  Logger.log('[LLM-JSON] Retrying with JSON nudge...');
  var retryPrompt = userPrompt +
    '\n\nIMPORTANT: Your previous response was not valid JSON. Return ONLY valid JSON, no markdown fences, no extra text.';
  raw = callLLM(systemPrompt, retryPrompt);
  parsed = tryParseJson(raw);
  if (parsed) {
    Logger.log('[LLM-JSON] Parse succeeded on retry. Top-level keys: ' + Object.keys(parsed).join(', '));
    return parsed;
  }

  Logger.log('[LLM-JSON] Parse FAILED on retry. Raw: ' + raw.substring(0, 500));
  throw new Error('Failed to parse LLM response as JSON after retry. Raw response: ' + raw.substring(0, 500));
}

/**
 * Try to parse a string as JSON, stripping markdown code fences if present.
 * @param {string} text
 * @returns {Object|null}
 */
// Stores citations from the most recent LLM call (if available from the endpoint)
var _lastCitations = [];

/**
 * Get citations captured from the last LLM response.
 * @returns {Array}
 */
function getLastCitations() {
  return _lastCitations || [];
}

/**
 * Strip Bing grounding citation markers like 【3:2†source】 from a string.
 * @param {string} str
 * @returns {string}
 */
function stripCitationMarkers(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/【[^】]*†[^】]*】/g, '').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Recursively strip citation markers from all string values in an object.
 * @param {*} obj
 * @returns {*}
 */
function cleanCitations(obj) {
  if (typeof obj === 'string') return stripCitationMarkers(obj);
  if (Array.isArray(obj)) return obj.map(cleanCitations);
  if (typeof obj === 'object' && obj !== null) {
    var cleaned = {};
    Object.keys(obj).forEach(function(key) {
      cleaned[key] = cleanCitations(obj[key]);
    });
    return cleaned;
  }
  return obj;
}

function tryParseJson(text) {
  if (!text) return null;
  _lastCitations = [];

  // If response is wrapped in the endpoint's own JSON envelope, unwrap it.
  // Known format: { "Success": true, "Result": { "text": "...LLM output..." } }
  try {
    var envelope = JSON.parse(text);
    if (typeof envelope === 'object' && !Array.isArray(envelope)) {
      // Handle { Result: { text: "..." } } envelope (Docusign infra endpoint)
      if (envelope.Result && typeof envelope.Result.text === 'string') {
        Logger.log('[tryParseJson] Result keys: ' + Object.keys(envelope.Result).join(', '));
        Logger.log('[tryParseJson] Unwrapped Result.text (' + envelope.Result.text.length + ' chars)');

        // Capture citations if available (common field names from Bing grounding)
        var citations = envelope.Result.citations || envelope.Result.sources ||
                        envelope.Result.annotations || envelope.Result.references ||
                        envelope.citations || envelope.sources;
        if (citations) {
          _lastCitations = Array.isArray(citations) ? citations : [citations];
          Logger.log('[tryParseJson] Captured ' + _lastCitations.length + ' citations');
        }

        // Log any non-text fields for diagnostics
        Object.keys(envelope.Result).forEach(function(key) {
          if (key !== 'text') {
            var val = envelope.Result[key];
            Logger.log('[tryParseJson] Result.' + key + ' = ' + JSON.stringify(val).substring(0, 500));
          }
        });
        text = envelope.Result.text;
      }
      // Handle flatter envelopes: { response|content|message|text: "..." }
      else {
        var inner = envelope.response || envelope.content || envelope.message || envelope.text;
        if (typeof inner === 'string') {
          text = inner;
        } else if (typeof inner === 'object') {
          return cleanCitations(inner);
        }
      }
    }
  } catch(e) {
    // Not wrapped JSON, continue with raw text
  }

  // Strip markdown code fences
  var cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    return cleanCitations(JSON.parse(cleaned));
  } catch(e) {
    // Try to find JSON object in the text
    var start = cleaned.indexOf('{');
    var end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return cleanCitations(JSON.parse(cleaned.substring(start, end + 1)));
      } catch(e2) {
        return null;
      }
    }
    return null;
  }
}


// ═══════════════════════════════════════════════════════════════════════
// Parallel LLM Infrastructure
// ═══════════════════════════════════════════════════════════════════════

/**
 * Build an HTTP request object for the LLM endpoint (without sending it).
 * Suitable for use with UrlFetchApp.fetchAll().
 * @param {string} systemPrompt  The system role content
 * @param {string} userPrompt    The user role content
 * @returns {Object} { url, options } ready for fetchAll
 */
function buildLLMRequest(systemPrompt, userPrompt) {
  var payload = {
    v:  LLM_MODEL,
    sr: systemPrompt,
    ur: userPrompt
  };

  return {
    url: LLM_ENDPOINT,
    method: 'post',
    contentType: 'application/json',
    headers: {
      'DOCU-INFRA-IC-KEY':  getApiKey(),
      'DOCU-INFRA-IC-USER': getApiUser()
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
}

/**
 * Send multiple LLM requests in parallel via UrlFetchApp.fetchAll().
 * Parses each response as JSON using tryParseJson().
 * @param {Array<Object>} requests  Array of { url, method, ... } from buildLLMRequest()
 * @returns {Array<Object|null>} Parsed JSON responses (null for failures)
 */
function callLLMJsonParallel(requests) {
  Logger.log('[LLM-Parallel] Sending ' + requests.length + ' requests in parallel');

  var responses = UrlFetchApp.fetchAll(requests);
  var results = [];

  for (var i = 0; i < responses.length; i++) {
    var response = responses[i];
    var code = response.getResponseCode();
    var body = response.getContentText();

    Logger.log('[LLM-Parallel] Response ' + i + ': HTTP ' + code + ' | ' + body.length + ' chars');

    if (code !== 200) {
      Logger.log('[LLM-Parallel] ERROR response ' + i + ': ' + body.substring(0, 500));
      results.push(null);
      continue;
    }

    var parsed = tryParseJson(body);
    if (parsed) {
      Logger.log('[LLM-Parallel] Response ' + i + ' parsed. Keys: ' + Object.keys(parsed).join(', '));
    } else {
      Logger.log('[LLM-Parallel] Response ' + i + ' parse FAILED. Raw: ' + body.substring(0, 300));
    }
    results.push(parsed);
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════
// Catalog Helper
// ═══════════════════════════════════════════════════════════════════════

/**
 * Format DOCUSIGN_CATALOG into a text block the LLM can reference.
 * @returns {string}
 */
function buildCatalogContext() {
  var lines = [];
  lines.push('BUNDLES:');
  DOCUSIGN_CATALOG.bundles.forEach(function(b) {
    lines.push('  ' + b.name + ': ' + b.description);
    lines.push('    Includes: ' + b.includes.join(', '));
    lines.push('    Solves: ' + b.solves.join(', '));
  });
  lines.push('\nCOMPONENTS:');
  DOCUSIGN_CATALOG.components.forEach(function(c) {
    lines.push('  ' + c.name + ': ' + c.description);
    lines.push('    Solves: ' + c.solves.join(', '));
  });
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════
// Enrichment Helpers (Layer 2 & 3)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Build a verified-data text block to inject into the Call 1 prompt.
 * Only includes fields that were actually enriched.
 * @param {Object} enrichment  Output of enrichCompanyData()
 * @returns {string}  Empty string if no enrichment data available
 */
function buildEnrichmentContext(enrichment) {
  if (!enrichment || Object.keys(enrichment).length === 0) return '';

  var lines = [];
  lines.push('=== VERIFIED DATA (from public APIs — use these exact values) ===');

  if (enrichment.overview) {
    lines.push('Company Overview (Wikipedia): ' + enrichment.overview);
  }

  // SEC financials — per-metric with definitions
  var hasFinancials = enrichment.revenueFormatted || enrichment.cogsFormatted ||
    enrichment.opexFormatted || enrichment.capexFormatted || enrichment.netIncomeFormatted;
  if (hasFinancials) {
    var period = enrichment.filingPeriod ? ' FY ending ' + enrichment.filingPeriod : '';
    lines.push('=== VERIFIED FINANCIALS (SEC EDGAR 10-K' + period + ') ===');
    if (enrichment.revenueFormatted)   lines.push('Revenue: ' + enrichment.revenueFormatted + ' — Total top-line income from all business activities');
    if (enrichment.cogsFormatted)      lines.push('COGS: ' + enrichment.cogsFormatted + ' — Direct costs of producing goods/services sold');
    if (enrichment.opexFormatted)      lines.push('OpEx: ' + enrichment.opexFormatted + ' — Day-to-day operating costs (salaries, rent, R&D, SG&A)');
    if (enrichment.capexFormatted)     lines.push('CapEx: ' + enrichment.capexFormatted + ' — Investments in property, equipment, and infrastructure');
    if (enrichment.netIncomeFormatted) lines.push('Net Income: ' + enrichment.netIncomeFormatted + ' — Bottom-line profit after all expenses and taxes');
    lines.push('');
    lines.push('When analyzing these financials, include a "context" field in the financials JSON that explains what these numbers reveal about the company\'s financial health, margins, and growth trajectory.');
  }

  // Segment revenue from 10-K XBRL
  if (enrichment.segmentsFormatted && enrichment.segmentsFormatted.length > 0) {
    lines.push('=== VERIFIED SEGMENT REVENUE (SEC EDGAR 10-K) ===');
    enrichment.segmentsFormatted.forEach(function(seg) {
      lines.push('  ' + seg);
    });
    if (enrichment.segmentType === 'geographic') {
      lines.push('NOTE: These are geographic segments (not product-line BUs). Use for regional revenue context but do not force-map to businessUnits.');
    } else {
      lines.push('IMPORTANT: Use these values for the segmentRevenue field in businessUnits.');
    }
    lines.push('');
  }

  if (enrichment.employeesFormatted) {
    lines.push('Employees (SEC 10-K): ' + enrichment.employeesFormatted);
  }

  if (enrichment.ceo) {
    lines.push('CEO: ' + enrichment.ceo);
  }

  if (enrichment.headquarters) {
    lines.push('Headquarters: ' + enrichment.headquarters);
  }

  if (enrichment.foundingDate) {
    lines.push('Founded: ' + enrichment.foundingDate);
  }

  if (enrichment.ticker) {
    lines.push('Stock Ticker: ' + enrichment.ticker);
  }

  if (enrichment.sicDescription) {
    lines.push('SIC Industry: ' + enrichment.sicDescription);
  }

  lines.push('=== END VERIFIED DATA ===');
  lines.push('');
  lines.push('IMPORTANT: Use the provided verified values exactly as given. Do NOT override them with web search numbers.');
  lines.push('Your job: add business units, SWOT, strategic initiatives, executives, tech stack, and other analytical content.');

  return lines.join('\n');
}

/**
 * Post-LLM enforcement: overwrite any LLM-generated values that differ
 * from verified API data. Safety net for when the LLM ignores anchoring.
 * @param {Object} accountProfile  The parsed LLM response from Call 1
 * @param {Object} enrichment      Output of enrichCompanyData()
 * @returns {Object} accountProfile with verified fields overwritten
 */
function enforceEnrichedData(accountProfile, enrichment) {
  if (!enrichment || !accountProfile) return accountProfile;

  // Override company overview if we have Wikipedia text
  if (enrichment.overview && accountProfile.companyOverview) {
    accountProfile.companyOverview = enrichment.overview;
    Logger.log('[Enrich/Enforce] Overwrote companyOverview with Wikipedia text');
  }

  // Override financials
  if (accountProfile.financials) {
    if (enrichment.revenueFormatted) {
      accountProfile.financials.revenue = enrichment.revenueFormatted;
    }
    if (enrichment.cogsFormatted) {
      accountProfile.financials.cogs = enrichment.cogsFormatted;
    }
    if (enrichment.opexFormatted) {
      accountProfile.financials.opex = enrichment.opexFormatted;
    }
    if (enrichment.capexFormatted) {
      accountProfile.financials.capex = enrichment.capexFormatted;
    }
    if (enrichment.netIncomeFormatted) {
      accountProfile.financials.netIncome = enrichment.netIncomeFormatted;
    }
    if (enrichment.revenueFormatted || enrichment.cogsFormatted) {
      Logger.log('[Enrich/Enforce] Overwrote financials with SEC EDGAR data');
    }
  }

  // Override employee count
  if (enrichment.employeesFormatted && accountProfile.employeeCount) {
    accountProfile.employeeCount.total = enrichment.employeesFormatted;
    Logger.log('[Enrich/Enforce] Overwrote employeeCount with SEC EDGAR data');
  }

  // Override segment revenue on business units via fuzzy matching (business-line segments only)
  if (enrichment.segments && enrichment.segments.length > 0 &&
      enrichment.segmentType !== 'geographic' &&
      accountProfile.businessUnits && accountProfile.businessUnits.length > 0) {

    // Build lookup map: lowercased segment name → formatted revenue string
    var segLookup = {};
    for (var si = 0; si < enrichment.segments.length; si++) {
      var seg = enrichment.segments[si];
      var formatted = enrichment.segmentsFormatted ? enrichment.segmentsFormatted[si] : null;
      var revStr = formatted ? formatted.split(': ').slice(1).join(': ') : null;
      if (revStr) {
        segLookup[seg.name.toLowerCase()] = revStr;
      }
    }

    var segNames = Object.keys(segLookup);

    for (var bi = 0; bi < accountProfile.businessUnits.length; bi++) {
      var bu = accountProfile.businessUnits[bi];
      var buLower = (bu.name || '').toLowerCase();
      var matched = null;

      // Try exact match first
      if (segLookup[buLower]) {
        matched = segLookup[buLower];
      } else {
        // Try substring match: segment name in BU name or vice versa
        for (var sn = 0; sn < segNames.length; sn++) {
          var segName = segNames[sn];
          if (buLower.indexOf(segName) !== -1 || segName.indexOf(buLower) !== -1) {
            matched = segLookup[segName];
            break;
          }
        }
      }

      if (matched) {
        bu.segmentRevenue = matched;
        Logger.log('[Enrich/Enforce] Matched segment revenue for BU "' + bu.name + '": ' + matched);
      }
    }
  }

  // Ensure CEO is in executive contacts if we have it from Wikidata
  if (enrichment.ceo && accountProfile.executiveContacts) {
    var hasCeo = accountProfile.executiveContacts.some(function(exec) {
      return exec.name && exec.name.toLowerCase().indexOf(enrichment.ceo.toLowerCase()) !== -1;
    });
    if (!hasCeo) {
      accountProfile.executiveContacts.unshift({
        name: enrichment.ceo,
        title: 'Chief Executive Officer',
        relevance: 'Key decision-maker for enterprise-wide agreement management strategy'
      });
      Logger.log('[Enrich/Enforce] Added CEO from Wikidata to executiveContacts');
    }
  }

  return accountProfile;
}

// ═══════════════════════════════════════════════════════════════════════
// Research Prompts (5 sequential LLM calls)
// ═══════════════════════════════════════════════════════════════════════

var RESEARCH_SYSTEM_BASE =
  'Use current web data via Bing to research the company. ' +
  'Return your response as valid JSON only. No markdown, no extra text. Do NOT include citation markers like 【†source】 in text.';

/**
 * Call 1: Comprehensive account profile (replaces old calls 1+2).
 * @param {string} companyName
 * @param {string} industry
 * @param {Object} [enrichment]  Optional enrichment data from DataEnricher
 * @returns {Object}
 */
function researchAccountProfile(companyName, industry, enrichment) {
  var systemPrompt =
    'You are an expert business analyst with deep knowledge of enterprise companies. ' + RESEARCH_SYSTEM_BASE;

  // Build enrichment context block (empty string if no enrichment)
  var enrichmentBlock = buildEnrichmentContext(enrichment || {});
  var enrichmentPrefix = enrichmentBlock ? enrichmentBlock + '\n\n' : '';

  var userPrompt =
    enrichmentPrefix +
    'Research "' + companyName + '" in the "' + industry + '" industry.\n\n' +
    'Return a JSON object with exactly this structure:\n' +
    '{\n' +
    '  "companyOverview": "2-3 sentence overview of the company, what it does, and its market position",\n' +
    '  "businessUnits": [\n' +
    '    { "name": "Unit name", "offering": "What this unit provides", "targetSegment": "Who they serve", "pricingRevenueModel": "How they make money", "segmentRevenue": "Estimated annual revenue for this BU (e.g. $1.2B)", "customerCount": "Approximate customers or scale" }\n' +
    '  ],\n' +
    '  "customerBase": { "total": "Total customer count or description", "context": "Additional context about customer segments" },\n' +
    '  "employeeCount": { "total": "Employee count", "context": "Global footprint, offices, hiring trends" },\n' +
    '  "supplyChain": { "majorCategories": ["category 1", "category 2"], "context": "Key supplier relationships and procurement focus" },\n' +
    '  "financials": { "revenue": "Annual revenue", "cogs": "Cost of goods sold if available", "opex": "Operating expenses", "capex": "Capital expenditures", "netIncome": "Net income", "context": "2-3 sentences analyzing what these numbers reveal about the company\'s financial health, margins, and investment posture" },\n' +
    '  "businessPerformance": {\n' +
    '    "threeYearTrend": "2-3 sentence narrative of the company\'s trajectory over 3 years",\n' +
    '    "highlights": ["financial or operational highlight 1", "highlight 2", "highlight 3"],\n' +
    '    "strategicInitiatives": [\n' +
    '      { "title": "Initiative name", "description": "What they are doing and why", "timeframe": "When this is happening" }\n' +
    '    ]\n' +
    '  },\n' +
    '  "swot": {\n' +
    '    "strengths": ["strength 1", "strength 2", "strength 3"],\n' +
    '    "weaknesses": ["weakness 1", "weakness 2", "weakness 3"],\n' +
    '    "opportunities": ["opportunity 1", "opportunity 2", "opportunity 3"],\n' +
    '    "threats": ["threat 1", "threat 2", "threat 3"]\n' +
    '  },\n' +
    '  "executiveContacts": [\n' +
    '    { "name": "Executive name", "title": "Their title", "relevance": "Why Docusign should connect with this person" }\n' +
    '  ],\n' +
    '  "technologyStack": { "crm": "CRM platform", "hr": "HR/HCM platform", "procurement": "Procurement platform", "other": ["Other system 1", "Other system 2"] },\n' +
    '  "systemsIntegrators": ["SI partner 1", "SI partner 2"]\n' +
    '}\n\n' +
    'Provide approximately 5 business units. For executiveContacts, focus on CIO, CTO, CLO, CPO, CFO, ' +
    'VP of Procurement, VP of Legal, and similar roles relevant to agreement management. ' +
    'Include at least 5 executives.\n' +
    'For businessPerformance.strategicInitiatives, provide 3-5 specific initiatives with concrete descriptions and timeframes.\n' +
    'For businessPerformance.highlights, provide 5-7 specific financial or operational highlights with real numbers where available.';

  Logger.log('[Research] Call 1: Researching account profile for "' + companyName + '" in "' + industry + '"');
  if (enrichmentBlock) {
    Logger.log('[Research] Call 1: Enrichment context injected (' + enrichmentBlock.length + ' chars)');
  }
  return callLLMJson(systemPrompt, userPrompt);
}

/**
 * Call 2: Business Map — hierarchical org structure (BU → Department → Function).
 * @param {string} companyName
 * @param {string} industry
 * @param {Object} accountProfile  Full result from Call 1
 * @returns {Object} { nodes: [...] }
 */
function researchBusinessMap(companyName, industry, accountProfile) {
  var systemPrompt =
    'You are an expert in enterprise organizational structures and agreement workflows. ' + RESEARCH_SYSTEM_BASE;

  var businessUnits = (accountProfile && accountProfile.businessUnits) || [];
  var buContext = '';
  if (businessUnits.length > 0) {
    buContext = '\n\nKnown business units:\n' +
      businessUnits.map(function(bu) { return '- ' + bu.name + ': ' + (bu.offering || ''); }).join('\n');
  }
  if (accountProfile && accountProfile.employeeCount) {
    buContext += '\nEmployee count: ' + (accountProfile.employeeCount.total || 'unknown');
  }
  if (accountProfile && accountProfile.supplyChain) {
    buContext += '\nSupply chain: ' + ((accountProfile.supplyChain.majorCategories || []).join(', ') || 'N/A');
  }

  var userPrompt =
    'For "' + companyName + '" in the "' + industry + '" industry, map the organizational hierarchy.\n' +
    buContext + '\n\n' +
    'Return a JSON object with exactly this structure:\n' +
    '{\n' +
    '  "nodes": [\n' +
    '    { "name": "Node name", "parent": "Parent node name or null for root", "level": "bu|department|function", "agreementIntensity": "high|medium|low" }\n' +
    '  ]\n' +
    '}\n\n' +
    'Build a tree: Company (root, parent=null) → Business Units (level="bu") → Departments (level="department") → Functions (level="function").\n' +
    'The root node should be the company name with parent=null.\n' +
    'Each BU should have parent=company name. Each department should have parent=BU name.\n' +
    'Each function should have parent=department name.\n' +
    'agreementIntensity indicates how many agreements/contracts that node handles (high, medium, or low).\n\n' +
    'IMPORTANT: The tree must be comprehensive. Requirements:\n' +
    '- Provide ALL major business units (minimum 4-5 BUs for large enterprises)\n' +
    '- Each BU MUST have 3-5 departments beneath it\n' +
    '- Each department MUST have 2-3 functions beneath it\n' +
    '- The total tree should have at least 40 nodes for a large company, 25+ for mid-size\n' +
    '- Include shared services departments (Legal, Finance, HR, IT, Procurement) under a Corporate/Shared Services BU\n' +
    '- Do NOT return a sparse tree with only 1 department per BU';

  Logger.log('[Research] Call 2: Researching business map for "' + companyName + '"');
  return callLLMJson(systemPrompt, userPrompt);
}

/**
 * Call 3: Agreement Landscape — top 20 agreement types scored by volume and complexity.
 * @param {string} companyName
 * @param {string} industry
 * @param {Object} accountProfile  Full result from Call 1
 * @param {Object} businessMap     Result from Call 2
 * @returns {Object} { agreements: [...], sources: [...] }
 */
function researchAgreementLandscape(companyName, industry, accountProfile, businessMap) {
  var systemPrompt =
    'You are an expert in enterprise contract management and agreement workflows. ' + RESEARCH_SYSTEM_BASE;

  var context = '';
  if (accountProfile && accountProfile.businessUnits) {
    context += '\nBusiness units: ' + accountProfile.businessUnits.map(function(bu) { return bu.name; }).join(', ');
  }
  if (businessMap && businessMap.nodes) {
    var depts = businessMap.nodes.filter(function(n) { return n.level === 'department'; });
    if (depts.length > 0) {
      context += '\nKey departments: ' + depts.map(function(d) { return d.name; }).join(', ');
    }
  }
  if (accountProfile && accountProfile.financials) {
    context += '\nCompany financials: Revenue ' + (accountProfile.financials.revenue || 'N/A') +
      ', Employees ' + ((accountProfile.employeeCount || {}).total || 'N/A');
  }

  var userPrompt =
    'For "' + companyName + '" in the "' + industry + '" industry, identify the top 20 agreement types ' +
    'across all business units and departments.' + context + '\n\n' +
    'Return a JSON object with exactly this structure:\n' +
    '{\n' +
    '  "agreements": [\n' +
    '    {\n' +
    '      "number": 1,\n' +
    '      "agreementType": "Name of the agreement type",\n' +
    '      "category": "Internal|External",\n' +
    '      "primaryBusinessUnit": "Which BU primarily uses this",\n' +
    '      "volume": 7,\n' +
    '      "complexity": 8,\n' +
    '      "contractType": "Negotiated|Non-negotiated|Form-based|Regulatory",\n' +
    '      "description": "Brief description of this agreement type and its business purpose"\n' +
    '    }\n' +
    '  ]\n' +
    '}\n\n' +
    'Rules:\n' +
    '- Provide exactly 20 agreement types, numbered 1-20\n' +
    '- volume: scale 1-10, how many of this agreement type are executed annually\n' +
    '- complexity: scale 1-10, how complex the negotiation/management process is\n' +
    '- Sort by combined score (volume + complexity) descending\n' +
    '- category: "Internal" for employee/inter-company agreements, "External" for customer/vendor/partner\n' +
    '- contractType: "Negotiated" (custom terms), "Non-negotiated" (standard/click), "Form-based" (templates), "Regulatory" (compliance-driven)\n' +
    '- Include a mix of internal and external agreements across multiple BUs';

  Logger.log('[Research] Call 3: Researching agreement landscape for "' + companyName + '"');

  // Call 3 has been unreliable — add extra resilience with a fallback retry using a simpler prompt
  try {
    return callLLMJson(systemPrompt, userPrompt);
  } catch (e) {
    Logger.log('[Research] Call 3 first attempt failed: ' + e.message);
    Logger.log('[Research] Call 3 retrying with simplified prompt...');

    // Simplified retry with fewer constraints
    var simplePrompt =
      'For "' + companyName + '" in the "' + industry + '" industry, list 15 agreement types the company likely manages.\n\n' +
      'Return JSON: { "agreements": [{ "number": 1, "agreementType": "...", "category": "Internal|External", ' +
      '"primaryBusinessUnit": "...", "volume": 5, "complexity": 5, "contractType": "Negotiated|Non-negotiated|Form-based|Regulatory", ' +
      '"description": "..." }] }\n\n' +
      'volume and complexity are 1-10 scales. Number them 1-15. Return ONLY valid JSON.';

    try {
      return callLLMJson(systemPrompt, simplePrompt);
    } catch (e2) {
      Logger.log('[Research] Call 3 simplified retry also failed: ' + e2.message);
      throw e2;
    }
  }
}

/**
 * Call 4: Contract Commerce Estimate — estimate commerce flowing through agreements.
 * @param {string} companyName
 * @param {string} industry
 * @param {Object} accountProfile  Result from Call 1 (financials)
 * @param {Object} agreements      Result from Call 3 (agreement landscape)
 * @returns {Object}
 */
function researchContractCommerce(companyName, industry, accountProfile, agreements) {
  var systemPrompt =
    'You are an expert in enterprise financial analysis and contract management. ' + RESEARCH_SYSTEM_BASE;

  var financialContext = '';
  if (accountProfile && accountProfile.financials) {
    financialContext = '\nKnown financials: ' + JSON.stringify(accountProfile.financials);
  }
  if (accountProfile && accountProfile.employeeCount) {
    financialContext += '\nEmployees: ' + (accountProfile.employeeCount.total || 'unknown') +
      (accountProfile.employeeCount.context ? ' (' + accountProfile.employeeCount.context + ')' : '');
  }
  if (accountProfile && accountProfile.customerBase) {
    financialContext += '\nCustomers: ' + (accountProfile.customerBase.total || 'unknown') +
      (accountProfile.customerBase.context ? ' (' + accountProfile.customerBase.context + ')' : '');
  }
  var agreementContext = '';
  if (agreements && agreements.agreements) {
    agreementContext = '\nTop agreement types (with relative volume/complexity scores on 1-10 scale — these are NOT actual counts): ' +
      agreements.agreements.slice(0, 10).map(function(a) {
        return a.agreementType + ' (volume score:' + a.volume + '/10, complexity score:' + a.complexity + '/10)';
      }).join(', ');
  }

  var userPrompt =
    'For "' + companyName + '" in the "' + industry + '" industry, estimate the commerce flowing through agreements.' +
    financialContext + agreementContext + '\n\n' +
    'Return a JSON object with exactly this structure:\n' +
    '{\n' +
    '  "estimatedCommerce": {\n' +
    '    "totalRevenue": "$X",\n' +
    '    "spendManaged": "$X",\n' +
    '    "opex": "$X"\n' +
    '  },\n' +
    '  "commercialRelationships": {\n' +
    '    "employees": "X",\n' +
    '    "suppliers": "X",\n' +
    '    "customers": "X",\n' +
    '    "partners": "X"\n' +
    '  },\n' +
    '  "commerceByDepartment": [\n' +
    '    { "department": "Dept name", "estimatedAnnualValue": "$X", "primaryAgreementTypes": ["type 1", "type 2"] }\n' +
    '  ],\n' +
    '  "commerceByAgreementType": [\n' +
    '    { "agreementType": "Type name", "estimatedAnnualValue": "$X", "volume": "X per year" }\n' +
    '  ],\n' +
    '  "painPoints": [\n' +
    '    { "title": "Pain point name", "description": "How this affects the business and why agreements matter" }\n' +
    '  ]\n' +
    '}\n\n' +
    'Provide at least 5 departments in commerceByDepartment and 5 agreement types in commerceByAgreementType.\n' +
    'Provide 3-5 pain points related to agreement management.\n' +
    'If department-level data is not available, provide your best estimates based on industry benchmarks.\n' +
    'Use realistic dollar figures based on the company\'s known revenue and industry norms.\n' +
    'IMPORTANT: For commercialRelationships, use the employee and customer counts provided above. Do not invent different numbers.\n' +
    'IMPORTANT: For commerceByAgreementType volume, estimate realistic ANNUAL TRANSACTION COUNTS for a company of this size (e.g. "~50,000 per year", "~2 million per year"). ' +
    'Do NOT use the 1-10 relative scores from the agreement types above — those are relative rankings, not actual counts.';

  Logger.log('[Research] Call 4: Researching contract commerce for "' + companyName + '"');
  return callLLMJson(systemPrompt, userPrompt);
}

// ═══════════════════════════════════════════════════════════════════════
// Request Builders for Parallel Execution
// ═══════════════════════════════════════════════════════════════════════

/**
 * Build Call 2 request (Business Map) without sending it.
 * Same prompt as researchBusinessMap() — uses only Call 1 data.
 * @param {string} companyName
 * @param {string} industry
 * @param {Object} accountProfile  Full result from Call 1
 * @returns {Object} request object for callLLMJsonParallel
 */
function buildCall2Request(companyName, industry, accountProfile) {
  var systemPrompt =
    'You are an expert in enterprise organizational structures and agreement workflows. ' + RESEARCH_SYSTEM_BASE;

  var businessUnits = (accountProfile && accountProfile.businessUnits) || [];
  var buContext = '';
  if (businessUnits.length > 0) {
    buContext = '\n\nKnown business units:\n' +
      businessUnits.map(function(bu) { return '- ' + bu.name + ': ' + (bu.offering || ''); }).join('\n');
  }
  if (accountProfile && accountProfile.employeeCount) {
    buContext += '\nEmployee count: ' + (accountProfile.employeeCount.total || 'unknown');
  }
  if (accountProfile && accountProfile.supplyChain) {
    buContext += '\nSupply chain: ' + ((accountProfile.supplyChain.majorCategories || []).join(', ') || 'N/A');
  }

  var userPrompt =
    'For "' + companyName + '" in the "' + industry + '" industry, map the organizational hierarchy.\n' +
    buContext + '\n\n' +
    'Return a JSON object with exactly this structure:\n' +
    '{\n' +
    '  "nodes": [\n' +
    '    { "name": "Node name", "parent": "Parent node name or null for root", "level": "bu|department|function", "agreementIntensity": "high|medium|low" }\n' +
    '  ]\n' +
    '}\n\n' +
    'Build a tree: Company (root, parent=null) → Business Units (level="bu") → Departments (level="department") → Functions (level="function").\n' +
    'The root node should be the company name with parent=null.\n' +
    'Each BU should have parent=company name. Each department should have parent=BU name.\n' +
    'Each function should have parent=department name.\n' +
    'agreementIntensity indicates how many agreements/contracts that node handles (high, medium, or low).\n\n' +
    'IMPORTANT: The tree must be comprehensive. Requirements:\n' +
    '- Provide ALL major business units (minimum 4-5 BUs for large enterprises)\n' +
    '- Each BU MUST have 3-5 departments beneath it\n' +
    '- Each department MUST have 2-3 functions beneath it\n' +
    '- The total tree should have at least 40 nodes for a large company, 25+ for mid-size\n' +
    '- Include shared services departments (Legal, Finance, HR, IT, Procurement) under a Corporate/Shared Services BU\n' +
    '- Do NOT return a sparse tree with only 1 department per BU';

  Logger.log('[Research] buildCall2Request: Business Map for "' + companyName + '"');
  return buildLLMRequest(systemPrompt, userPrompt);
}

/**
 * Build Call 3 request (Agreement Landscape) without sending it.
 * Drops businessMap dependency — uses BU names from accountProfile instead.
 * @param {string} companyName
 * @param {string} industry
 * @param {Object} accountProfile  Full result from Call 1
 * @returns {Object} request object for callLLMJsonParallel
 */
function buildCall3Request(companyName, industry, accountProfile) {
  var systemPrompt =
    'You are an expert in enterprise contract management and agreement workflows. ' + RESEARCH_SYSTEM_BASE;

  var context = '';
  if (accountProfile && accountProfile.businessUnits) {
    context += '\nBusiness units: ' + accountProfile.businessUnits.map(function(bu) { return bu.name; }).join(', ');
  }
  if (accountProfile && accountProfile.financials) {
    context += '\nCompany financials: Revenue ' + (accountProfile.financials.revenue || 'N/A') +
      ', Employees ' + ((accountProfile.employeeCount || {}).total || 'N/A');
  }

  var userPrompt =
    'For "' + companyName + '" in the "' + industry + '" industry, identify the top 20 agreement types ' +
    'across all business units and departments.' + context + '\n\n' +
    'Return a JSON object with exactly this structure:\n' +
    '{\n' +
    '  "agreements": [\n' +
    '    {\n' +
    '      "number": 1,\n' +
    '      "agreementType": "Name of the agreement type",\n' +
    '      "category": "Internal|External",\n' +
    '      "primaryBusinessUnit": "Which BU primarily uses this",\n' +
    '      "volume": 7,\n' +
    '      "complexity": 8,\n' +
    '      "contractType": "Negotiated|Non-negotiated|Form-based|Regulatory",\n' +
    '      "description": "Brief description of this agreement type and its business purpose"\n' +
    '    }\n' +
    '  ]\n' +
    '}\n\n' +
    'Rules:\n' +
    '- Provide exactly 20 agreement types, numbered 1-20\n' +
    '- volume: scale 1-10, how many of this agreement type are executed annually\n' +
    '- complexity: scale 1-10, how complex the negotiation/management process is\n' +
    '- Sort by combined score (volume + complexity) descending\n' +
    '- category: "Internal" for employee/inter-company agreements, "External" for customer/vendor/partner\n' +
    '- contractType: "Negotiated" (custom terms), "Non-negotiated" (standard/click), "Form-based" (templates), "Regulatory" (compliance-driven)\n' +
    '- Include a mix of internal and external agreements across multiple BUs';

  Logger.log('[Research] buildCall3Request: Agreement Landscape for "' + companyName + '"');
  return buildLLMRequest(systemPrompt, userPrompt);
}

/**
 * Build Call 4 request (Contract Commerce) without sending it.
 * Drops agreements dependency — uses industry-aware instruction instead.
 * @param {string} companyName
 * @param {string} industry
 * @param {Object} accountProfile  Full result from Call 1
 * @returns {Object} request object for callLLMJsonParallel
 */
function buildCall4Request(companyName, industry, accountProfile) {
  var systemPrompt =
    'You are an expert in enterprise financial analysis and contract management. ' + RESEARCH_SYSTEM_BASE;

  var financialContext = '';
  if (accountProfile && accountProfile.financials) {
    financialContext = '\nKnown financials: ' + JSON.stringify(accountProfile.financials);
  }
  if (accountProfile && accountProfile.employeeCount) {
    financialContext += '\nEmployees: ' + (accountProfile.employeeCount.total || 'unknown') +
      (accountProfile.employeeCount.context ? ' (' + accountProfile.employeeCount.context + ')' : '');
  }
  if (accountProfile && accountProfile.customerBase) {
    financialContext += '\nCustomers: ' + (accountProfile.customerBase.total || 'unknown') +
      (accountProfile.customerBase.context ? ' (' + accountProfile.customerBase.context + ')' : '');
  }

  var userPrompt =
    'For "' + companyName + '" in the "' + industry + '" industry, estimate the commerce flowing through agreements.' +
    financialContext + '\n\n' +
    'Based on typical agreement types for a ' + industry + ' company of this size, estimate the commerce flowing through each agreement category.\n\n' +
    'Return a JSON object with exactly this structure:\n' +
    '{\n' +
    '  "estimatedCommerce": {\n' +
    '    "totalRevenue": "$X",\n' +
    '    "spendManaged": "$X",\n' +
    '    "opex": "$X"\n' +
    '  },\n' +
    '  "commercialRelationships": {\n' +
    '    "employees": "X",\n' +
    '    "suppliers": "X",\n' +
    '    "customers": "X",\n' +
    '    "partners": "X"\n' +
    '  },\n' +
    '  "commerceByDepartment": [\n' +
    '    { "department": "Dept name", "estimatedAnnualValue": "$X", "primaryAgreementTypes": ["type 1", "type 2"] }\n' +
    '  ],\n' +
    '  "commerceByAgreementType": [\n' +
    '    { "agreementType": "Type name", "estimatedAnnualValue": "$X", "volume": "X per year" }\n' +
    '  ],\n' +
    '  "painPoints": [\n' +
    '    { "title": "Pain point name", "description": "How this affects the business and why agreements matter" }\n' +
    '  ]\n' +
    '}\n\n' +
    'Provide at least 5 departments in commerceByDepartment and 5 agreement types in commerceByAgreementType.\n' +
    'Provide 3-5 pain points related to agreement management.\n' +
    'If department-level data is not available, provide your best estimates based on industry benchmarks.\n' +
    'Use realistic dollar figures based on the company\'s known revenue and industry norms.\n' +
    'IMPORTANT: For commercialRelationships, use the employee and customer counts provided above. Do not invent different numbers.\n' +
    'IMPORTANT: For commerceByAgreementType volume, estimate realistic ANNUAL TRANSACTION COUNTS for a company of this size (e.g. "~50,000 per year", "~2 million per year"). ' +
    'Do NOT use relative scores — provide actual estimated counts.';

  Logger.log('[Research] buildCall4Request: Contract Commerce for "' + companyName + '"');
  return buildLLMRequest(systemPrompt, userPrompt);
}

/**
 * Build a condensed text summary of external research for Call 5 context.
 * Avoids passing raw JSON that can exceed token limits or truncate mid-object.
 * @param {Object} ext  Combined results from Calls 1-4
 * @returns {string}
 */
function summarizeExternalResearch(ext) {
  var lines = [];
  var ap = ext.accountProfile || {};

  if (ap.companyOverview) lines.push('Company: ' + ap.companyOverview);

  if (ap.businessUnits && ap.businessUnits.length > 0) {
    lines.push('Business Units: ' + ap.businessUnits.map(function(bu) {
      return bu.name + ' (' + (bu.offering || '') + ')';
    }).join(', '));
  }

  if (ap.financials) {
    var f = ap.financials;
    lines.push('Financials: Revenue ' + (f.revenue || 'N/A') + ', COGS ' + (f.cogs || 'N/A') +
      ', OpEx ' + (f.opex || 'N/A') + ', CapEx ' + (f.capex || 'N/A'));
  }

  if (ap.employeeCount) lines.push('Employees: ' + (ap.employeeCount.total || 'N/A'));
  if (ap.customerBase) lines.push('Customers: ' + (ap.customerBase.total || 'N/A'));

  if (ap.businessPerformance && ap.businessPerformance.strategicInitiatives) {
    lines.push('Strategic Initiatives:');
    ap.businessPerformance.strategicInitiatives.forEach(function(init) {
      lines.push('  - ' + (init.title || '') + ': ' + (init.description || ''));
    });
  }

  if (ap.swot) {
    var sw = ap.swot;
    if (sw.strengths) lines.push('Strengths: ' + sw.strengths.join(', '));
    if (sw.weaknesses) lines.push('Weaknesses: ' + sw.weaknesses.join(', '));
    if (sw.opportunities) lines.push('Opportunities: ' + sw.opportunities.join(', '));
    if (sw.threats) lines.push('Threats: ' + sw.threats.join(', '));
  }

  if (ap.technologyStack) {
    var ts = ap.technologyStack;
    lines.push('Tech Stack: CRM=' + (ts.crm || 'N/A') + ', HR=' + (ts.hr || 'N/A') +
      ', Procurement=' + (ts.procurement || 'N/A') +
      (ts.other && ts.other.length > 0 ? ', Other: ' + ts.other.join(', ') : ''));
  }

  // Business map — just BU and department names, skip functions
  var bm = ext.businessMap || {};
  if (bm.nodes && bm.nodes.length > 0) {
    var depts = bm.nodes.filter(function(n) { return n.level === 'department'; });
    if (depts.length > 0) {
      lines.push('Key Departments: ' + depts.map(function(d) {
        return d.name + ' (' + (d.agreementIntensity || '') + ')';
      }).join(', '));
    }
  }

  // Agreement landscape — top 10 only
  var al = ext.agreementLandscape || {};
  if (al.agreements && al.agreements.length > 0) {
    lines.push('Top Agreement Types:');
    al.agreements.slice(0, 10).forEach(function(a) {
      lines.push('  - ' + a.agreementType + ' (vol:' + a.volume + ', cx:' + a.complexity +
        ', ' + (a.contractType || '') + ', ' + (a.category || '') + ')');
    });
  }

  // Contract commerce — summary figures
  var cc = ext.contractCommerce || {};
  if (cc.estimatedCommerce) {
    var ec = cc.estimatedCommerce;
    lines.push('Contract Commerce: Revenue ' + (ec.totalRevenue || 'N/A') +
      ', Spend Managed ' + (ec.spendManaged || 'N/A') + ', OpEx ' + (ec.opex || 'N/A'));
  }
  if (cc.painPoints && cc.painPoints.length > 0) {
    lines.push('Pain Points: ' + cc.painPoints.map(function(p) { return p.title; }).join(', '));
  }

  return lines.join('\n');
}

/**
 * Call 5: Priority Map — map company initiatives to Docusign solutions + action plan.
 * @param {string} companyName
 * @param {string} internalSummary  Text summary from summarizeForLLM()
 * @param {Object} externalResearch  Combined results from Calls 1-4
 * @param {Object} [productSignals]  Output of generateProductSignals()
 * @returns {Object}
 */
function synthesizePriorityMap(companyName, internalSummary, externalResearch, productSignals) {
  var catalogContext = buildCatalogContext();
  var signalContext = (productSignals && productSignals.summary) || '';

  var systemPrompt =
    'You are a Docusign growth strategist helping account teams identify upsell and expansion opportunities.\n\n' +
    '--- DOCUSIGN PRODUCT CATALOG ---\n' + catalogContext + '\n\n' +
    '--- PRE-QUALIFIED PRODUCT SIGNALS (from internal data analysis) ---\n' + signalContext + '\n\n' +
    'IMPORTANT: The product signals above are computed from the customer\'s actual usage data. ' +
    'Use them to ground your recommendations. Do NOT recommend products marked "in_use" as new opportunities. ' +
    'Prioritize "strong" signal products in your expansion opportunities and priority mappings. ' +
    'For each recommendation, explain WHY the customer\'s data supports it.\n\n' +
    RESEARCH_SYSTEM_BASE;

  // Build a condensed summary instead of raw JSON to avoid truncation issues
  var externalContext = summarizeExternalResearch(externalResearch);
  Logger.log('[Research] Call 5: Synthesizing priority map for "' + companyName + '"');
  Logger.log('[Research] Internal summary length: ' + internalSummary.length + ' chars');
  Logger.log('[Research] External context length: ' + externalContext.length + ' chars');

  var userPrompt =
    'Analyze this Docusign customer and create a priority map with action plan.\n\n' +
    '--- INTERNAL DOCUSIGN USAGE DATA ---\n' +
    internalSummary + '\n\n' +
    '--- EXTERNAL COMPANY RESEARCH ---\n' +
    externalContext + '\n\n' +
    'Return a JSON object with exactly this structure:\n' +
    '{\n' +
    '  "currentUseCases": {\n' +
    '    "summary": "Brief description of how they use Docusign today based on the internal data",\n' +
    '    "products": ["product 1", "product 2"],\n' +
    '    "useCases": ["use case 1", "use case 2"],\n' +
    '    "techStack": "known or inferred integrations and tech stack"\n' +
    '  },\n' +
    '  "priorityMapping": [\n' +
    '    {\n' +
    '      "companyPriority": "A strategic priority the company has",\n' +
    '      "priorityDetails": ["specific detail 1", "specific detail 2"],\n' +
    '      "docusignCapability": "The Docusign product/feature that maps to this",\n' +
    '      "businessImpact": "Quantified or qualified business impact"\n' +
    '    }\n' +
    '  ],\n' +
    '  "expansionOpportunities": [\n' +
    '    {\n' +
    '      "product": "Docusign product name",\n' +
    '      "useCase": "Specific use case for this customer",\n' +
    '      "businessValue": "Quantified or qualified business impact",\n' +
    '      "department": "Target department"\n' +
    '    }\n' +
    '  ],\n' +
    '  "actionPlan": [\n' +
    '    {\n' +
    '      "action": "Specific action to take",\n' +
    '      "owner": "Account team role responsible (AE, CSM, SA, etc.)",\n' +
    '      "rationale": "Why this action matters now"\n' +
    '    }\n' +
    '  ]\n' +
    '}\n\n' +
    'Provide 5-7 priority mappings, 5+ expansion opportunities, and 5+ action items.\n' +
    'For priorityMapping, connect real company strategic initiatives to specific Docusign capabilities.\n' +
    'For actionPlan, provide actionable next steps the account team can execute immediately.';

  return callLLMJson(systemPrompt, userPrompt);
}

/**
 * Call 6: Executive Meeting Briefing — concise narrative summary with Docusign mapping.
 * Uses data already gathered (no additional web research).
 * @param {string} companyName
 * @param {Object} accountProfile  Result from Call 1
 * @param {Object} priorityMap     Result from Call 5
 * @param {Object} productSignals  Output of generateProductSignals()
 * @returns {Object} { introText, priorities: [{ title, body }] }
 */
function generateExecutiveBriefing(companyName, accountProfile, priorityMap, productSignals) {
  var systemPrompt =
    'You are writing an executive meeting briefing focused entirely on the customer.\n' +
    'Write in a concise, professional tone suitable for an executive audience.\n' +
    'Use **bold** for key data points, company names, and dollar figures.\n' +
    'Use *italic* for emphasis on specific terms.\n' +
    'Do NOT mention Docusign, any Docusign products, or any vendor solutions.\n' +
    'Do NOT include source citations or URLs.\n' +
    'Return your response as valid JSON only. No markdown fences, no extra text.';

  var initiatives = '';
  if (accountProfile && accountProfile.businessPerformance &&
      accountProfile.businessPerformance.strategicInitiatives) {
    initiatives = JSON.stringify(accountProfile.businessPerformance.strategicInitiatives);
  }

  var priorities = '';
  if (priorityMap && priorityMap.priorityMapping) {
    priorities = JSON.stringify(priorityMap.priorityMapping);
  }

  var expansions = '';
  if (priorityMap && priorityMap.expansionOpportunities) {
    expansions = JSON.stringify(priorityMap.expansionOpportunities);
  }

  var userPrompt =
    'Create an executive meeting briefing about "' + companyName + '".\n' +
    'Focus 100% on the customer — their strategic priorities, business challenges, and market context.\n\n' +
    '--- STRATEGIC INITIATIVES ---\n' + initiatives + '\n\n' +
    '--- PRIORITY MAPPINGS ---\n' + priorities + '\n\n' +
    '--- EXPANSION CONTEXT ---\n' + expansions + '\n\n' +
    'Return a JSON object with exactly this structure:\n' +
    '{\n' +
    '  "introText": "1-2 sentences setting context about the company\'s current strategic focus and market position. No source citations.",\n' +
    '  "priorities": [\n' +
    '    {\n' +
    '      "title": "Priority title (with parenthetical context if relevant)",\n' +
    '      "body": "A 3-4 sentence paragraph describing the customer\'s strategic initiative, why it matters to their business, and what challenges or opportunities it presents. Use **bold** for key data points. Use *italic* for emphasis."\n' +
    '    }\n' +
    '  ]\n' +
    '}\n\n' +
    'Rules:\n' +
    '- Provide exactly 3 priorities\n' +
    '- Each priority must focus on the customer\'s business initiative, challenge, or opportunity\n' +
    '- Do NOT mention Docusign or any vendor products/solutions\n' +
    '- The body should read as natural prose, not bullet points\n' +
    '- Bold company names and dollar figures (e.g. **$2.5B**, **Wells Fargo**)\n' +
    '- Italic for emphasis on specific terms (e.g. *digital transformation*, *compliance*)';

  Logger.log('[Research] Call 6: Generating executive briefing for "' + companyName + '"');
  return callLLMJson(systemPrompt, userPrompt);
}

/**
 * Build Call 6 request (Executive Briefing) without sending it.
 * Same prompt as generateExecutiveBriefing().
 * @param {string} companyName
 * @param {Object} accountProfile  Result from Call 1
 * @param {Object} priorityMap     Result from Call 5
 * @param {Object} productSignals  Output of generateProductSignals()
 * @returns {Object} request object for callLLMJsonParallel
 */
function buildCall6Request(companyName, accountProfile, priorityMap, productSignals) {
  var systemPrompt =
    'You are writing an executive meeting briefing focused entirely on the customer.\n' +
    'Write in a concise, professional tone suitable for an executive audience.\n' +
    'Use **bold** for key data points, company names, and dollar figures.\n' +
    'Use *italic* for emphasis on specific terms.\n' +
    'Do NOT mention Docusign, any Docusign products, or any vendor solutions.\n' +
    'Do NOT include source citations or URLs.\n' +
    'Return your response as valid JSON only. No markdown fences, no extra text.';

  var initiatives = '';
  if (accountProfile && accountProfile.businessPerformance &&
      accountProfile.businessPerformance.strategicInitiatives) {
    initiatives = JSON.stringify(accountProfile.businessPerformance.strategicInitiatives);
  }

  var priorities = '';
  if (priorityMap && priorityMap.priorityMapping) {
    priorities = JSON.stringify(priorityMap.priorityMapping);
  }

  var expansions = '';
  if (priorityMap && priorityMap.expansionOpportunities) {
    expansions = JSON.stringify(priorityMap.expansionOpportunities);
  }

  var userPrompt =
    'Create an executive meeting briefing about "' + companyName + '".\n' +
    'Focus 100% on the customer — their strategic priorities, business challenges, and market context.\n\n' +
    '--- STRATEGIC INITIATIVES ---\n' + initiatives + '\n\n' +
    '--- PRIORITY MAPPINGS ---\n' + priorities + '\n\n' +
    '--- EXPANSION CONTEXT ---\n' + expansions + '\n\n' +
    'Return a JSON object with exactly this structure:\n' +
    '{\n' +
    '  "introText": "1-2 sentences setting context about the company\'s current strategic focus and market position. No source citations.",\n' +
    '  "priorities": [\n' +
    '    {\n' +
    '      "title": "Priority title (with parenthetical context if relevant)",\n' +
    '      "body": "A 3-4 sentence paragraph describing the customer\'s strategic initiative, why it matters to their business, and what challenges or opportunities it presents. Use **bold** for key data points. Use *italic* for emphasis."\n' +
    '    }\n' +
    '  ]\n' +
    '}\n\n' +
    'Rules:\n' +
    '- Provide exactly 3 priorities\n' +
    '- Each priority must focus on the customer\'s business initiative, challenge, or opportunity\n' +
    '- Do NOT mention Docusign or any vendor products/solutions\n' +
    '- The body should read as natural prose, not bullet points\n' +
    '- Bold company names and dollar figures (e.g. **$2.5B**, **Wells Fargo**)\n' +
    '- Italic for emphasis on specific terms (e.g. *digital transformation*, *compliance*)';

  Logger.log('[Research] buildCall6Request: Executive Briefing for "' + companyName + '"');
  return buildLLMRequest(systemPrompt, userPrompt);
}

/**
 * Call 7: Big Bet Initiatives — 3 quantified, high-impact IAM transformation projects.
 * @param {string} companyName
 * @param {Object} accountProfile  Result from Call 1
 * @param {Object} priorityMap     Result from Call 5
 * @param {Object} productSignals  Output of generateProductSignals()
 * @param {Object} agreementLandscape  Result from Call 3
 * @param {string} internalSummary  Text summary from summarizeForLLM()
 * @returns {Object} { bigBets: [...] }
 */
function generateBigBetInitiatives(companyName, accountProfile, priorityMap, productSignals, agreementLandscape, internalSummary) {
  var request = buildCall7Request(companyName, accountProfile, priorityMap, productSignals, agreementLandscape, internalSummary);
  Logger.log('[Research] Call 7: Generating Big Bet Initiatives for "' + companyName + '"');

  var payload = JSON.parse(request.payload);
  return callLLMJson(payload.sr, payload.ur);
}

/**
 * Build Call 7 request (Big Bet Initiatives) without sending it.
 * @param {string} companyName
 * @param {Object} accountProfile  Result from Call 1
 * @param {Object} priorityMap     Result from Call 5
 * @param {Object} productSignals  Output of generateProductSignals()
 * @param {Object} agreementLandscape  Result from Call 3
 * @param {string} internalSummary  Text summary from summarizeForLLM()
 * @returns {Object} request object for callLLMJsonParallel
 */
function buildCall7Request(companyName, accountProfile, priorityMap, productSignals, agreementLandscape, internalSummary) {
  var catalogContext = buildCatalogContext();
  var signalSummary = (productSignals && productSignals.summary) || '';

  var systemPrompt =
    'You are a senior Docusign solutions architect designing high-impact IAM (Intelligent Agreement Management) transformation projects.\n' +
    'Your goal is to identify 3 bold, quantified initiatives that would transform how the company manages agreements.\n\n' +
    '--- DOCUSIGN PRODUCT CATALOG ---\n' + catalogContext + '\n\n' +
    '--- PRODUCT SIGNALS (from internal data analysis) ---\n' + signalSummary + '\n\n' +
    'IMPORTANT: Use product signals to ground recommendations. Do NOT recommend products marked "in_use" as the core of a big bet. ' +
    'Prioritize "strong" signal products. Each bet must use 2+ Docusign products.\n\n' +
    'Return your response as valid JSON only. No markdown fences, no extra text.';

  // Build context from available data
  var contextParts = [];

  if (accountProfile) {
    if (accountProfile.financials) {
      contextParts.push('Company Financials: ' + JSON.stringify(accountProfile.financials));
    }
    if (accountProfile.businessPerformance && accountProfile.businessPerformance.strategicInitiatives) {
      contextParts.push('Strategic Initiatives: ' + JSON.stringify(accountProfile.businessPerformance.strategicInitiatives));
    }
    if (accountProfile.businessUnits) {
      contextParts.push('Business Units: ' + accountProfile.businessUnits.map(function(bu) {
        return bu.name + ' (' + (bu.offering || '') + ')';
      }).join(', '));
    }
    if (accountProfile.technologyStack) {
      contextParts.push('Tech Stack: ' + JSON.stringify(accountProfile.technologyStack));
    }
  }

  if (priorityMap) {
    if (priorityMap.priorityMapping) {
      contextParts.push('Priority Mappings: ' + JSON.stringify(priorityMap.priorityMapping));
    }
    if (priorityMap.expansionOpportunities) {
      contextParts.push('Expansion Opportunities: ' + JSON.stringify(priorityMap.expansionOpportunities));
    }
  }

  if (agreementLandscape && agreementLandscape.agreements) {
    contextParts.push('Top Agreement Types: ' + agreementLandscape.agreements.slice(0, 10).map(function(a) {
      return a.agreementType + ' (' + a.category + ', vol:' + a.volume + ', cx:' + a.complexity + ')';
    }).join(', '));
  }

  if (internalSummary) {
    contextParts.push('Internal Docusign Usage Data:\n' + internalSummary);
  }

  var userPrompt =
    'Design 3 Big Bet IAM transformation initiatives for "' + companyName + '".\n\n' +
    '--- COMPANY CONTEXT ---\n' + contextParts.join('\n\n') + '\n\n' +
    'Return a JSON object with exactly this structure:\n' +
    '{\n' +
    '  "bigBets": [\n' +
    '    {\n' +
    '      "number": 1,\n' +
    '      "title": "Short punchy initiative name",\n' +
    '      "targetBusinessUnit": "Which BU this serves",\n' +
    '      "painPoint": "The problem it solves (2-3 sentences)",\n' +
    '      "solution": {\n' +
    '        "description": "What the IAM solution looks like (3-4 sentences)",\n' +
    '        "primaryProducts": ["Docusign Product 1", "Docusign Product 2"],\n' +
    '        "integrations": ["Salesforce", "SAP", "etc."]\n' +
    '      },\n' +
    '      "impact": {\n' +
    '        "estimatedAnnualValue": "$X.XM",\n' +
    '        "valueDrivers": [\n' +
    '          { "driver": "Description of value driver", "estimate": "$X" }\n' +
    '        ],\n' +
    '        "qualitativeImpact": "Risk reduction, compliance improvement, etc."\n' +
    '      },\n' +
    '      "implementation": {\n' +
    '        "effortLevel": "Low|Medium|High",\n' +
    '        "timelineWeeks": "X-Y weeks",\n' +
    '        "phases": [\n' +
    '          { "phase": "Phase name", "duration": "X weeks", "activities": "Key activities" }\n' +
    '        ],\n' +
    '        "prerequisites": ["prerequisite 1", "prerequisite 2"]\n' +
    '      },\n' +
    '      "executiveSponsor": "Suggested executive title (e.g. CPO, CLO, CIO)",\n' +
    '      "rationale": "A 3-4 sentence paragraph explaining WHY this was identified as a big bet. Reference specific evidence from the research: financial data points, strategic initiatives, agreement landscape findings, product signal strengths, internal usage patterns, or pain points that converge to make this a high-impact opportunity. This should read as a persuasive narrative connecting the dots across multiple data sources."\n' +
    '    }\n' +
    '  ]\n' +
    '}\n\n' +
    'Rules:\n' +
    '- Exactly 3 big bets, sorted by estimated annual value (highest first)\n' +
    '- Each must use 2+ Docusign products from the catalog\n' +
    '- Prioritize strong-signal products from the product signals data\n' +
    '- Do NOT recommend products already in use as the core of a big bet (they can be supporting)\n' +
    '- At least one bet must be revenue-side (sales, customer-facing agreements)\n' +
    '- At least one bet must be spend-side (procurement, vendor, supply chain agreements)\n' +
    '- Value estimates should be realistic and grounded in the company\'s financials\n' +
    '- Implementation phases should be specific and actionable (typically 3 phases each)\n' +
    '- Each bet should target a different business unit where possible\n' +
    '- The rationale field is critical: it must cite specific data points from the company context above (e.g. revenue figures, strategic initiative names, agreement types, product signals) to substantiate why this bet was chosen';

  Logger.log('[Research] buildCall7Request: Big Bet Initiatives for "' + companyName + '"');
  return buildLLMRequest(systemPrompt, userPrompt);
}
