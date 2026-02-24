/**
 * Orchestrates data extraction, LLM research, and Google Doc generation.
 */

// ── Styling constants ─────────────────────────────────────────────────
var DOCUSIGN_PURPLE = '#1B0B3B';
var DOCUSIGN_GREEN  = '#00B388';
var HEADER_BG            = '#1B0B3B';
var HEADER_FG            = '#FFFFFF';
var TABLE_ALT_BG         = '#F5F3F7';
var DOCUSIGN_TODAY_BG    = '#00695C';  // dark teal — contrasts with purple header
var DOCUSIGN_TODAY_FG    = '#FFFFFF';

// ── Chart / quadrant constants ────────────────────────────────────────
var QUADRANT_COLORS = {
  'Negotiated':     '#1B0B3B',  // Docusign purple
  'Non-negotiated': '#00B388',  // Docusign green
  'Form-based':     '#4A90D9',  // Blue
  'Regulatory':     '#F5A623'   // Orange
};

var CONTRACT_TYPE_COLORS = {
  'Negotiated':     { bg: '#E8E0F0', fg: '#1B0B3B' },
  'Non-negotiated': { bg: '#E0F5EF', fg: '#00875A' },
  'Form-based':     { bg: '#E0EDF7', fg: '#2D6CB4' },
  'Regulatory':     { bg: '#FEF3E0', fg: '#C77D00' }
};

/**
 * Extract a plain string from a value that may be a string, object, or nested structure.
 * LLMs sometimes return { name: "..." } or { agreementType: "..." } instead of a bare string.
 * @param {*} val  The value to extract a string from
 * @returns {string}
 */
function extractString(val) {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && val !== null) {
    // Try common property names the LLM might nest under
    var candidate = val.name || val.agreementType || val.type || val.label || val.title || val.value || '';
    if (typeof candidate === 'string') return candidate;
    if (typeof candidate === 'object' && candidate !== null) {
      return candidate.name || candidate.agreementType || candidate.type || candidate.label || '';
    }
    return '';
  }
  return String(val);
}

/**
 * Normalize a contract type string to one of the canonical values.
 * Handles casing variations and missing/malformed values from LLM output.
 * @param {string} raw  Raw contract type from LLM
 * @returns {string} One of 'Negotiated', 'Non-negotiated', 'Form-based', 'Regulatory'
 */
function normalizeContractType(raw) {
  if (!raw || typeof raw !== 'string') return 'Negotiated';
  var lower = raw.toLowerCase().replace(/[\s_-]+/g, '');
  if (lower.indexOf('regulat') >= 0) return 'Regulatory';
  if (lower.indexOf('form') >= 0) return 'Form-based';
  if (lower.indexOf('non') >= 0) return 'Non-negotiated';
  return 'Negotiated';
}

/**
 * Compute quadrant label from volume and complexity (both 1-10, baseline 5).
 * @param {number} volume
 * @param {number} complexity
 * @returns {string}
 */
function getQuadrant(volume, complexity) {
  var v = Math.max(1, Math.min(10, Number(volume) || 5));
  var c = Math.max(1, Math.min(10, Number(complexity) || 5));
  if (v >= 5 && c >= 5) return 'High Volume / High Complexity';
  if (v >= 5 && c < 5)  return 'High Volume / Low Complexity';
  if (v < 5 && c >= 5)  return 'Low Volume / High Complexity';
  return 'Low Volume / Low Complexity';
}

function getQuadrantAbbrev(volume, complexity) {
  var v = Math.max(1, Math.min(10, Number(volume) || 5));
  var c = Math.max(1, Math.min(10, Number(complexity) || 5));
  if (v >= 5 && c >= 5) return 'HV/HC';
  if (v >= 5 && c < 5)  return 'HV/LC';
  if (v < 5 && c >= 5)  return 'LV/HC';
  return 'LV/LC';
}


// ═══════════════════════════════════════════════════════════════════════
// Temp Sheet Helpers (for chart generation)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Create a temporary Google Sheet for chart generation.
 * @param {string} name  Sheet title
 * @returns {Spreadsheet}
 */
function createTempSheet(name) {
  var ss = SpreadsheetApp.create('_tmp_chart_' + name + '_' + Date.now());
  Logger.log('[Chart] Created temp sheet: ' + ss.getId());
  return ss;
}

/**
 * Delete a temporary Google Sheet.
 * @param {Spreadsheet} ss
 */
function cleanupTempSheet(ss) {
  if (!ss) return;
  try {
    DriveApp.getFileById(ss.getId()).setTrashed(true);
    Logger.log('[Chart] Cleaned up temp sheet: ' + ss.getId());
  } catch (e) {
    Logger.log('[Chart] Failed to cleanup temp sheet: ' + e.message);
  }
}


// ═══════════════════════════════════════════════════════════════════════
// Chart Builders
// ═══════════════════════════════════════════════════════════════════════

/**
 * Build a tree-ordered list from flat nodes array (parent-first traversal).
 * Returns array of { name, level, agreementIntensity, depth } sorted for display.
 */
function buildHierarchyTree(nodes) {
  // Index children by parent name
  var childrenOf = {};
  var roots = [];
  nodes.forEach(function(n) {
    var parent = (n.parent || '').trim();
    if (!parent) {
      roots.push(n);
    } else {
      if (!childrenOf[parent]) childrenOf[parent] = [];
      childrenOf[parent].push(n);
    }
  });

  // Walk tree depth-first
  var result = [];
  function walk(node, depth) {
    result.push({
      name: node.name || '',
      level: node.level || '',
      agreementIntensity: node.agreementIntensity || '',
      depth: depth
    });
    var kids = childrenOf[node.name || ''] || [];
    kids.forEach(function(kid) { walk(kid, depth + 1); });
  }
  roots.forEach(function(r) { walk(r, 0); });

  // Append any orphans not reached by traversal
  var visited = {};
  result.forEach(function(r) { visited[r.name] = true; });
  nodes.forEach(function(n) {
    if (!visited[n.name || '']) {
      result.push({ name: n.name || '', level: n.level || '', agreementIntensity: n.agreementIntensity || '', depth: 1 });
    }
  });

  return result;
}

/**
 * Parse a money string like "$1.2 million", "$500,000", "$3.5 billion" into a number.
 * Returns 0 if the value can't be parsed.
 * @param {string|number} val
 * @returns {number}
 */
function parseMoneyValue(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  var s = String(val).replace(/[$,]/g, '').trim().toLowerCase();
  var match = s.match(/^([\d.]+)\s*(billion|million|thousand|[bmk])?/);
  if (!match) return 0;
  var num = parseFloat(match[1]);
  if (isNaN(num)) return 0;
  var unit = match[2] || '';
  if (unit === 'billion' || unit === 'b') return num * 1e9;
  if (unit === 'million' || unit === 'm') return num * 1e6;
  if (unit === 'thousand' || unit === 'k') return num * 1e3;
  return num;
}

/**
 * Create a horizontal bar chart PNG blob from commerce by department data.
 * @param {Array} departments  Array of { department, estimatedAnnualValue }
 * @returns {Blob|null} PNG blob or null on failure
 */
function createBarChart(departments) {
  if (!departments || departments.length === 0) return null;
  var ss = null;
  try {
    ss = createTempSheet('barchart');
    var sheet = ss.getActiveSheet();

    sheet.getRange(1, 1, 1, 2).setValues([['Department', 'Estimated Annual Value']]);
    var rows = [];
    for (var i = 0; i < departments.length; i++) {
      var d = departments[i];
      var numVal = parseMoneyValue(d.estimatedAnnualValue);
      rows.push([d.department || 'Unknown', numVal]);
    }
    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, 2).setValues(rows);
    }

    var chart = sheet.newChart()
      .setChartType(Charts.ChartType.BAR)
      .addRange(sheet.getRange(1, 1, rows.length + 1, 2))
      .setOption('title', 'Contract Commerce by Department')
      .setOption('backgroundColor', '#FFFFFF')
      .setOption('legend', { position: 'none' })
      .setOption('colors', [DOCUSIGN_PURPLE])
      .setOption('width', 700)
      .setOption('height', 400)
      .setPosition(1, 4, 0, 0)
      .build();

    sheet.insertChart(chart);
    SpreadsheetApp.flush();
    Utilities.sleep(2000);

    var charts = sheet.getCharts();
    if (charts.length > 0) {
      var blob = charts[0].getBlob();
      Logger.log('[Chart] Bar chart blob created: ' + blob.getBytes().length + ' bytes');
      return blob;
    }
    return null;
  } catch (e) {
    Logger.log('[Chart] Bar chart failed: ' + e.message);
    return null;
  } finally {
    cleanupTempSheet(ss);
  }
}


// ═══════════════════════════════════════════════════════════════════════
// QuickChart Quadrant Chart
// ═══════════════════════════════════════════════════════════════════════

/**
 * Shorten an agreement type name for chart bubble labels.
 * Extracts parenthetical abbreviation if present, otherwise uses first 2-3 words.
 * @param {string} name  Full agreement type name
 * @returns {string} Short label
 */
function abbreviateAgreementType(name) {
  if (!name) return '';
  // Extract a string from objects (LLM sometimes returns {name:..} or {agreementType:..})
  if (typeof name === 'object' && name !== null) {
    name = name.name || name.agreementType || name.type || name.label || '';
    if (typeof name === 'object') name = '';  // nested object safety
  }
  if (typeof name !== 'string') name = '';
  if (!name) return '';
  // Extract abbreviation in parentheses, e.g. "Non-Disclosure Agreement (NDA)" → "NDA"
  var parenMatch = name.match(/\(([A-Z][A-Za-z\/&]{1,8})\)/);
  if (parenMatch) return parenMatch[1];
  // Take up to 4 words, allow two lines via \n for readability
  var words = name.split(/\s+/);
  var short = words.slice(0, 4).join(' ');
  if (short.length > 24) short = short.substring(0, 22) + '..';
  // Wrap to two lines at the nearest space around the midpoint
  if (short.length > 12) {
    var mid = Math.floor(short.length / 2);
    var spaceAfter = short.indexOf(' ', mid);
    var spaceBefore = short.lastIndexOf(' ', mid);
    var breakAt = (spaceAfter >= 0 && (spaceAfter - mid) <= (mid - spaceBefore || 999))
      ? spaceAfter : spaceBefore;
    if (breakAt > 0) {
      short = short.substring(0, breakAt) + '\n' + short.substring(breakAt + 1);
    }
  }
  return short;
}

/**
 * Build a Chart.js config for a quadrant chart using box annotations (rectangles).
 * Limits to top 10 agreements by combined volume+complexity score.
 * Colors match CONTRACT_TYPE_COLORS used in the Agreement Details table.
 * @param {Array} agreements  Array of agreement objects
 * @returns {Object} Chart.js configuration
 */
function buildQuadrantChartConfig(agreements) {
  var contractTypes = ['Negotiated', 'Non-negotiated', 'Form-based', 'Regulatory'];

  // Select top 10 agreements by volume + complexity
  var sorted = agreements.slice().sort(function(a, b) {
    return ((Number(b.volume) || 0) + (Number(b.complexity) || 0)) -
           ((Number(a.volume) || 0) + (Number(a.complexity) || 0));
  });
  var top = sorted.slice(0, 10);

  // Box dimensions in axis units (half-width / half-height)
  var boxW = 1.1;
  var boxH = 0.55;

  // Start with quadrant divider lines
  var annotations = [
    {
      type: 'line', mode: 'horizontal', scaleID: 'y-axis-0',
      value: 5.5, borderColor: 'rgba(0,0,0,0.25)', borderWidth: 2,
      borderDash: [6, 4], label: { enabled: false }
    },
    {
      type: 'line', mode: 'vertical', scaleID: 'x-axis-0',
      value: 5.5, borderColor: 'rgba(0,0,0,0.25)', borderWidth: 2,
      borderDash: [6, 4], label: { enabled: false }
    }
  ];

  // Resolve overlapping positions by nudging on the y-axis.
  // Build initial positions, then push apart any that collide.
  var placed = [];
  top.forEach(function(a) {
    placed.push({
      x: Number(a.volume) || 5,
      y: Number(a.complexity) || 5,
      ct: normalizeContractType(a.contractType),
      name: extractString(a.agreementType)
    });
  });
  // Greedy nudge: for each box, if it overlaps any earlier box, shift y.
  // Limited to 50 iterations per box to prevent infinite loops.
  var minGapX = boxW * 2 + 0.1;
  var minGapY = boxH * 2 + 0.1;
  for (var i = 1; i < placed.length; i++) {
    var attempts = 0;
    for (var j = 0; j < i && attempts < 50; j++) {
      var dx = Math.abs(placed[i].x - placed[j].x);
      var dy = Math.abs(placed[i].y - placed[j].y);
      if (dx < minGapX && dy < minGapY) {
        attempts++;
        var shift = minGapY - dy + 0.05;
        placed[i].y += (placed[i].y >= placed[j].y) ? shift : -shift;
        placed[i].y = Math.max(0.5, Math.min(10.5, placed[i].y));
        j = -1; // restart inner loop
      }
    }
  }

  // Build box annotations + scatter points from nudged positions
  var dataByType = {};
  placed.forEach(function(p) {
    var colors = CONTRACT_TYPE_COLORS[p.ct] || CONTRACT_TYPE_COLORS['Negotiated'];

    // Box annotation (colored rectangle)
    annotations.push({
      type: 'box',
      xScaleID: 'x-axis-0',
      yScaleID: 'y-axis-0',
      xMin: p.x - boxW,
      xMax: p.x + boxW,
      yMin: p.y - boxH,
      yMax: p.y + boxH,
      backgroundColor: colors.bg,
      borderColor: colors.fg,
      borderWidth: 1.5
    });

    // Scatter point for datalabels text
    if (!dataByType[p.ct]) dataByType[p.ct] = [];
    dataByType[p.ct].push({
      x: p.x,
      y: p.y,
      label: abbreviateAgreementType(p.name)
    });
  });

  // One dataset per contract type: invisible points that carry datalabels
  var presentTypes = {};
  top.forEach(function(a) { presentTypes[normalizeContractType(a.contractType)] = true; });
  var datasets = contractTypes.filter(function(ct) {
    return presentTypes[ct];
  }).map(function(ct) {
    var colors = CONTRACT_TYPE_COLORS[ct];
    return {
      label: ct,
      data: dataByType[ct] || [],
      backgroundColor: colors.bg,
      borderColor: colors.fg,
      borderWidth: 2,
      pointStyle: 'rect',
      pointRadius: 0,
      datalabels: {
        display: true,
        color: colors.fg,
        font: { size: 11, weight: 'bold' },
        anchor: 'center',
        align: 'center',
        formatter: '__FORMATTER_PLACEHOLDER__'
      }
    };
  });

  return {
    type: 'scatter',
    data: { datasets: datasets },
    options: {
      animation: false,
      layout: { padding: { top: 10, right: 20, bottom: 10, left: 10 } },
      scales: {
        xAxes: [{
          id: 'x-axis-0',
          scaleLabel: { display: true, labelString: 'Agreement Volume', fontSize: 13, fontStyle: 'bold' },
          ticks: { min: 0, max: 11, stepSize: 1 },
          gridLines: { color: 'rgba(0,0,0,0.08)' }
        }],
        yAxes: [{
          id: 'y-axis-0',
          scaleLabel: { display: true, labelString: 'Agreement Complexity', fontSize: 13, fontStyle: 'bold' },
          ticks: { min: 0, max: 11, stepSize: 1 },
          gridLines: { color: 'rgba(0,0,0,0.08)' }
        }]
      },
      legend: {
        position: 'bottom',
        labels: { fontSize: 11, padding: 15, usePointStyle: true, boxWidth: 12 }
      },
      plugins: { datalabels: { display: false } },
      annotation: { annotations: annotations }
    }
  };
}

/**
 * Create a quadrant chart PNG via QuickChart.io using box annotations.
 * @param {Array} agreements  Array of agreement objects
 * @returns {Blob|null} PNG blob or null on failure
 */
function createQuadrantChart(agreements) {
  if (!agreements || agreements.length === 0) return null;
  try {
    var config = buildQuadrantChartConfig(agreements);
    // Config must be sent as a string so QuickChart can evaluate the JS formatter function
    var chartStr = JSON.stringify(config).replace(
      /"__FORMATTER_PLACEHOLDER__"/g,
      'function(value, context) { return context.dataset.data[context.dataIndex].label; }'
    );
    var payload = JSON.stringify({
      chart: chartStr,
      width: 1000,
      height: 500,
      devicePixelRatio: 2,
      format: 'png',
      backgroundColor: '#FFFFFF'
    });
    var response = UrlFetchApp.fetch('https://quickchart.io/chart', {
      method: 'post',
      contentType: 'application/json',
      payload: payload,
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) {
      Logger.log('[Chart] QuickChart returned HTTP ' + response.getResponseCode() +
        ': ' + response.getContentText().substring(0, 200));
      return null;
    }
    var blob = response.getBlob().setName('agreement_quadrant.png');
    Logger.log('[Chart] Quadrant chart blob created: ' + blob.getBytes().length + ' bytes');
    return blob;
  } catch (e) {
    Logger.log('[Chart] Quadrant chart failed: ' + e.message);
    return null;
  }
}


// ═══════════════════════════════════════════════════════════════════════
// Main Orchestrator
// ═══════════════════════════════════════════════════════════════════════

/**
 * Main entry point: generate a growth strategy doc for one company.
 * @param {string} companyName
 * @returns {string} URL of the created Google Doc
 */
function generateGrowthStrategyDoc(companyName) {
  Logger.log('Starting growth strategy generation for: ' + companyName);

  // ── Step 1: Extract internal data and run signal matching ─────────
  Logger.log('Extracting sheet data...');
  var data = getCompanyData(companyName);
  var productSignals = generateProductSignals(data);
  var internalSummary = summarizeForLLM(data, productSignals);
  Logger.log('[DocGen] Internal data extracted. Industry: ' + data.context.industry +
    ' | Plan: ' + data.contract.plan + ' | Envelopes: ' + data.consumption.envelopesSent + '/' + data.consumption.envelopesPurchased);

  // ── Step 1.5: Enrich with public API data (SEC, Wikipedia, Wikidata) ──
  Logger.log('[DocGen] === DATA ENRICHMENT ===');
  var enrichment = {};
  try {
    enrichment = enrichCompanyData(data.identity.name, data.context.industry);
    var enrichedFields = Object.keys(enrichment).filter(function(k) {
      return k.charAt(0) !== '_' && enrichment[k] != null;
    });
    Logger.log('[DocGen] Enrichment succeeded. Fields: ' + enrichedFields.join(', '));
  } catch (e) {
    Logger.log('[DocGen] Enrichment failed (continuing without): ' + e.message);
    enrichment = {};
  }

  // ── Step 2: Run 7 LLM research calls ──────────────────────────────
  // Call 1 (sequential) → Calls 2+3+4 (parallel) → Call 5 (sequential) → Calls 6+7 (parallel)

  // Call 1: Account Profile (with enrichment anchoring)
  Logger.log('[DocGen] === LLM CALL 1/7: Account Profile ===');
  var accountProfile;
  try {
    accountProfile = researchAccountProfile(data.identity.name, data.context.industry, enrichment);
    Logger.log('[DocGen] Call 1 succeeded. Keys: ' + (accountProfile ? Object.keys(accountProfile).join(', ') : 'null'));
  } catch (e) {
    Logger.log('[DocGen] Call 1 FAILED: ' + e.message);
    accountProfile = {};
  }

  // Post-LLM enforcement: overwrite any values the LLM got wrong
  try {
    accountProfile = enforceEnrichedData(accountProfile, enrichment);
  } catch (e) {
    Logger.log('[DocGen] Enrichment enforcement failed (non-fatal): ' + e.message);
  }

  // Calls 2+3+4: Business Map, Agreement Landscape, Contract Commerce (PARALLEL)
  Logger.log('[DocGen] === LLM CALLS 2+3+4/7: Business Map + Agreement Landscape + Contract Commerce (parallel) ===');
  var businessMap = {};
  var agreementLandscape = {};
  var contractCommerce = {};

  try {
    var req2 = buildCall2Request(data.identity.name, data.context.industry, accountProfile);
    var req3 = buildCall3Request(data.identity.name, data.context.industry, accountProfile);
    var req4 = buildCall4Request(data.identity.name, data.context.industry, accountProfile);

    var parallelResults = callLLMJsonParallel([req2, req3, req4]);

    // Process results — retry individually on failure
    if (parallelResults[0]) {
      businessMap = parallelResults[0];
      Logger.log('[DocGen] Call 2 (parallel) succeeded. Nodes: ' + (businessMap.nodes ? businessMap.nodes.length : 0));
    } else {
      Logger.log('[DocGen] Call 2 (parallel) failed. Retrying individually...');
      try {
        businessMap = researchBusinessMap(data.identity.name, data.context.industry, accountProfile);
        Logger.log('[DocGen] Call 2 retry succeeded. Nodes: ' + (businessMap.nodes ? businessMap.nodes.length : 0));
      } catch (e2) {
        Logger.log('[DocGen] Call 2 retry FAILED: ' + e2.message);
        businessMap = {};
      }
    }

    if (parallelResults[1]) {
      agreementLandscape = parallelResults[1];
      Logger.log('[DocGen] Call 3 (parallel) succeeded. Agreements: ' + (agreementLandscape.agreements ? agreementLandscape.agreements.length : 0));
    } else {
      Logger.log('[DocGen] Call 3 (parallel) failed. Retrying individually...');
      try {
        agreementLandscape = researchAgreementLandscape(data.identity.name, data.context.industry, accountProfile, businessMap);
        Logger.log('[DocGen] Call 3 retry succeeded. Agreements: ' + (agreementLandscape.agreements ? agreementLandscape.agreements.length : 0));
      } catch (e3) {
        Logger.log('[DocGen] Call 3 retry FAILED: ' + e3.message);
        agreementLandscape = {};
      }
    }

    if (parallelResults[2]) {
      contractCommerce = parallelResults[2];
      Logger.log('[DocGen] Call 4 (parallel) succeeded. Keys: ' + Object.keys(contractCommerce).join(', '));
    } else {
      Logger.log('[DocGen] Call 4 (parallel) failed. Retrying individually...');
      try {
        contractCommerce = researchContractCommerce(data.identity.name, data.context.industry, accountProfile, agreementLandscape);
        Logger.log('[DocGen] Call 4 retry succeeded. Keys: ' + Object.keys(contractCommerce).join(', '));
      } catch (e4) {
        Logger.log('[DocGen] Call 4 retry FAILED: ' + e4.message);
        contractCommerce = {};
      }
    }
  } catch (e) {
    Logger.log('[DocGen] Parallel calls 2+3+4 FAILED: ' + e.message + '. Falling back to sequential...');
    try {
      businessMap = researchBusinessMap(data.identity.name, data.context.industry, accountProfile);
    } catch (e2) { Logger.log('[DocGen] Call 2 fallback FAILED: ' + e2.message); businessMap = {}; }
    try {
      agreementLandscape = researchAgreementLandscape(data.identity.name, data.context.industry, accountProfile, businessMap);
    } catch (e3) { Logger.log('[DocGen] Call 3 fallback FAILED: ' + e3.message); agreementLandscape = {}; }
    try {
      contractCommerce = researchContractCommerce(data.identity.name, data.context.industry, accountProfile, agreementLandscape);
    } catch (e4) { Logger.log('[DocGen] Call 4 fallback FAILED: ' + e4.message); contractCommerce = {}; }
  }

  // If Call 3 returned empty or failed, use deterministic fallback
  if (!agreementLandscape || !agreementLandscape.agreements || agreementLandscape.agreements.length === 0) {
    Logger.log('[DocGen] Call 3 produced no agreements. Using deterministic fallback...');
    agreementLandscape = generateFallbackAgreementLandscape(data, accountProfile, businessMap);
    Logger.log('[DocGen] Fallback generated ' + agreementLandscape.agreements.length + ' agreements');
  }

  // Call 5: Priority Map
  Logger.log('[DocGen] === LLM CALL 5/7: Priority Map ===');
  var externalResearch = {
    accountProfile: accountProfile,
    businessMap: businessMap,
    agreementLandscape: agreementLandscape,
    contractCommerce: contractCommerce
  };
  var priorityMap;
  try {
    priorityMap = synthesizePriorityMap(data.identity.name, internalSummary, externalResearch, productSignals);
    Logger.log('[DocGen] Call 5 succeeded. Priorities: ' +
      (priorityMap && priorityMap.priorityMapping ? priorityMap.priorityMapping.length : 0));
  } catch (e) {
    Logger.log('[DocGen] Call 5 FAILED: ' + e.message);
    priorityMap = {};
  }

  // Calls 6+7: Executive Briefing + Big Bet Initiatives (PARALLEL)
  Logger.log('[DocGen] === LLM CALLS 6+7/7: Executive Briefing + Big Bet Initiatives (parallel) ===');
  var briefing = {};
  var bigBets = {};

  try {
    var req6 = buildCall6Request(data.identity.name, accountProfile, priorityMap, productSignals);
    var req7 = buildCall7Request(data.identity.name, accountProfile, priorityMap, productSignals, agreementLandscape, internalSummary);

    var parallelResults67 = callLLMJsonParallel([req6, req7]);

    if (parallelResults67[0]) {
      briefing = parallelResults67[0];
      Logger.log('[DocGen] Call 6 (parallel) succeeded. Priorities: ' + (briefing.priorities ? briefing.priorities.length : 0));
    } else {
      Logger.log('[DocGen] Call 6 (parallel) failed. Retrying individually...');
      try {
        briefing = generateExecutiveBriefing(data.identity.name, accountProfile, priorityMap, productSignals);
        Logger.log('[DocGen] Call 6 retry succeeded. Priorities: ' + (briefing.priorities ? briefing.priorities.length : 0));
      } catch (e6) {
        Logger.log('[DocGen] Call 6 retry FAILED: ' + e6.message);
        briefing = {};
      }
    }

    if (parallelResults67[1]) {
      bigBets = parallelResults67[1];
      Logger.log('[DocGen] Call 7 (parallel) succeeded. Big Bets: ' + (bigBets.bigBets ? bigBets.bigBets.length : 0));
    } else {
      Logger.log('[DocGen] Call 7 (parallel) failed. Retrying individually...');
      try {
        bigBets = generateBigBetInitiatives(data.identity.name, accountProfile, priorityMap, productSignals, agreementLandscape, internalSummary);
        Logger.log('[DocGen] Call 7 retry succeeded. Big Bets: ' + (bigBets.bigBets ? bigBets.bigBets.length : 0));
      } catch (e7) {
        Logger.log('[DocGen] Call 7 retry FAILED: ' + e7.message);
        bigBets = {};
      }
    }
  } catch (e) {
    Logger.log('[DocGen] Parallel calls 6+7 FAILED: ' + e.message + '. Falling back to sequential...');
    try {
      briefing = generateExecutiveBriefing(data.identity.name, accountProfile, priorityMap, productSignals);
    } catch (e6) { Logger.log('[DocGen] Call 6 fallback FAILED: ' + e6.message); briefing = {}; }
    try {
      bigBets = generateBigBetInitiatives(data.identity.name, accountProfile, priorityMap, productSignals, agreementLandscape, internalSummary);
    } catch (e7) { Logger.log('[DocGen] Call 7 fallback FAILED: ' + e7.message); bigBets = {}; }
  }

  // ── Step 3: Create the Google Doc ─────────────────────────────────
  Logger.log('[DocGen] Creating Google Doc...');
  var docTitle = data.identity.name + ' | Growth Strategy';
  var doc = DocumentApp.create(docTitle);

  // Move to configured folder
  try {
    var folderId = getOutputFolder();
    var file = DriveApp.getFileById(doc.getId());
    DriveApp.getFolderById(folderId).addFile(file);
    DriveApp.getRootFolder().removeFile(file);
  } catch (e) {
    Logger.log('Could not move to output folder: ' + e.message + '. Doc stays in root.');
  }

  var body = doc.getBody();
  body.setMarginTop(36);
  body.setMarginBottom(36);
  body.setMarginLeft(48);
  body.setMarginRight(48);

  // ── Build 11 sections ─────────────────────────────────────────────
  // Order: executive briefing first, big bets, then analysis & recommendations, then supporting detail.

  Logger.log('[DocGen] Building Section 0/10: Executive Meeting Briefing');
  addExecutiveBriefingSection(body, data, briefing);
  if (briefing && briefing.priorities) {
    body.appendPageBreak();
  }

  Logger.log('[DocGen] Building Section 1/10: Big Bet Initiatives');
  addBigBetInitiativesSection(body, data, bigBets);
  if (bigBets && bigBets.bigBets && bigBets.bigBets.length > 0) {
    body.appendPageBreak();
  }

  Logger.log('[DocGen] Building Section 2/10: Company Profile');
  addCompanyProfileSection(body, data, accountProfile, enrichment, businessMap);
  body.appendPageBreak();

  Logger.log('[DocGen] Building Section 3/10: Account Health Analysis');
  addAccountHealthSection(body, data);
  body.appendPageBreak();

  Logger.log('[DocGen] Building Section 4/10: Priority Map');
  addPriorityMapSection(body, data, priorityMap, productSignals);
  body.appendPageBreak();

  Logger.log('[DocGen] Building Section 5/10: Docusign Footprint');
  addDocusignTodaySection(body, data, priorityMap);
  body.appendPageBreak();

  Logger.log('[DocGen] Building Section 6/10: Agreement Landscape');
  addAgreementLandscapeSection(body, data, agreementLandscape);
  body.appendPageBreak();

  Logger.log('[DocGen] Building Section 7/10: Contract Commerce Estimate');
  addContractCommerceSection(body, data, contractCommerce);
  body.appendPageBreak();

  Logger.log('[DocGen] Building Section 8/10: Business Performance & Strategy');
  addBusinessPerformanceSection(body, data, accountProfile);
  body.appendPageBreak();

  Logger.log('[DocGen] Building Section 9/10: Executive Contacts & Technology');
  addExecutivesAndTechSection(body, data, accountProfile);

  body.appendPageBreak();
  Logger.log('[DocGen] Building appendix: Data Sources & Methodology');
  addDataSourcesSection(body, enrichment);

  Logger.log('[DocGen] Saving and closing doc...');
  doc.saveAndClose();

  var docUrl = doc.getUrl();
  Logger.log('[DocGen] COMPLETE. Doc URL: ' + docUrl);
  return docUrl;
}


// ═══════════════════════════════════════════════════════════════════════
// Rich Text Helper
// ═══════════════════════════════════════════════════════════════════════

/**
 * Append a paragraph with inline **bold** and *italic* markdown formatting
 * rendered as Google Doc rich text.
 * @param {Body} body  Google Doc body
 * @param {string} text  Text with markdown-style markers
 * @returns {Paragraph} the appended paragraph
 */
function appendRichText(body, text) {
  if (!text) return body.appendParagraph('');

  // Parse segments: split on **...**  and *...*  markers
  // Regex captures: group 1 = bold content, group 2 = italic content, group 3 = plain text
  var segments = [];
  var regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)/g;
  var lastIndex = 0;
  var match;

  while ((match = regex.exec(text)) !== null) {
    // Push any plain text before this match
    if (match.index > lastIndex) {
      segments.push({ text: text.substring(lastIndex, match.index), style: 'plain' });
    }
    if (match[2]) {
      // Bold match (group 2 is the content inside **)
      segments.push({ text: match[2], style: 'bold' });
    } else if (match[4]) {
      // Italic match (group 4 is the content inside *)
      segments.push({ text: match[4], style: 'italic' });
    }
    lastIndex = regex.lastIndex;
  }
  // Push remaining plain text
  if (lastIndex < text.length) {
    segments.push({ text: text.substring(lastIndex), style: 'plain' });
  }

  // Build the paragraph with all text first, then apply ranges
  var fullText = segments.map(function(s) { return s.text; }).join('');
  var para = body.appendParagraph(fullText);
  para.setHeading(DocumentApp.ParagraphHeading.NORMAL);
  para.editAsText().setFontSize(11);
  para.editAsText().setBold(false);
  para.editAsText().setItalic(false);
  para.editAsText().setForegroundColor('#333333');
  para.setLineSpacing(1.15);
  para.setSpacingAfter(6);

  // Apply bold/italic formatting to specific ranges
  var offset = 0;
  var textEl = para.editAsText();
  segments.forEach(function(seg) {
    if (seg.text.length > 0) {
      if (seg.style === 'bold') {
        textEl.setBold(offset, offset + seg.text.length - 1, true);
      } else if (seg.style === 'italic') {
        textEl.setItalic(offset, offset + seg.text.length - 1, true);
      }
      offset += seg.text.length;
    }
  });

  return para;
}


// ═══════════════════════════════════════════════════════════════════════
// Section Builders
// ═══════════════════════════════════════════════════════════════════════

/**
 * Section 0: Executive Meeting Briefing
 */
function addExecutiveBriefingSection(body, data, briefing) {
  if (!briefing || !briefing.priorities) return;

  addSectionHeading(body, data.identity.name + ': Executive Meeting Briefing');
  addSectionDescription(body, 'Sources: AI-synthesized narrative focused on the customer\'s strategic priorities, business challenges, and market context. No independently verified data in this section; content reflects LLM interpretation. Treat as a conversation starter, not a factual reference.');

  // Intro paragraph with rich text
  if (briefing.introText) {
    appendRichText(body, briefing.introText);
    addSpacer(body);
  }

  // Numbered priorities
  var priorities = briefing.priorities || [];
  priorities.forEach(function(p, idx) {
    // Priority title as bold subheading-style line
    var titleText = (idx + 1) + '. ' + (p.title || 'Priority ' + (idx + 1));
    var titlePara = body.appendParagraph(titleText);
    titlePara.setHeading(DocumentApp.ParagraphHeading.NORMAL);
    titlePara.editAsText().setFontSize(12);
    titlePara.editAsText().setBold(true);
    titlePara.editAsText().setForegroundColor(DOCUSIGN_PURPLE);
    titlePara.setSpacingBefore(8);
    titlePara.setSpacingAfter(2);

    // Body paragraph with inline formatting
    if (p.body) {
      appendRichText(body, p.body);
    }
  });
}

/**
 * Section 1: Big Bet Initiatives — 3 quantified, high-impact IAM transformation projects.
 */
function addBigBetInitiativesSection(body, data, bigBets) {
  if (!bigBets || !bigBets.bigBets || bigBets.bigBets.length === 0) return;

  addSectionHeading(body, 'Big Bet Initiatives');
  addSectionDescription(body, 'Sources: AI-generated strategic analysis combining SEC EDGAR financials, internal Docusign usage signals, agreement landscape estimates, and strategic initiative research. Dollar figures and ROI projections are LLM estimates grounded in company financials but not independently verified.');

  var bets = bigBets.bigBets;
  bets.forEach(function(bet) {
    // ── Title (H2, Docusign purple) ──────────────────────────────
    var titleText = 'Big Bet #' + (bet.number || '') + ': ' + (bet.title || 'Initiative');
    var titlePara = body.appendParagraph(titleText);
    titlePara.setHeading(DocumentApp.ParagraphHeading.HEADING2);
    titlePara.editAsText().setFontSize(15);
    titlePara.editAsText().setBold(true);
    titlePara.editAsText().setForegroundColor(DOCUSIGN_PURPLE);
    titlePara.setSpacingBefore(12);
    titlePara.setSpacingAfter(4);

    // ── Metadata line (italic) ───────────────────────────────────
    var metaParts = [];
    if (bet.targetBusinessUnit) metaParts.push('Target BU: ' + bet.targetBusinessUnit);
    if (bet.executiveSponsor) metaParts.push('Executive Sponsor: ' + bet.executiveSponsor);
    if (metaParts.length > 0) {
      var metaPara = body.appendParagraph(metaParts.join('  |  '));
      metaPara.setHeading(DocumentApp.ParagraphHeading.NORMAL);
      metaPara.editAsText().setFontSize(10);
      metaPara.editAsText().setItalic(true);
      metaPara.editAsText().setForegroundColor('#666666');
      metaPara.setSpacingAfter(6);
    }

    // ── Why This Big Bet (rationale) ─────────────────────────────
    if (bet.rationale) {
      var rationaleLabel = body.appendParagraph('Why This Big Bet');
      rationaleLabel.setHeading(DocumentApp.ParagraphHeading.NORMAL);
      rationaleLabel.editAsText().setFontSize(11);
      rationaleLabel.editAsText().setBold(true);
      rationaleLabel.editAsText().setForegroundColor('#333333');
      rationaleLabel.setSpacingBefore(4);
      rationaleLabel.setSpacingAfter(2);
      addBodyText(body, bet.rationale);
    }

    // ── Challenge ────────────────────────────────────────────────
    if (bet.painPoint) {
      var challengeLabel = body.appendParagraph('Challenge');
      challengeLabel.setHeading(DocumentApp.ParagraphHeading.NORMAL);
      challengeLabel.editAsText().setFontSize(11);
      challengeLabel.editAsText().setBold(true);
      challengeLabel.editAsText().setForegroundColor('#333333');
      challengeLabel.setSpacingBefore(4);
      challengeLabel.setSpacingAfter(2);
      addBodyText(body, bet.painPoint);
    }

    // ── Docusign IAM Solution ────────────────────────────────────
    var sol = bet.solution || {};
    var solLabel = body.appendParagraph('Docusign IAM Solution');
    solLabel.setHeading(DocumentApp.ParagraphHeading.NORMAL);
    solLabel.editAsText().setFontSize(11);
    solLabel.editAsText().setBold(true);
    solLabel.editAsText().setForegroundColor('#333333');
    solLabel.setSpacingBefore(4);
    solLabel.setSpacingAfter(2);

    if (sol.description) {
      addBodyText(body, sol.description);
    }
    if (sol.primaryProducts && sol.primaryProducts.length > 0) {
      var prodText = 'Products: ' + sol.primaryProducts.join(', ');
      var prodPara = addBodyText(body, prodText);
      prodPara.editAsText().setBold(0, 'Products:'.length, true);
    }
    if (sol.integrations && sol.integrations.length > 0) {
      var intText = 'Integrations: ' + sol.integrations.join(', ');
      var intPara = addBodyText(body, intText);
      intPara.editAsText().setBold(0, 'Integrations:'.length, true);
    }

    addSpacer(body);
  });
}

/**
 * Section 2: Company Profile
 */
function addCompanyProfileSection(body, data, accountProfile, enrichment, businessMap) {
  addSectionHeading(body, 'Company Profile');
  addSectionDescription(body, 'Sources: SEC EDGAR 10-K filings (revenue, employees, segment data), Wikipedia (company overview), Wikidata (CEO, HQ, founding date), and AI research via Bing-grounded web search (business units, customer base, supply chain). Verified data is labeled per sub-table; AI-generated fields are marked accordingly.');

  var ap = accountProfile || {};
  var enr = enrichment || {};

  // Overview paragraph
  if (ap.companyOverview) {
    addBodyText(body, ap.companyOverview);
    if (enr.overview) {
      addSourceNote(body, 'Source: Wikipedia');
    }
  }

  // Business Units table
  var bus = ap.businessUnits || [];
  var bmNodes = (businessMap && businessMap.nodes) || [];

  // Build BU-level intensity lookup from Business Map (keyed by lowercased name)
  var buIntensityMap = {};
  var intensityLabel = { high: '\u25cf High', medium: '\u25cb Medium', low: '\u25cb Low' };
  bmNodes.forEach(function(node) {
    if ((node.level || '').toLowerCase() === 'bu') {
      var key = (node.name || '').toLowerCase();
      var intensityKey = (node.agreementIntensity || '').toLowerCase();
      buIntensityMap[key] = intensityLabel[intensityKey] || node.agreementIntensity || '';
    }
  });

  // Collect known BU names (lowercased) for gap detection
  var knownBuNames = {};
  bus.forEach(function(bu) { knownBuNames[(bu.name || '').toLowerCase()] = true; });

  // Find BU-level nodes in Business Map not represented in the Business Units list
  var extraBus = [];
  bmNodes.forEach(function(node) {
    if ((node.level || '').toLowerCase() === 'bu') {
      var key = (node.name || '').toLowerCase();
      if (!knownBuNames[key]) {
        extraBus.push(node);
      }
    }
  });

  // Combine: known BUs + any extras from Business Map (e.g. Corporate/Shared Services)
  var allBus = bus.slice();
  extraBus.forEach(function(node) { allBus.push({ name: node.name }); });

  if (allBus.length > 0) {
    addSubHeading(body, 'Business Units');
    var buRows = [['Name', 'Offering', 'Target Segment', 'Revenue Model', 'Segment Revenue', 'Customers', 'Agreement Intensity', 'Docusign Today']];
    allBus.forEach(function(bu) {
      var intensityKey = (bu.name || '').toLowerCase();
      buRows.push([
        bu.name || '',
        bu.offering || '',
        bu.targetSegment || '',
        bu.pricingRevenueModel || '',
        bu.segmentRevenue || '',
        bu.customerCount || '',
        buIntensityMap[intensityKey] || '',
        ''
      ]);
    });
    var buTable = addStyledTable(body, buRows);
    var buLastHeaderCell = buTable.getRow(0).getCell(buRows[0].length - 1);
    buLastHeaderCell.setBackgroundColor(DOCUSIGN_TODAY_BG);
    buLastHeaderCell.editAsText().setForegroundColor(DOCUSIGN_TODAY_FG);
    var buSources = ['AI-generated research (Bing-grounded)'];
    if (enr.segments && enr.segments.length > 0 && enr.segmentType !== 'geographic') {
      buSources.push('Segment Revenue from SEC EDGAR 10-K XBRL filing');
    }
    addSourceNote(body, 'Source: ' + buSources.join(' · '));

    // Business Map — rendered as sub-section directly beneath Business Units
    if (bmNodes.length > 0) {
      addSubHeading(body, 'Business Map');
      addSourceNote(body, 'Source: AI-generated organizational hierarchy based on company profile, public disclosures, and industry patterns. Agreement intensity ratings (High/Medium/Low) reflect expected agreement activity, not measured data.');

      var bmTree = buildHierarchyTree(bmNodes);
      var bmRows = [['Business Unit', 'Department', 'Function', 'Agreement Intensity', 'Docusign Today']];
      var currentBU = '';
      var currentDept = '';
      var lastBU = '';
      var lastDept = '';

      bmTree.forEach(function(item) {
        var level = (item.level || '').toLowerCase();
        if (level !== 'bu' && level !== 'department' && level !== 'function') return;

        var intensityKey = (item.agreementIntensity || '').toLowerCase();
        var intensityText = intensityLabel[intensityKey] || item.agreementIntensity || '';
        var buCell = '';
        var deptCell = '';
        var funcCell = '';

        if (level === 'bu') {
          currentBU = item.name;
          currentDept = '';
          buCell = currentBU !== lastBU ? currentBU : '';
          lastBU = currentBU;
          lastDept = '';
        } else if (level === 'department') {
          currentDept = item.name;
          buCell = currentBU !== lastBU ? currentBU : '';
          deptCell = currentDept !== lastDept ? currentDept : '';
          lastBU = currentBU;
          lastDept = currentDept;
        } else if (level === 'function') {
          buCell = currentBU !== lastBU ? currentBU : '';
          deptCell = currentDept !== lastDept ? currentDept : '';
          funcCell = item.name;
          lastBU = currentBU;
          lastDept = currentDept;
        }

        bmRows.push([buCell, deptCell, funcCell, intensityText, '']);
      });

      var bmTable = addStyledTable(body, bmRows);
      var bmLastHeaderCell = bmTable.getRow(0).getCell(bmRows[0].length - 1);
      bmLastHeaderCell.setBackgroundColor(DOCUSIGN_TODAY_BG);
      bmLastHeaderCell.editAsText().setForegroundColor(DOCUSIGN_TODAY_FG);
      var bmLegend = addBodyText(body, '\u25cf High agreement intensity    \u25cb Medium    \u25cb Low');
      bmLegend.editAsText().setFontSize(9);
      bmLegend.editAsText().setBold(false);
      bmLegend.editAsText().setForegroundColor('#666666');
    }
  }

  // Revenue by Geography table (geographic segments only)
  if (enr.segmentType === 'geographic' && enr.segments && enr.segments.length > 0) {
    addSubHeading(body, 'Revenue by Geography');
    var geoRows = [['Region', 'Revenue']];
    enr.segments.forEach(function(seg) {
      geoRows.push([seg.name || '', formatDollars(seg.revenue)]);
    });
    addStyledTable(body, geoRows);
    var period = enr.filingPeriod ? ' (FY ' + enr.filingPeriod + ')' : '';
    addSourceNote(body, 'Source: SEC EDGAR 10-K' + period + ' \u00b7 Geographic segments');
  }

  // Key Metrics table
  addSubHeading(body, 'Key Metrics');
  var custBase = ap.customerBase || {};
  var empCount = ap.employeeCount || {};
  var supply = ap.supplyChain || {};
  var fin = ap.financials || {};

  var metricsRows = [
    ['Metric', 'Value', 'Context'],
    ['Customer Base', custBase.total || 'N/A', custBase.context || ''],
    ['Employees', empCount.total || 'N/A', empCount.context || ''],
    ['Supply Chain', (supply.majorCategories || []).join(', ') || 'N/A', supply.context || '']
  ];
  addStyledTable(body, metricsRows);
  var metricSources = [];
  if (enr.employeesFormatted) metricSources.push('Employee count from SEC EDGAR 10-K');
  if (metricSources.length > 0) {
    addSourceNote(body, 'Source: ' + metricSources.join(' · '));
  }

  // Financial metrics table with definitions and insight
  var filingPeriod = enr.filingPeriod || '';
  var finLabel = filingPeriod ? 'Financial Metrics (FY ' + filingPeriod + ')' : 'Financial Metrics';
  addSubHeading(body, finLabel);
  var METRIC_DEFS = {
    revenue:   'Total income from all business activities',
    cogs:      'Direct costs of goods/services sold',
    opex:      'Day-to-day operating costs',
    capex:     'Investments in property & equipment',
    netIncome: 'Profit after all expenses and taxes'
  };
  var finRows = [
    ['Metric', 'Value', 'Definition', 'Insight'],
    ['Revenue',    fin.revenue   || 'N/A', METRIC_DEFS.revenue,   fin.context || ''],
    ['COGS',       fin.cogs      || 'N/A', METRIC_DEFS.cogs,      ''],
    ['OpEx',       fin.opex      || 'N/A', METRIC_DEFS.opex,      ''],
    ['CapEx',      fin.capex     || 'N/A', METRIC_DEFS.capex,     ''],
    ['Net Income', fin.netIncome || 'N/A', METRIC_DEFS.netIncome, '']
  ];
  addStyledTable(body, finRows);
  if (enr.revenueFormatted) {
    addSourceNote(body, 'Source: SEC EDGAR 10-K XBRL filing' + (filingPeriod ? ' (FY ' + filingPeriod + ')' : ''));
  }
}

/**
 * Section 2: Business Performance & Strategy
 */
function addBusinessPerformanceSection(body, data, accountProfile) {
  addSectionHeading(body, 'Business Performance & Strategy');
  addSectionDescription(body, 'Sources: AI research via Bing-grounded web search. Three-year trends, highlights, strategic initiatives, and SWOT analysis are LLM-generated based on publicly available information. Financial trend claims should be cross-checked against SEC filings in the Company Profile section.');

  var ap = accountProfile || {};
  var perf = ap.businessPerformance || {};
  var swot = ap.swot || {};

  // 3-year trend narrative
  if (perf.threeYearTrend) {
    addSubHeading(body, 'Three-Year Trend');
    addBodyText(body, perf.threeYearTrend);
  }

  // Highlights
  if (perf.highlights && perf.highlights.length > 0) {
    perf.highlights.forEach(function(h) {
      var li = body.appendListItem(h);
      li.setGlyphType(DocumentApp.GlyphType.BULLET);
      li.editAsText().setFontSize(11);
      li.editAsText().setBold(false);
      li.editAsText().setForegroundColor('#333333');
    });
  }

  // Strategic Initiatives
  var initiatives = perf.strategicInitiatives || [];
  if (initiatives.length > 0) {
    addSubHeading(body, 'Strategic Initiatives');
    var initRows = [['Initiative', 'Description', 'Timeframe']];
    initiatives.forEach(function(init) {
      initRows.push([
        init.title || '',
        init.description || '',
        init.timeframe || ''
      ]);
    });
    addStyledTable(body, initRows);
  }

  // SWOT 2x2 table
  var hasSwot = (swot.strengths && swot.strengths.length > 0) ||
                (swot.weaknesses && swot.weaknesses.length > 0) ||
                (swot.opportunities && swot.opportunities.length > 0) ||
                (swot.threats && swot.threats.length > 0);

  if (hasSwot) {
    addSubHeading(body, 'SWOT Analysis');

    var strengthsText = (swot.strengths || []).map(function(s) { return '• ' + s; }).join('\n');
    var weaknessesText = (swot.weaknesses || []).map(function(s) { return '• ' + s; }).join('\n');
    var opportunitiesText = (swot.opportunities || []).map(function(s) { return '• ' + s; }).join('\n');
    var threatsText = (swot.threats || []).map(function(s) { return '• ' + s; }).join('\n');

    var swotTable = body.appendTable([
      ['Strengths', 'Weaknesses'],
      [strengthsText || 'N/A', weaknessesText || 'N/A'],
      ['Opportunities', 'Threats'],
      [opportunitiesText || 'N/A', threatsText || 'N/A']
    ]);
    swotTable.setBorderColor('#CCCCCC');
    swotTable.setBorderWidth(1);

    // Style SWOT header rows (row 0 and row 2)
    [0, 2].forEach(function(rowIdx) {
      var hRow = swotTable.getRow(rowIdx);
      for (var c = 0; c < 2; c++) {
        var cell = hRow.getCell(c);
        cell.setBackgroundColor(HEADER_BG);
        cell.editAsText().setForegroundColor(HEADER_FG);
        cell.editAsText().setBold(true);
        cell.editAsText().setFontSize(11);
        cell.setPaddingTop(6);
        cell.setPaddingBottom(6);
        cell.setPaddingLeft(8);
        cell.setPaddingRight(8);
      }
    });

    // Style SWOT content rows (row 1 and row 3)
    [1, 3].forEach(function(rowIdx) {
      var dRow = swotTable.getRow(rowIdx);
      for (var c = 0; c < 2; c++) {
        var cell = dRow.getCell(c);
        cell.setBackgroundColor('#FFFFFF');
        cell.editAsText().setFontSize(10);
        cell.editAsText().setBold(false);
        cell.editAsText().setForegroundColor('#333333');
        cell.setPaddingTop(8);
        cell.setPaddingBottom(8);
        cell.setPaddingLeft(8);
        cell.setPaddingRight(8);
      }
    });
    addSpacer(body);
  }
}

/**
 * Section 3: Executive Contacts & Technology
 */
function addExecutivesAndTechSection(body, data, accountProfile) {
  addSectionHeading(body, 'Executive Contacts & Technology');
  addSectionDescription(body, 'Sources: AI research via Bing-grounded web search. Executive names, titles, technology stack, and SI partnerships are LLM-identified from public sources. Verify executive contacts and titles before outreach as these may be outdated.');

  var ap = accountProfile || {};

  // Executive Contacts table
  var execs = ap.executiveContacts || [];
  if (execs.length > 0) {
    addSubHeading(body, 'Key Executive Contacts');
    var execRows = [['Name', 'Title', 'Why Docusign Should Connect']];
    execs.forEach(function(exec) {
      execRows.push([
        exec.name || '',
        exec.title || '',
        exec.relevance || ''
      ]);
    });
    addStyledTable(body, execRows);
  }

  // Technology Stack table
  var tech = ap.technologyStack || {};
  var hasTech = tech.crm || tech.hr || tech.procurement || (tech.other && tech.other.length > 0);
  if (hasTech) {
    addSubHeading(body, 'Technology Stack');
    var techRows = [
      ['Category', 'Platform'],
      ['CRM', tech.crm || 'N/A'],
      ['HR / HCM', tech.hr || 'N/A'],
      ['Procurement', tech.procurement || 'N/A'],
      ['Other', (tech.other || []).join(', ') || 'N/A']
    ];
    addStyledTable(body, techRows);
  }

  // Systems Integrators
  var sis = ap.systemsIntegrators || [];
  if (sis.length > 0) {
    addSubHeading(body, 'Systems Integrators');
    sis.forEach(function(si) {
      var li = body.appendListItem(si);
      li.setGlyphType(DocumentApp.GlyphType.BULLET);
      li.editAsText().setFontSize(11);
      li.editAsText().setBold(false);
      li.editAsText().setForegroundColor('#333333');
    });
  }
}

/**
 * Section 4: Business Map
 */
function addBusinessMapSection(body, data, businessMap) {
  addSectionHeading(body, 'Business Map');
  addSectionDescription(body, 'Sources: AI-generated organizational hierarchy based on company profile, public disclosures, and industry patterns. Business units, departments, and functions are LLM estimates. Agreement intensity ratings (High/Medium/Low) reflect expected agreement activity, not measured data.');

  var nodes = (businessMap && businessMap.nodes) || [];

  if (nodes.length === 0) {
    addBodyText(body, 'Business map data not available.');
    return;
  }

  var tree = buildHierarchyTree(nodes);

  // Intensity tag for display
  var intensityLabel = { high: '\u25cf High', medium: '\u25cb Medium', low: '\u25cb Low' };

  // Build denormalized table: BU | Department | Function | Agreement Intensity
  // Repeated BU/Dept names are left blank for easy scanning.
  var rows = [['Business Unit', 'Department', 'Function', 'Agreement Intensity']];

  var currentBU = '';
  var currentDept = '';
  var lastBU = '';
  var lastDept = '';

  tree.forEach(function(item) {
    var level = (item.level || '').toLowerCase();

    // Skip root / company-level nodes — start with BUs
    if (level !== 'bu' && level !== 'department' && level !== 'function') return;

    var intensityKey = (item.agreementIntensity || '').toLowerCase();
    var intensityText = intensityLabel[intensityKey] || item.agreementIntensity || '';

    var buCell = '';
    var deptCell = '';
    var funcCell = '';

    if (level === 'bu') {
      currentBU = item.name;
      currentDept = '';
      buCell = currentBU !== lastBU ? currentBU : '';
      lastBU = currentBU;
      lastDept = '';
    } else if (level === 'department') {
      currentDept = item.name;
      buCell = currentBU !== lastBU ? currentBU : '';
      deptCell = currentDept !== lastDept ? currentDept : '';
      lastBU = currentBU;
      lastDept = currentDept;
    } else if (level === 'function') {
      buCell = currentBU !== lastBU ? currentBU : '';
      deptCell = currentDept !== lastDept ? currentDept : '';
      funcCell = item.name;
      lastBU = currentBU;
      lastDept = currentDept;
    }

    rows.push([buCell, deptCell, funcCell, intensityText]);
  });

  addStyledTable(body, rows);

  // Legend
  var legend = addBodyText(body, '\u25cf High agreement intensity    \u25cb Medium    \u25cb Low');
  legend.editAsText().setFontSize(9);
  legend.editAsText().setBold(false);
  legend.editAsText().setForegroundColor('#666666');
}

/**
 * Section 5: Docusign Footprint (was Docusign Today — mostly unchanged)
 */
function addDocusignTodaySection(body, data, strategy) {
  addSectionHeading(body, 'Docusign Footprint');
  addSectionDescription(body, 'Sources: Internal Docusign Book of Business (contract terms, consumption metrics, seat usage, integrations). Current use cases are LLM-synthesized from internal product adoption data. All quantitative metrics are verified internal data.');
  addSourceNote(body, 'Source: Docusign Book of Business · All metrics derived from internal account data');

  // ── Current Use Cases (from LLM synthesis) ──────────────────────
  addSubHeading(body, 'Current Use Cases');

  var useCases = (strategy && strategy.currentUseCases) || {};

  var bullets = [];
  bullets.push('Docusign Products: ' + data.activeProducts.join(', '));
  if (useCases.useCases && useCases.useCases.length > 0) {
    bullets.push('Current use cases: ' + useCases.useCases.join(', '));
  }
  if (useCases.techStack) {
    bullets.push('Relevant Tech Stack and integrations: ' + useCases.techStack);
  }
  if (useCases.summary) {
    bullets.push('Summary: ' + useCases.summary);
  }

  bullets.forEach(function(b) {
    var li = body.appendListItem(b);
    li.setGlyphType(DocumentApp.GlyphType.BULLET);
    li.editAsText().setFontSize(11);
      li.editAsText().setBold(false);
      li.editAsText().setForegroundColor('#333333');
  });

  // ── Contract & Account ──────────────────────────────────────────
  addSubHeading(body, 'Contract & Account');

  var contractRows = [
    ['Field', 'Value'],
    ['Docusign Plan',          data.contract.plan || 'N/A'],
    ['Contract Term',          formatDate(data.contract.termStart) + ' - ' + formatDate(data.contract.termEnd)],
    ['Term Completion',        formatPct(data.contract.percentComplete)],
    ['Days Used / Left',       data.contract.daysUsed + ' / ' + data.contract.daysLeft],
    ['Months Left',            String(data.contract.monthsLeft)],
    ['Renewal FYQ',            data.contract.termEndFyq || 'N/A'],
    ['Multi-Year Ramp',        data.contract.isMultiYearRamp ? 'Yes' : 'No'],
    ['Charge Model',           data.contract.chargeModel || 'N/A'],
    ['Sales Channel',          data.context.salesChannel || 'N/A'],
    ['Industry',               data.context.industry || 'N/A'],
    ['Country',                data.context.country || 'N/A'],
    ['ACV',                    '$' + formatNumber(data.financial.acv)],
    ['CMRR',                   data.financial.cmrr || 'N/A'],
    ['Cost per Envelope',      data.financial.costPerEnvelope ? '$' + data.financial.costPerEnvelope.toFixed(3) : 'N/A'],
    ['Cost per Seat',          data.financial.costPerSeat ? '$' + data.financial.costPerSeat.toFixed(2) : 'N/A']
  ];
  addStyledTable(body, contractRows);

  // ── Consumption & Usage ─────────────────────────────────────────
  addSubHeading(body, 'Consumption & Usage');

  var consumptionPct = data.consumption.envelopesPurchased > 0
    ? ((data.consumption.envelopesSent / data.consumption.envelopesPurchased) * 100).toFixed(1) + '%'
    : 'N/A';

  var consumptionRows = [
    ['Metric', 'Value'],
    ['Envelopes Purchased',          formatNumber(data.consumption.envelopesPurchased)],
    ['Envelopes Sent (Total)',       formatNumber(data.consumption.envelopesSent)],
    ['Consumption Pacing',           consumptionPct],
    ['Usage Trend',                  data.consumption.usageTrend || 'N/A'],
    ['Consumption Performance',      formatPct(data.consumption.consumptionPerformance)],
    ['Projected Usage Score',        String(data.consumption.projectedUsageScore || 'N/A')],
    ['Last 30 Days Bucket',          data.consumption.last30dBucket || 'N/A'],
    ['Send Vitality',                String(data.consumption.sendVitality || 'N/A')],
    ['Send Velocity (MoM)',          String(data.consumption.sendVelocityMom || 'N/A')],
    ['Envelope Allowance',           formatNumber(data.consumption.envelopeAllowance)],
    ['Projected Envelopes Sent',     formatNumber(data.consumption.projectedSent)],
    ['Planned Sends',                formatNumber(data.consumption.plannedSends)]
  ];
  addStyledTable(body, consumptionRows);

  // ── Send Velocity ───────────────────────────────────────────────
  addSubHeading(body, 'Send Velocity');

  var velocityRows = [
    ['Time Period', 'Envelopes Sent'],
    ['Last 7 Days',    formatNumber(data.consumption.sent7d)],
    ['Last 30 Days',   formatNumber(data.consumption.sent30d)],
    ['Last 60 Days',   formatNumber(data.consumption.sent60d)],
    ['Last 90 Days',   formatNumber(data.consumption.sent90d)],
    ['Last 365 Days',  formatNumber(data.consumption.sent365d)]
  ];
  addStyledTable(body, velocityRows);

  // ── Transaction Health ──────────────────────────────────────────
  addSubHeading(body, 'Transaction Health');

  var healthRows = [
    ['Metric', 'Value'],
    ['Envelopes Completed',    formatNumber(data.consumption.completed)],
    ['Completion Rate',        formatPct(data.consumption.completedRate)],
    ['Envelopes Declined',     formatNumber(data.consumption.declined)],
    ['% Declined',             formatPct(data.consumption.pctDeclined)],
    ['Envelopes Voided',       formatNumber(data.consumption.voided)],
    ['% Voided',               formatPct(data.consumption.pctVoided)],
    ['Envelopes Expired',      formatNumber(data.consumption.expired)],
    ['% Expired',              formatPct(data.consumption.pctExpired)]
  ];
  addStyledTable(body, healthRows);

  // ── Seats ───────────────────────────────────────────────────────
  addSubHeading(body, 'Seats');

  var seatRows = [
    ['Metric', 'Value'],
    ['Seats Purchased',       data.seats.unlimited ? 'Unlimited' : formatNumber(data.seats.purchased)],
    ['Active Seats',          formatNumber(data.seats.active)],
    ['Admin Seats',           formatNumber(data.seats.admin)],
    ['Sender Seats',          formatNumber(data.seats.sender)],
    ['Viewer Seats',          formatNumber(data.seats.viewer)],
    ['Seat Activation %',     formatPct(data.seats.activationRate)],
    ['Active Seats MoM',      String(data.seats.activeSeatsMom || 'N/A')]
  ];
  addStyledTable(body, seatRows);

  // ── Integrations ────────────────────────────────────────────────
  addSubHeading(body, 'Integrations (' + data.integrations.count + ' detected)');

  var intRows = [
    ['Integration', 'Envelopes'],
    ['Salesforce',        formatNumber(data.integrations.salesforce)],
    ['Workday',           formatNumber(data.integrations.workday)],
    ['SAP',               formatNumber(data.integrations.sap)],
    ['Custom API',        formatNumber(data.integrations.customApi) + (data.integrations.pctCustomApi ? ' (' + formatPct(data.integrations.pctCustomApi) + ')' : '')],
    ['PowerForms',        formatNumber(data.integrations.powerforms)],
    ['Bulk Send',         formatNumber(data.integrations.bulkSend)],
    ['Mobile Signs',      formatNumber(data.integrations.mobileSigns)],
    ['Non-Mobile Signs',  formatNumber(data.integrations.nonMobileSigns)],
    ['Web App Sends (Annual)',     formatNumber(data.integrations.webappSends)],
    ['Automation Sends (Annual)',  formatNumber(data.integrations.automationSends)]
  ];
  addStyledTable(body, intRows);

  // ── Product Adoption ────────────────────────────────────────────
  addSubHeading(body, 'Product Adoption');

  var activeLabel = addBodyText(body, 'Active Products:');
  activeLabel.editAsText().setBold(true);
  activeLabel.editAsText().setFontSize(11);
  if (data.activeProducts.length > 0) {
    data.activeProducts.forEach(function(p) {
      var li = body.appendListItem(p);
      li.setGlyphType(DocumentApp.GlyphType.BULLET);
      li.editAsText().setFontSize(10);
      li.editAsText().setBold(false);
      li.editAsText().setForegroundColor('#333333');
    });
  } else {
    addBodyText(body, 'None');
  }

  addSpacer(body);
  var unusedLabel = addBodyText(body, 'Unused / Available for Expansion:');
  unusedLabel.editAsText().setBold(true);
  unusedLabel.editAsText().setFontSize(11);
  if (data.inactiveProducts.length > 0) {
    data.inactiveProducts.forEach(function(p) {
      var li = body.appendListItem(p);
      li.setGlyphType(DocumentApp.GlyphType.BULLET);
      li.editAsText().setFontSize(10);
      li.editAsText().setBold(false);
      li.editAsText().setForegroundColor('#333333');
    });
  } else {
    addBodyText(body, 'All products active');
  }
}


// ═══════════════════════════════════════════════════════════════════════
// Account Health Analysis (unchanged)
// ═══════════════════════════════════════════════════════════════════════

var HEALTH_GREEN  = '#E6F4EA';
var HEALTH_YELLOW = '#FFF8E1';
var HEALTH_RED    = '#FCE8E6';
var HEALTH_GRAY   = '#F5F5F5';
var LABEL_GREEN   = '#1E8E3E';
var LABEL_YELLOW  = '#F9AB00';
var LABEL_RED     = '#D93025';
var LABEL_GRAY    = '#757575';

/**
 * Assess a metric and return { status, label, detail }.
 * status: 'green' | 'yellow' | 'red' | 'gray' (no data)
 */
function assessHealth(status, label, detail) {
  return { status: status, label: label, detail: detail };
}

/**
 * Analyze all health indicators from the internal data.
 * @param {Object} data  Output of getCompanyData
 * @returns {Object} grouped health assessments
 */
function analyzeAccountHealth(data) {
  var results = {};
  var isSeatModel = (data.contract.chargeModel || '').toUpperCase() === 'SEAT';

  // ── 1. Consumption Pacing ───────────────────────────────────────
  var termPct = data.contract.percentComplete;
  var consumptionPct = data.consumption.envelopesPurchased > 0
    ? (data.consumption.envelopesSent / data.consumption.envelopesPurchased) * 100
    : null;

  if (consumptionPct !== null && termPct > 0) {
    var pacingRatio = consumptionPct / termPct;
    if (pacingRatio >= 0.9) {
      results.consumptionPacing = assessHealth('green', 'On Track',
        'Consumption at ' + consumptionPct.toFixed(0) + '% vs ' + termPct.toFixed(0) + '% through term (' + pacingRatio.toFixed(2) + 'x ratio).');
    } else if (pacingRatio >= 0.6) {
      results.consumptionPacing = assessHealth('yellow', 'Slightly Behind',
        'Consumption at ' + consumptionPct.toFixed(0) + '% vs ' + termPct.toFixed(0) + '% through term (' + pacingRatio.toFixed(2) + 'x ratio). May catch up with seasonal patterns.');
    } else {
      results.consumptionPacing = assessHealth('red', 'Significantly Behind',
        'Consumption at ' + consumptionPct.toFixed(0) + '% vs ' + termPct.toFixed(0) + '% through term (' + pacingRatio.toFixed(2) + 'x ratio). Risk of over-purchase or dormant use cases.');
    }
  } else {
    results.consumptionPacing = assessHealth('gray', 'No Data',
      'No envelope consumption data yet. Account is ' + (data.contract.daysUsed || 0) + ' days into term.');
  }

  // ── 2. Usage Trend ──────────────────────────────────────────────
  var trend = (data.consumption.usageTrend || '').toLowerCase();
  if (trend.indexOf('over') !== -1) {
    results.usageTrend = assessHealth('green', 'Over Trending',
      data.consumption.usageTrend + '. Customer is exceeding expected usage — upsell opportunity at renewal.');
  } else if (trend.indexOf('on') !== -1 || trend.indexOf('track') !== -1) {
    results.usageTrend = assessHealth('green', 'On Track',
      data.consumption.usageTrend + '.');
  } else if (trend.indexOf('under') !== -1) {
    results.usageTrend = assessHealth('red', 'Under Trending',
      data.consumption.usageTrend + '. Investigate dormant use cases or onboarding gaps.');
  } else {
    results.usageTrend = assessHealth('gray', 'No Data',
      'No usage trend data available yet.');
  }

  // ── 3. Send Velocity MoM ───────────────────────────────────────
  var velMom = data.consumption.sendVelocityMom;
  if (velMom !== 0 && velMom !== null && velMom !== undefined) {
    if (velMom > 10) {
      results.sendVelocity = assessHealth('green', 'Accelerating',
        'Send volume up ' + velMom + '% month-over-month. Usage is growing.');
    } else if (velMom >= -10) {
      results.sendVelocity = assessHealth('yellow', 'Flat',
        'Send volume changed ' + velMom + '% month-over-month. Stable but not growing.');
    } else {
      results.sendVelocity = assessHealth('red', 'Decelerating',
        'Send volume down ' + velMom + '% month-over-month. Declining engagement.');
    }
  } else {
    results.sendVelocity = assessHealth('gray', 'No Data',
      'No send velocity data available yet.');
  }

  // ── 4. Seat Activation ─────────────────────────────────────────
  var seatAct = data.seats.activationRate;
  var seatsP = data.seats.purchased;
  var seatsA = data.seats.active;
  if (seatsP > 0) {
    if (seatAct >= 70) {
      results.seatActivation = assessHealth('green', 'Healthy',
        seatAct.toFixed(0) + '% activation (' + seatsA + '/' + seatsP + '). Strong user adoption.');
    } else if (seatAct >= 30) {
      results.seatActivation = assessHealth('yellow', 'Moderate',
        seatAct.toFixed(0) + '% activation (' + seatsA + '/' + seatsP + '). Room to grow user base.');
    } else {
      results.seatActivation = assessHealth('red', 'Low',
        seatAct.toFixed(0) + '% activation (' + seatsA + '/' + seatsP + '). Significant shelfware risk.');
    }
  } else if (seatsA > 0) {
    results.seatActivation = assessHealth('yellow', 'Unmetered',
      seatsA + ' active seats with no purchased limit. Likely API-driven or unlimited plan.');
  } else {
    results.seatActivation = assessHealth('gray', 'No Data',
      'No seat data available yet.');
  }

  // ── 5. Active Seats MoM ────────────────────────────────────────
  var seatMom = data.seats.activeSeatsMom;
  if (seatMom !== 0 && seatMom !== null && seatMom !== undefined) {
    if (seatMom > 0) {
      results.seatGrowth = assessHealth('green', 'Growing',
        'Active seats up ' + seatMom + '% month-over-month. Organic expansion happening.');
    } else if (seatMom >= -5) {
      results.seatGrowth = assessHealth('yellow', 'Stable',
        'Active seats changed ' + seatMom + '% month-over-month.');
    } else {
      results.seatGrowth = assessHealth('red', 'Contracting',
        'Active seats down ' + seatMom + '% month-over-month. Users leaving the platform.');
    }
  } else {
    results.seatGrowth = assessHealth('gray', 'No Data',
      'No seat growth trend data available yet.');
  }

  // ── 6. Integration Depth ───────────────────────────────────────
  var intCount = data.integrations.count;
  var apiPct = data.integrations.pctCustomApi || 0;
  if (intCount >= 3) {
    results.integrationDepth = assessHealth('green', 'Deeply Embedded',
      intCount + ' integrations detected. High switching cost — strong retention signal.');
  } else if (intCount >= 1) {
    var intDetail = intCount + ' integration(s). ';
    if (apiPct > 50) {
      intDetail += 'API-driven (' + apiPct.toFixed(0) + '% of sends) — technically committed.';
    } else {
      intDetail += 'Opportunity to deepen integration with Salesforce, Workday, or custom API.';
    }
    results.integrationDepth = assessHealth('yellow', 'Moderate', intDetail);
  } else {
    results.integrationDepth = assessHealth('red', 'Low Stickiness',
      'No integrations detected. Using web app only — easily replaceable.');
  }

  // ── 7. Transaction Health ──────────────────────────────────────
  var compRate = data.consumption.completedRate;
  var failPct = (data.consumption.pctDeclined || 0) + (data.consumption.pctVoided || 0) + (data.consumption.pctExpired || 0);
  if (compRate > 0) {
    if (failPct < 5) {
      results.transactionHealth = assessHealth('green', 'Healthy',
        compRate.toFixed(0) + '% completion rate. Only ' + failPct.toFixed(1) + '% declined/voided/expired.');
    } else if (failPct < 15) {
      results.transactionHealth = assessHealth('yellow', 'Moderate Issues',
        compRate.toFixed(0) + '% completion rate. ' + failPct.toFixed(1) + '% of transactions fail — review signer experience.');
    } else {
      results.transactionHealth = assessHealth('red', 'High Failure Rate',
        compRate.toFixed(0) + '% completion rate. ' + failPct.toFixed(1) + '% of transactions fail — workflow friction needs attention.');
    }
  } else {
    results.transactionHealth = assessHealth('gray', 'No Data',
      'No transaction completion data available yet.');
  }

  // ── 8. Product Breadth ─────────────────────────────────────────
  var activeCount = data.activeProducts.length;
  var totalProducts = activeCount + data.inactiveProducts.length;
  if (activeCount >= 5) {
    results.productBreadth = assessHealth('green', 'Broad Adoption',
      activeCount + ' of ' + totalProducts + ' products active. Multi-product customer — strong expansion.');
  } else if (activeCount >= 2) {
    results.productBreadth = assessHealth('yellow', 'Moderate',
      activeCount + ' of ' + totalProducts + ' products active. Room to expand footprint.');
  } else {
    results.productBreadth = assessHealth('red', 'Single Product',
      'Only ' + activeCount + ' product(s) active out of ' + totalProducts + '. Significant whitespace for expansion — but also less sticky.');
  }

  // ── 9. Renewal Proximity ───────────────────────────────────────
  var monthsLeft = data.contract.monthsLeft;
  if (monthsLeft !== null && monthsLeft !== undefined) {
    if (monthsLeft <= 3) {
      results.renewalProximity = assessHealth('red', 'Imminent',
        monthsLeft + ' months until renewal (' + data.contract.termEndFyq + '). Renewal conversation should be active now.');
    } else if (monthsLeft <= 6) {
      results.renewalProximity = assessHealth('yellow', 'Approaching',
        monthsLeft + ' months until renewal (' + data.contract.termEndFyq + '). Begin renewal planning.');
    } else {
      results.renewalProximity = assessHealth('green', 'Runway',
        monthsLeft + ' months until renewal (' + data.contract.termEndFyq + '). Time to build expansion case.');
    }
  } else {
    results.renewalProximity = assessHealth('gray', 'No Data',
      'No renewal date available.');
  }

  // ── 10. Charge Model Context ───────────────────────────────────
  if (isSeatModel) {
    results.chargeModel = assessHealth('yellow', 'Seat-Based',
      'Seat charge model — seat activation and growth are the primary health metrics, not envelope consumption.');
  } else {
    results.chargeModel = assessHealth('yellow', 'Envelope-Based',
      'Envelope charge model — consumption pacing is the primary health metric.');
  }

  return results;
}

/**
 * Section 6: Account Health Analysis — data-driven health indicators (unchanged)
 */
function addAccountHealthSection(body, data) {
  addSectionHeading(body, 'Account Health Analysis');
  addSectionDescription(body, 'Sources: Internal Docusign account metrics processed through rule-based scoring. Health indicators (green/yellow/red) are computed deterministically from consumption pacing, usage trends, seat activation, and renewal proximity. No AI estimation involved.');
  addSourceNote(body, 'Source: Docusign Book of Business · Health indicators computed from internal account metrics');

  var health = analyzeAccountHealth(data);

  // ── Summary Scorecard ──────────────────────────────────────────
  addSubHeading(body, 'Health Scorecard');

  var indicatorOrder = [
    { key: 'consumptionPacing', name: 'Consumption Pacing' },
    { key: 'usageTrend',        name: 'Usage Trend' },
    { key: 'sendVelocity',      name: 'Send Velocity (MoM)' },
    { key: 'seatActivation',    name: 'Seat Activation' },
    { key: 'seatGrowth',        name: 'Seat Growth (MoM)' },
    { key: 'integrationDepth',  name: 'Integration Depth' },
    { key: 'transactionHealth', name: 'Transaction Health' },
    { key: 'productBreadth',    name: 'Product Breadth' },
    { key: 'renewalProximity',  name: 'Renewal Proximity' },
    { key: 'chargeModel',       name: 'Charge Model' }
  ];

  var scorecardRows = [['Indicator', 'Status', 'Assessment']];
  var greenCount = 0, yellowCount = 0, redCount = 0, grayCount = 0;

  indicatorOrder.forEach(function(ind) {
    var h = health[ind.key];
    if (h) {
      scorecardRows.push([ind.name, h.label, h.detail]);
      if (h.status === 'green') greenCount++;
      else if (h.status === 'yellow') yellowCount++;
      else if (h.status === 'red') redCount++;
      else if (h.status === 'gray') grayCount++;
    }
  });

  var table = body.appendTable(scorecardRows);
  table.setBorderColor('#CCCCCC');
  table.setBorderWidth(1);

  // Style header row
  var numCols = scorecardRows[0].length;
  var headerRow = table.getRow(0);
  for (var c = 0; c < numCols; c++) {
    var cell = headerRow.getCell(c);
    cell.setBackgroundColor(HEADER_BG);
    cell.editAsText().setForegroundColor(HEADER_FG);
    cell.editAsText().setBold(true);
    cell.editAsText().setFontSize(10);
    cell.setPaddingTop(6);
    cell.setPaddingBottom(6);
    cell.setPaddingLeft(8);
    cell.setPaddingRight(8);
  }

  // Style data rows with health colors
  var dataIdx = 0;
  indicatorOrder.forEach(function(ind) {
    var h = health[ind.key];
    if (!h) return;
    dataIdx++;
    var row = table.getRow(dataIdx);

    var bgColor = h.status === 'green' ? HEALTH_GREEN :
                  h.status === 'yellow' ? HEALTH_YELLOW :
                  h.status === 'gray' ? HEALTH_GRAY : HEALTH_RED;
    var labelColor = h.status === 'green' ? LABEL_GREEN :
                     h.status === 'yellow' ? LABEL_YELLOW :
                     h.status === 'gray' ? LABEL_GRAY : LABEL_RED;

    // Indicator name column
    var nameCell = row.getCell(0);
    nameCell.setBackgroundColor('#FFFFFF');
    nameCell.editAsText().setBold(true);
    nameCell.editAsText().setFontSize(10);
    nameCell.setPaddingTop(4);
    nameCell.setPaddingBottom(4);
    nameCell.setPaddingLeft(8);
    nameCell.setPaddingRight(8);

    // Status column — colored background
    var statusCell = row.getCell(1);
    statusCell.setBackgroundColor(bgColor);
    statusCell.editAsText().setForegroundColor(labelColor);
    statusCell.editAsText().setBold(true);
    statusCell.editAsText().setFontSize(10);
    statusCell.setPaddingTop(4);
    statusCell.setPaddingBottom(4);
    statusCell.setPaddingLeft(8);
    statusCell.setPaddingRight(8);

    // Detail column
    var detailCell = row.getCell(2);
    detailCell.setBackgroundColor('#FFFFFF');
    detailCell.editAsText().setFontSize(9);
    detailCell.setPaddingTop(4);
    detailCell.setPaddingBottom(4);
    detailCell.setPaddingLeft(8);
    detailCell.setPaddingRight(8);
  });

  // ── Overall Assessment ─────────────────────────────────────────
  addSubHeading(body, 'Overall Assessment');

  var total = greenCount + yellowCount + redCount + grayCount;
  var summaryText = greenCount + ' healthy, ' + yellowCount + ' watch, ' + redCount + ' concern';
  if (grayCount > 0) {
    summaryText += ', ' + grayCount + ' no data';
  }
  summaryText += ' — out of ' + total + ' indicators evaluated.';
  var overallPara = addBodyText(body, summaryText);
  overallPara.editAsText().setBold(true);

  // Build narrative
  var narrativeLines = [];

  if (health.chargeModel) {
    narrativeLines.push(health.chargeModel.detail);
  }

  if (redCount === 0) {
    narrativeLines.push('No critical health concerns detected. Focus on expansion opportunities.');
  } else {
    narrativeLines.push('Key areas requiring attention:');
  }

  indicatorOrder.forEach(function(ind) {
    var h = health[ind.key];
    if (h && h.status === 'red' && ind.key !== 'chargeModel') {
      narrativeLines.push('\u2022 ' + ind.name + ': ' + h.detail);
    }
  });

  // Growth opportunity callout
  if (health.productBreadth && health.productBreadth.status !== 'green') {
    narrativeLines.push('');
    narrativeLines.push('Growth Opportunity: ' + data.inactiveProducts.length + ' Docusign products are not yet adopted. ' +
      'Given the $' + formatNumber(data.financial.acv) + ' ACV, expanding the product footprint would increase both value delivery and retention.');
  }

  if (health.integrationDepth && health.integrationDepth.status === 'red') {
    narrativeLines.push('');
    narrativeLines.push('Retention Risk: No integrations detected. Recommend prioritizing Salesforce or API integration to increase switching cost.');
  }

  narrativeLines.forEach(function(line) {
    addBodyText(body, line);
  });
}


/**
 * Section 7: Agreement Landscape
 */
function addAgreementLandscapeSection(body, data, agreementLandscape) {
  addSectionHeading(body, 'Agreement Landscape');
  addSectionDescription(body, 'Sources: AI-estimated agreement types based on company profile, organizational structure, and industry patterns. Volume and complexity scores (1-10 scale) are LLM estimates, not measured counts. Quadrant classifications derive from these estimated scores.');

  var agreements = (agreementLandscape && agreementLandscape.agreements) || [];

  if (agreements.length === 0) {
    addBodyText(body, 'Agreement landscape data not available.');
    return;
  }

  // Quadrant bubble chart (QuickChart.io)
  var chartBlob = createQuadrantChart(agreements);
  if (chartBlob) {
    try {
      var chartImage = body.appendImage(chartBlob);
      chartImage.setWidth(468);
      chartImage.setHeight(234);
      addSpacer(body);
    } catch (e) {
      Logger.log('[DocGen] Failed to insert quadrant chart: ' + e.message);
    }
  }

  // Show fallback note if agreements were generated deterministically
  if (agreementLandscape._fallback) {
    var fallbackNote = addBodyText(body, 'Agreement types below are estimated based on industry and organizational structure. Actual agreement landscape may differ.');
    fallbackNote.editAsText().setItalic(true);
    fallbackNote.editAsText().setFontSize(10);
    fallbackNote.editAsText().setBold(false);
    fallbackNote.editAsText().setForegroundColor('#666666');
    addSpacer(body);
  }

  // Quadrant guide
  addSubHeading(body, 'Quadrant Guide');
  var guideRows = [
    ['Quadrant', 'Description'],
    ['HV/HC \u2014 High Vol / High Cx', 'Strategic agreements \u2014 highest Docusign value. CLM, Navigator, Maestro opportunities.'],
    ['HV/LC \u2014 High Vol / Low Cx', 'Transactional agreements \u2014 eSignature, Clickwraps, Bulk Send, automation.'],
    ['LV/HC \u2014 Low Vol / High Cx', 'Specialized agreements \u2014 CLM, Document Generation, ID Verification.'],
    ['LV/LC \u2014 Low Vol / Low Cx', 'Standard agreements \u2014 eSignature, templates, PowerForms.']
  ];
  addStyledTable(body, guideRows);

  // Full data table
  addSubHeading(body, 'Agreement Details');
  var aggRows = [['#', 'Agreement Type', 'Category', 'Business Unit', 'Vol', 'Cx', 'Type', 'Quadrant']];
  agreements.forEach(function(a) {
    aggRows.push([
      String(a.number || ''),
      extractString(a.agreementType),
      a.category || '',
      a.primaryBusinessUnit || '',
      String(a.volume || ''),
      String(a.complexity || ''),
      normalizeContractType(a.contractType),
      getQuadrantAbbrev(a.volume, a.complexity)
    ]);
  });

  // Custom table rendering with color-coded Type column and explicit widths
  var table = body.appendTable(aggRows);
  table.setBorderColor('#CCCCCC');
  table.setBorderWidth(1);

  var colWidths = [24, 135, 60, 115, 28, 28, 80, 46];
  for (var w = 0; w < colWidths.length; w++) {
    table.setColumnWidth(w, colWidths[w]);
  }

  var numCols = aggRows[0].length;

  // Style header row
  var headerRow = table.getRow(0);
  for (var hc = 0; hc < numCols; hc++) {
    var hCell = headerRow.getCell(hc);
    hCell.setBackgroundColor(HEADER_BG);
    hCell.editAsText().setForegroundColor(HEADER_FG);
    hCell.editAsText().setBold(true);
    hCell.editAsText().setFontSize(10);
    hCell.setPaddingTop(6);
    hCell.setPaddingBottom(6);
    hCell.setPaddingLeft(8);
    hCell.setPaddingRight(8);
  }

  // Style data rows
  for (var r = 1; r < table.getNumRows(); r++) {
    var row = table.getRow(r);
    var bg = (r % 2 === 0) ? TABLE_ALT_BG : '#FFFFFF';
    for (var c = 0; c < numCols; c++) {
      var dataCell = row.getCell(c);
      dataCell.setBackgroundColor(bg);
      dataCell.editAsText().setFontSize(10);
      dataCell.editAsText().setBold(false);
      dataCell.editAsText().setForegroundColor('#333333');
      dataCell.setPaddingTop(4);
      dataCell.setPaddingBottom(4);
      dataCell.setPaddingLeft(8);
      dataCell.setPaddingRight(8);
    }

    // Color-code the Type column (index 6)
    var typeCell = row.getCell(6);
    var typeValue = typeCell.getText().trim();
    var typeColor = CONTRACT_TYPE_COLORS[typeValue];
    if (typeColor) {
      typeCell.setBackgroundColor(typeColor.bg);
      typeCell.editAsText().setForegroundColor(typeColor.fg);
      typeCell.editAsText().setBold(true);
    }
  }

  addSpacer(body);

  // Contract type legend
  var legendText = '\u25a0 Negotiated    \u25a0 Non-negotiated    \u25a0 Form-based    \u25a0 Regulatory';
  var legend = addBodyText(body, legendText);
  legend.editAsText().setFontSize(9);
  legend.editAsText().setBold(false);
  legend.editAsText().setForegroundColor('#666666');
  // Color each legend swatch
  var legendStr = legendText;
  var pos = 0;
  var types = ['Negotiated', 'Non-negotiated', 'Form-based', 'Regulatory'];
  for (var t = 0; t < types.length; t++) {
    var idx = legendStr.indexOf('\u25a0', pos);
    if (idx >= 0) {
      legend.editAsText().setForegroundColor(idx, idx, CONTRACT_TYPE_COLORS[types[t]].fg);
      pos = idx + 1;
    }
  }

  // Descriptions
  addSubHeading(body, 'Agreement Descriptions');
  agreements.forEach(function(a) {
    if (a.description) {
      var agType = extractString(a.agreementType);
      var text = (a.number || '') + '. ' + agType + ': ' + extractString(a.description);
      var para = addBodyText(body, text);
      var titleEnd = String(a.number || '').length + 2 + agType.length + 1;
      if (titleEnd > 0 && titleEnd < text.length) {
        para.editAsText().setBold(0, titleEnd, true);
      }
    }
  });
}

/**
 * Section 8: Contract Commerce Estimate
 */
function addContractCommerceSection(body, data, contractCommerce) {
  addSectionHeading(body, 'Contract Commerce Estimate');
  addSectionDescription(body, 'Sources: AI-estimated dollar values for commerce flowing through agreements, grounded in SEC EDGAR financials and company profile. Revenue splits and department-level estimates are LLM projections, not audited figures. Use as directional sizing, not precise forecasts.');

  var cc = contractCommerce || {};

  // Estimated Commerce table
  var est = cc.estimatedCommerce || {};
  if (est.totalRevenue || est.spendManaged || est.opex) {
    addSubHeading(body, 'Estimated Commerce');
    var estRows = [
      ['Metric', 'Value'],
      ['Total Revenue', est.totalRevenue || 'N/A'],
      ['Spend Managed', est.spendManaged || 'N/A'],
      ['OpEx', est.opex || 'N/A']
    ];
    addStyledTable(body, estRows);
  }

  // Commercial Relationships table
  var rel = cc.commercialRelationships || {};
  if (rel.employees || rel.suppliers || rel.customers || rel.partners) {
    addSubHeading(body, 'Commercial Relationships');
    var relRows = [
      ['Relationship Type', 'Count'],
      ['Employees', rel.employees || 'N/A'],
      ['Suppliers', rel.suppliers || 'N/A'],
      ['Customers', rel.customers || 'N/A'],
      ['Partners', rel.partners || 'N/A']
    ];
    addStyledTable(body, relRows);
  }

  // Commerce by Department table + optional bar chart
  var depts = cc.commerceByDepartment || [];
  if (depts.length > 0) {
    addSubHeading(body, 'Commerce by Department');

    // Try bar chart
    var barBlob = createBarChart(depts);
    if (barBlob) {
      try {
        body.appendImage(barBlob);
        addSpacer(body);
      } catch (e) {
        Logger.log('[DocGen] Failed to insert bar chart: ' + e.message);
      }
    }

    var deptRows = [['Department', 'Estimated Annual Value', 'Primary Agreement Types']];
    depts.forEach(function(d) {
      deptRows.push([
        d.department || '',
        d.estimatedAnnualValue || '',
        (d.primaryAgreementTypes || []).join(', ')
      ]);
    });
    addStyledTable(body, deptRows);
  }

  // Commerce by Agreement Type (fallback if department data is sparse)
  var byType = cc.commerceByAgreementType || [];
  if (byType.length > 0) {
    addSubHeading(body, 'Commerce by Agreement Type');
    var typeRows = [['Agreement Type', 'Estimated Annual Value', 'Volume']];
    byType.forEach(function(t) {
      typeRows.push([
        t.agreementType || '',
        t.estimatedAnnualValue || '',
        t.volume || ''
      ]);
    });
    addStyledTable(body, typeRows);
  }

  // Pain Points
  var pains = cc.painPoints || [];
  if (pains.length > 0) {
    addSubHeading(body, 'Agreement Pain Points');
    pains.forEach(function(p) {
      var text = (p.title || 'Pain Point') + ': ' + (p.description || '');
      var li = body.appendListItem(text);
      li.setGlyphType(DocumentApp.GlyphType.BULLET);
      li.editAsText().setFontSize(11);
      li.editAsText().setBold(false);
      li.editAsText().setForegroundColor('#333333');
      var titleLen = (p.title || 'Pain Point').length + 1;
      if (titleLen > 0 && titleLen < text.length) {
        li.editAsText().setBold(0, titleLen, true);
      }
    });
  }

  if (!est.totalRevenue && depts.length === 0 && byType.length === 0) {
    addBodyText(body, 'Contract commerce data not available.');
  }
}

/**
 * Match an opportunity product name to a signal entry.
 * Tries exact match (case-insensitive), then substring in either direction.
 * @param {string} product  Opportunity product name (e.g. "Docusign Navigator")
 * @param {Array}  signals  productSignals.signals array
 * @returns {Object|null}   Matched signal or null
 */
function findSignalForProduct(product, signals) {
  if (!product || !signals || !signals.length) return null;
  var pLower = product.toLowerCase().trim();

  // Exact match (case-insensitive)
  for (var i = 0; i < signals.length; i++) {
    if ((signals[i].product || '').toLowerCase().trim() === pLower) return signals[i];
  }

  // Substring match: opportunity product contains signal product, or vice-versa
  for (var j = 0; j < signals.length; j++) {
    var sLower = (signals[j].product || '').toLowerCase().trim();
    if (sLower && (pLower.indexOf(sLower) !== -1 || sLower.indexOf(pLower) !== -1)) {
      return signals[j];
    }
  }

  return null;
}

/**
 * Section 9: Priority Map
 */
function addPriorityMapSection(body, data, priorityMap, productSignals) {
  addSectionHeading(body, 'Priority Map');
  addSectionDescription(body, 'Sources: AI synthesis mapping company strategic priorities to Docusign capabilities, combined with deterministic product signals from internal usage analysis. Top opportunities are scored by initiative alignment and white-space analysis. Bundle recommendations are rule-based from product signals.');

  var pm = priorityMap || {};

  // Accept both field names: priorityMapping (new) or priorities (old/LLM variant)
  var mappings = pm.priorityMapping || pm.priorities || [];

  // ── Top Opportunities table ────────────────────────────────────────
  var opportunities = pm.expansionOpportunities || [];
  var ps = productSignals || {};
  var signals = ps.signals || [];

  if (opportunities.length > 0 && signals.length > 0) {
    // Score each opportunity
    var scored = opportunities.map(function(opp) {
      // 1. Initiative alignment (0 or 1)
      var aligned = 0;
      var matchedPriority = '';
      var oppProductLower = (opp.product || '').toLowerCase();
      for (var mi = 0; mi < mappings.length; mi++) {
        var capLower = (mappings[mi].docusignCapability || '').toLowerCase();
        if (capLower.indexOf(oppProductLower) !== -1 || oppProductLower.indexOf(capLower) !== -1) {
          aligned = 1;
          matchedPriority = mappings[mi].companyPriority || '';
          break;
        }
      }

      // 2. White space (1–3)
      var signal = findSignalForProduct(opp.product, signals);
      var whiteSpace = 3; // default: "White" (LLM recommending something not in their stack)
      var whiteSpaceLabel = 'White';
      if (signal) {
        if (signal.status === 'in_use') {
          whiteSpace = 1;
          whiteSpaceLabel = 'Dark Grey';
        } else if (signal.status === 'recommended' && signal.strength === 'moderate') {
          whiteSpace = 2;
          whiteSpaceLabel = 'Grey';
        } else if (signal.status === 'recommended' && signal.strength === 'strong') {
          whiteSpace = 3;
          whiteSpaceLabel = 'White';
        } else {
          // recommended with no strength, or not_relevant → treat as white
          whiteSpace = 3;
          whiteSpaceLabel = 'White';
        }
      }

      // 3. Combined score
      var score = (aligned * 3) + whiteSpace;

      return {
        product: opp.product || '',
        useCase: opp.useCase || '',
        department: opp.department || '',
        businessValue: opp.businessValue || '',
        aligned: aligned,
        matchedPriority: matchedPriority,
        whiteSpaceLabel: whiteSpaceLabel,
        score: score
      };
    });

    // Sort descending by score, take top 3
    scored.sort(function(a, b) { return b.score - a.score; });
    var top3 = scored.slice(0, 3);

    // Build table data
    var topRows = [['#', 'Opportunity', 'White Space', 'Initiative Alignment', 'Business Value']];
    top3.forEach(function(item, idx) {
      var oppLabel = item.product + '\n' + item.useCase + ' — ' + item.department;
      topRows.push([
        String(idx + 1),
        oppLabel,
        item.whiteSpaceLabel,
        item.matchedPriority || '\u2014',
        item.businessValue
      ]);
    });

    // Render custom table
    addSubHeading(body, 'Top Opportunities');
    var topTable = body.appendTable(topRows);
    topTable.setBorderColor('#CCCCCC');
    topTable.setBorderWidth(1);

    var topColWidths = [20, 130, 60, 140, 166];
    for (var tw = 0; tw < topColWidths.length; tw++) {
      topTable.setColumnWidth(tw, topColWidths[tw]);
    }

    var topNumCols = topRows[0].length;

    // Style header row
    var topHeaderRow = topTable.getRow(0);
    for (var thc = 0; thc < topNumCols; thc++) {
      var thCell = topHeaderRow.getCell(thc);
      thCell.setBackgroundColor(HEADER_BG);
      thCell.editAsText().setForegroundColor(HEADER_FG);
      thCell.editAsText().setBold(true);
      thCell.editAsText().setFontSize(10);
      thCell.setPaddingTop(6);
      thCell.setPaddingBottom(6);
      thCell.setPaddingLeft(8);
      thCell.setPaddingRight(8);
    }

    // White space color map
    var wsColors = {
      'White':     { bg: '#FFFFFF', fg: '#1E8E3E' },
      'Grey':      { bg: '#E8EAED', fg: '#5F6368' },
      'Dark Grey': { bg: '#DADCE0', fg: '#3C4043' }
    };

    // Style data rows
    for (var tr = 1; tr < topTable.getNumRows(); tr++) {
      var topRow = topTable.getRow(tr);
      var topBg = (tr % 2 === 0) ? TABLE_ALT_BG : '#FFFFFF';
      for (var tc = 0; tc < topNumCols; tc++) {
        var tCell = topRow.getCell(tc);
        tCell.setBackgroundColor(topBg);
        tCell.editAsText().setFontSize(10);
        tCell.editAsText().setBold(false);
        tCell.editAsText().setForegroundColor('#333333');
        tCell.setPaddingTop(4);
        tCell.setPaddingBottom(4);
        tCell.setPaddingLeft(8);
        tCell.setPaddingRight(8);
      }

      // # column (col 0): bold, centered
      var rankCell = topRow.getCell(0);
      rankCell.editAsText().setBold(true);

      // Opportunity column (col 1): bold product name, normal use case
      var oppCell = topRow.getCell(1);
      var oppText = oppCell.getText();
      var oppNewline = oppText.indexOf('\n');
      if (oppNewline > 0) {
        oppCell.editAsText().setBold(0, oppNewline - 1, true);
        oppCell.editAsText().setItalic(false);
        // Italicize the department portion (after " — ")
        var dashIdx = oppText.indexOf(' \u2014 ', oppNewline);
        if (dashIdx !== -1 && dashIdx + 3 < oppText.length) {
          oppCell.editAsText().setItalic(dashIdx + 3, oppText.length - 1, true);
        }
      } else {
        oppCell.editAsText().setBold(true);
      }

      // White Space column (col 2): color-coded background
      var wsCell = topRow.getCell(2);
      var wsValue = wsCell.getText().trim();
      var wsStyle = wsColors[wsValue];
      if (wsStyle) {
        wsCell.setBackgroundColor(wsStyle.bg);
        wsCell.editAsText().setForegroundColor(wsStyle.fg);
        wsCell.editAsText().setBold(true);
      }
    }

    addSpacer(body);
  }

  // Priority Mapping table
  if (mappings.length > 0) {
    addSubHeading(body, 'Company Priorities Mapped to Docusign Capabilities');
    var mapRows = [['Company Priority', 'Priority Details', 'Docusign Capability', 'Business Impact']];
    mappings.forEach(function(m) {
      var details = m.priorityDetails || [];
      var detailsStr = Array.isArray(details) ? details.join('; ') : String(details);
      mapRows.push([
        m.companyPriority || '',
        detailsStr,
        m.docusignCapability || '',
        m.businessImpact || m.rationale || ''
      ]);
    });
    addStyledTable(body, mapRows);
  }

  // Recommended Bundles table (deterministic, from productSignals.bundleSignals)
  var bundleSignals = ps.bundleSignals || [];
  if (bundleSignals.length > 0) {
    // Build a catalog lookup by bundle name
    var catalogByName = {};
    DOCUSIGN_CATALOG.bundles.forEach(function(cat) {
      catalogByName[cat.name] = cat;
    });

    addSubHeading(body, 'Recommended Bundles');
    var bundleRows = [['Bundle', 'Signal', 'Key Components', 'Rationale']];
    bundleSignals.forEach(function(b) {
      var catalogEntry = catalogByName[b.bundle] || {};
      var bundleLabel = b.bundle + (catalogEntry.description ? '\n' + catalogEntry.description : '');
      bundleRows.push([
        bundleLabel,
        b.strength ? b.strength.charAt(0).toUpperCase() + b.strength.slice(1) : '',
        (b.recommendedComponents || []).join(', '),
        (b.reasons || []).join('; ')
      ]);
    });

    // Custom table rendering for Signal column color-coding
    var table = body.appendTable(bundleRows);
    table.setBorderColor('#CCCCCC');
    table.setBorderWidth(1);

    var colWidths = [105, 55, 140, 216];
    for (var w = 0; w < colWidths.length; w++) {
      table.setColumnWidth(w, colWidths[w]);
    }

    var numCols = bundleRows[0].length;

    // Style header row
    var headerRow = table.getRow(0);
    for (var hc = 0; hc < numCols; hc++) {
      var hCell = headerRow.getCell(hc);
      hCell.setBackgroundColor(HEADER_BG);
      hCell.editAsText().setForegroundColor(HEADER_FG);
      hCell.editAsText().setBold(true);
      hCell.editAsText().setFontSize(10);
      hCell.setPaddingTop(6);
      hCell.setPaddingBottom(6);
      hCell.setPaddingLeft(8);
      hCell.setPaddingRight(8);
    }

    // Style data rows
    for (var r = 1; r < table.getNumRows(); r++) {
      var row = table.getRow(r);
      var bg = (r % 2 === 0) ? TABLE_ALT_BG : '#FFFFFF';
      for (var c = 0; c < numCols; c++) {
        var dataCell = row.getCell(c);
        dataCell.setBackgroundColor(bg);
        dataCell.editAsText().setFontSize(10);
        dataCell.editAsText().setBold(false);
        dataCell.editAsText().setForegroundColor('#333333');
        dataCell.setPaddingTop(4);
        dataCell.setPaddingBottom(4);
        dataCell.setPaddingLeft(8);
        dataCell.setPaddingRight(8);
      }

      // Bold the bundle name (first line) in the Bundle column, leave description normal
      var bundleCell = row.getCell(0);
      var bundleText = bundleCell.getText();
      var newlineIdx = bundleText.indexOf('\n');
      if (newlineIdx > 0) {
        bundleCell.editAsText().setBold(0, newlineIdx - 1, true);
        bundleCell.editAsText().setFontSize(newlineIdx + 1, bundleText.length - 1, 9);
        bundleCell.editAsText().setForegroundColor(newlineIdx + 1, bundleText.length - 1, '#666666');
      } else {
        bundleCell.editAsText().setBold(true);
      }

      // Color-code the Signal column (index 1)
      var signalCell = row.getCell(1);
      var signalValue = signalCell.getText().trim().toLowerCase();
      if (signalValue === 'strong') {
        signalCell.setBackgroundColor(HEALTH_GREEN);
        signalCell.editAsText().setForegroundColor(LABEL_GREEN);
        signalCell.editAsText().setBold(true);
      } else if (signalValue === 'moderate') {
        signalCell.setBackgroundColor(HEALTH_YELLOW);
        signalCell.editAsText().setForegroundColor(LABEL_YELLOW);
        signalCell.editAsText().setBold(true);
      }
    }

    addSpacer(body);
  }

  // Expansion Opportunities table
  if (opportunities.length > 0) {
    addSubHeading(body, 'Expansion Opportunities');
    var oppRows = [['Product', 'Use Case', 'Business Value', 'Target Department']];
    opportunities.forEach(function(o) {
      oppRows.push([
        o.product || '',
        o.useCase || '',
        o.businessValue || '',
        o.department || ''
      ]);
    });
    addStyledTable(body, oppRows);
  }

  // Action Plan
  var actions = pm.actionPlan || [];
  if (actions.length > 0) {
    addSubHeading(body, 'Recommended Action Plan');
    var actRows = [['Action', 'Owner', 'Rationale']];
    actions.forEach(function(a) {
      actRows.push([
        a.action || '',
        a.owner || '',
        a.rationale || ''
      ]);
    });
    addStyledTable(body, actRows);
  }

  if (mappings.length === 0 && opportunities.length === 0) {
    addBodyText(body, 'Priority map data not available.');
  }
}


// ═══════════════════════════════════════════════════════════════════════
// Appendix: Data Sources & Methodology
// ═══════════════════════════════════════════════════════════════════════

/**
 * Appendix section: Data Sources & Methodology.
 * Lists all data sources used, what they provided, and methodology notes.
 * @param {Body} body
 * @param {Object} enrichment  Output of enrichCompanyData()
 */
function addDataSourcesSection(body, enrichment) {
  addSectionHeading(body, 'Data Sources & Methodology');

  var enr = enrichment || {};

  addBodyText(body, 'This report combines verified data from multiple authoritative sources. ' +
    'Where data is sourced from public filings or databases, it is used as-is. ' +
    'AI-generated analysis is grounded with live web search (Bing) and anchored to verified data points.');

  // Build sources table dynamically based on what was actually enriched
  var rows = [['Source', 'Data Provided', 'Notes']];

  // Always present: internal Docusign data
  rows.push([
    'Docusign Book of Business',
    'Contract terms, consumption metrics, seat usage, integrations, product adoption, financial data (ACV/CMRR)',
    'Internal account data extracted from Docusign systems'
  ]);

  // SEC EDGAR
  if (enr.revenueFormatted || enr.segments) {
    var secData = [];
    if (enr.revenueFormatted) secData.push('consolidated financials (revenue, COGS, OpEx, CapEx, net income)');
    if (enr.employeesFormatted) secData.push('employee count');
    if (enr.segments && enr.segments.length > 0) secData.push('segment revenue (' + enr.segments.length + ' segments)');
    var period = enr.filingPeriod ? 'From most recent 10-K annual filing (FY ' + enr.filingPeriod + ')' : 'From most recent 10-K annual filing';
    rows.push([
      'SEC EDGAR (XBRL)',
      secData.join(', '),
      period + '. Parsed from XBRL instance documents via SEC EDGAR API.'
    ]);
  }

  // Wikipedia
  if (enr.overview) {
    rows.push([
      'Wikipedia',
      'Company overview',
      'Summary extract from English Wikipedia article'
    ]);
  }

  // Wikidata
  var wikidataFields = [];
  if (enr.ceo) wikidataFields.push('CEO');
  if (enr.headquarters) wikidataFields.push('headquarters');
  if (enr.foundingDate) wikidataFields.push('founding date');
  if (enr.ticker) wikidataFields.push('stock ticker');
  if (wikidataFields.length > 0) {
    rows.push([
      'Wikidata',
      wikidataFields.join(', '),
      'Structured data from Wikidata knowledge base'
    ]);
  }

  // AI research (always present)
  rows.push([
    'AI Research (Bing-grounded)',
    'Business units, SWOT analysis, strategic initiatives, executive contacts, technology stack, agreement landscape, contract commerce estimates, priority mapping',
    'Generated by LLM with live Bing web search grounding. Verified data from sources above is enforced over AI estimates.'
  ]);

  addStyledTable(body, rows);

  addSpacer(body);
  var methodNote = addBodyText(body,
    'Methodology: Verified data from SEC filings and public databases is fetched first and injected into AI prompts as anchoring context. ' +
    'After AI generation, a post-processing enforcement step overwrites any AI-generated values that conflict with verified data. ' +
    'This ensures financial figures, employee counts, and segment revenue reflect actual SEC filings rather than AI estimates.');
  methodNote.editAsText().setFontSize(9);
  methodNote.editAsText().setForegroundColor('#666666');
}


// ═══════════════════════════════════════════════════════════════════════
// Formatting Helpers
// ═══════════════════════════════════════════════════════════════════════

function addSectionHeading(body, text) {
  var heading = body.appendParagraph(text);
  heading.setHeading(DocumentApp.ParagraphHeading.HEADING1);
  heading.editAsText().setForegroundColor(DOCUSIGN_PURPLE);
  heading.editAsText().setFontSize(22);
  heading.editAsText().setBold(false);
  heading.setSpacingAfter(12);
  // Insert a reset paragraph so the next append doesn't inherit heading style
  var reset = body.appendParagraph('');
  reset.setHeading(DocumentApp.ParagraphHeading.NORMAL);
  reset.editAsText().setFontSize(11);
  reset.editAsText().setBold(false);
  reset.editAsText().setForegroundColor('#000000');
  reset.setSpacingBefore(0).setSpacingAfter(0);
}

function addSubHeading(body, text) {
  var heading = body.appendParagraph(text);
  heading.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  heading.editAsText().setFontSize(13);
  heading.editAsText().setBold(true);
  heading.editAsText().setForegroundColor('#333333');
  heading.setSpacingBefore(8);
  heading.setSpacingAfter(4);
}

/**
 * Add a body text paragraph with explicit normal styling.
 * Prevents style inheritance from headings.
 */
function addBodyText(body, text) {
  var para = body.appendParagraph(text);
  para.setHeading(DocumentApp.ParagraphHeading.NORMAL);
  para.editAsText().setFontSize(11);
  para.editAsText().setBold(false);
  para.editAsText().setForegroundColor('#333333');
  para.setLineSpacing(1.15);
  para.setSpacingAfter(6);
  return para;
}

/**
 * Add a spacer paragraph (replaces bare appendParagraph(''))
 */
function addSpacer(body) {
  var sp = body.appendParagraph('');
  sp.setHeading(DocumentApp.ParagraphHeading.NORMAL);
  sp.editAsText().setFontSize(4);
  sp.editAsText().setBold(false);
  sp.setSpacingBefore(0).setSpacingAfter(0);
}

/**
 * Add an inline source attribution note — small italic gray text.
 * e.g. "Source: SEC EDGAR 10-K Filing (FY 2024)"
 * @param {Body} body
 * @param {string} text
 */
function addSourceNote(body, text) {
  var para = body.appendParagraph(text);
  para.setHeading(DocumentApp.ParagraphHeading.NORMAL);
  para.editAsText().setFontSize(8);
  para.editAsText().setItalic(true);
  para.editAsText().setBold(false);
  para.editAsText().setForegroundColor('#888888');
  para.setSpacingBefore(2);
  para.setSpacingAfter(6);
  return para;
}

/**
 * Add a section description paragraph — brief provenance note below section headings.
 * 9pt italic gray text, tight against heading with small gap before content.
 * @param {Body} body
 * @param {string} text
 */
function addSectionDescription(body, text) {
  var para = body.appendParagraph(text);
  para.setHeading(DocumentApp.ParagraphHeading.NORMAL);
  para.editAsText().setFontSize(9);
  para.editAsText().setItalic(true);
  para.editAsText().setBold(false);
  para.editAsText().setForegroundColor('#777777');
  para.setSpacingBefore(0);
  para.setSpacingAfter(8);
  return para;
}

/**
 * Create a styled table with header row formatting and alternating row colors.
 */
function addStyledTable(body, rows) {
  if (!rows || rows.length === 0) return;

  var table = body.appendTable(rows);
  table.setBorderColor('#CCCCCC');
  table.setBorderWidth(1);

  var numCols = rows[0].length;

  // Style header row
  var headerRow = table.getRow(0);
  for (var c = 0; c < numCols; c++) {
    var cell = headerRow.getCell(c);
    cell.setBackgroundColor(HEADER_BG);
    cell.editAsText().setForegroundColor(HEADER_FG);
    cell.editAsText().setBold(true);
    cell.editAsText().setItalic(false);
    cell.editAsText().setFontSize(10);
    cell.setPaddingTop(6);
    cell.setPaddingBottom(6);
    cell.setPaddingLeft(8);
    cell.setPaddingRight(8);
  }

  // Style data rows
  for (var r = 1; r < table.getNumRows(); r++) {
    var row = table.getRow(r);
    var bg = (r % 2 === 0) ? TABLE_ALT_BG : '#FFFFFF';
    for (var c2 = 0; c2 < numCols; c2++) {
      var dataCell = row.getCell(c2);
      dataCell.setBackgroundColor(bg);
      dataCell.editAsText().setFontSize(10);
      dataCell.editAsText().setBold(false);
      dataCell.editAsText().setItalic(false);
      dataCell.editAsText().setForegroundColor('#333333');
      dataCell.setPaddingTop(4);
      dataCell.setPaddingBottom(4);
      dataCell.setPaddingLeft(8);
      dataCell.setPaddingRight(8);

      // Bold the first column in two-column tables (label column)
      if (numCols === 2 && c2 === 0) {
        dataCell.editAsText().setBold(true);
      }
    }
  }

  addSpacer(body);
  return table;
}

function formatNumber(n) {
  if (!n && n !== 0) return 'N/A';
  return Number(n).toLocaleString();
}

/**
 * Format a date value from the sheet (could be Date object or string) as MM/DD/YYYY.
 */
function formatDate(val) {
  if (!val) return 'N/A';
  var d = (val instanceof Date) ? val : new Date(val);
  if (isNaN(d.getTime())) return String(val);
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  var yyyy = d.getFullYear();
  return mm + '/' + dd + '/' + yyyy;
}

/**
 * Format a percentage value for display.
 */
function formatPct(n, decimals) {
  if (n === null || n === undefined || n === '') return 'N/A';
  var num = Number(n);
  if (isNaN(num)) return 'N/A';
  return num.toFixed(decimals !== undefined ? decimals : 1) + '%';
}
