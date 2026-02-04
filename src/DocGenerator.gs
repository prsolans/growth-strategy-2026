/**
 * Orchestrates data extraction, LLM research, and Google Doc generation.
 */

// ── Styling constants ─────────────────────────────────────────────────
var DOCUSIGN_PURPLE = '#1B0B3B';
var DOCUSIGN_GREEN  = '#00B388';
var HEADER_BG       = '#1B0B3B';
var HEADER_FG       = '#FFFFFF';
var TABLE_ALT_BG    = '#F5F3F7';

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

  // ── Step 2: Run 5 LLM research calls (sequential) ─────────────────

  // Call 1: Account Profile
  Logger.log('[DocGen] === LLM CALL 1/5: Account Profile ===');
  var accountProfile;
  try {
    accountProfile = researchAccountProfile(data.identity.name, data.context.industry);
    Logger.log('[DocGen] Call 1 succeeded. Keys: ' + (accountProfile ? Object.keys(accountProfile).join(', ') : 'null'));
  } catch (e) {
    Logger.log('[DocGen] Call 1 FAILED: ' + e.message);
    accountProfile = {};
  }

  // Call 2: Business Map
  Logger.log('[DocGen] === LLM CALL 2/5: Business Map ===');
  var businessMap;
  try {
    businessMap = researchBusinessMap(data.identity.name, data.context.industry,
      accountProfile);
    Logger.log('[DocGen] Call 2 succeeded. Nodes: ' + (businessMap && businessMap.nodes ? businessMap.nodes.length : 0));
  } catch (e) {
    Logger.log('[DocGen] Call 2 FAILED: ' + e.message);
    businessMap = {};
  }

  // Call 3: Agreement Landscape
  Logger.log('[DocGen] === LLM CALL 3/5: Agreement Landscape ===');
  var agreementLandscape;
  try {
    agreementLandscape = researchAgreementLandscape(data.identity.name, data.context.industry,
      accountProfile, businessMap);
    Logger.log('[DocGen] Call 3 succeeded. Agreements: ' + (agreementLandscape && agreementLandscape.agreements ? agreementLandscape.agreements.length : 0));
  } catch (e) {
    Logger.log('[DocGen] Call 3 FAILED: ' + e.message);
    agreementLandscape = {};
  }

  // If Call 3 returned empty or failed, use deterministic fallback
  if (!agreementLandscape || !agreementLandscape.agreements || agreementLandscape.agreements.length === 0) {
    Logger.log('[DocGen] Call 3 produced no agreements. Using deterministic fallback...');
    agreementLandscape = generateFallbackAgreementLandscape(data, accountProfile, businessMap);
    Logger.log('[DocGen] Fallback generated ' + agreementLandscape.agreements.length + ' agreements');
  }

  // Call 4: Contract Commerce
  Logger.log('[DocGen] === LLM CALL 4/5: Contract Commerce ===');
  var contractCommerce;
  try {
    contractCommerce = researchContractCommerce(data.identity.name, data.context.industry,
      accountProfile, agreementLandscape);
    Logger.log('[DocGen] Call 4 succeeded. Keys: ' + (contractCommerce ? Object.keys(contractCommerce).join(', ') : 'null'));
  } catch (e) {
    Logger.log('[DocGen] Call 4 FAILED: ' + e.message);
    contractCommerce = {};
  }

  // Call 5: Priority Map
  Logger.log('[DocGen] === LLM CALL 5/5: Priority Map ===');
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

  // ── Build 9 sections ──────────────────────────────────────────────
  // Order: analysis & recommendations first, then supporting detail.

  Logger.log('[DocGen] Building Section 1/9: Company Profile');
  addCompanyProfileSection(body, data, accountProfile);
  addInlineSources(body, accountProfile);
  body.appendPageBreak();

  Logger.log('[DocGen] Building Section 2/9: Account Health Analysis');
  addAccountHealthSection(body, data);
  body.appendPageBreak();

  Logger.log('[DocGen] Building Section 3/9: Priority Map');
  addPriorityMapSection(body, data, priorityMap);
  addInlineSources(body, priorityMap);
  body.appendPageBreak();

  Logger.log('[DocGen] Building Section 4/9: Docusign Footprint');
  addDocusignTodaySection(body, data, priorityMap);
  body.appendPageBreak();

  Logger.log('[DocGen] Building Section 5/9: Business Performance & Strategy');
  addBusinessPerformanceSection(body, data, accountProfile);
  body.appendPageBreak();

  Logger.log('[DocGen] Building Section 6/9: Executive Contacts & Technology');
  addExecutivesAndTechSection(body, data, accountProfile);
  body.appendPageBreak();

  Logger.log('[DocGen] Building Section 7/9: Business Map');
  addBusinessMapSection(body, data, businessMap);
  addInlineSources(body, businessMap);
  body.appendPageBreak();

  Logger.log('[DocGen] Building Section 8/9: Agreement Landscape');
  addAgreementLandscapeSection(body, data, agreementLandscape);
  addInlineSources(body, agreementLandscape);
  body.appendPageBreak();

  Logger.log('[DocGen] Building Section 9/9: Contract Commerce Estimate');
  addContractCommerceSection(body, data, contractCommerce);
  addInlineSources(body, contractCommerce);

  // ── Collect and render sources ──────────────────────────────────
  Logger.log('[DocGen] Building Sources section');
  var allSources = collectSources(accountProfile, businessMap, agreementLandscape, contractCommerce, priorityMap);
  if (allSources.length > 0) {
    body.appendPageBreak();
    addSourcesSection(body, allSources);
  }

  Logger.log('[DocGen] Saving and closing doc...');
  doc.saveAndClose();

  var docUrl = doc.getUrl();
  Logger.log('[DocGen] COMPLETE. Doc URL: ' + docUrl);
  return docUrl;
}


// ═══════════════════════════════════════════════════════════════════════
// Section Builders
// ═══════════════════════════════════════════════════════════════════════

/**
 * Section 1: Company Profile
 */
function addCompanyProfileSection(body, data, accountProfile) {
  addSectionHeading(body, data.identity.name + ' | Company Profile');

  var ap = accountProfile || {};

  // Overview paragraph
  if (ap.companyOverview) {
    addBodyText(body, ap.companyOverview);
  }

  // Business Units table
  var bus = ap.businessUnits || [];
  if (bus.length > 0) {
    addSubHeading(body, 'Business Units');
    var buRows = [['Name', 'Offering', 'Target Segment', 'Revenue Model', 'Customers']];
    bus.forEach(function(bu) {
      buRows.push([
        bu.name || '',
        bu.offering || '',
        bu.targetSegment || '',
        bu.pricingRevenueModel || '',
        bu.customerCount || ''
      ]);
    });
    addStyledTable(body, buRows);
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
    ['Supply Chain', (supply.majorCategories || []).join(', ') || 'N/A', supply.context || ''],
    ['Revenue', fin.revenue || 'N/A', fin.context || ''],
    ['COGS', fin.cogs || 'N/A', ''],
    ['OpEx', fin.opex || 'N/A', ''],
    ['CapEx', fin.capex || 'N/A', '']
  ];
  addStyledTable(body, metricsRows);
}

/**
 * Section 2: Business Performance & Strategy
 */
function addBusinessPerformanceSection(body, data, accountProfile) {
  addSectionHeading(body, data.identity.name + ' | Business Performance & Strategy');

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
  addSectionHeading(body, data.identity.name + ' | Executive Contacts & Technology');

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
  addSectionHeading(body, data.identity.name + ' | Business Map');

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
  addSectionHeading(body, data.identity.name + ' | Docusign Footprint');

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
  addSectionHeading(body, data.identity.name + ' | Account Health Analysis');

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
  addSectionHeading(body, data.identity.name + ' | Agreement Landscape');

  var agreements = (agreementLandscape && agreementLandscape.agreements) || [];

  if (agreements.length === 0) {
    addBodyText(body, 'Agreement landscape data not available.');
    return;
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
      a.agreementType || '',
      a.category || '',
      a.primaryBusinessUnit || '',
      String(a.volume || ''),
      String(a.complexity || ''),
      a.contractType || '',
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
      var text = (a.number || '') + '. ' + (a.agreementType || '') + ': ' + a.description;
      var para = addBodyText(body, text);
      var titleEnd = String(a.number || '').length + 2 + (a.agreementType || '').length + 1;
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
  addSectionHeading(body, data.identity.name + ' | Contract Commerce Estimate');

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
 * Section 9: Priority Map
 */
function addPriorityMapSection(body, data, priorityMap) {
  addSectionHeading(body, data.identity.name + ' | Priority Map');

  var pm = priorityMap || {};

  // Accept both field names: priorityMapping (new) or priorities (old/LLM variant)
  var mappings = pm.priorityMapping || pm.priorities || [];

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

  // Expansion Opportunities table
  var opportunities = pm.expansionOpportunities || [];
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
// Sources
// ═══════════════════════════════════════════════════════════════════════

/**
 * Collect sources arrays from all 5 LLM call results and deduplicate by URL.
 */
function collectSources(accountProfile, businessMap, agreementLandscape, contractCommerce, priorityMap) {
  var all = [];
  var seen = {};

  // Known hallucinated or placeholder domains the LLM tends to fabricate
  var blockedPatterns = [
    /internal\.docusign/i,
    /docusigndata\.com/i,
    /example\.com/i,
    /placeholder\./i,
    /localhost/i,
    /hypothetical/i,
    /fictional/i,
    /sampleurl/i,
    /companywebsite\.com/i,
    /companydomain\.com/i,
    /companyname\.com/i,
    /corporatesite\.com/i,
    /businesswebsite\.com/i,
    /genericurl/i,
    /testsite\.com/i,
    /fakeurl/i
  ];

  function isBlockedUrl(url) {
    for (var i = 0; i < blockedPatterns.length; i++) {
      if (blockedPatterns[i].test(url)) return true;
    }
    // Block bare domain-only URLs (no path) — they don't cite anything specific
    try {
      var stripped = url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
      if (stripped.indexOf('/') === -1) return true;
    } catch (e) {}
    return false;
  }

  function addFrom(obj) {
    if (!obj || !obj.sources || !Array.isArray(obj.sources)) return;
    obj.sources.forEach(function(s) {
      if (s && s.url && !seen[s.url] && !isBlockedUrl(s.url)) {
        seen[s.url] = true;
        all.push({ title: s.title || s.url, url: s.url });
      }
    });
  }

  addFrom(accountProfile);
  addFrom(businessMap);
  addFrom(agreementLandscape);
  addFrom(contractCommerce);
  addFrom(priorityMap);

  Logger.log('[DocGen] Collected ' + all.length + ' unique sources from LLM responses');
  return all;
}

/**
 * Render inline parenthetical source references at the end of a section.
 * Shows "(Sources: title1, title2, ...)" with each title hyperlinked.
 * @param {Body} body
 * @param {Object} llmResult - An LLM result object that may contain a sources array
 */
function addInlineSources(body, llmResult) {
  if (!llmResult || !llmResult.sources || !Array.isArray(llmResult.sources) || llmResult.sources.length === 0) return;

  // Build the text: "(Sources: title1, title2, ...)"
  var prefix = '(Sources: ';
  var suffix = ')';
  var titles = [];
  var links = [];  // { start, end, url } for each title

  llmResult.sources.forEach(function(s) {
    if (s && s.url && s.title) {
      titles.push(s.title);
      links.push({ title: s.title, url: s.url });
    }
  });

  if (titles.length === 0) return;

  var fullText = prefix + titles.join(', ') + suffix;
  var para = body.appendParagraph(fullText);
  para.editAsText().setFontSize(9);
  para.editAsText().setBold(false);
  para.editAsText().setItalic(true);
  para.editAsText().setForegroundColor('#666666');
  para.setSpacingBefore(2);
  para.setSpacingAfter(4);

  // Apply hyperlinks to each title
  var offset = prefix.length;
  for (var i = 0; i < links.length; i++) {
    var start = fullText.indexOf(links[i].title, offset);
    if (start !== -1) {
      var end = start + links[i].title.length - 1;
      para.editAsText().setLinkUrl(start, end, links[i].url);
      para.editAsText().setForegroundColor(start, end, '#1155CC');
      offset = end + 1;
    }
  }
}

/**
 * Render a Sources section at the end of the document.
 */
function addSourcesSection(body, sources) {
  addSectionHeading(body, 'Sources');

  for (var i = 0; i < sources.length; i++) {
    var s = sources[i];
    var text = (i + 1) + '. ' + s.title;
    var para = addBodyText(body, text);
    para.editAsText().setFontSize(10);
    para.editAsText().setBold(false);
    para.setSpacingAfter(0);

    // Add the URL as a clickable link on the next line
    var urlPara = addBodyText(body, s.url);
    urlPara.editAsText().setFontSize(9);
    urlPara.editAsText().setBold(false);
    urlPara.editAsText().setForegroundColor('#1155CC');
    urlPara.setLinkUrl(s.url);
    urlPara.setSpacingAfter(4);
  }
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
