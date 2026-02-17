import { extractAllMetrics } from './xbrl-extractor.js';
import { fetchSegmentRevenue } from './segment-extractor.js';

const SEC_BASE = 'https://data.sec.gov';
const SEC_USER_AGENT = 'GrowthStrategy growth-strategy@docusign.com';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * Fetch JSON from SEC EDGAR with the required User-Agent header.
 */
async function fetchSec(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': SEC_USER_AGENT,
      'Accept': 'application/json',
    },
  });
  if (!res.ok) {
    const err = new Error(`SEC returned ${res.status} for ${url}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * Fetch text (XML/HTML) from SEC EDGAR with the required User-Agent header.
 */
async function fetchSecText(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': SEC_USER_AGENT,
      'Accept': 'text/xml, application/xml, text/html, */*',
    },
  });
  if (!res.ok) {
    throw new Error(`SEC returned ${res.status} for ${url}`);
  }
  return res.text();
}

// Cache ticker→CIK map in memory across warm Worker instances
let tickerMap = null;

/**
 * Load SEC's company_tickers.json and build a ticker → CIK lookup.
 * Cached in module scope for warm Worker invocations.
 */
async function getTickerMap() {
  if (tickerMap) return tickerMap;

  const res = await fetch('https://www.sec.gov/files/company_tickers.json', {
    headers: { 'User-Agent': SEC_USER_AGENT, 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`SEC returned ${res.status} for company_tickers.json`);

  const data = await res.json();
  tickerMap = {};
  for (const entry of Object.values(data)) {
    tickerMap[entry.ticker.toUpperCase()] = String(entry.cik_str);
  }
  return tickerMap;
}

/**
 * Pad a CIK to 10 digits with leading zeros.
 */
function padCik(cik) {
  return String(cik).replace(/^0+/, '').padStart(10, '0');
}

/**
 * Return a JSON Response with CORS headers.
 */
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

export default {
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'GET') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    const url = new URL(request.url);
    let cik = url.searchParams.get('cik');
    let ticker = url.searchParams.get('ticker');

    // Resolve ticker → CIK if no CIK provided
    if (!cik && ticker) {
      try {
        const map = await getTickerMap();
        cik = map[ticker.toUpperCase()];
        if (!cik) {
          return jsonResponse({ error: `Ticker "${ticker}" not found in SEC database` }, 404);
        }
      } catch (e) {
        console.error('Failed to load ticker map:', e.message);
        return jsonResponse({ error: 'Failed to load SEC ticker data' }, 502);
      }
    }

    if (!cik) {
      return jsonResponse({ error: 'Missing required parameter: cik or ticker' }, 400);
    }

    const paddedCik = padCik(cik);

    // Fetch companyfacts (XBRL) and submissions in parallel
    let companyfacts, submissions;
    try {
      [companyfacts, submissions] = await Promise.all([
        fetchSec(`${SEC_BASE}/api/xbrl/companyfacts/CIK${paddedCik}.json`),
        fetchSec(`${SEC_BASE}/submissions/CIK${paddedCik}.json`),
      ]);
    } catch (e) {
      console.error('SEC fetch failed:', e.message);
      if (e.status === 404) {
        return jsonResponse({ error: `CIK ${paddedCik} not found on SEC EDGAR` }, 404);
      }
      return jsonResponse({ error: 'SEC EDGAR request failed: ' + e.message }, 502);
    }

    // Extract metrics from XBRL
    const { financials, filingPeriod } = extractAllMetrics(companyfacts);

    // Extract segment revenue from 10-K XBRL instance document
    const segmentResult = await fetchSegmentRevenue(paddedCik, submissions, fetchSecText, null);

    // Build response
    const result = {
      cik: paddedCik,
      entityName: (companyfacts.entityName || submissions.name || '').toUpperCase(),
      ticker: ticker ? ticker.toUpperCase() : (submissions.tickers && submissions.tickers[0]) || null,
      sicDescription: submissions.sicDescription || null,
      filingPeriod,
      financials,
      segments: segmentResult.segments,
      segmentType: segmentResult.segmentType,
    };

    return jsonResponse(result);
  },
};
