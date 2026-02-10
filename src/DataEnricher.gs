/**
 * DataEnricher — pre-fetch verified company data from free public APIs
 * to anchor LLM research with consistent, authoritative facts.
 *
 * APIs used:
 *   - Financial Modeling Prep (FMP) — financials, employee count, industry
 *   - Wikipedia                     — stable company overview text
 *   - Wikidata                      — CEO, headquarters, founding date, ticker
 *
 * All functions degrade gracefully: if an API is unreachable or the company
 * is not found, the corresponding fields are simply omitted.
 */

// ═══════════════════════════════════════════════════════════════════════
// HTTP Helpers
// ═══════════════════════════════════════════════════════════════════════

/**
 * Fetch JSON from a public API (Wikipedia, Wikidata, FMP).
 * @param {string} url
 * @returns {Object|null}
 */
function fetchPublicJson(url) {
  try {
    var response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      headers: { 'Accept': 'application/json' }
    });
    if (response.getResponseCode() !== 200) {
      Logger.log('[Enrich] HTTP ' + response.getResponseCode() + ' for ' + url);
      return null;
    }
    return JSON.parse(response.getContentText());
  } catch (e) {
    Logger.log('[Enrich] Fetch failed: ' + e.message);
    return null;
  }
}

/**
 * Get the FMP API key from script properties.
 * @returns {string|null}
 */
function getFmpApiKey() {
  try {
    var key = PropertiesService.getScriptProperties().getProperty(PROP_FMP_API_KEY);
    return key || null;
  } catch (e) {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Company Name Cleaning
// ═══════════════════════════════════════════════════════════════════════

/**
 * Clean a company name for API searches.
 * Strips parenthetical suffixes like "(Parent)", legal entity markers like
 * "Bank, N.A.", "Inc.", "Corp.", etc. to get a clean, searchable name.
 * @param {string} name
 * @returns {string}
 */
function cleanCompanyNameForSearch(name) {
  var cleaned = (name || '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')                     // strip all parenthetical content: (Parent), (US), etc.
    .trim();

  // Strip trailing legal suffixes only — multiple passes for stacked suffixes
  // like "Bank, N.A." → strip "N.A." then strip "Bank"
  for (var i = 0; i < 3; i++) {
    cleaned = cleaned
      .replace(/,?\s*N\.?\s*A\.?\s*$/gi, '')               // trailing ", N.A."
      .replace(/,?\s*(Inc|Corp|Corporation|Ltd|LLC|Company|Group|PLC|Holdings|Incorporated|L\.?P\.?)\.?\s*$/gi, '')
      .replace(/,?\s*Bank\s*$/gi, '')                      // trailing "Bank" only (not "Bank of America")
      .replace(/[,.\-;]+\s*$/g, '')                        // trailing punctuation
      .trim();
  }

  return cleaned.replace(/\s+/g, ' ');
}

// ═══════════════════════════════════════════════════════════════════════
// Financial Modeling Prep (FMP) — Financials & Company Profile
// ═══════════════════════════════════════════════════════════════════════

/**
 * Fetch company profile from FMP (employee count, industry, description, etc.).
 * @param {string} ticker  Stock ticker symbol (e.g., "WFC")
 * @param {string} apiKey  FMP API key
 * @returns {Object|null}  First profile result
 */
function fetchFmpProfile(ticker, apiKey) {
  var url = FMP_BASE_URL + '/profile/' + encodeURIComponent(ticker) + '?apikey=' + apiKey;
  Logger.log('[Enrich/FMP] Fetching profile for ' + ticker);
  var data = fetchPublicJson(url);
  if (!data || !Array.isArray(data) || data.length === 0) {
    Logger.log('[Enrich/FMP] No profile data for ' + ticker);
    return null;
  }
  Logger.log('[Enrich/FMP] Profile: ' + data[0].companyName + ' | employees: ' +
    data[0].fullTimeEmployees + ' | industry: ' + data[0].industry);
  return data[0];
}

/**
 * Fetch income statement from FMP (revenue, net income, OpEx, etc.).
 * Returns the most recent annual statement.
 * @param {string} ticker  Stock ticker symbol
 * @param {string} apiKey  FMP API key
 * @returns {Object|null}  Most recent annual income statement
 */
function fetchFmpIncomeStatement(ticker, apiKey) {
  var url = FMP_BASE_URL + '/income-statement/' + encodeURIComponent(ticker) +
    '?period=annual&limit=1&apikey=' + apiKey;
  Logger.log('[Enrich/FMP] Fetching income statement for ' + ticker);
  var data = fetchPublicJson(url);
  if (!data || !Array.isArray(data) || data.length === 0) {
    Logger.log('[Enrich/FMP] No income statement data for ' + ticker);
    return null;
  }
  var stmt = data[0];
  Logger.log('[Enrich/FMP] Income statement (' + stmt.calendarYear + '): revenue=' +
    stmt.revenue + ', netIncome=' + stmt.netIncome + ', opEx=' + stmt.operatingExpenses);
  return stmt;
}

/**
 * Fetch cash flow statement from FMP (CapEx).
 * @param {string} ticker  Stock ticker symbol
 * @param {string} apiKey  FMP API key
 * @returns {Object|null}  Most recent annual cash flow statement
 */
function fetchFmpCashFlow(ticker, apiKey) {
  var url = FMP_BASE_URL + '/cash-flow-statement/' + encodeURIComponent(ticker) +
    '?period=annual&limit=1&apikey=' + apiKey;
  Logger.log('[Enrich/FMP] Fetching cash flow for ' + ticker);
  var data = fetchPublicJson(url);
  if (!data || !Array.isArray(data) || data.length === 0) {
    Logger.log('[Enrich/FMP] No cash flow data for ' + ticker);
    return null;
  }
  Logger.log('[Enrich/FMP] Cash flow (' + data[0].calendarYear + '): capEx=' +
    data[0].capitalExpenditure);
  return data[0];
}

/**
 * Fetch all financial data from FMP for a given ticker.
 * Consolidates profile, income statement, and cash flow into one result.
 * @param {string} ticker  Stock ticker symbol
 * @param {string} apiKey  FMP API key
 * @returns {Object}  Consolidated financial data
 */
function fetchFmpFinancials(ticker, apiKey) {
  var result = {};

  // Profile: employee count, industry, description
  var profile = fetchFmpProfile(ticker, apiKey);
  if (profile) {
    if (profile.fullTimeEmployees) result.employees = profile.fullTimeEmployees;
    if (profile.industry) result.fmpIndustry = profile.industry;
    if (profile.sector) result.fmpSector = profile.sector;
  }

  // Income statement: revenue, COGS, OpEx, net income
  var income = fetchFmpIncomeStatement(ticker, apiKey);
  if (income) {
    if (income.revenue) result.revenue = income.revenue;
    if (income.costOfRevenue) result.cogs = income.costOfRevenue;
    if (income.operatingExpenses) result.opex = income.operatingExpenses;
    if (income.netIncome) result.netIncome = income.netIncome;
    if (income.calendarYear) result.filingPeriod = income.calendarYear;
  }

  // Cash flow: CapEx
  var cashFlow = fetchFmpCashFlow(ticker, apiKey);
  if (cashFlow) {
    // FMP reports CapEx as negative; take absolute value
    if (cashFlow.capitalExpenditure) result.capex = Math.abs(cashFlow.capitalExpenditure);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════
// Wikipedia — Company Overview
// ═══════════════════════════════════════════════════════════════════════

/**
 * Fetch the intro paragraph for a company from Wikipedia.
 * Uses the REST API summary endpoint for a clean extract.
 * @param {string} companyName
 * @returns {string|null}  First ~3 sentences of the Wikipedia article
 */
function fetchWikipediaOverview(companyName) {
  Logger.log('[Enrich/Wiki] Fetching overview for "' + companyName + '"');

  // Use Wikipedia search to find the right article title
  var searchUrl = 'https://en.wikipedia.org/w/api.php?action=query&list=search' +
    '&srsearch=' + encodeURIComponent(companyName + ' company') +
    '&srlimit=1&format=json';
  var searchData = fetchPublicJson(searchUrl);

  var title = null;
  if (searchData && searchData.query && searchData.query.search && searchData.query.search.length > 0) {
    title = searchData.query.search[0].title;
  }
  if (!title) {
    Logger.log('[Enrich/Wiki] No Wikipedia article found for "' + companyName + '"');
    return null;
  }

  // Fetch the summary/extract using the REST API
  var summaryUrl = WIKI_API_URL + '/page/summary/' + encodeURIComponent(title.replace(/ /g, '_'));
  var summaryData = fetchPublicJson(summaryUrl);

  if (!summaryData || !summaryData.extract) {
    Logger.log('[Enrich/Wiki] No extract available for "' + title + '"');
    return null;
  }

  // Truncate to ~3 sentences for conciseness
  var extract = summaryData.extract;
  var sentences = extract.match(/[^.!?]+[.!?]+/g) || [extract];
  var overview = sentences.slice(0, 3).join(' ').trim();

  Logger.log('[Enrich/Wiki] Overview (' + overview.length + ' chars): ' + overview.substring(0, 200) + '...');
  return overview;
}

// ═══════════════════════════════════════════════════════════════════════
// Wikidata — Structured Company Facts
// ═══════════════════════════════════════════════════════════════════════

/**
 * Search Wikidata for a company entity.
 * @param {string} companyName
 * @returns {string|null}  Wikidata QID (e.g., "Q312")
 */
function searchWikidata(companyName) {
  var url = WIKIDATA_API_URL + '?action=wbsearchentities' +
    '&search=' + encodeURIComponent(companyName) +
    '&language=en&limit=3&format=json';
  var data = fetchPublicJson(url);

  if (!data || !data.search || data.search.length === 0) {
    Logger.log('[Enrich/Wikidata] No results for "' + companyName + '"');
    return null;
  }

  // Return the first result — typically the most relevant
  var qid = data.search[0].id;
  Logger.log('[Enrich/Wikidata] Found: ' + qid + ' — ' + data.search[0].label +
    ' (' + (data.search[0].description || '') + ')');
  return qid;
}

/**
 * Fetch structured facts from a Wikidata entity.
 * @param {string} qid  Wikidata entity ID (e.g., "Q312")
 * @returns {Object}  { ceo, headquarters, foundingDate, ticker, secCik, industry }
 */
function fetchWikidataFacts(qid) {
  var url = WIKIDATA_API_URL + '?action=wbgetentities' +
    '&ids=' + qid +
    '&props=claims&format=json';
  var data = fetchPublicJson(url);

  if (!data || !data.entities || !data.entities[qid]) {
    return {};
  }

  var claims = data.entities[qid].claims || {};
  var result = {};

  // P169 = CEO / head of organization
  result.ceo = getWikidataLabel(claims, 'P169');

  // P159 = headquarters location
  result.headquarters = getWikidataLabel(claims, 'P159');

  // P571 = inception / founding date
  result.foundingDate = getWikidataDate(claims, 'P571');

  // P249 = ticker symbol (standalone)
  result.ticker = getWikidataStringValue(claims, 'P249');

  // If no standalone ticker, try extracting from P414 (stock exchange) qualifiers
  if (!result.ticker) {
    result.ticker = getWikidataQualifierString(claims, 'P414', 'P249');
  }

  // P5531 = SEC Central Index Key (CIK)
  result.secCik = getWikidataStringValue(claims, 'P5531');

  // P452 = industry
  result.industry = getWikidataLabel(claims, 'P452');

  Logger.log('[Enrich/Wikidata] Facts: ' + JSON.stringify(result));
  return result;
}

/**
 * Extract a label (entity reference) from a Wikidata claim.
 * Returns the QID label via a follow-up entity lookup.
 * @param {Object} claims
 * @param {string} property  Wikidata property ID
 * @returns {string|null}
 */
function getWikidataLabel(claims, property) {
  if (!claims[property] || claims[property].length === 0) return null;

  // Get the most recent / preferred value
  var claim = claims[property][0];
  var mainsnak = claim.mainsnak;
  if (!mainsnak || !mainsnak.datavalue) return null;

  var entityId = mainsnak.datavalue.value && mainsnak.datavalue.value.id;
  if (!entityId) return null;

  // Look up the entity's label
  var url = WIKIDATA_API_URL + '?action=wbgetentities' +
    '&ids=' + entityId + '&props=labels&languages=en&format=json';
  var data = fetchPublicJson(url);
  if (data && data.entities && data.entities[entityId] &&
      data.entities[entityId].labels && data.entities[entityId].labels.en) {
    return data.entities[entityId].labels.en.value;
  }
  return null;
}

/**
 * Extract a date value from a Wikidata claim.
 * @param {Object} claims
 * @param {string} property
 * @returns {string|null}  Year string (e.g., "1976")
 */
function getWikidataDate(claims, property) {
  if (!claims[property] || claims[property].length === 0) return null;
  var mainsnak = claims[property][0].mainsnak;
  if (!mainsnak || !mainsnak.datavalue) return null;
  var time = mainsnak.datavalue.value && mainsnak.datavalue.value.time;
  if (!time) return null;
  // Format: "+1976-04-01T00:00:00Z" — extract year
  var match = time.match(/\+?(\d{4})/);
  return match ? match[1] : null;
}

/**
 * Extract a plain string value from a Wikidata claim.
 * @param {Object} claims
 * @param {string} property
 * @returns {string|null}
 */
function getWikidataStringValue(claims, property) {
  if (!claims[property] || claims[property].length === 0) return null;
  var mainsnak = claims[property][0].mainsnak;
  if (!mainsnak || !mainsnak.datavalue) return null;
  return mainsnak.datavalue.value || null;
}

/**
 * Extract a string value from a qualifier on a Wikidata claim.
 * e.g., P414 (stock exchange) has qualifier P249 (ticker symbol) = "WFC"
 * @param {Object} claims
 * @param {string} property     The main property (e.g., "P414")
 * @param {string} qualifierId  The qualifier property (e.g., "P249")
 * @returns {string|null}
 */
function getWikidataQualifierString(claims, property, qualifierId) {
  if (!claims[property]) return null;
  for (var i = 0; i < claims[property].length; i++) {
    var qualifiers = claims[property][i].qualifiers;
    if (!qualifiers || !qualifiers[qualifierId]) continue;
    for (var j = 0; j < qualifiers[qualifierId].length; j++) {
      var dv = qualifiers[qualifierId][j].datavalue;
      if (dv && dv.value) return dv.value;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// Formatting Helpers
// ═══════════════════════════════════════════════════════════════════════

/**
 * Format a raw dollar value as a human-readable string.
 * e.g., 45300000000 → "$45.3 billion", 850000000 → "$850 million"
 * @param {number} val
 * @returns {string}
 */
function formatDollars(val) {
  if (val == null || isNaN(val)) return null;
  var abs = Math.abs(val);
  var sign = val < 0 ? '-' : '';

  if (abs >= 1e12) return sign + '$' + (abs / 1e12).toFixed(1) + ' trillion';
  if (abs >= 1e9)  return sign + '$' + (abs / 1e9).toFixed(1) + ' billion';
  if (abs >= 1e6)  return sign + '$' + (abs / 1e6).toFixed(1) + ' million';
  if (abs >= 1e3)  return sign + '$' + (abs / 1e3).toFixed(0) + ' thousand';
  return sign + '$' + abs.toFixed(0);
}

/**
 * Format a large number with commas.
 * e.g., 155000 → "155,000"
 * @param {number} val
 * @returns {string}
 */
function formatNumber(val) {
  if (val == null || isNaN(val)) return null;
  return Number(val).toLocaleString('en-US');
}

// ═══════════════════════════════════════════════════════════════════════
// Orchestrator
// ═══════════════════════════════════════════════════════════════════════

/**
 * Main entry point: enrich company data from public APIs.
 * Returns a consolidated enrichment object with all verified data.
 * Degrades gracefully — missing data is simply omitted.
 *
 * @param {string} companyName
 * @param {string} industry
 * @returns {Object} enrichment object with verified facts
 */
function enrichCompanyData(companyName, industry) {
  if (!ENRICHMENT_ENABLED) {
    Logger.log('[Enrich] Enrichment disabled via ENRICHMENT_ENABLED flag');
    return {};
  }

  Logger.log('[Enrich] ═══ Starting enrichment for "' + companyName + '" ═══');
  var enrichment = { _source: 'DataEnricher', _timestamp: new Date().toISOString() };

  // Clean the name for API searches (strip "Bank, N.A.", "(Parent)", etc.)
  var searchName = cleanCompanyNameForSearch(companyName);
  Logger.log('[Enrich] Cleaned search name: "' + searchName + '"');

  // ── Wikidata: structured facts (also gives us ticker for FMP) ──────
  var wikidataFacts = {};
  try {
    var qid = searchWikidata(searchName);
    if (qid) {
      wikidataFacts = fetchWikidataFacts(qid);
      if (wikidataFacts.ceo) enrichment.ceo = wikidataFacts.ceo;
      if (wikidataFacts.headquarters) enrichment.headquarters = wikidataFacts.headquarters;
      if (wikidataFacts.foundingDate) enrichment.foundingDate = wikidataFacts.foundingDate;
      if (wikidataFacts.ticker) enrichment.ticker = wikidataFacts.ticker;
      if (wikidataFacts.industry) enrichment.wikidataIndustry = wikidataFacts.industry;
    }
  } catch (e) {
    Logger.log('[Enrich] Wikidata failed: ' + e.message);
  }

  // ── Wikipedia: stable overview text ────────────────────────────────
  try {
    var overview = fetchWikipediaOverview(searchName);
    if (overview) enrichment.overview = overview;
  } catch (e) {
    Logger.log('[Enrich] Wikipedia failed: ' + e.message);
  }

  // ── FMP: financials, employee count, industry ─────────────────────
  try {
    var fmpKey = getFmpApiKey();
    var ticker = enrichment.ticker || null;

    if (!fmpKey) {
      Logger.log('[Enrich/FMP] No FMP API key configured. Set script property "' + PROP_FMP_API_KEY + '" to enable financial enrichment.');
    } else if (!ticker) {
      Logger.log('[Enrich/FMP] No ticker available — cannot fetch financials (company may be private)');
    } else {
      var financials = fetchFmpFinancials(ticker, fmpKey);

      if (financials.revenue != null)   { enrichment.revenue = financials.revenue; enrichment.revenueFormatted = formatDollars(financials.revenue); }
      if (financials.cogs != null)      { enrichment.cogs = financials.cogs; enrichment.cogsFormatted = formatDollars(financials.cogs); }
      if (financials.opex != null)      { enrichment.opex = financials.opex; enrichment.opexFormatted = formatDollars(financials.opex); }
      if (financials.capex != null)     { enrichment.capex = financials.capex; enrichment.capexFormatted = formatDollars(financials.capex); }
      if (financials.netIncome != null) { enrichment.netIncome = financials.netIncome; enrichment.netIncomeFormatted = formatDollars(financials.netIncome); }
      if (financials.employees != null) { enrichment.employees = financials.employees; enrichment.employeesFormatted = formatNumber(financials.employees); }
      if (financials.filingPeriod)      enrichment.filingPeriod = financials.filingPeriod;
      if (financials.fmpIndustry)       enrichment.fmpIndustry = financials.fmpIndustry;
      if (financials.fmpSector)         enrichment.fmpSector = financials.fmpSector;
    }
  } catch (e) {
    Logger.log('[Enrich] FMP failed: ' + e.message);
  }

  // Summary of what was enriched
  var enrichedFields = Object.keys(enrichment).filter(function(k) {
    return k.charAt(0) !== '_' && enrichment[k] != null;
  });
  Logger.log('[Enrich] ═══ Enrichment complete. Fields: ' + enrichedFields.join(', ') + ' ═══');

  return enrichment;
}
