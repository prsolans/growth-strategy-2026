/**
 * DataEnricher — pre-fetch verified company data from free public APIs
 * to anchor LLM research with consistent, authoritative facts.
 *
 * APIs used:
 *   - SEC EDGAR (via Cloudflare Worker proxy) — financials from 10-K XBRL
 *   - Wikipedia                               — stable company overview text
 *   - Wikidata                                — CEO, headquarters, founding date, ticker, CIK
 *
 * All functions degrade gracefully: if an API is unreachable or the company
 * is not found, the corresponding fields are simply omitted.
 */

// ═══════════════════════════════════════════════════════════════════════
// HTTP Helpers
// ═══════════════════════════════════════════════════════════════════════

/**
 * Fetch JSON from a public API (Wikipedia, Wikidata, SEC proxy).
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
// SEC EDGAR Proxy — Financials via Cloudflare Worker
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get the SEC proxy Worker URL from script properties.
 * @returns {string|null}
 */
function getSecProxyUrl() {
  try {
    var url = PropertiesService.getScriptProperties().getProperty(PROP_SEC_PROXY_URL);
    return url || null;
  } catch (e) {
    return null;
  }
}

/**
 * Fetch financials from the SEC EDGAR proxy Worker.
 * Accepts CIK and/or ticker — the proxy resolves ticker→CIK if needed.
 *
 * @param {string|null} cik     SEC CIK number (e.g., "0000072971")
 * @param {string|null} ticker  Stock ticker (e.g., "WFC")
 * @returns {Object}  { revenue, cogs, opex, capex, netIncome, employees, filingPeriod, secIndustry }
 */
function fetchSecProxyFinancials(cik, ticker) {
  var proxyUrl = getSecProxyUrl();
  if (!proxyUrl) {
    Logger.log('[Enrich/SEC] No SEC_PROXY_URL configured. Set script property "' + PROP_SEC_PROXY_URL + '".');
    return {};
  }

  // Build query string — prefer CIK, fall back to ticker
  var params = [];
  if (cik) params.push('cik=' + encodeURIComponent(cik));
  if (ticker) params.push('ticker=' + encodeURIComponent(ticker));
  if (params.length === 0) {
    Logger.log('[Enrich/SEC] No CIK or ticker available — cannot fetch SEC financials');
    return {};
  }

  var url = proxyUrl + '?' + params.join('&');
  Logger.log('[Enrich/SEC] Fetching: ' + url);

  var data = fetchPublicJson(url);
  if (!data || data.error) {
    Logger.log('[Enrich/SEC] Proxy returned error: ' + (data ? data.error : 'null response'));
    return {};
  }

  Logger.log('[Enrich/SEC] Response: ' + data.entityName + ' (' + data.filingPeriod + ')');

  var result = {};
  var fin = data.financials || {};

  if (fin.revenue != null)   result.revenue = fin.revenue;
  if (fin.cogs != null)      result.cogs = fin.cogs;
  if (fin.opex != null)      result.opex = fin.opex;
  if (fin.capex != null)     result.capex = fin.capex;
  if (fin.netIncome != null) result.netIncome = fin.netIncome;
  if (fin.employees != null) result.employees = fin.employees;
  if (data.filingPeriod)     result.filingPeriod = data.filingPeriod;
  if (data.sicDescription)   result.secIndustry = data.sicDescription;

  // Segment revenue from 10-K XBRL instance
  if (data.segments && data.segments.length > 0) {
    result.segments = data.segments;
    result.segmentType = data.segmentType || 'business';
    Logger.log('[Enrich/SEC] Segment revenue: ' + data.segments.length + ' segments (' + result.segmentType + ')');
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

  // ── Wikidata: structured facts (also gives us ticker + CIK for SEC) ─
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

  // ── SEC EDGAR: financials from 10-K filings ─────────────────────
  try {
    var ticker = enrichment.ticker || null;
    var secCik = wikidataFacts.secCik || null;
    var financials = {};

    if (!secCik && !ticker) {
      Logger.log('[Enrich/SEC] No CIK or ticker available — cannot fetch SEC financials (company may be private)');
    } else {
      financials = fetchSecProxyFinancials(secCik, ticker);
      if (financials.secIndustry) enrichment.secIndustry = financials.secIndustry;
    }

    if (financials.revenue != null)   { enrichment.revenue = financials.revenue; enrichment.revenueFormatted = formatDollars(financials.revenue); }
    if (financials.cogs != null)      { enrichment.cogs = financials.cogs; enrichment.cogsFormatted = formatDollars(financials.cogs); }
    if (financials.opex != null)      { enrichment.opex = financials.opex; enrichment.opexFormatted = formatDollars(financials.opex); }
    if (financials.capex != null)     { enrichment.capex = financials.capex; enrichment.capexFormatted = formatDollars(financials.capex); }
    if (financials.netIncome != null) { enrichment.netIncome = financials.netIncome; enrichment.netIncomeFormatted = formatDollars(financials.netIncome); }
    if (financials.employees != null) { enrichment.employees = financials.employees; enrichment.employeesFormatted = formatNumber(financials.employees); }
    if (financials.filingPeriod)      enrichment.filingPeriod = financials.filingPeriod;

    // Segment revenue
    if (financials.segments && financials.segments.length > 0) {
      enrichment.segments = financials.segments;
      enrichment.segmentType = financials.segmentType || 'business';
      enrichment.segmentsFormatted = financials.segments.map(function(seg) {
        return seg.name + ': ' + formatDollars(seg.revenue);
      });
      Logger.log('[Enrich/SEC] Segment revenue formatted (' + enrichment.segmentType + '): ' + enrichment.segmentsFormatted.join(', '));
    }
  } catch (e) {
    Logger.log('[Enrich] SEC financial data failed: ' + e.message);
  }

  // Summary of what was enriched
  var enrichedFields = Object.keys(enrichment).filter(function(k) {
    return k.charAt(0) !== '_' && enrichment[k] != null;
  });
  Logger.log('[Enrich] ═══ Enrichment complete. Fields: ' + enrichedFields.join(', ') + ' ═══');

  return enrichment;
}
