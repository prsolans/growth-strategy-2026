/**
 * Orchestrates data extraction, LLM research, and Google Doc generation.
 */

// ── Docusign Brand Colors ─────────────────────────────────────────────
// Source: Docusign Brand Assets — Brand Colors
var DOCUSIGN_COBALT      = '#4C00FF';  // Primary brand — H1 headings, CTAs
var DOCUSIGN_POPPY       = '#FF5252';  // Accent/alert — H2 headings
var DOCUSIGN_DEEP_VIOLET = '#26065D';  // Primary dark — table headers
var DOCUSIGN_INKWELL     = '#130032';  // Deepest dark — near-black
var DOCUSIGN_MIST        = '#CBC2FF';  // Soft accent — borders, highlights
var DOCUSIGN_ECRU        = '#F8F3F0';  // Warm surface — alt row backgrounds
// Legacy references (kept for backward compat)
var DOCUSIGN_PURPLE      = '#1B0B3B';
var DOCUSIGN_GREEN       = '#00B388';

// ── Table styling ─────────────────────────────────────────────────────
var HEADER_BG     = DOCUSIGN_DEEP_VIOLET;  // Deep Violet header rows
var HEADER_FG     = '#FFFFFF';
var TABLE_ALT_BG  = DOCUSIGN_ECRU;         // Ecru alt rows
var TABLE_BORDER  = DOCUSIGN_MIST;          // Mist borders

// ── Special section column headers ───────────────────────────────────
var DOCUSIGN_TODAY_BG = DOCUSIGN_COBALT;   // Cobalt — "Docusign Today" column
var DOCUSIGN_TODAY_FG = '#FFFFFF';

// ── Chart / quadrant constants — brand-aligned ────────────────────────
var QUADRANT_COLORS = {
  'Negotiated':     DOCUSIGN_COBALT,       // Primary brand
  'Non-negotiated': DOCUSIGN_DEEP_VIOLET,  // Deep Violet
  'Form-based':     DOCUSIGN_MIST,         // Mist lavender
  'Regulatory':     DOCUSIGN_POPPY         // Poppy
};

var CONTRACT_TYPE_COLORS = {
  'Negotiated':     { bg: '#E4DAFF', fg: DOCUSIGN_INKWELL     },  // Cobalt light tint
  'Non-negotiated': { bg: DOCUSIGN_ECRU,   fg: DOCUSIGN_DEEP_VIOLET },  // Ecru + Deep Violet
  'Form-based':     { bg: '#EDE8FF', fg: DOCUSIGN_COBALT      },  // Mist tint + Cobalt text
  'Regulatory':     { bg: '#FFE5E5', fg: '#CC2222'             }   // Poppy light tint
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
  // Skip chart if fewer than 3 departments have parseable monetary values — not worth the 6s temp-sheet overhead
  var parseableCount = 0;
  for (var pi = 0; pi < departments.length; pi++) {
    if (parseMoneyValue(departments[pi].estimatedAnnualValue) > 0) parseableCount++;
  }
  if (parseableCount < 3) {
    Logger.log('[Chart] Skipping bar chart — fewer than 3 departments have parseable values (' + parseableCount + ')');
    return null;
  }
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
 * Add a branded header to the top of the document.
 * Layout: Row 1 — Docusign logo (left) | "Account Planning" title (center) | empty (right)
 *         Row 2 — Company name (left) | "Account Planning Report" italic (center) | Generated date (right)
 *         Followed by a horizontal rule divider.
 * @param {Body}   body         Document body
 * @param {string} companyName  Account name for the subtitle row
 * @param {boolean} isProspect  Prepends [PROSPECT] to company name if true
 */
function addDocumentHeader(body, companyName, isProspect) {
  var label = (isProspect ? '[PROSPECT] ' : '') + companyName;
  var dateStr = 'Generated ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMMM d, yyyy');

  // Decode logo blobs from base64 constants in Config.gs
  var logoBlob = null;
  try {
    logoBlob = Utilities.newBlob(Utilities.base64Decode(DOCUSIGN_LOGO_BASE64), 'image/png', 'docusign-logo.png');
  } catch (e) {
    Logger.log('[Header] Logo decode failed: ' + e.message);
  }

  var badgeBlob = null;
  try {
    badgeBlob = Utilities.newBlob(Utilities.base64Decode(GENIUS_BAR_LOGO_BASE64), 'image/png', 'genius-bar.png');
  } catch (e) {
    Logger.log('[Header] Badge decode failed: ' + e.message);
  }

  // Collapse the default empty paragraph Google Docs inserts before any appended content
  var defaultPara = body.getChild(0);
  if (defaultPara && defaultPara.getType() === DocumentApp.ElementType.PARAGRAPH) {
    defaultPara.asParagraph().setSpacingBefore(0);
    defaultPara.asParagraph().setSpacingAfter(0);
    defaultPara.asParagraph().editAsText().setFontSize(1);
  }

  // ── Logo ──────────────────────────────────────────────────────────────
  var logoPara = body.appendParagraph('');
  logoPara.setAlignment(DocumentApp.HorizontalAlignment.LEFT);
  logoPara.setSpacingBefore(4);
  logoPara.setSpacingAfter(4);
  if (logoBlob) {
    try {
      logoPara.appendInlineImage(logoBlob).setWidth(112).setHeight(23);
    } catch (e) {
      Logger.log('[Header] Logo insert failed: ' + e.message);
      logoPara.appendText('Docusign').editAsText().setBold(true);
    }
  }

  // ── Genius Bar badge (inline image, right of logo) ────────────────────
  // 1.05in × 0.28in → 76pt × 20pt
  if (badgeBlob) {
    try {
      logoPara.appendText(' ');
      logoPara.appendInlineImage(badgeBlob).setWidth(96).setHeight(25);
    } catch (e) {
      Logger.log('[Header] Badge insert failed: ' + e.message);
    }
  }

  // ── Company name ──────────────────────────────────────────────────────
  var namePara = body.appendParagraph(label);
  namePara.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  namePara.setSpacingBefore(8);
  namePara.setSpacingAfter(2);
  var nameText = namePara.editAsText();
  nameText.setFontSize(22);
  nameText.setBold(true);
  nameText.setForegroundColor(DOCUSIGN_PURPLE);

  // ── Subhead ───────────────────────────────────────────────────────────
  var subPara = body.appendParagraph('Account Planning Report');
  subPara.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  subPara.setSpacingBefore(0);
  subPara.setSpacingAfter(2);
  var subText = subPara.editAsText();
  subText.setFontSize(10);
  subText.setBold(false);
  subText.setItalic(true);
  subText.setForegroundColor('#666666');

  // ── Date ──────────────────────────────────────────────────────────────
  var datePara = body.appendParagraph(dateStr);
  datePara.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  datePara.setSpacingBefore(0);
  datePara.setSpacingAfter(12);
  var dateText = datePara.editAsText();
  dateText.setFontSize(9);
  dateText.setBold(false);
  dateText.setItalic(true);
  dateText.setForegroundColor('#666666');

  // ── Divider ───────────────────────────────────────────────────────────
  body.appendHorizontalRule();
  var spacer = body.appendParagraph('');
  spacer.setSpacingBefore(0);
  spacer.setSpacingAfter(8);
}

//AAH 3.23.2026
function notifyUserOfProgress (email, channelId, message){
  if (email != "" && channelId != ""){
    var slackWebhookUrl = "https://hooks.slack.com/triggers/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";

    var formData = {
      'channelId': channelId,
      'email' : email,
      'message' : message
    };

    var options = {
      'method' : 'post',
      'contentType': 'application/json',
      'payload' : JSON.stringify(formData)
    };
    var response = UrlFetchApp.fetch(slackWebhookUrl, options);
  }
}

/**
 * Generate an account planning report for the account matching the given Salesforce Account ID.
 * Looks up the account in the Full Data sheet, then delegates to generateAccountPlanningDoc().
 * @param {string} salesforceAccountId  e.g. "0014x000009XXXXAAA"
 * @returns {string} URL of the created Google Doc
 */
function generateReportByAccountId(salesforceAccountId, email, channelId, isProspect) {
  Logger.log('[DocGen] generateReportByAccountId called with: ' + salesforceAccountId);
  //AAH 3.24.2026
  var companyName;
  if (isProspect){
    companyName = salesforceAccountId;
  }
  else{
    companyName = findCompanyNameByAccountId(salesforceAccountId);
  }
  Logger.log('[DocGen] Resolved account ID "' + salesforceAccountId + '" → "' + companyName + '"');
  return generateAccountPlanningDoc(companyName, email, channelId, isProspect);
}

/**
 * Generate an account planning doc for all accounts in a GTM group.
 * Merges account data via getGtmGroupData() and delegates to generateAccountPlanningDoc().
 * @param {string} gtmGroupId  Value of the GTM_GROUP column (Salesforce group ID)
 * @param {string} email       Optional — for Slack progress notifications
 * @param {string} channelId   Optional — for Slack progress notifications
 * @returns {string} URL of the created Google Doc
 */
function generateAccountPlanningDocForGroup(gtmGroupId, email, channelId) {
  Logger.log('[DocGen] generateAccountPlanningDocForGroup called for ID: ' + gtmGroupId);
  var groupData = getGtmGroupData(gtmGroupId);
  return generateAccountPlanningDoc(groupData.identity.name, email || '', channelId || '', false, groupData);
}

/**
 * Main entry point: generate an account planning doc for one company.
 * @param {string} companyName
 * @returns {string} URL of the created Google Doc
 */
function generateAccountPlanningDoc(companyName, email, channelId, isProspect, prebuiltData) {
  Logger.log('Starting account planning generation for: ' + companyName + (isProspect ? ' [PROSPECT]' : ''));

  // ── Step 1: Extract internal data and run signal matching ─────────
  Logger.log('Extracting sheet data...');
  //AAH 3.23.2026
  notifyUserOfProgress (email, channelId, "Fetching consumption data..");
  var data = prebuiltData || getCompanyData(companyName, isProspect);
  var productSignals = generateProductSignals(data);
  var internalSummary = summarizeForLLM(data, productSignals);
  Logger.log('[DocGen] Internal data extracted. Industry: ' + data.context.industry +
    ' | Plan: ' + data.contract.plan + ' | Envelopes: ' + data.consumption.envelopesSent + '/' + data.consumption.envelopesPurchased);

  // ── Step 1.5: Enrich with public API data (SEC, Wikipedia, Wikidata) ──
  Logger.log('[DocGen] === DATA ENRICHMENT ===');
  //AAH 3.23.2026
  notifyUserOfProgress (email, channelId, "Fetching SEC, Wikipedia and Wikidata data..");
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
  //AAH 3.23.2026
  notifyUserOfProgress (email, channelId, "Researching company " + companyName + "..");
  var accountProfile;
  try {
    accountProfile = researchAccountProfile(data.identity.name, data.context.industry, enrichment);
    Logger.log('[DocGen] Call 1 succeeded. Keys: ' + (accountProfile ? Object.keys(accountProfile).join(', ') : 'null'));
  } catch (e) {
    Logger.log('[DocGen] Call 1 FAILED: ' + e.message);
    accountProfile = {};
  }

  //Logger.log ("[DEBUG] - Account profile before enriching");
  //Logger.log (JSON.stringify (accountProfile));

  // Post-LLM enforcement: overwrite any values the LLM got wrong
  try {
    accountProfile = enforceEnrichedData(accountProfile, enrichment);
  } catch (e) {
    Logger.log('[DocGen] Enrichment enforcement failed (non-fatal): ' + e.message);
  }

  //Logger.log ("[DEBUG] - Account profile after enriching");
  //Logger.log (JSON.stringify (accountProfile));

  // Calls 2+3+4: Business Map, Agreement Landscape, Contract Commerce (PARALLEL)
  //AAH 3.23.2026
  notifyUserOfProgress (email, channelId, "Generating Business Map, Agreement Landscape and Contract Commerce..");
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
  //AAH 3.23.2026
  notifyUserOfProgress (email, channelId, "Generating Priority Map..");
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
  //AAH 3.23.2026
  notifyUserOfProgress (email, channelId, "Generating Executive Briefing and Big Bet Initiatives..");
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
  //AAH 3.23.2026
  notifyUserOfProgress (email, channelId, "Generating Final Document..");
  Logger.log('[DocGen] Creating Google Doc...');
  var docTitle = (isProspect ? '[PROSPECT] ' : '') +
    data.identity.name + ' | Account Planning' +
    (data.isGtmGroup ? ' [GTM GROUP: ' + data.context.gtmGroup + ']' : '');
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

  // ── Header ────────────────────────────────────────────────────────────
  addDocumentHeader(body, data.identity.name, isProspect);

  // ── Build primary sections ───────────────────────────────────────────
  // Sections 1–3: internal account data (customer accounts only).
  // Sections 4–6: AI-synthesized strategy (shown for all accounts including prospects).

  if (!isProspect) {
    Logger.log('[DocGen] Building Section 1/6: Docusign Today');
    addDocusignTodayContractSection(body, data);
    body.appendPageBreak();

    Logger.log('[DocGen] Building Section 2/6: Product Adoption Opportunity');
    addProductAdoptionSection(body, data);
    body.appendPageBreak();

    Logger.log('[DocGen] Building Section 3/6: Account Health');
    addAccountHealthSection(body, data, false);
    body.appendPageBreak();
  }

  Logger.log('[DocGen] Building Section 4/6: Strategic Initiatives');
  addStrategicInitiativesSection(body, data, briefing, accountProfile);
  if (accountProfile && accountProfile.businessPerformance &&
      accountProfile.businessPerformance.strategicInitiatives &&
      accountProfile.businessPerformance.strategicInitiatives.length > 0) {
    body.appendPageBreak();
  }

  Logger.log('[DocGen] Building Section 5/6: Long Term Opportunity Map - Big Bets');
  addLongTermOpportunityMapSection(body, data, accountProfile, enrichment, businessMap, bigBets);
  body.appendPageBreak();

  Logger.log('[DocGen] Building Section 6/6: High Value - Top 3 Big Bets');
  addBigBetInitiativesSection(body, data, bigBets, accountProfile, contractCommerce);

  // ── Appendix: full supporting detail ─────────────────────────────────
  body.appendPageBreak();
  Logger.log('[DocGen] Building Appendix divider');
  addAppendixDivider(body);

  Logger.log('[DocGen] Appendix: Company Profile');
  addCompanyProfileSection(body, data, accountProfile, enrichment, businessMap);
  body.appendPageBreak();

  Logger.log('[DocGen] Appendix: Business Performance & Strategy');
  addBusinessPerformanceSection(body, data, accountProfile);
  body.appendPageBreak();

  Logger.log('[DocGen] Appendix: Executive Contacts & Technology');
  addExecutivesAndTechSection(body, data, accountProfile);
  body.appendPageBreak();

  Logger.log('[DocGen] Appendix: Priority Map');
  addPriorityMapSection(body, data, priorityMap, productSignals);
  body.appendPageBreak();

  Logger.log('[DocGen] Appendix: Agreement Landscape');
  addAgreementLandscapeSection(body, data, agreementLandscape, businessMap);
  body.appendPageBreak();

  Logger.log('[DocGen] Appendix: Contract Commerce Estimate');
  addContractCommerceSection(body, data, contractCommerce);
  body.appendPageBreak();

  Logger.log('[DocGen] Appendix: Docusign Footprint');
  addDocusignTodaySection(body, data, priorityMap, isProspect);
  body.appendPageBreak();

  Logger.log('[DocGen] Appendix: Executive Meeting Briefing');
  addExecutiveBriefingSection(body, data, briefing);
  body.appendPageBreak();

  Logger.log('[DocGen] Appendix: Big Bet Detail');
  addBigBetsDetailSection(body, data, bigBets);
  body.appendPageBreak();

  Logger.log('[DocGen] Appendix: Data Sources & Methodology');
  addDataSourcesSection(body, enrichment);

  Logger.log('[DocGen] Saving and closing doc...');
  doc.saveAndClose();

  var docUrl = doc.getUrl();
  Logger.log('[DocGen] COMPLETE. Doc URL: ' + docUrl);
  return docUrl;
}


// ═══════════════════════════════════════════════════════════════════════
// Glean Path: doc builder that consumes pre-built Glean analysis JSON
// ═══════════════════════════════════════════════════════════════════════

/**
 * Build the account planning Google Doc from a Glean V3 analysis JSON.
 * Skips all LLM calls — the Glean agent has already performed research and
 * synthesis. The JSON keys map directly to the existing section builder functions.
 *
 * @param {string}  companyName    Display name for the doc title
 * @param {Object}  gleanAnalysis  Parsed JSON from Glean (accountProfile, businessMap,
 *                                 agreementLandscape, contractCommerce, priorityMap,
 *                                 briefing, bigBets)
 * @param {Object}  data           Internal bookscrub data from getCompanyData()
 * @param {Object}  productSignals Signal map from generateProductSignals()
 * @param {Object}  enrichment     Public enrichment from enrichCompanyData()
 * @param {string}  email          For Slack progress notifications (pass '' to skip)
 * @param {string}  channelId      For Slack progress notifications (pass '' to skip)
 * @param {boolean} isProspect
 * @returns {string} Google Doc URL
 */
function generateAccountPlanningDocFromGlean(companyName, gleanAnalysis, data, productSignals, enrichment, email, channelId, isProspect) {
  Logger.log('[GleanDoc] Starting Glean-path doc generation for: ' + companyName +
    (data.isGtmGroup ? ' [GTM GROUP]' : '') + (isProspect ? ' [PROSPECT]' : ''));

  // ── Extract section variables from Glean analysis ─────────────────
  var accountProfile     = (gleanAnalysis && gleanAnalysis.accountProfile)     || {};
  var businessMap        = (gleanAnalysis && gleanAnalysis.businessMap)        || {};
  var agreementLandscape = (gleanAnalysis && gleanAnalysis.agreementLandscape) || {};
  var contractCommerce   = (gleanAnalysis && gleanAnalysis.contractCommerce)   || {};
  var priorityMap        = (gleanAnalysis && gleanAnalysis.priorityMap)        || {};
  var briefing           = (gleanAnalysis && gleanAnalysis.briefing)           || {};
  var bigBets            = (gleanAnalysis && gleanAnalysis.bigBets)            || {};

  Logger.log('[GleanDoc] Sections unpacked. accountProfile keys: ' + Object.keys(accountProfile).join(', '));
  Logger.log('[GleanDoc] businessMap nodes: ' + (businessMap.nodes ? businessMap.nodes.length : 0));
  Logger.log('[GleanDoc] agreementLandscape agreements: ' + (agreementLandscape.agreements ? agreementLandscape.agreements.length : 0));
  Logger.log('[GleanDoc] bigBets: ' + (bigBets.bigBets ? bigBets.bigBets.length : 0));

  // Fallback: if Glean returned no agreements, use deterministic generator
  if (!agreementLandscape.agreements || agreementLandscape.agreements.length === 0) {
    Logger.log('[GleanDoc] No agreements in Glean response — using deterministic fallback.');
    agreementLandscape = generateFallbackAgreementLandscape(data, accountProfile, businessMap);
    Logger.log('[GleanDoc] Fallback generated ' + agreementLandscape.agreements.length + ' agreements.');
  }

  // ── Create the Google Doc ─────────────────────────────────────────
  notifyUserOfProgress(email, channelId, 'Generating Final Document..');

  var docTitle = (isProspect ? '[PROSPECT] ' : '') +
    data.identity.name + ' | Account Planning' +
    (data.isGtmGroup ? ' [GTM GROUP: ' + data.context.gtmGroup + ']' : '');
  var doc = DocumentApp.create(docTitle);

  try {
    var folderId = getOutputFolder();
    var file = DriveApp.getFileById(doc.getId());
    DriveApp.getFolderById(folderId).addFile(file);
    DriveApp.getRootFolder().removeFile(file);
  } catch (e) {
    Logger.log('[GleanDoc] Could not move to output folder: ' + e.message + '. Doc stays in root.');
  }

  var body = doc.getBody();
  body.setMarginTop(36);
  body.setMarginBottom(36);
  body.setMarginLeft(48);
  body.setMarginRight(48);

  // ── Primary sections (front material only — no appendix) ─────────
  Logger.log('[GleanDoc] Building document header');
  addDocumentHeader(body, data.identity.name, isProspect);

  if (!isProspect) {
    Logger.log('[GleanDoc] Building: Docusign Today Contract');
    addDocusignTodayContractSection(body, data);
    body.appendPageBreak();

    Logger.log('[GleanDoc] Building: Product Adoption');
    addProductAdoptionSection(body, data);
    body.appendPageBreak();

    Logger.log('[GleanDoc] Building: Account Health');
    addAccountHealthSection(body, data, false);
    body.appendPageBreak();
  }

  Logger.log('[GleanDoc] Building: Strategic Initiatives');
  addStrategicInitiativesSection(body, data, briefing, accountProfile);
  if (accountProfile && accountProfile.businessPerformance &&
      accountProfile.businessPerformance.strategicInitiatives &&
      accountProfile.businessPerformance.strategicInitiatives.length > 0) {
    body.appendPageBreak();
  }

  Logger.log('[GleanDoc] Building: Long Term Opportunity Map');
  addLongTermOpportunityMapSection(body, data, accountProfile, enrichment, businessMap, bigBets);
  body.appendPageBreak();

  Logger.log('[GleanDoc] Building: Big Bet Initiatives');
  addBigBetInitiativesSection(body, data, bigBets, accountProfile, contractCommerce);
  body.appendPageBreak();

  Logger.log('[GleanDoc] Building: Big Bet Detail');
  addBigBetsDetailSection(body, data, bigBets);
  body.appendPageBreak();

  Logger.log('[GleanDoc] Building: Executive Meeting Briefing');
  addExecutiveBriefingSection(body, data, briefing);
  body.appendPageBreak();

  // ── Appendix: full supporting detail (V4 JSON — all appendix sections) ──
  Logger.log('[GleanDoc] Building appendix divider');
  addAppendixDivider(body);

  Logger.log('[GleanDoc] Appendix: Company Profile');
  addCompanyProfileSection(body, data, accountProfile, enrichment, businessMap);
  body.appendPageBreak();

  Logger.log('[GleanDoc] Appendix: Business Performance & Strategy');
  addBusinessPerformanceSection(body, data, accountProfile);
  body.appendPageBreak();

  Logger.log('[GleanDoc] Appendix: Executive Contacts & Technology');
  addExecutivesAndTechSection(body, data, accountProfile);
  body.appendPageBreak();

  Logger.log('[GleanDoc] Appendix: Agreement Landscape');
  addAgreementLandscapeSection(body, data, agreementLandscape, businessMap);
  body.appendPageBreak();

  Logger.log('[GleanDoc] Appendix: Contract Commerce Estimate');
  addContractCommerceSection(body, data, contractCommerce);
  body.appendPageBreak();

  Logger.log('[GleanDoc] Appendix: Data Sources & Methodology');
  addDataSourcesSection(body, enrichment);

  Logger.log('[GleanDoc] Saving and closing doc...');
  doc.saveAndClose();

  var docUrl = doc.getUrl();
  Logger.log('[GleanDoc] COMPLETE. Doc URL: ' + docUrl);
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
    titlePara.editAsText().setForegroundColor(DOCUSIGN_DEEP_VIOLET);
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
function addBigBetInitiativesSection(body, data, bigBets, accountProfile, contractCommerce) {
  if (!bigBets || !bigBets.bigBets || bigBets.bigBets.length === 0) return;

  addSectionHeading(body, 'High Value - Top 3 Big Bets');
  addSectionDescription(body, 'Sources: AI-generated strategic analysis combining SEC EDGAR financials, internal Docusign usage signals, agreement landscape estimates, and strategic initiative research. Dollar figures and ROI projections are LLM estimates grounded in company financials but not independently verified.');

  // Sort all bets by opportunityScore descending; top 3 shown in matrix.
  var bets = bigBets.bigBets.slice().sort(function(a, b) {
    return (Number(b.opportunityScore) || 0) - (Number(a.opportunityScore) || 0);
  });
  var top3Bets = bets.slice(0, 3);

  var buList = (accountProfile && accountProfile.businessUnits) || [];
  var deptList = (contractCommerce && contractCommerce.commerceByDepartment) || [];

  // Fuzzy BU name match: exact first, then substring in either direction.
  function findMatchingBU(betBUName) {
    if (!betBUName || !buList.length) return null;
    var betLower = betBUName.toLowerCase().trim();
    for (var i = 0; i < buList.length; i++) {
      if ((buList[i].name || '').toLowerCase().trim() === betLower) return buList[i];
    }
    for (var j = 0; j < buList.length; j++) {
      var buLower = (buList[j].name || '').toLowerCase().trim();
      if (buLower && (betLower.indexOf(buLower) !== -1 || buLower.indexOf(betLower) !== -1)) {
        return buList[j];
      }
    }
    return null;
  }

  // Build Size and Scope from matched BU data, falling back through contract commerce
  // then the LLM-generated field.
  function buildSizeAndScope(bet, matchedBU) {
    var parts = [];
    if (matchedBU) {
      if (matchedBU.segmentRevenue) parts.push(matchedBU.segmentRevenue);
      if (matchedBU.customerCount) parts.push(matchedBU.customerCount + ' customers');
    }
    if (parts.length === 0) {
      var betLower = (bet.targetBusinessUnit || '').toLowerCase();
      for (var i = 0; i < deptList.length; i++) {
        var dLower = (deptList[i].department || '').toLowerCase();
        if (dLower && (betLower.indexOf(dLower) !== -1 || dLower.indexOf(betLower) !== -1)) {
          if (deptList[i].estimatedAnnualValue) parts.push(deptList[i].estimatedAnnualValue);
          break;
        }
      }
    }
    if (parts.length === 0) {
      return bet.sizeAndScope || bet.estimatedAnnualValue || '—';
    }
    return parts.join(' | ');
  }

  // ── Summary matrix table (top 3 by opportunityScore) ────────────────
  // Transposed format: rows = attributes, columns = each big bet.
  if (top3Bets.length > 0) {
    var matrixRows = [
      // Header row: label col + one col per bet
      ['Big Bet'].concat(top3Bets.map(function(b, i) {
        return (i + 1) + '. ' + (b.title || 'Initiative ' + (i + 1));
      })),
      ['Timing'].concat(top3Bets.map(function() { return ''; })),
      ['BU Name'].concat(top3Bets.map(function(b) {
        var matched = findMatchingBU(b.targetBusinessUnit);
        return (matched && matched.name) || b.targetBusinessUnit || '—';
      })),
      ['Use Case'].concat(top3Bets.map(function(b) { return b.useCase || '—'; })),
      ['IAM Solution'].concat(top3Bets.map(function(b) {
        var sol = b.solution || {};
        var products = (sol.primaryProducts || []).join(', ');
        return products || sol.description || '—';
      })),
      ['Why change'].concat(top3Bets.map(function(b) { return b.painPoint || '—'; })),
      ['Size and Scope'].concat(top3Bets.map(function(b) {
        return buildSizeAndScope(b, findMatchingBU(b.targetBusinessUnit));
      }))
    ];

    var matrixTable = safeAppendTable(body, matrixRows);
    matrixTable.setBorderColor('#CCCCCC');
    matrixTable.setBorderWidth(1);

    var numCols = matrixRows[0].length;

    // Column widths: label col narrower, data cols share remaining 516pt
    var labelColWidth = 100;
    var dataColWidth = Math.floor((516 - labelColWidth) / (numCols - 1));
    matrixTable.setColumnWidth(0, labelColWidth);
    for (var mw = 1; mw < numCols; mw++) {
      matrixTable.setColumnWidth(mw, dataColWidth);
    }

    for (var mr = 0; mr < matrixTable.getNumRows(); mr++) {
      var mRow = matrixTable.getRow(mr);
      var isHeader = (mr === 0);
      var rowBg = isHeader ? HEADER_BG : ((mr % 2 === 0) ? TABLE_ALT_BG : '#FFFFFF');

      for (var mc = 0; mc < numCols; mc++) {
        var mCell = mRow.getCell(mc);
        var isLabelCol = (mc === 0);

        mCell.setBackgroundColor(rowBg);
        mCell.editAsText().setForegroundColor(isHeader ? HEADER_FG : '#333333');
        mCell.editAsText().setBold(isHeader || isLabelCol);
        mCell.editAsText().setItalic(false);
        mCell.editAsText().setFontSize(10);

        mCell.setPaddingTop(isHeader ? 6 : 4);
        mCell.setPaddingBottom(isHeader ? 6 : 4);
        mCell.setPaddingLeft(8);
        mCell.setPaddingRight(8);
      }
    }

    // Teal styling on the "Timing" label cell (row 1, col 0) — matches LTOM "Docusign Today" header
    var timingLabelCell = matrixTable.getRow(1).getCell(0);
    timingLabelCell.setBackgroundColor(DOCUSIGN_TODAY_BG);
    timingLabelCell.editAsText().setForegroundColor(DOCUSIGN_TODAY_FG);

    addSpacer(body);
  }

}

/**
 * Appendix: Big Bet detail cards — one per bet with full narrative.
 */
function addBigBetsDetailSection(body, data, bigBets) {
  if (!bigBets || !bigBets.bigBets || bigBets.bigBets.length === 0) return;

  var allBets = bigBets.bigBets.slice().sort(function(a, b) {
    return (Number(b.opportunityScore) || 0) - (Number(a.opportunityScore) || 0);
  });
  var totalBets = allBets.length;

  addSectionHeading(body, 'Big Bets by Business Unit — Full Detail (' + totalBets + ' initiatives)');
  addSectionDescription(body, 'Sources: AI-generated strategic analysis combining SEC EDGAR financials, internal Docusign usage signals, agreement landscape estimates, and strategic initiative research. One initiative per business unit, ranked by opportunity score. Dollar figures and ROI projections are LLM estimates grounded in company financials but not independently verified.');

  allBets.forEach(function(bet) {
    // ── Title ────────────────────────────────────────────────────
    var scoreLabel = bet.opportunityScore ? ' [Score: ' + bet.opportunityScore + '/10]' : '';
    var titleText = 'Big Bet #' + (bet.number || '') + ': ' + (bet.title || 'Initiative') + scoreLabel;
    var titlePara = body.appendParagraph(titleText);
    titlePara.setHeading(DocumentApp.ParagraphHeading.HEADING2);
    titlePara.editAsText().setFontSize(15);
    titlePara.editAsText().setBold(true);
    titlePara.editAsText().setItalic(false);
    titlePara.editAsText().setForegroundColor(DOCUSIGN_DEEP_VIOLET);
    titlePara.setSpacingBefore(12);
    titlePara.setSpacingAfter(4);

    // ── Metadata line ────────────────────────────────────────────
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

    // ── Why This Big Bet ─────────────────────────────────────────
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

// ═══════════════════════════════════════════════════════════════════════
// Primary Section Builders (front matter — extracted from full sections)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Primary Section 1: Docusign Today — Contract & Account table only.
 */
function addDocusignTodayContractSection(body, data) {
  addSectionHeading(body, 'Docusign Today');
  addSectionDescription(body, 'Sources: Internal Docusign Book of Business. All metrics are verified internal data.');
  addSourceNote(body, 'Source: Docusign Book of Business · Internal account data');

  if (data.isGtmGroup && data.accounts && data.accounts.length > 0) {
    // GTM GROUP: show per-account summary, group context, and consumption — no Contract & Account
    addSubHeading(body, 'Accounts in GTM Group (' + data.accounts.length + ')');
    var groupHeader = ['Account', 'Plan', 'Contract Term', 'Term %', 'ACV', 'Seats (Purch / Active)', 'Envelopes Sent'];
    var groupRows = [groupHeader];
    data.accounts.forEach(function(acc) {
      var term = formatDate(acc.contract.termStart) + ' \u2013 ' + formatDate(acc.contract.termEnd);
      var acv = acc.financial.acv ? '$' + formatNumber(acc.financial.acv) : 'N/A';
      var seats = formatNumber(acc.seats.purchased) + ' / ' + formatNumber(acc.seats.active);
      groupRows.push([
        acc.identity.name,
        acc.contract.plan || 'N/A',
        term,
        formatTermCompletion(acc.contract.percentComplete),
        acv,
        seats,
        formatNumber(acc.consumption.envelopesSent)
      ]);
    });
    groupRows.push([
      'GROUP TOTAL', '—', '—', '—',
      '$' + formatNumber(data.financial.acv),
      formatNumber(data.seats.purchased) + ' / ' + formatNumber(data.seats.active),
      formatNumber(data.consumption.envelopesSent)
    ]);
    addStyledTable(body, groupRows);

    addSubHeading(body, 'Group Context');
    addStyledTable(body, [
      ['Field', 'Value'],
      ['Industry',      data.context.industry || 'N/A'],
      ['Region',        data.context.region || 'N/A'],
      ['Sales Channel', data.context.salesChannel || 'N/A'],
      ['Total ACV',     '$' + formatNumber(data.financial.acv)]
    ]);

    addSubHeading(body, 'Consumption & Usage');
    var consRows = [['Account', 'Env Purchased', 'Env Sent', 'Pacing %', 'Usage Trend']];
    var totalPurch = 0, totalSent = 0;
    data.accounts.forEach(function(acc) {
      var purch = acc.consumption.envelopesPurchased || 0;
      var sent  = acc.consumption.envelopesSent || 0;
      var pacing = purch > 0 ? ((sent / purch) * 100).toFixed(1) + '%' : 'N/A';
      totalPurch += purch;
      totalSent  += sent;
      consRows.push([
        acc.identity.name,
        formatNumber(purch),
        formatNumber(sent),
        pacing,
        acc.consumption.usageTrend || 'N/A'
      ]);
    });
    var groupPacing = totalPurch > 0 ? ((totalSent / totalPurch) * 100).toFixed(1) + '%' : 'N/A';
    consRows.push(['GROUP TOTAL', formatNumber(totalPurch), formatNumber(totalSent), groupPacing, '—']);
    addStyledTable(body, consRows);
    return;
  }

  addSubHeading(body, 'Contract & Account');
  var contractRows = [
    ['Field', 'Value'],
    ['Docusign Plan',          data.contract.plan || 'N/A'],
    ['Contract Term',          formatDate(data.contract.termStart) + ' - ' + formatDate(data.contract.termEnd)],
    ['Term Completion',        formatTermCompletion(data.contract.percentComplete)],
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

  if (data.contract.percentComplete > 100) {
    var dateNote = body.appendParagraph(
      '\u26A0\uFE0F  Contract dates are sourced from the bookscrub and reflect this specific Docusign account record. ' +
      'For enterprises with multiple accounts, the term shown may not match the primary renewal date in Salesforce. ' +
      'Verify the renewal date directly before presenting to stakeholders.'
    );
    dateNote.editAsText().setFontSize(9).setForegroundColor('#92400E').setItalic(true);
    dateNote.setSpacingBefore(4).setSpacingAfter(0);
  }
}

/**
 * Primary Section 2: Product Adoption Opportunity — active and unused products.
 */
function addProductAdoptionSection(body, data) {
  addSectionHeading(body, 'Product Adoption Opportunity');
  addSectionDescription(body, 'Sources: Internal Docusign Book of Business (product activation data). Unused products represent upsell and expansion opportunities.');
  addSourceNote(body, 'Source: Docusign Book of Business · Product activation data');

  var activeText;
  var unusedProducts;
  if (data.isGtmGroup && data.accounts && data.accounts.length > 0) {
    var productCounts = {};
    data.accounts.forEach(function(acc) {
      acc.activeProducts.forEach(function(p) { productCounts[p] = (productCounts[p] || 0) + 1; });
    });
    activeText = data.activeProducts.length > 0
      ? data.activeProducts.map(function(p) { return '\u2022 ' + p + ' (' + (productCounts[p] || 0) + ')'; }).join('\n')
      : 'None';
    // Derive unused as all known products not in the active union
    unusedProducts = Object.keys(data.products || {}).filter(function(p) {
      return !productCounts[p];
    }).sort();
  } else {
    activeText = data.activeProducts.length > 0
      ? data.activeProducts.map(function(p) { return '\u2022 ' + p; }).join('\n')
      : 'None';
    unusedProducts = data.inactiveProducts;
  }
  var unusedText = unusedProducts.length > 0 ? unusedProducts.map(function(p) { return '\u2022 ' + p; }).join('\n') : 'All products active';

  var ptTable = safeAppendTable(body, [
    ['Active Products', 'Unused / Available for Expansion'],
    [activeText, unusedText]
  ]);
  ptTable.setBorderColor('#CCCCCC');
  ptTable.setBorderWidth(1);
  ptTable.setColumnWidth(0, 258);
  ptTable.setColumnWidth(1, 258);

  // Header row
  var hRow = ptTable.getRow(0);
  for (var h = 0; h < 2; h++) {
    var hCell = hRow.getCell(h);
    hCell.setBackgroundColor(HEADER_BG);
    hCell.editAsText().setForegroundColor(HEADER_FG);
    hCell.editAsText().setBold(true);
    hCell.editAsText().setItalic(false);
    hCell.editAsText().setFontSize(10);
    hCell.setPaddingTop(6); hCell.setPaddingBottom(6);
    hCell.setPaddingLeft(8); hCell.setPaddingRight(8);
  }

  // Content row
  var cRow = ptTable.getRow(1);
  for (var c = 0; c < 2; c++) {
    var cCell = cRow.getCell(c);
    cCell.setBackgroundColor('#FFFFFF');
    cCell.editAsText().setFontSize(10);
    cCell.editAsText().setBold(false);
    cCell.editAsText().setItalic(false);
    cCell.editAsText().setForegroundColor('#333333');
    cCell.setPaddingTop(6); cCell.setPaddingBottom(6);
    cCell.setPaddingLeft(8); cCell.setPaddingRight(8);
  }

  addSpacer(body);
}

/**
 * Primary Section 4: Strategic Initiatives — customer's own strategic priorities.
 * Exclusively customer POV: what the customer is pursuing. No Docusign framing.
 */
function addStrategicInitiativesSection(body, data, briefing, accountProfile) {
  var initiatives = (accountProfile &&
                     accountProfile.businessPerformance &&
                     accountProfile.businessPerformance.strategicInitiatives) || [];
  if (initiatives.length === 0) return;

  addSectionHeading(body, 'Strategic Initiatives');
  addSectionDescription(body, 'Customer\'s active strategic priorities based on external research. This is their agenda — no Docusign framing.');

  initiatives.forEach(function(init, idx) {
    var titleText = (idx + 1) + '. ' + (init.title || 'Initiative ' + (idx + 1));
    var titlePara = body.appendParagraph(titleText);
    titlePara.setHeading(DocumentApp.ParagraphHeading.NORMAL);
    titlePara.editAsText().setFontSize(13);
    titlePara.editAsText().setBold(true);
    titlePara.editAsText().setForegroundColor(DOCUSIGN_DEEP_VIOLET);
    titlePara.setSpacingBefore(12);
    titlePara.setSpacingAfter(4);

    if (init.description) {
      var descPara = body.appendParagraph(init.description);
      descPara.editAsText().setFontSize(11);
      descPara.setSpacingBefore(0);
      descPara.setSpacingAfter(4);
    }

    if (init.timeframe) {
      var tfPara = body.appendParagraph('Timeframe: ' + init.timeframe);
      tfPara.editAsText().setFontSize(10);
      tfPara.editAsText().setItalic(true);
      tfPara.editAsText().setForegroundColor('#666666');
      tfPara.setSpacingBefore(0);
      tfPara.setSpacingAfter(8);
    }
  });
}

/**
 * Primary Section 5: Long Term Opportunity Map - Big Bets — Business Units strategic overview table.
 */
function addLongTermOpportunityMapSection(body, data, accountProfile, enrichment, businessMap, bigBets) {
  addSectionHeading(body, 'Long Term Opportunity Map - Big Bets');
  addSectionDescription(body, 'Sources: Glean AI research (Google Gemini web search) for business unit structure and strategic context. Agreement intensity from org hierarchy analysis. Big Bet columns derived from strategic initiative and big bet research. Docusign Today column left blank for AE completion.');

  var ap = accountProfile || {};
  var bus = ap.businessUnits || [];
  var bmNodes = (businessMap && businessMap.nodes) || [];
  var bets = ((bigBets && bigBets.bigBets) || []).slice().sort(function(a, b) {
    return (Number(b.opportunityScore) || 0) - (Number(a.opportunityScore) || 0);
  });

  if (bets.length === 0) {
    addBodyText(body, 'Big bet data not available.');
    return;
  }

  // Build BU-level intensity lookup from Business Map
  var buIntensityMap = {};
  bmNodes.forEach(function(node) {
    if ((node.level || '').toLowerCase() === 'bu') {
      var key = (node.name || '').toLowerCase().trim();
      var raw = node.agreementIntensity || '';
      buIntensityMap[key] = raw.charAt(0).toUpperCase() + raw.slice(1);
    }
  });

  // Fuzzy intensity lookup — exact key first, then substring
  function findIntensity(name) {
    if (!name) return '';
    var nLower = name.toLowerCase().trim();
    if (buIntensityMap[nLower]) return buIntensityMap[nLower];
    for (var key in buIntensityMap) {
      if (key && (key.indexOf(nLower) !== -1 || nLower.indexOf(key) !== -1)) return buIntensityMap[key];
    }
    return '';
  }

  // Fuzzy lookup: find account profile BU matching a bet's targetBusinessUnit
  function findApBU(betBUName) {
    if (!betBUName || !bus.length) return null;
    var nLower = betBUName.toLowerCase().trim();
    for (var i = 0; i < bus.length; i++) {
      var bLower = (bus[i].name || '').toLowerCase().trim();
      if (bLower === nLower || bLower.indexOf(nLower) !== -1 || nLower.indexOf(bLower) !== -1) return bus[i];
    }
    return null;
  }

  // Table driven by bigBets so all data columns are guaranteed to populate.
  // BU Name | BU Offering | Major Company Initiative | Executive Sponsor | Agreement Intensity | Docusign Opportunity | Docusign Today
  var buRows = [['BU Name', 'BU Offering', 'Major Company Initiative', 'Executive Sponsor', 'Agreement Intensity', 'Docusign Opportunity', 'Docusign Today']];
  bets.forEach(function(bet) {
    var buName = bet.targetBusinessUnit || '';
    var isCorporate = /corporate|shared services/i.test(buName);
    var apBU = findApBU(buName);
    var offering = (apBU && apBU.offering) || (isCorporate ? 'Legal, Finance, HR, Operations, Etc.' : '');
    var intensity = findIntensity(buName) || (apBU ? findIntensity(apBU.name || '') : '');
    var initiative = bet.companyInitiative || '';
    var sponsor = bet.executiveSponsor || '';
    var opportunity = ((bet.solution && bet.solution.primaryProducts) || []).join(', ') || (bet.solution && bet.solution.description) || '';
    buRows.push([buName, offering, initiative, sponsor, intensity, opportunity, '']);
  });

  var buTable = addStyledTable(body, buRows);

  // Custom column widths for 7-column LTOM table (sum = 516pt)
  // Proportioned so "Opportunity", "Initiative", "Offering" headers don't break mid-word
  var ltomColWidths = [68, 82, 80, 76, 68, 82, 60];
  for (var lw = 0; lw < ltomColWidths.length; lw++) {
    buTable.setColumnWidth(lw, ltomColWidths[lw]);
  }

  // Teal background for "Docusign Today" header cell (last column)
  var lastHeaderCell = buTable.getRow(0).getCell(buRows[0].length - 1);
  lastHeaderCell.setBackgroundColor(DOCUSIGN_TODAY_BG);
  lastHeaderCell.editAsText().setForegroundColor(DOCUSIGN_TODAY_FG);

  addSourceNote(body, 'Source: AI-generated research (Bing-grounded) · Big Bet columns from strategic analysis');
}

/**
 * Appendix divider — rendered as a section heading to mark the start of supporting detail.
 */
function addAppendixDivider(body) {
  addSectionHeading(body, 'Appendix');
  addSectionDescription(body, 'Full supporting detail for the analysis and recommendations presented above.');
}

/**
 * Company Profile section
 */
function addCompanyProfileSection(body, data, accountProfile, enrichment, businessMap) {
  addSectionHeading(body, 'Company Profile');
  addSectionDescription(body, 'Sources: SEC EDGAR 10-K filings (revenue, employees, segment data), Wikipedia (company overview), Wikidata (CEO, HQ, founding date), and Glean AI research via Google Gemini web search (business units, customer base, supply chain). Verified data is labeled per sub-table; AI-generated fields are marked accordingly.');

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
      var isCorporate = /corporate|shared services/i.test(bu.name || '');
      var offeringValue = bu.offering || (isCorporate ? 'Legal, Finance, HR, Operations, Etc.' : '');
      buRows.push([
        bu.name || '',
        offeringValue,
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
  addSectionDescription(body, 'Sources: Glean AI research (Google Gemini web search). Three-year trends, highlights, strategic initiatives, and SWOT analysis are AI-generated based on publicly available information. Financial trend claims should be cross-checked against SEC filings in the Company Profile section.');

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

    var swotTable = safeAppendTable(body, [
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
  addSectionDescription(body, 'Sources: Glean AI research (Google Gemini web search). Executive names, titles, technology stack, and SI partnerships are AI-identified from public sources. Verify executive contacts and titles before outreach as these may be outdated.');

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
function addDocusignTodaySection(body, data, strategy, isProspect) {
  addSectionHeading(body, 'Docusign Footprint');
  if (isProspect) {
    addSectionDescription(body, 'This is a prospect account with no existing Docusign footprint. Typical use cases below are LLM-inferred based on industry and company research.');
  } else {
    addSectionDescription(body, 'Sources: Internal Docusign Book of Business (contract terms, consumption metrics, seat usage, integrations). Current use cases are LLM-synthesized from internal product adoption data. All quantitative metrics are verified internal data.');
    addSourceNote(body, 'Source: Docusign Book of Business · All metrics derived from internal account data');
  }

  // ── Current Use Cases (from LLM synthesis) ──────────────────────
  addSubHeading(body, 'Current Use Cases');

  var useCases = (strategy && strategy.currentUseCases) || {};

  var bullets = [];
  if (!isProspect) {
    bullets.push('Docusign Products: ' + data.activeProducts.join(', '));
  }
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

  if (!isProspect) {
  // ── Contract & Account ──────────────────────────────────────────
  // GTM groups: Accounts, Group Context, and Consumption tables are in Section 1 — skip here.
  if (!data.isGtmGroup) {
    addSubHeading(body, 'Contract & Account');
    var contractRows = [
      ['Field', 'Value'],
      ['Salesforce Account ID',  data.identity.salesforceAccountId || 'N/A'],
      ['Docusign Plan',          data.contract.plan || 'N/A'],
      ['Contract Term',          formatDate(data.contract.termStart) + ' - ' + formatDate(data.contract.termEnd)],
      ['Term Completion',        formatTermCompletion(data.contract.percentComplete)],
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
  }

  // ── Consumption & Usage ─────────────────────────────────────────
  // GTM groups: already rendered in the top block above; skip here.
  if (!data.isGtmGroup) {
    addSubHeading(body, 'Consumption & Usage');
    var consumptionPct = data.consumption.envelopesPurchased > 0
      ? ((data.consumption.envelopesSent / data.consumption.envelopesPurchased) * 100).toFixed(1) + '%'
      : 'N/A';
    var consumptionRows = [
      ['Metric', 'Value'],
      ['Envelopes Purchased',    formatNumber(data.consumption.envelopesPurchased)],
      ['Envelopes Sent (Total)', formatNumber(data.consumption.envelopesSent)],
      ['Consumption Pacing',     consumptionPct],
      ['Usage Trend',            data.consumption.usageTrend || 'N/A'],
      ['Send Velocity (MoM)',    String(data.consumption.sendVelocityMom || 'N/A')]
    ];
    addStyledTable(body, consumptionRows);
  }

  // ── Transaction Health ──────────────────────────────────────────
  addSubHeading(body, 'Transaction Health');

  var healthRows = [
    ['Metric', 'Value'],
    ['% Declined',       formatPct(data.consumption.pctDeclined)],
    ['% Voided',         formatPct(data.consumption.pctVoided)],
    ['% Expired',        formatPct(data.consumption.pctExpired)]
  ];
  addStyledTable(body, healthRows);

  // ── Seats ───────────────────────────────────────────────────────
  addSubHeading(body, 'Seats');

  var seatRows = [
    ['Metric', 'Value'],
    ['Seats Purchased',  formatNumber(data.seats.purchased)],
    ['Active Seats',     formatNumber(data.seats.active)],
    ['Seat Activation %', formatPct(data.seats.activationRate)],
    ['Active Seats MoM', String(data.seats.activeSeatsMom || 'N/A')]
  ];
  addStyledTable(body, seatRows);

  // ── Integrations ────────────────────────────────────────────────
  addSubHeading(body, 'Integrations (' + data.integrations.count + ' detected)');

  var intRows = [
    ['Integration', 'Envelopes'],
    ['Salesforce',                formatNumber(data.integrations.salesforce)],
    ['Workday',                   formatNumber(data.integrations.workday)],
    ['SAP',                       formatNumber(data.integrations.sap)],
    ['Custom API',                formatNumber(data.integrations.customApi) + (data.integrations.pctCustomApi ? ' (' + formatPct(data.integrations.pctCustomApi) + ')' : '')],
    ['PowerForms',                formatNumber(data.integrations.powerforms)],
    ['Bulk Send',                 formatNumber(data.integrations.bulkSend)],
    ['Web App Sends (Annual)',    formatNumber(data.integrations.webappSends)],
    ['Automation Sends (Annual)', formatNumber(data.integrations.automationSends)]
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
  } // end if (!isProspect)
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
  var rawTermPct = data.contract.percentComplete;
  var termElapsed = rawTermPct > 100;
  var termPct = termElapsed ? 100 : rawTermPct;   // cap at 100 for pacing ratio
  var termNote = termElapsed ? ' Contract term has elapsed (' + rawTermPct.toFixed(0) + '% completed).' : '';

  var consumptionPct = data.consumption.envelopesPurchased > 0
    ? (data.consumption.envelopesSent / data.consumption.envelopesPurchased) * 100
    : null;

  if (consumptionPct !== null && termPct > 0) {
    var pacingRatio = consumptionPct / termPct;
    if (pacingRatio >= 0.9) {
      results.consumptionPacing = assessHealth('green', 'On Track',
        'Consumption at ' + consumptionPct.toFixed(0) + '% vs ' + termPct.toFixed(0) + '% through term (' + pacingRatio.toFixed(2) + 'x ratio).' + termNote);
    } else if (pacingRatio >= 0.6) {
      results.consumptionPacing = assessHealth('yellow', 'Slightly Behind',
        'Consumption at ' + consumptionPct.toFixed(0) + '% vs ' + termPct.toFixed(0) + '% through term (' + pacingRatio.toFixed(2) + 'x ratio). May catch up with seasonal patterns.' + termNote);
    } else {
      results.consumptionPacing = assessHealth('red', 'Significantly Behind',
        'Consumption at ' + consumptionPct.toFixed(0) + '% vs ' + termPct.toFixed(0) + '% through term (' + pacingRatio.toFixed(2) + 'x ratio). Risk of over-purchase or dormant use cases.' + termNote);
    }
  } else {
    results.consumptionPacing = assessHealth('gray', 'No Data',
      'No envelope consumption data yet. Account is ' + (data.contract.daysUsed || 0) + ' days into term.' + termNote);
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
  if (velMom !== null && velMom !== undefined) {
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
  if (seatMom !== null && seatMom !== undefined) {
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
function addAccountHealthSection(body, data, showOverallAssessment) {
  addSectionHeading(body, 'Account Health');
  addSectionDescription(body, 'Sources: Internal Docusign account metrics processed through rule-based scoring. Health indicators (green/yellow/red) are computed deterministically from consumption pacing, usage trends, seat activation, and renewal proximity. No AI estimation involved.');
  addSourceNote(body, 'Source: Docusign Book of Business · Health indicators computed from internal account metrics');

  // GTM groups: account health not shown — per-account data in Docusign Footprint is sufficient.
  if (data.isGtmGroup) return;

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

  // ── GTM Group: compact summary table (now unreachable — kept for safety) ──
  if (data.isGtmGroup && data.accounts && data.accounts.length > 0) {
    addSubHeading(body, 'Health Summary by Account');
    var summaryRows = [['Account', 'Healthy', 'Watch', 'Concern', 'Status']];
    data.accounts.forEach(function(acc) {
      var h = analyzeAccountHealth(acc);
      var green = 0, yellow = 0, red = 0;
      indicatorOrder.forEach(function(ind) {
        if (!h[ind.key]) return;
        if (h[ind.key].status === 'green') green++;
        else if (h[ind.key].status === 'yellow') yellow++;
        else if (h[ind.key].status === 'red') red++;
      });
      var status = red > 0 ? 'At Risk' : yellow > 0 ? 'Watch' : 'Healthy';
      summaryRows.push([acc.identity.name, String(green), String(yellow), String(red), status]);
    });

    var summaryTable = safeAppendTable(body, summaryRows);
    summaryTable.setBorderColor('#CCCCCC');
    summaryTable.setBorderWidth(1);
    var PAGE_WIDTH = 516;
    var colWidths = [210, 60, 60, 70, 80];
    colWidths.forEach(function(w, i) { summaryTable.setColumnWidth(i, w); });

    // Header row
    var hdr = summaryTable.getRow(0);
    for (var c = 0; c < 5; c++) {
      var hCell = hdr.getCell(c);
      hCell.setBackgroundColor(HEADER_BG);
      hCell.editAsText().setForegroundColor(HEADER_FG);
      hCell.editAsText().setBold(true);
      hCell.editAsText().setFontSize(10);
      hCell.setPaddingTop(6); hCell.setPaddingBottom(6);
      hCell.setPaddingLeft(8); hCell.setPaddingRight(8);
    }

    // Data rows — color the Status column
    for (var r = 1; r < summaryTable.getNumRows(); r++) {
      var row = summaryTable.getRow(r);
      var statusVal = summaryRows[r][4];
      var statusBg = statusVal === 'At Risk' ? HEALTH_RED : statusVal === 'Watch' ? HEALTH_YELLOW : HEALTH_GREEN;
      var statusFg = statusVal === 'At Risk' ? LABEL_RED  : statusVal === 'Watch' ? LABEL_YELLOW  : LABEL_GREEN;
      for (var c2 = 0; c2 < 5; c2++) {
        var cell = row.getCell(c2);
        cell.setBackgroundColor(c2 === 4 ? statusBg : '#FFFFFF');
        cell.editAsText().setFontSize(10);
        cell.editAsText().setBold(c2 === 0 || c2 === 4);
        cell.editAsText().setForegroundColor(c2 === 4 ? statusFg : '#333333');
        cell.setPaddingTop(4); cell.setPaddingBottom(4);
        cell.setPaddingLeft(8); cell.setPaddingRight(8);
      }
    }
    addSpacer(body);
    return;
  }

  // ── Single account: full scorecard ──────────────────────────────
  var health = analyzeAccountHealth(data);

  addSubHeading(body, 'Health Scorecard');

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

  var table = safeAppendTable(body, scorecardRows);
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

    var nameCell = row.getCell(0);
    nameCell.setBackgroundColor('#FFFFFF');
    nameCell.editAsText().setBold(true);
    nameCell.editAsText().setFontSize(10);
    nameCell.setPaddingTop(4); nameCell.setPaddingBottom(4);
    nameCell.setPaddingLeft(8); nameCell.setPaddingRight(8);

    var statusCell = row.getCell(1);
    statusCell.setBackgroundColor(bgColor);
    statusCell.editAsText().setForegroundColor(labelColor);
    statusCell.editAsText().setBold(true);
    statusCell.editAsText().setFontSize(10);
    statusCell.setPaddingTop(4); statusCell.setPaddingBottom(4);
    statusCell.setPaddingLeft(8); statusCell.setPaddingRight(8);

    var detailCell = row.getCell(2);
    detailCell.setBackgroundColor('#FFFFFF');
    detailCell.editAsText().setFontSize(9);
    detailCell.setPaddingTop(4); detailCell.setPaddingBottom(4);
    detailCell.setPaddingLeft(8); detailCell.setPaddingRight(8);
  });

  // ── Overall Assessment ─────────────────────────────────────────
  if (showOverallAssessment === false) return;
  addSubHeading(body, 'Overall Assessment');

  var total = greenCount + yellowCount + redCount + grayCount;
  var summaryText = greenCount + ' healthy, ' + yellowCount + ' watch, ' + redCount + ' concern';
  if (grayCount > 0) summaryText += ', ' + grayCount + ' no data';
  summaryText += ' — out of ' + total + ' indicators evaluated.';
  var overallPara = addBodyText(body, summaryText);
  overallPara.editAsText().setBold(true);

  var narrativeLines = [];
  if (health.chargeModel) narrativeLines.push(health.chargeModel.detail);

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

  if (health.productBreadth && health.productBreadth.status !== 'green') {
    narrativeLines.push('');
    narrativeLines.push('Growth Opportunity: ' + data.inactiveProducts.length + ' Docusign products are not yet adopted. ' +
      'Given the $' + formatNumber(data.financial.acv) + ' ACV, expanding the product footprint would increase both value delivery and retention.');
  }

  if (health.integrationDepth && health.integrationDepth.status === 'red') {
    narrativeLines.push('');
    narrativeLines.push('Retention Risk: No integrations detected. Recommend prioritizing Salesforce or API integration to increase switching cost.');
  }

  narrativeLines.forEach(function(line) { addBodyText(body, line); });
}


/**
 * Section 7: Agreement Landscape
 */
function addAgreementLandscapeSection(body, data, agreementLandscape, businessMap) {
  addSectionHeading(body, 'Agreement Landscape');
  addSectionDescription(body, 'Sources: AI-estimated agreement types based on company profile, organizational structure, and industry patterns. Volume and complexity scores (1-10 scale) are LLM estimates, not measured counts. Quadrant classifications derive from these estimated scores.');

  var agreements = (agreementLandscape && agreementLandscape.agreements) || [];

  if (agreements.length === 0) {
    addBodyText(body, 'Agreement landscape data not available.');
    return;
  }

  // Quadrant bubble chart (QuickChart.io) — disabled: slow and low-quality output
  // var chartBlob = createQuadrantChart(agreements);
  // if (chartBlob) {
  //   try {
  //     var chartImage = body.appendImage(chartBlob);
  //     chartImage.setWidth(468);
  //     chartImage.setHeight(234);
  //     addSpacer(body);
  //   } catch (e) {
  //     Logger.log('[DocGen] Failed to insert quadrant chart: ' + e.message);
  //   }
  // }

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
    ['HV/LC \u2014 High Vol / Low Cx', 'Transactional agreements \u2014 eSignature, Embedded Signing, Bulk Send, automation.'],
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
  var table = safeAppendTable(body, aggRows);
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
    var hCellText = hCell.editAsText();
    hCell.setBackgroundColor(HEADER_BG);
    hCellText.setForegroundColor(HEADER_FG);
    hCellText.setBold(true);
    hCellText.setFontSize(10);
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
      var dataCellText = dataCell.editAsText();
      dataCell.setBackgroundColor(bg);
      dataCellText.setFontSize(10);
      dataCellText.setBold(false);
      dataCellText.setForegroundColor('#333333');
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
      var typeCellText = typeCell.editAsText();
      typeCell.setBackgroundColor(typeColor.bg);
      typeCellText.setForegroundColor(typeColor.fg);
      typeCellText.setBold(true);
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

  // Business Map — rendered at the end of Agreement Landscape
  var bmNodes = (businessMap && businessMap.nodes) || [];
  if (bmNodes.length > 0) {
    addSubHeading(body, 'Business Map');
    addSourceNote(body, 'Source: AI-generated organizational hierarchy based on company profile, public disclosures, and industry patterns. Agreement intensity ratings (High/Medium/Low) reflect expected agreement activity, not measured data.');

    var bmTree = buildHierarchyTree(bmNodes);
    var intensityLabel = { high: '\u25cf High', medium: '\u25cb Medium', low: '\u25cb Low' };
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
    var topTable = safeAppendTable(body, topRows);
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
    var table = safeAppendTable(body, bundleRows);
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

  addBodyText(body, 'This report is generated by a multi-step Glean AI workflow orchestrated from Google Sheets. ' +
    'Verified account data from internal Docusign systems anchors the analysis. ' +
    'External research is gathered by Glean via Google Gemini web search and synthesized through a series of structured Think steps. ' +
    'Where public filings or databases are available, that data takes precedence over AI estimates.');

  // ── Sources table — built dynamically based on what was actually available ──
  var rows = [['Source', 'Data Provided', 'Reliability']];

  // Always: internal Docusign data
  rows.push([
    'Docusign Book of Business',
    'Contract terms, renewal dates, ACV/CMRR, consumption metrics, envelope pacing, seat usage, product adoption, integrations',
    'Verified — extracted directly from internal Docusign systems'
  ]);

  // Always: Glean internal search
  rows.push([
    'Glean Internal Search',
    'Recent account activity: account plans, QBRs, strategy docs, customer meeting notes, Slack discussions (last 6 months)',
    'Best-effort — results depend on indexed internal content; may be empty for accounts with limited internal coverage'
  ]);

  // Always: Glean + Google Gemini web search
  rows.push([
    'Glean + Google Gemini Web Search',
    'Company overview, business units, financials, 3-year performance trends, strategic initiatives, SWOT analysis, executive contacts, technology stack, organizational structure',
    'AI-generated from public sources (earnings reports, press releases, LinkedIn, company websites). Cross-checked against verified data where available.'
  ]);

  // Always: Glean AI synthesis (Think steps)
  rows.push([
    'Glean AI Synthesis (Think Steps)',
    'Company profile, org hierarchy, agreement landscape, contract commerce estimates, Docusign account planning, big bet opportunities',
    'AI-generated — structured reasoning grounded in web research and internal account data. Dollar estimates are directional, not audited.'
  ]);

  // Conditional: SEC EDGAR
  if (enr.revenueFormatted || enr.segments) {
    var secData = [];
    if (enr.revenueFormatted) secData.push('consolidated financials (revenue, COGS, OpEx, CapEx, net income)');
    if (enr.employeesFormatted) secData.push('employee count');
    if (enr.segments && enr.segments.length > 0) secData.push('segment revenue (' + enr.segments.length + ' segments)');
    var period = enr.filingPeriod ? 'FY ' + enr.filingPeriod + ' 10-K annual filing' : 'Most recent 10-K annual filing';
    rows.push([
      'SEC EDGAR (XBRL)',
      secData.join(', '),
      'Verified — parsed from XBRL instance documents via SEC EDGAR API. ' + period + '. Injected into AI prompts as authoritative anchors; overrides AI estimates.'
    ]);
  }

  // Conditional: Wikipedia
  if (enr.overview) {
    rows.push([
      'Wikipedia',
      'Company overview narrative',
      'Reference — summary extract from English Wikipedia. Used as background context.'
    ]);
  }

  // Conditional: Wikidata
  var wikidataFields = [];
  if (enr.ceo) wikidataFields.push('CEO');
  if (enr.headquarters) wikidataFields.push('headquarters');
  if (enr.foundingDate) wikidataFields.push('founding date');
  if (enr.ticker) wikidataFields.push('stock ticker');
  if (wikidataFields.length > 0) {
    rows.push([
      'Wikidata',
      wikidataFields.join(', '),
      'Reference — structured data from Wikidata knowledge base.'
    ]);
  }

  addStyledTable(body, rows);

  addSpacer(body);
  addSubHeading(body, 'How This Report Was Generated');

  var steps = [
    ['Step 1–2 (Parallel)', 'Glean searches internal Docusign knowledge (account plans, QBRs, Slack) and runs an Google Gemini web search for external company research. Both run simultaneously.'],
    ['Step 3 — Think 1', 'Glean synthesizes a complete company profile: business units, financials, SWOT, executive contacts, technology stack, and account health indicators derived from Book of Business data.'],
    ['Step 4 — Think 2', 'Glean builds the organizational hierarchy (business map), identifies 15–20 agreement types with volume and complexity scores, and estimates contract commerce by department and agreement type.'],
    ['Step 5 — Think 3', 'Glean synthesizes the Docusign account plan: executive briefing, strategic priorities, and 3–5 ranked big bet opportunities tied to specific company initiatives and white-space product signals.'],
    ['Post-processing', 'GAS enforces verified data (SEC EDGAR financials, internal Book of Business metrics) over any conflicting AI estimates before writing the document.']
  ];

  var stepRows = [['Stage', 'What Happens']];
  steps.forEach(function(s) { stepRows.push(s); });
  addStyledTable(body, stepRows);

  addSpacer(body);
  var disclaimer = addBodyText(body,
    'Disclaimer: AI-generated analysis in this report is intended as a starting point for AE research and executive conversations — not a substitute for independent verification. ' +
    'Executive contacts and titles should be confirmed before outreach. Financial estimates and commerce projections are directional; treat as order-of-magnitude guidance.');
  disclaimer.editAsText().setFontSize(9);
  disclaimer.editAsText().setForegroundColor('#666666');
  disclaimer.editAsText().setItalic(true);
}


// ═══════════════════════════════════════════════════════════════════════
// Formatting Helpers
// ═══════════════════════════════════════════════════════════════════════

function addSectionHeading(body, text) {
  var heading = body.appendParagraph(text);
  heading.setHeading(DocumentApp.ParagraphHeading.HEADING1);
  heading.editAsText().setForegroundColor(DOCUSIGN_COBALT);
  heading.editAsText().setFontSize(22);
  heading.editAsText().setBold(false);
  heading.editAsText().setItalic(false);
  heading.setSpacingBefore(0);
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
  heading.editAsText().setForegroundColor(DOCUSIGN_DEEP_VIOLET);
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
 * Coerce a 2D array to string[][] and call body.appendTable().
 * Inline table builds that don't use addStyledTable should call this
 * to avoid "number[] doesn't match" errors from raw LLM numeric values.
 */
function safeAppendTable(body, rows) {
  var safeRows = rows.map(function(row) {
    return row.map(function(cell) {
      return (cell === null || cell === undefined) ? '' : String(cell);
    });
  });
  return body.appendTable(safeRows);
}

/**
 * Create a styled table with header row formatting and alternating row colors.
 */
function addStyledTable(body, rows) {
  if (!rows || rows.length === 0) return;

  // appendTable requires string[][] — coerce all cells defensively
  var safeRows = rows.map(function(row) {
    return row.map(function(cell) {
      return (cell === null || cell === undefined) ? '' : String(cell);
    });
  });

  var table = body.appendTable(safeRows);
  table.setBorderColor(TABLE_BORDER);
  table.setBorderWidth(1);

  var numCols = rows[0].length;

  // Distribute full page width (516pt = 612 letter - 48 left - 48 right margin).
  // 2-column tables use a 30/70 label/value split; all others divide evenly.
  var PAGE_WIDTH = 516;
  if (numCols === 2) {
    table.setColumnWidth(0, Math.floor(PAGE_WIDTH * 0.30));
    table.setColumnWidth(1, Math.floor(PAGE_WIDTH * 0.70));
  } else {
    var colW = Math.floor(PAGE_WIDTH / numCols);
    for (var cw = 0; cw < numCols; cw++) {
      table.setColumnWidth(cw, colW);
    }
  }

  // Style header row
  var headerRow = table.getRow(0);
  for (var c = 0; c < numCols; c++) {
    var cell = headerRow.getCell(c);
    var cellText = cell.editAsText();
    cell.setBackgroundColor(HEADER_BG);
    cellText.setForegroundColor(HEADER_FG);
    cellText.setBold(true);
    cellText.setItalic(false);
    cellText.setFontSize(10);
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
      var dataCellText = dataCell.editAsText();
      dataCell.setBackgroundColor(bg);
      dataCellText.setFontSize(10);
      dataCellText.setBold(numCols === 2 && c2 === 0);
      dataCellText.setItalic(false);
      dataCellText.setForegroundColor('#333333');
      dataCell.setPaddingTop(4);
      dataCell.setPaddingBottom(4);
      dataCell.setPaddingLeft(8);
      dataCell.setPaddingRight(8);
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

// Term completion display: shows normally up to 100%; flags elapsed contracts.
function formatTermCompletion(n) {
  if (n === null || n === undefined || n === '') return 'N/A';
  var num = Number(n);
  if (isNaN(num)) return 'N/A';
  if (num > 100) return 'Term elapsed (' + num.toFixed(1) + '%)';
  return num.toFixed(1) + '%';
}
