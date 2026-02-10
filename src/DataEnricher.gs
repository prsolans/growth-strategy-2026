/**
 * DataEnricher — pre-fetch verified company data from free public APIs
 * to anchor LLM research with consistent, authoritative facts.
 *
 * APIs used:
 *   - SEC EDGAR (XBRL)  — financials, employee count, SIC code, ticker
 *   - Wikipedia          — stable company overview text
 *   - Wikidata           — CEO, headquarters, founding date, ticker
 *
 * All functions degrade gracefully: if an API is unreachable or the company
 * is not found, the corresponding fields are simply omitted.
 */

// ═══════════════════════════════════════════════════════════════════════
// HTTP Helpers
// ═══════════════════════════════════════════════════════════════════════

/**
 * Fetch JSON from SEC EDGAR (requires User-Agent header per SEC policy).
 * @param {string} url
 * @returns {Object|null}
 */
function fetchSecJson(url) {
  try {
    var response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      headers: { 'User-Agent': SEC_USER_AGENT, 'Accept': 'application/json' }
    });
    if (response.getResponseCode() !== 200) {
      Logger.log('[Enrich/SEC] HTTP ' + response.getResponseCode() + ' for ' + url);
      return null;
    }
    return JSON.parse(response.getContentText());
  } catch (e) {
    Logger.log('[Enrich/SEC] Fetch failed: ' + e.message);
    return null;
  }
}

/**
 * Fetch JSON from a public API (Wikipedia, Wikidata).
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
  return (name || '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')                     // strip (Parent), (US), etc.
    .replace(/\b(bank|n\.?\s*a\.?)\b/gi, '')               // strip "Bank", "N.A."
    .replace(/[,.]?\s*\b(inc|corp|corporation|ltd|llc|co|company|group|plc|& co|the|holdings?|l\.?p\.?)\b\.?/gi, '')
    .replace(/[,.\-]+$/, '')                                // trailing punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

// ═══════════════════════════════════════════════════════════════════════
// SEC EDGAR — CIK Resolution (via EFTS search API)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Search EDGAR EFTS for a company and extract CIK from results.
 * Uses the full-text search system at efts.sec.gov which is designed
 * for API access (avoids 403 issues with www.sec.gov static files).
 * @param {string} query  Company name or ticker to search
 * @returns {string|null} CIK zero-padded to 10 digits
 */
function searchEftsByCik(query) {
  var url = SEC_EFTS_URL + '/search-index?q=%22' + encodeURIComponent(query) +
    '%22&forms=10-K&dateRange=custom&startdt=2023-01-01&enddt=2026-12-31';
  Logger.log('[Enrich/SEC] EFTS search: ' + url);

  var data = fetchSecJson(url);
  if (!data) {
    Logger.log('[Enrich/SEC] EFTS returned no data');
    return null;
  }

  // Log response structure for debugging
  Logger.log('[Enrich/SEC] EFTS response keys: ' + Object.keys(data).join(', '));

  var hits = data.hits && data.hits.hits;
  if (!hits || hits.length === 0) {
    Logger.log('[Enrich/SEC] EFTS returned 0 hits');
    return null;
  }

  // Extract CIK from first hit
  var source = hits[0]._source || {};
  Logger.log('[Enrich/SEC] EFTS first hit: entity_name=' + (source.entity_name || 'N/A') +
    ', entity_id=' + (source.entity_id || 'N/A') + ', _id=' + (hits[0]._id || 'N/A'));

  // entity_id is the CIK in EFTS results
  if (source.entity_id) {
    var cik = padCik(source.entity_id);
    Logger.log('[Enrich/SEC] CIK from EFTS entity_id: ' + cik + ' (' + (source.entity_name || '') + ')');
    return cik;
  }

  // Fallback: parse CIK from _id (format: "{CIK}:{accession}")
  if (hits[0]._id) {
    var idParts = String(hits[0]._id).split(':');
    if (idParts[0] && /^\d+$/.test(idParts[0])) {
      var cikFromId = padCik(idParts[0]);
      Logger.log('[Enrich/SEC] CIK from EFTS _id parse: ' + cikFromId);
      return cikFromId;
    }
  }

  Logger.log('[Enrich/SEC] Could not extract CIK from EFTS response');
  return null;
}

/**
 * Resolve a company name to an SEC CIK number.
 * Strategy:
 *   1. If wikidataTicker is provided, search EFTS by ticker
 *   2. Search EFTS by cleaned company name
 * @param {string} companyName  Already cleaned for search
 * @param {string} [wikidataTicker]
 * @returns {string|null} CIK zero-padded to 10 digits
 */
function resolveCompanyToCik(companyName, wikidataTicker) {
  Logger.log('[Enrich/SEC] Resolving CIK for "' + companyName + '"' +
    (wikidataTicker ? ' (ticker hint: ' + wikidataTicker + ')' : ''));

  // Strategy 1: Search by ticker (most precise)
  if (wikidataTicker) {
    var cik = searchEftsByCik(wikidataTicker);
    if (cik) return cik;
  }

  // Strategy 2: Search by company name
  var cikByName = searchEftsByCik(companyName);
  if (cikByName) return cikByName;

  Logger.log('[Enrich/SEC] Could not resolve CIK for "' + companyName + '"');
  return null;
}

/**
 * Zero-pad a CIK to 10 digits (SEC API requirement).
 * @param {string|number} cik
 * @returns {string}
 */
function padCik(cik) {
  var s = String(cik);
  while (s.length < 10) s = '0' + s;
  return s;
}

// ═══════════════════════════════════════════════════════════════════════
// SEC EDGAR — Financials (XBRL CompanyConcept API)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Fetch the most recent annual value for a given XBRL concept.
 * Tries each concept name in the fallback array until one has data.
 * @param {string} cik        Zero-padded CIK
 * @param {Array}  concepts   Array of US-GAAP concept names to try
 * @returns {number|null}     Raw numeric value (e.g., 45300000000)
 */
function fetchXbrlConcept(cik, concepts) {
  for (var i = 0; i < concepts.length; i++) {
    var url = SEC_BASE_URL + '/api/xbrl/companyconcept/CIK' + cik +
      '/us-gaap/' + concepts[i] + '.json';
    var data = fetchSecJson(url);
    if (!data || !data.units) continue;

    // Find USD values (or pure numbers for employee count)
    var units = data.units.USD || data.units.pure || data.units['shares'];
    if (!units || units.length === 0) continue;

    // Filter to annual filings (10-K, 10-K/A) and pick the most recent
    var annuals = units.filter(function(entry) {
      return entry.form === '10-K' || entry.form === '10-K/A';
    });
    if (annuals.length === 0) continue;

    // Sort by end date descending, pick most recent
    annuals.sort(function(a, b) {
      return (b.end || '').localeCompare(a.end || '');
    });

    Logger.log('[Enrich/SEC] Found ' + concepts[i] + ' = ' + annuals[0].val +
      ' (filed: ' + annuals[0].end + ', form: ' + annuals[0].form + ')');
    return { value: annuals[0].val, period: annuals[0].end, concept: concepts[i] };
  }
  return null;
}

/**
 * Fetch full financial data from SEC EDGAR for a company.
 * @param {string} cik  Zero-padded CIK
 * @returns {Object}    { revenue, cogs, opex, capex, netIncome, employees, filingPeriod }
 */
function fetchSecFinancials(cik) {
  Logger.log('[Enrich/SEC] Fetching financials for CIK ' + cik);
  var result = {};

  var revenue = fetchXbrlConcept(cik, XBRL_REVENUE_CONCEPTS);
  if (revenue) { result.revenue = revenue.value; result.filingPeriod = revenue.period; }

  var cogs = fetchXbrlConcept(cik, XBRL_COGS_CONCEPTS);
  if (cogs) result.cogs = cogs.value;

  var opex = fetchXbrlConcept(cik, XBRL_OPEX_CONCEPTS);
  if (opex) result.opex = opex.value;

  var capex = fetchXbrlConcept(cik, XBRL_CAPEX_CONCEPTS);
  if (capex) result.capex = capex.value;

  var netIncome = fetchXbrlConcept(cik, XBRL_NET_INCOME_CONCEPTS);
  if (netIncome) result.netIncome = netIncome.value;

  var employees = fetchXbrlConcept(cik, XBRL_EMPLOYEE_CONCEPTS);
  if (employees) result.employees = employees.value;

  Logger.log('[Enrich/SEC] Financials result: ' + JSON.stringify(result));
  return result;
}

/**
 * Fetch company metadata from SEC EDGAR submissions endpoint.
 * @param {string} cik  Zero-padded CIK
 * @returns {Object|null}  { name, tickers, sic, sicDescription, stateOfIncorporation }
 */
function fetchSecSubmissions(cik) {
  var url = SEC_BASE_URL + '/submissions/CIK' + cik + '.json';
  var data = fetchSecJson(url);
  if (!data) return null;

  return {
    name: data.name || null,
    tickers: data.tickers || [],
    sic: data.sic || null,
    sicDescription: data.sicDescription || null,
    stateOfIncorporation: data.stateOfIncorporation || null
  };
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
 * @returns {Object}  { ceo, headquarters, foundingDate, ticker }
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

  // P249 = ticker symbol
  result.ticker = getWikidataStringValue(claims, 'P249');

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

  // ── Wikidata: structured facts (also gives us ticker for SEC) ──────
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

  // ── SEC EDGAR: financials and company metadata ─────────────────────
  try {
    var cik = resolveCompanyToCik(searchName, wikidataFacts.ticker || null);
    if (cik) {
      enrichment.cik = cik;

      // Company metadata (name, tickers, SIC)
      var submissions = fetchSecSubmissions(cik);
      if (submissions) {
        if (submissions.sic) enrichment.sicCode = submissions.sic;
        if (submissions.sicDescription) enrichment.sicDescription = submissions.sicDescription;
        if (submissions.tickers && submissions.tickers.length > 0) {
          enrichment.ticker = enrichment.ticker || submissions.tickers[0];
        }
      }

      // Financial data from XBRL
      var financials = fetchSecFinancials(cik);
      if (financials) {
        if (financials.revenue != null)   enrichment.revenue = financials.revenue;
        if (financials.cogs != null)      enrichment.cogs = financials.cogs;
        if (financials.opex != null)      enrichment.opex = financials.opex;
        if (financials.capex != null)     enrichment.capex = financials.capex;
        if (financials.netIncome != null) enrichment.netIncome = financials.netIncome;
        if (financials.employees != null) enrichment.employees = financials.employees;
        if (financials.filingPeriod)      enrichment.filingPeriod = financials.filingPeriod;

        // Pre-format for prompt injection
        enrichment.revenueFormatted   = formatDollars(financials.revenue);
        enrichment.cogsFormatted      = formatDollars(financials.cogs);
        enrichment.opexFormatted      = formatDollars(financials.opex);
        enrichment.capexFormatted     = formatDollars(financials.capex);
        enrichment.netIncomeFormatted = formatDollars(financials.netIncome);
        enrichment.employeesFormatted = formatNumber(financials.employees);
      }
    }
  } catch (e) {
    Logger.log('[Enrich] SEC EDGAR failed: ' + e.message);
  }

  // Summary of what was enriched
  var enrichedFields = Object.keys(enrichment).filter(function(k) {
    return k.charAt(0) !== '_' && enrichment[k] != null;
  });
  Logger.log('[Enrich] ═══ Enrichment complete. Fields: ' + enrichedFields.join(', ') + ' ═══');

  return enrichment;
}
