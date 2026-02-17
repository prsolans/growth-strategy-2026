/**
 * XBRL segment revenue extraction from SEC EDGAR 10-K filing archives.
 *
 * The companyfacts API only provides consolidated (company-level) financials.
 * Segment revenue required by ASC 280 lives in the actual XBRL instance
 * documents within the filing archive.  This module fetches and parses those
 * documents to extract per-segment revenue figures.
 */

const SEC_ARCHIVES = 'https://www.sec.gov/Archives/edgar/data';

// Revenue concepts in priority order (same as xbrl-extractor.js)
const REVENUE_CONCEPTS = [
  'Revenues',
  'RevenueFromContractWithCustomerExcludingAssessedTax',
  'RevenueFromContractWithCustomerIncludingAssessedTax',
  'SalesRevenueNet',
  'SalesRevenueGoodsNet',
  'TotalRevenuesAndOtherIncome',
];

// Build a Set for O(1) lookups — prefixed with "us-gaap:"
const REVENUE_CONCEPT_SET = new Set(
  REVENUE_CONCEPTS.map((c) => 'us-gaap:' + c)
);

// The preferred dimension for business segments
const BIZ_SEGMENT_AXIS = 'StatementBusinessSegmentsAxis';

/**
 * Find the latest 10-K filing accession number from submissions data.
 * @param {Object} submissions  SEC submissions JSON
 * @returns {{ accession: string, primaryDocument: string } | null}
 */
export function findLatest10KAccession(submissions) {
  const recent = submissions && submissions.filings && submissions.filings.recent;
  if (!recent || !recent.form) return null;

  for (let i = 0; i < recent.form.length; i++) {
    if (recent.form[i] === '10-K') {
      return {
        accession: recent.accessionNumber[i].replace(/-/g, ''),
        primaryDocument: recent.primaryDocument ? recent.primaryDocument[i] : null,
      };
    }
  }
  return null;
}

/**
 * Identify the XBRL instance file from a filing index JSON.
 * Priority 1: _htm.xml (iXBRL companion — pure XML)
 * Priority 2: .xml that isn't a schema/linkbase
 * @param {Object} indexJson  Filing directory index JSON
 * @returns {string|null}  Filename of the XBRL instance
 */
export function findXbrlInstanceFile(indexJson) {
  const items = indexJson && indexJson.directory && indexJson.directory.item;
  if (!items || !items.length) return null;

  const LINKBASE_SUFFIXES = ['_cal.xml', '_def.xml', '_lab.xml', '_pre.xml'];

  let htmXml = null;
  let plainXml = null;

  for (const item of items) {
    const name = item.name || '';
    const lower = name.toLowerCase();

    if (lower.endsWith('_htm.xml')) {
      htmXml = name;
    } else if (lower.endsWith('.xml') && !lower.endsWith('.xsd')) {
      const isLinkbase = LINKBASE_SUFFIXES.some((s) => lower.endsWith(s));
      if (!isLinkbase && !plainXml) {
        plainXml = name;
      }
    }
  }

  return htmXml || plainXml || null;
}

/**
 * Parse all XBRL contexts that contain dimensional (segment) information.
 * @param {string} xml  Raw XBRL/iXBRL XML text
 * @returns {Map<string, { dimensions: Array<{axis: string, member: string}>, startDate: string|null, endDate: string|null, isInstant: boolean }>}
 */
export function parseSegmentContexts(xml) {
  const contexts = new Map();
  // Handle both prefixed (xbrli:context) and unprefixed (context) tags
  const contextRegex = /<(?:xbrli:)?context\s+id="([^"]+)">([\s\S]*?)<\/(?:xbrli:)?context>/gi;
  const dimRegex = /<xbrldi:explicitMember\s+dimension="([^"]+)">([^<]+)<\/xbrldi:explicitMember>/gi;
  const startRegex = /<(?:xbrli:)?startDate>([^<]+)<\/(?:xbrli:)?startDate>/i;
  const endRegex = /<(?:xbrli:)?endDate>([^<]+)<\/(?:xbrli:)?endDate>/i;
  const instantRegex = /<(?:xbrli:)?instant>([^<]+)<\/(?:xbrli:)?instant>/i;

  let match;
  while ((match = contextRegex.exec(xml)) !== null) {
    const contextId = match[1];
    const body = match[2];

    // Only interested in contexts with explicit dimensions
    const dimensions = [];
    let dimMatch;
    dimRegex.lastIndex = 0;
    while ((dimMatch = dimRegex.exec(body)) !== null) {
      dimensions.push({ axis: dimMatch[1], member: dimMatch[2] });
    }
    if (dimensions.length === 0) continue;

    const startMatch = body.match(startRegex);
    const endMatch = body.match(endRegex);
    const instantMatch = body.match(instantRegex);

    contexts.set(contextId, {
      dimensions,
      startDate: startMatch ? startMatch[1] : null,
      endDate: endMatch ? endMatch[1] : (instantMatch ? instantMatch[1] : null),
      isInstant: !!instantMatch,
    });
  }

  return contexts;
}

/**
 * Extract revenue facts from XBRL/iXBRL XML.
 * Handles both plain XBRL (<us-gaap:Revenues>) and iXBRL (<ix:nonFraction>).
 * @param {string} xml
 * @returns {Array<{ concept: string, contextRef: string, value: number, unitRef: string, scale: number }>}
 */
export function parseRevenueFacts(xml) {
  const facts = [];

  // Plain XBRL: <us-gaap:Revenues contextRef="..." unitRef="..." ...>12345</...>
  for (const concept of REVENUE_CONCEPTS) {
    const tag = 'us-gaap:' + concept;
    const regex = new RegExp(
      '<' + tag + '\\s+[^>]*contextRef="([^"]+)"[^>]*>([^<]+)</' + tag + '>',
      'gi'
    );
    let m;
    while ((m = regex.exec(xml)) !== null) {
      const fullTag = m[0];
      const contextRef = m[1];
      const rawValue = m[2].replace(/,/g, '').trim();
      const value = parseFloat(rawValue);
      if (isNaN(value)) continue;

      const unitMatch = fullTag.match(/unitRef="([^"]+)"/);
      facts.push({
        concept: tag,
        contextRef,
        value,
        unitRef: unitMatch ? unitMatch[1] : '',
        scale: 0,
      });
    }
  }

  // iXBRL: <ix:nonFraction name="us-gaap:Revenues" contextRef="..." ...>formatted number</ix:nonFraction>
  const ixRegex = /<ix:nonFraction\s+[^>]*name="([^"]+)"[^>]*>([^<]*)<\/ix:nonFraction>/gi;
  let ixMatch;
  while ((ixMatch = ixRegex.exec(xml)) !== null) {
    const fullTag = ixMatch[0];
    const name = ixMatch[1];
    if (!REVENUE_CONCEPT_SET.has(name)) continue;

    const ctxMatch = fullTag.match(/contextRef="([^"]+)"/);
    if (!ctxMatch) continue;

    const scaleMatch = fullTag.match(/scale="([^"]+)"/);
    const scale = scaleMatch ? parseInt(scaleMatch[1], 10) : 0;

    const rawValue = ixMatch[2].replace(/,/g, '').replace(/\s/g, '').trim();
    const value = parseFloat(rawValue);
    if (isNaN(value)) continue;

    const unitMatch = fullTag.match(/unitRef="([^"]+)"/);
    facts.push({
      concept: name,
      contextRef: ctxMatch[1],
      value: value * Math.pow(10, scale),
      unitRef: unitMatch ? unitMatch[1] : '',
      scale,
    });
  }

  return facts;
}

/**
 * Clean an XBRL segment member name into a human-readable label.
 * e.g. "aapl:AmericasSegmentMember" → "Americas"
 * @param {string} member
 * @returns {string}
 */
export function cleanSegmentName(member) {
  // Strip namespace prefix
  let name = member.includes(':') ? member.split(':').pop() : member;

  // Remove common suffixes
  name = name
    .replace(/SegmentMember$/i, '')
    .replace(/Member$/i, '')
    .replace(/Segment$/i, '');

  // CamelCase → spaces
  name = name.replace(/([a-z])([A-Z])/g, '$1 $2');

  return name.trim();
}

/**
 * Classify whether segment names represent geographic regions or business lines.
 * Heuristic: if >50% of names match geographic patterns → "geographic", else "business".
 * @param {Array<{ name: string, revenue: number }>} segments
 * @returns {"geographic"|"business"}
 */
export function classifySegmentType(segments) {
  if (!segments || segments.length === 0) return 'business';

  const GEO_PATTERNS = [
    // Continents / regions
    /\bamericas?\b/i, /\beurope\b/i, /\basia\b/i, /\bafrica\b/i,
    /\bemea\b/i, /\bapac\b/i, /\blatin\s*america\b/i, /\bmiddle\s*east\b/i,
    /\basia\s*pacific\b/i, /\bnorth\s*america\b/i, /\bsouth\s*america\b/i,
    // Major countries
    /\bchina\b/i, /\bjapan\b/i, /\bindia\b/i, /\bu\.?k\.?\b/i,
    /\bgermany\b/i, /\bfrance\b/i, /\bbrazil\b/i, /\bcanada\b/i,
    /\bkorea\b/i, /\baustralia\b/i, /\bunited\s*kingdom\b/i,
    /\bunited\s*states\b/i,
    // Geographic qualifiers
    /\bgreater\b/i, /\brest\s*of\b/i, /\binternational\b/i, /\bdomestic\b/i,
  ];

  let geoCount = 0;
  for (const seg of segments) {
    const name = seg.name || '';
    if (GEO_PATTERNS.some((pat) => pat.test(name))) {
      geoCount++;
    }
  }

  return geoCount > segments.length / 2 ? 'geographic' : 'business';
}

/**
 * Main segment extraction orchestrator.
 * Joins revenue facts to dimensional contexts and returns per-segment revenue.
 *
 * @param {string} xml        Raw XBRL instance XML
 * @param {string|null} fyEndDate  Expected FY end date (YYYY-MM-DD) for filtering, or null
 * @returns {{ segments: Array<{ name: string, revenue: number }>, segmentType: "geographic"|"business" }}
 */
export function extractSegmentRevenue(xml, fyEndDate) {
  const contexts = parseSegmentContexts(xml);
  const facts = parseRevenueFacts(xml);

  if (contexts.size === 0 || facts.length === 0) return { segments: [], segmentType: 'business' };

  // Join facts to their dimensional contexts.
  // For each joined record, identify the "segment dimension" — the one that
  // tells us which business/geographic segment the fact belongs to.
  // Many filings use 2 dimensions (e.g., ConsolidationItemsAxis + StatementBusinessSegmentsAxis).
  const joined = [];
  for (const fact of facts) {
    const ctx = contexts.get(fact.contextRef);
    if (!ctx) continue;

    // Skip instant contexts (we want duration/period facts)
    if (ctx.isInstant) continue;

    // Find the segment dimension — prefer StatementBusinessSegmentsAxis
    let segDim = null;
    for (const dim of ctx.dimensions) {
      if (dim.axis.includes(BIZ_SEGMENT_AXIS)) {
        segDim = dim;
        break;
      }
    }
    // Fall back to any single-dimension context (geographic etc.)
    if (!segDim && ctx.dimensions.length === 1) {
      segDim = ctx.dimensions[0];
    }
    if (!segDim) continue;

    joined.push({ ...fact, ...ctx, segDim });
  }

  if (joined.length === 0) return { segments: [], segmentType: 'business' };

  // Prefer StatementBusinessSegmentsAxis over geographic/other axes
  const hasBizAxis = joined.some((j) =>
    j.segDim.axis.includes(BIZ_SEGMENT_AXIS)
  );

  let filtered = hasBizAxis
    ? joined.filter((j) => j.segDim.axis.includes(BIZ_SEGMENT_AXIS))
    : joined;

  // Filter to annual period: match FY end date if provided, else most common end date
  if (fyEndDate) {
    const withDate = filtered.filter((j) => j.endDate === fyEndDate);
    if (withDate.length > 0) filtered = withDate;
  }

  if (filtered.length > 0) {
    // Find most common end date (heuristic for annual period)
    const dateCounts = {};
    for (const j of filtered) {
      if (j.endDate) {
        dateCounts[j.endDate] = (dateCounts[j.endDate] || 0) + 1;
      }
    }
    const bestDate = Object.entries(dateCounts).sort((a, b) => b[1] - a[1])[0];
    if (bestDate) {
      const dateFiltered = filtered.filter((j) => j.endDate === bestDate[0]);
      if (dateFiltered.length > 0) filtered = dateFiltered;
    }
  }

  // Build concept priority map for deduplication
  const conceptPriority = {};
  REVENUE_CONCEPTS.forEach((c, i) => {
    conceptPriority['us-gaap:' + c] = i;
  });

  // Deduplicate by segment name (prefer higher-priority revenue concept = lower index)
  const segmentMap = new Map();
  for (const j of filtered) {
    const name = cleanSegmentName(j.segDim.member);
    const priority = conceptPriority[j.concept] ?? 999;

    const existing = segmentMap.get(name);
    if (!existing || priority < existing.priority) {
      segmentMap.set(name, { name, revenue: j.value, priority });
    }
  }

  // Sort by revenue descending
  const segments = Array.from(segmentMap.values())
    .map(({ name, revenue }) => ({ name, revenue }))
    .sort((a, b) => b.revenue - a.revenue);

  return { segments, segmentType: classifySegmentType(segments) };
}

/**
 * Top-level async function: fetch and parse segment revenue from a 10-K filing.
 *
 * @param {string} cik           Padded CIK (10 digits)
 * @param {Object} submissions   SEC submissions JSON
 * @param {Function} fetchTextFn Async function(url) → string (text fetcher with SEC headers)
 * @param {string|null} fyEndDate  Expected FY end date for filtering
 * @returns {Promise<{ segments: Array<{ name: string, revenue: number }>, segmentType: "geographic"|"business" }>}
 */
export async function fetchSegmentRevenue(cik, submissions, fetchTextFn, fyEndDate) {
  const empty = { segments: [], segmentType: 'business' };
  try {
    // 1. Find latest 10-K accession
    const filing = findLatest10KAccession(submissions);
    if (!filing) {
      console.log('[Segments] No 10-K filing found');
      return empty;
    }
    console.log('[Segments] Found 10-K accession: ' + filing.accession);

    // 2. Fetch filing index JSON
    const cikClean = cik.replace(/^0+/, '');
    const indexUrl = `${SEC_ARCHIVES}/${cikClean}/${filing.accession}/index.json`;
    let indexJson;
    try {
      const indexText = await fetchTextFn(indexUrl);
      indexJson = JSON.parse(indexText);
    } catch (e) {
      console.log('[Segments] Failed to fetch filing index: ' + e.message);
      return empty;
    }

    // 3. Identify XBRL instance file
    const xbrlFile = findXbrlInstanceFile(indexJson);
    if (!xbrlFile) {
      console.log('[Segments] No XBRL instance file found in filing');
      return empty;
    }
    console.log('[Segments] XBRL instance file: ' + xbrlFile);

    // 4. Fetch and parse the XBRL instance
    const xbrlUrl = `${SEC_ARCHIVES}/${cikClean}/${filing.accession}/${xbrlFile}`;
    const xml = await fetchTextFn(xbrlUrl);
    if (!xml || xml.length === 0) {
      console.log('[Segments] Empty XBRL document');
      return empty;
    }
    console.log('[Segments] XBRL document size: ' + xml.length + ' chars');

    // 5. Extract segment revenue
    const result = extractSegmentRevenue(xml, fyEndDate);
    console.log('[Segments] Extracted ' + result.segments.length + ' segments (' + result.segmentType + ')');
    return result;
  } catch (e) {
    console.log('[Segments] Error: ' + e.message);
    return empty;
  }
}
