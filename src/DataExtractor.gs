/**
 * Extracts and structures data from the Book Scrub sheet for a given company.
 */

var COMPANY_NAME_COL = 'COMPANY_NAME';
var BOOKSCRUB_SHEET_NAME = 'Full Data';

/**
 * Extract just the company name from the ACCOUNT_NAME_PLAN_TERM field.
 * Format: "Company Name (Plan Name || YYYY-MM-DD - YYYY-MM-DD)"
 * Handles company names that contain parentheses, e.g. "(Prev Arrow) Ingram..."
 *
 * @param {string} raw  The full ACCOUNT_NAME_PLAN_TERM value
 * @returns {string} The company name only
 */
function extractCompanyName(raw) {
  var text = String(raw).replace(/[\u200B-\u200D\uFEFF]/g, '').trim(); // strip zero-width chars
  var pipeIdx = text.lastIndexOf(' || ');
  if (pipeIdx === -1) return text;
  var beforePipe = text.substring(0, pipeIdx);
  var openParen = beforePipe.lastIndexOf('(');
  if (openParen <= 0) return text;
  return text.substring(0, openParen).trim();
}

/**
 * Ensure a COMPANY_NAME column exists in the sheet and all rows have a value.
 * - If the column is missing, creates it as the last column and populates all rows.
 * - If the column already exists, fills in any blank cells (e.g. newly added rows).
 * Manually-edited cells (non-blank) are never overwritten.
 *
 * @param {Sheet} sheet
 * @param {Object} headerIndex  Current header-to-column map (mutated in place if column is added)
 */
function ensureCompanyNameColumn(sheet, headerIndex) {
  var sourceCol = headerIndex['ACCOUNT_NAME_PLAN_TERM'];
  if (sourceCol === undefined) {
    throw new Error('Column ACCOUNT_NAME_PLAN_TERM not found — cannot create COMPANY_NAME.');
  }

  var numRows = sheet.getLastRow();

  if (headerIndex[COMPANY_NAME_COL] !== undefined) {
    // Column exists — backfill any blank cells introduced by new rows
    var nameColIdx = headerIndex[COMPANY_NAME_COL]; // 0-based
    if (numRows < 2) return;

    var rawValues  = sheet.getRange(2, sourceCol + 1,  numRows - 1, 1).getValues();
    var nameValues = sheet.getRange(2, nameColIdx + 1, numRows - 1, 1).getValues();

    var updates = [];
    var updateRows = [];
    for (var i = 0; i < nameValues.length; i++) {
      if (String(nameValues[i][0]).trim() === '') {
        updates.push([extractCompanyName(rawValues[i][0])]);
        updateRows.push(i);
      }
    }

    if (updates.length === 0) {
      Logger.log('[DataExtractor] COMPANY_NAME column up to date — no blank cells found.');
      return;
    }

    // Write blanks individually (rows may not be contiguous)
    for (var j = 0; j < updateRows.length; j++) {
      sheet.getRange(updateRows[j] + 2, nameColIdx + 1).setValue(updates[j][0]);
    }
    Logger.log('[DataExtractor] Backfilled ' + updates.length + ' blank COMPANY_NAME cell(s).');
    return;
  }

  // Column doesn't exist — create it and populate all rows
  var lastCol = sheet.getLastColumn();
  var newColIdx = lastCol + 1;

  Logger.log('[DataExtractor] Creating COMPANY_NAME column at position ' + newColIdx + '...');

  sheet.getRange(1, newColIdx).setValue(COMPANY_NAME_COL);

  if (numRows > 1) {
    var rawValues = sheet.getRange(2, sourceCol + 1, numRows - 1, 1).getValues();
    var parsed = rawValues.map(function(row) {
      return [extractCompanyName(row[0])];
    });
    sheet.getRange(2, newColIdx, parsed.length, 1).setValues(parsed);
  }

  headerIndex[COMPANY_NAME_COL] = newColIdx - 1; // 0-based
  Logger.log('[DataExtractor] COMPANY_NAME column created and populated (' + (numRows - 1) + ' rows)');
}

/**
 * Build a map of header name -> column index from the first row of the sheet.
 * @param {Sheet} sheet
 * @returns {Object.<string, number>} header name to 0-based column index
 */
function buildHeaderIndex(sheet) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idx = {};
  for (var c = 0; c < headers.length; c++) {
    var name = String(headers[c]).trim();
    if (name) idx[name] = c;
  }
  Logger.log('[DataExtractor] Built header index: ' + Object.keys(idx).length + ' columns found');
  return idx;
}

/**
 * Find the row (0-based within data, not header) that matches the company name.
 * Searches the COMPANY_NAME column with a simple case-insensitive match.
 * @param {Array[]} data  All rows excluding header
 * @param {string} companyName
 * @param {number} nameCol  Column index of COMPANY_NAME
 * @returns {number} row index in data array, or -1
 */
function findCompanyRow(data, companyName, nameCol) {
  var target = companyName.replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toLowerCase();

  // Pass 1: exact match
  for (var r = 0; r < data.length; r++) {
    var cell = String(data[r][nameCol]).replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toLowerCase();
    if (cell === target) {
      return r;
    }
  }

  // Pass 2: substring match (either direction)
  var bestRow = -1;
  var bestLen = 0;
  for (var r2 = 0; r2 < data.length; r2++) {
    var cell2 = String(data[r2][nameCol]).replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toLowerCase();
    if (!cell2) continue;
    if (cell2.indexOf(target) !== -1 || target.indexOf(cell2) !== -1) {
      // Prefer the match whose lengths are closest (most specific)
      var matchLen = Math.min(cell2.length, target.length);
      if (matchLen > bestLen) {
        bestLen = matchLen;
        bestRow = r2;
      }
    }
  }
  if (bestRow !== -1) {
    Logger.log('[DataExtractor] Fuzzy match (substring): "' + companyName + '" → "' +
      String(data[bestRow][nameCol]).trim() + '"');
    return bestRow;
  }

  // Pass 3: normalized token match — strip Inc/Corp/LLC/N.A./Bank/& Co etc.
  var normalize = function(s) {
    return s.replace(/[,.()\-]/g, ' ')
      .replace(/\b(inc|corp|corporation|ltd|llc|co|company|group|plc|n\s*a|the|holdings?|bank|&)\b/gi, '')
      .replace(/\s+/g, ' ').trim();
  };
  var normalizedTarget = normalize(target);
  if (normalizedTarget.length < 3) return -1;

  for (var r3 = 0; r3 < data.length; r3++) {
    var cell3 = String(data[r3][nameCol]).replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toLowerCase();
    var normalizedCell = normalize(cell3);
    if (normalizedCell === normalizedTarget) {
      Logger.log('[DataExtractor] Fuzzy match (normalized): "' + companyName + '" → "' +
        String(data[r3][nameCol]).trim() + '"');
      return r3;
    }
    // Token containment: all tokens of shorter name present in longer name
    var targetTokens = normalizedTarget.split(' ').filter(function(t) { return t.length > 1; });
    var cellTokens = normalizedCell.split(' ').filter(function(t) { return t.length > 1; });
    if (targetTokens.length >= 2 && cellTokens.length >= 2) {
      var allTargetInCell = targetTokens.every(function(t) { return normalizedCell.indexOf(t) !== -1; });
      var allCellInTarget = cellTokens.every(function(t) { return normalizedTarget.indexOf(t) !== -1; });
      if (allTargetInCell || allCellInTarget) {
        Logger.log('[DataExtractor] Fuzzy match (tokens): "' + companyName + '" → "' +
          String(data[r3][nameCol]).trim() + '"');
        return r3;
      }
    }
  }

  return -1;
}

/**
 * Pull a value from a row by header name. Returns empty string if column not found.
 */
function val(row, headerIndex, colName) {
  var c = headerIndex[colName];
  if (c === undefined) return '';
  var v = row[c];
  return (v === null || v === undefined) ? '' : v;
}

/**
 * Pull a numeric value, stripping currency formatting. Returns 0 if not parseable.
 */
function numVal(row, headerIndex, colName) {
  var raw = String(val(row, headerIndex, colName));
  var cleaned = raw.replace(/[$,\s]/g, '');
  var n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/**
 * Check if a product is in use based on purchased/used column pair.
 */
function productInUse(row, headerIndex, purchasedCol, usedCol) {
  return numVal(row, headerIndex, purchasedCol) > 0 ||
         numVal(row, headerIndex, usedCol) > 0;
}

/**
 * Get list of all company names in the sheet.
 * Reads from the COMPANY_NAME column (creates it if needed).
 * @returns {string[]}
 */
function getCompanyNames() {
  //AAH 3.23.2026
  var sheet = SpreadsheetApp.openById ("1tyrEBzmADyzvgTX8ltRZO0faaoiXnxrJgo1arzefKAk").getSheetByName(BOOKSCRUB_SHEET_NAME);

  var headerIndex = buildHeaderIndex(sheet);
  ensureCompanyNameColumn(sheet, headerIndex);

  var nameCol = headerIndex[COMPANY_NAME_COL];
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  var names = [];
  for (var r = 0; r < data.length; r++) {
    var name = String(data[r][nameCol]).trim();
    if (name) names.push(name);
  }
  Logger.log('[DataExtractor] Found ' + names.length + ' companies');
  return names;
}

/**
 * Returns the sorted list of distinct GTM_GROUP values in the bookscrub sheet.
 * Used to populate the GTM Group picker dialog.
 * @returns {string[]}
 */
function getGtmGroupNames() {
  var sheet = SpreadsheetApp.openById('1tyrEBzmADyzvgTX8ltRZO0faaoiXnxrJgo1arzefKAk').getSheetByName(BOOKSCRUB_SHEET_NAME);
  var headerIndex = buildHeaderIndex(sheet);

  // a) confirm GTM_GROUP column was found
  var groupNameCol = headerIndex['GTM_GROUP'];
  Logger.log('[GTMGroup] getGtmGroupNames: GTM_GROUP col index = ' + groupNameCol);
  if (groupNameCol === undefined) {
    Logger.log('[GTMGroup] ERROR: GTM_GROUP column not found. Available keys: ' + Object.keys(headerIndex).join(', '));
    return [];
  }

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  var seen = {};
  var names = [];
  for (var r = 0; r < rows.length; r++) {
    var name = String(rows[r][groupNameCol]).trim();
    if (name && !seen[name]) {
      seen[name] = true;
      names.push(name);
    }
  }
  Logger.log('[GTMGroup] getGtmGroupNames: found ' + names.length + ' distinct groups: ' + names.sort().join(', '));
  return names.sort();
}

/**
 * Loads data for every account in a GTM group and returns a single merged
 * data object that has the same shape as getCompanyData(). Numeric fields are
 * summed; percentage/rate fields are recalculated from the sums; categorical
 * fields are taken from the primary (highest-ACV) account. An `accounts[]`
 * array of individual data objects is attached for per-account table rendering.
 *
 * @param {string} gtmGroupName  Value of the GTM_GROUP_NAME column
 * @returns {Object} merged data object (isGtmGroup: true, accounts: [...])
 */
function getGtmGroupData(gtmGroupName) {
  // a) confirm what value we received
  Logger.log('[GTMGroup] getGtmGroupData called with: "' + gtmGroupName + '"');

  var sheet = SpreadsheetApp.openById('1tyrEBzmADyzvgTX8ltRZO0faaoiXnxrJgo1arzefKAk').getSheetByName(BOOKSCRUB_SHEET_NAME);
  var headerIndex = buildHeaderIndex(sheet);
  ensureCompanyNameColumn(sheet, headerIndex);

  // b) confirm GTM_GROUP column was found
  var groupNameCol = headerIndex['GTM_GROUP'];
  var nameCol = headerIndex[COMPANY_NAME_COL];
  Logger.log('[GTMGroup] GTM_GROUP col index = ' + groupNameCol + ' | COMPANY_NAME col index = ' + nameCol);
  if (groupNameCol === undefined) throw new Error('GTM_GROUP column not found in sheet.');

  var sfidCol = headerIndex['SALESFORCE_ACCOUNT_ID'];

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  Logger.log('[GTMGroup] Total data rows to scan: ' + rows.length);

  // c) collect matching rows; deduplicate by SALESFORCE_ACCOUNT_ID to avoid
  //    counting the same account twice when a name appears in multiple rows
  var matchedAccounts = [];
  var seenIds = {};
  for (var r = 0; r < rows.length; r++) {
    var cellValue = String(rows[r][groupNameCol]).trim();
    var compName  = String(rows[r][nameCol]).trim();
    if (cellValue === gtmGroupName) {
      var sfid = sfidCol !== undefined ? String(rows[r][sfidCol]).trim() : '';
      var dedupeKey = sfid || compName; // fall back to name if no SFID
      Logger.log('[GTMGroup] Row ' + (r + 2) + ' MATCH: GTM_GROUP="' + cellValue + '" | SFID="' + sfid + '" | company="' + compName + '"');
      if (compName && !seenIds[dedupeKey]) {
        seenIds[dedupeKey] = true;
        matchedAccounts.push({ name: compName, rowIndex: r, row: rows[r] });
      } else if (seenIds[dedupeKey]) {
        Logger.log('[GTMGroup] Row ' + (r + 2) + ' SKIPPED (duplicate SFID/name: "' + dedupeKey + '")');
      }
    } else if (r < 5) {
      Logger.log('[GTMGroup] Row ' + (r + 2) + ' sample: GTM_GROUP="' + cellValue + '" | company="' + compName + '"');
    }
  }

  Logger.log('[GTMGroup] Unique accounts after dedup: ' + matchedAccounts.length + ' — ' + matchedAccounts.map(function(a) { return a.name; }).join(', '));
  if (matchedAccounts.length === 0) throw new Error('No accounts found for GTM group: "' + gtmGroupName + '"');

  // Load individual account data — pass preloaded row to skip the per-account sheet re-scan
  var preloadedContext = { headerIndex: headerIndex };
  var accounts = matchedAccounts.map(function(a) {
    return getCompanyData(a.name, false, { headerIndex: headerIndex, row: a.row });
  });

  // Primary = highest ACV account (drives categorical fields)
  accounts.sort(function(a, b) { return (b.financial.acv || 0) - (a.financial.acv || 0); });
  var primary = accounts[0];

  // Helper: sum a numeric field across all accounts
  function sum(getter) {
    return accounts.reduce(function(t, a) { return t + (getter(a) || 0); }, 0);
  }

  // Pre-compute shared denominators
  var totalEnvSent      = sum(function(a) { return a.consumption.envelopesSent; });
  var totalEnvPurchased = sum(function(a) { return a.consumption.envelopesPurchased; });
  var totalCompleted    = sum(function(a) { return a.consumption.completed; });
  var totalDeclined     = sum(function(a) { return a.consumption.declined; });
  var totalVoided       = sum(function(a) { return a.consumption.voided; });
  var totalExpired      = sum(function(a) { return a.consumption.expired; });
  var totalCustomApi    = sum(function(a) { return a.integrations.customApi; });
  var totalSeatsActive  = sum(function(a) { return a.seats.active; });
  var totalSeatsPurch   = sum(function(a) { return a.seats.purchased; });

  // Union active products across all accounts
  var allActive = {};
  var allProducts = {};
  accounts.forEach(function(acc) {
    acc.activeProducts.forEach(function(p) { allActive[p] = true; });
    Object.keys(acc.products).forEach(function(p) {
      if (!allProducts[p]) {
        allProducts[p] = JSON.parse(JSON.stringify(acc.products[p]));
      } else if (acc.products[p].inUse) {
        allProducts[p].inUse = true;
      }
    });
  });

  // Count integration types active in any account
  var intFields = ['salesforce', 'workday', 'sap', 'customApi', 'powerforms', 'bulkSend'];
  var intCount = intFields.filter(function(f) {
    return accounts.some(function(a) { return (a.integrations[f] || 0) > 0; });
  }).length;

  return {
    isGtmGroup:   true,
    gtmGroupName: gtmGroupName,
    accounts:     accounts,

    identity: {
      name:               gtmGroupName,
      rawName:            gtmGroupName,
      sfdcParentId:       primary.identity.sfdcParentId,
      siteId:             '',
      docusignAccountId:  '',
      salesforceAccountId: '',
      sfdcUrl:            ''
    },

    context: {
      industry:      primary.context.industry,
      country:       primary.context.country,
      salesChannel:  primary.context.salesChannel,
      region:        primary.context.region,
      gtmGroup:      primary.context.gtmGroup,
      gtmGroupName:  gtmGroupName,
      partnerAccount: primary.context.partnerAccount
    },

    // Contract fields are shown per-account; this placeholder keeps callers safe
    contract: {
      plan: '', planName: '', chargeModel: '',
      termStart: '', termEnd: '', termEndFyq: '',
      daysUsed: 0, daysLeft: 0, percentComplete: 0,
      monthsLeft: 0, isMultiYearRamp: false
    },

    consumption: {
      envelopesPurchased:    totalEnvPurchased,
      envelopesSent:         totalEnvSent,
      sent7d:                sum(function(a) { return a.consumption.sent7d; }),
      sent30d:               sum(function(a) { return a.consumption.sent30d; }),
      sent60d:               sum(function(a) { return a.consumption.sent60d; }),
      sent90d:               sum(function(a) { return a.consumption.sent90d; }),
      sent365d:              sum(function(a) { return a.consumption.sent365d; }),
      envelopesExpected:     sum(function(a) { return a.consumption.envelopesExpected; }),
      consumptionPerformance: totalEnvPurchased > 0 ? (totalEnvSent / totalEnvPurchased) * 100 : 0,
      usageTrend:            primary.consumption.usageTrend,
      usageTrendSeat:        primary.consumption.usageTrendSeat,
      projectedUsageScore:   null,
      last30dBucket:         primary.consumption.last30dBucket,
      sendVitality:          null,
      sendVelocityMom:       null,
      completed:             totalCompleted,
      completedRate:         totalEnvSent > 0 ? (totalCompleted / totalEnvSent) * 100 : 0,
      declined:              totalDeclined,
      voided:                totalVoided,
      expired:               totalExpired,
      pctDeclined:           totalEnvSent > 0 ? (totalDeclined / totalEnvSent) * 100 : 0,
      pctVoided:             totalEnvSent > 0 ? (totalVoided / totalEnvSent) * 100 : 0,
      pctExpired:            totalEnvSent > 0 ? (totalExpired / totalEnvSent) * 100 : 0,
      usageVsExpected:       0,
      pctUsageVsExpected:    0,
      projectedSent:         sum(function(a) { return a.consumption.projectedSent; }),
      envelopeAllowance:     sum(function(a) { return a.consumption.envelopeAllowance; }),
      plannedSends:          sum(function(a) { return a.consumption.plannedSends; }),
      plannedPerDay:         sum(function(a) { return a.consumption.plannedPerDay; })
    },

    integrations: {
      salesforce:     sum(function(a) { return a.integrations.salesforce; }),
      workday:        sum(function(a) { return a.integrations.workday; }),
      sap:            sum(function(a) { return a.integrations.sap; }),
      customApi:      totalCustomApi,
      pctCustomApi:   totalEnvSent > 0 ? (totalCustomApi / totalEnvSent) * 100 : 0,
      powerforms:     sum(function(a) { return a.integrations.powerforms; }),
      bulkSend:       sum(function(a) { return a.integrations.bulkSend; }),
      mobileSigns:    sum(function(a) { return a.integrations.mobileSigns; }),
      nonMobileSigns: sum(function(a) { return a.integrations.nonMobileSigns; }),
      webappSends:    sum(function(a) { return a.integrations.webappSends; }),
      automationSends: sum(function(a) { return a.integrations.automationSends; }),
      count:          intCount
    },

    seats: {
      purchased:      totalSeatsPurch,
      active:         totalSeatsActive,
      admin:          sum(function(a) { return a.seats.admin; }),
      viewer:         sum(function(a) { return a.seats.viewer; }),
      sender:         sum(function(a) { return a.seats.sender; }),
      activationRate: totalSeatsPurch > 0 ? (totalSeatsActive / totalSeatsPurch) * 100 : 0,
      evaRate:        0,
      activeSeatsMom: null,
      unlimited:      accounts.some(function(a) { return a.seats.unlimited; })
    },

    financial: {
      cmrr:            primary.financial.cmrr,
      acv:             sum(function(a) { return a.financial.acv; }),
      currency:        primary.financial.currency,
      costPerEnvelope: null,
      costPerSeat:     null,
      reportingMrr:    sum(function(a) { return a.financial.reportingMrr; })
    },

    products:        allProducts,
    activeProducts:  Object.keys(allActive),
    inactiveProducts: [],

    people: primary.people
  };
}

/**
 * Look up a company name by Salesforce Account ID.
 * @param {string} accountId  Value from the SALESFORCE_ACCOUNT_ID column
 * @returns {string} company name (COMPANY_NAME column value)
 * @throws if the account ID is not found
 */
function findCompanyNameByAccountId(accountId) {
  var target = String(accountId).trim();
  //AAH 3.23.2026
  var sheet = SpreadsheetApp.openById ("1tyrEBzmADyzvgTX8ltRZO0faaoiXnxrJgo1arzefKAk").getSheetByName(BOOKSCRUB_SHEET_NAME);
  var headerIndex = buildHeaderIndex(sheet);
  ensureCompanyNameColumn(sheet, headerIndex);

  var accountIdCol = headerIndex['SALESFORCE_ACCOUNT_ID'];
  if (accountIdCol === undefined) {
    throw new Error('SALESFORCE_ACCOUNT_ID column not found in "' + BOOKSCRUB_SHEET_NAME + '" sheet.');
  }
  var nameCol = headerIndex[COMPANY_NAME_COL];
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();

  for (var r = 0; r < data.length; r++) {
    if (String(data[r][accountIdCol]).trim() === target) {
      return String(data[r][nameCol]).trim();
    }
  }
  throw new Error('No row found with SALESFORCE_ACCOUNT_ID = "' + accountId + '".');
}

/**
 * Main extraction function. Returns a structured object with all relevant data
 * for the given company.
 *
 * @param {string} companyName
 * @returns {Object} structured company data
 */
function getCompanyData(companyName, isProspect, preloadedContext) {
  Logger.log('[DataExtractor] getCompanyData called for: "' + companyName + '" (isProspect=' + !!isProspect + ')');

  var headerIndex, row;

  if (preloadedContext && preloadedContext.row) {
    // Fast path: caller already has the sheet loaded and the exact row — skip the full scan
    headerIndex = preloadedContext.headerIndex;
    row = preloadedContext.row;
    Logger.log('[DataExtractor] Using preloaded row for "' + companyName + '" (no sheet re-scan)');
  } else {
    //AAH 3.23.2026
    var sheet = SpreadsheetApp.openById('1tyrEBzmADyzvgTX8ltRZO0faaoiXnxrJgo1arzefKAk').getSheetByName(BOOKSCRUB_SHEET_NAME);
    Logger.log('[DataExtractor] Active sheet: "' + sheet.getName() + '" (' + sheet.getLastRow() + ' rows, ' + sheet.getLastColumn() + ' cols)');
    headerIndex = buildHeaderIndex(sheet);
    ensureCompanyNameColumn(sheet, headerIndex);

    var nameCol = headerIndex[COMPANY_NAME_COL];
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    Logger.log('[DataExtractor] Loaded ' + data.length + ' data rows. Searching for "' + companyName + '"...');
    var rowIdx = findCompanyRow(data, companyName, nameCol);
    if (rowIdx === -1) {
      if (isProspect) {
        Logger.log('[DataExtractor] Company not found in sheet — returning prospect data object for "' + companyName + '"');
        return buildProspectData(companyName);
      }
      var available = data.slice(0, 10).map(function(r) { return String(r[nameCol]).trim(); });
      Logger.log('[DataExtractor] ERROR: Company not found. First 10 names: ' + available.join(', '));
      throw new Error('Company "' + companyName + '" not found in sheet.');
    }
    Logger.log('[DataExtractor] Found company at row ' + (rowIdx + 2) + ' (data row ' + rowIdx + ')');
    row = data[rowIdx];
  }
  var v = function(col) { return val(row, headerIndex, col); };
  var n = function(col) { return numVal(row, headerIndex, col); };
  var inUse = function(pCol, uCol) { return productInUse(row, headerIndex, pCol, uCol); };

  // ── Integration count ───────────────────────────────────────────
  var integrationCount = 0;
  if (n('ENVELOPES_VIA_SALESFORCE') > 0) integrationCount++;
  if (n('ENVELOPES_VIA_WORKDAY') > 0) integrationCount++;
  if (n('ENVELOPES_VIA_SAP') > 0) integrationCount++;
  if (n('CUSTOM_API_SENT') > 0) integrationCount++;
  if (n('COUNT_POWERFORM_SENT') > 0) integrationCount++;
  if (n('COUNT_BULKSEND_SENT') > 0) integrationCount++;

  // ── Product adoption flags ──────────────────────────────────────
  var products = {
    eSignature: true, // assumed if they're in the book
    clm:              String(v('IS_CLM_ACCOUNT')).toUpperCase() === 'TRUE',
    iam:              String(v('IS_IAM')).toUpperCase() === 'TRUE',
    smsDelivery:      inUse('SMS_DELIVERY_PURCHASED', 'SMS_DELIVERY_USED'),
    smsAuth:          inUse('SMS_AUTH_PURCHASED', 'SMS_AUTH_USED'),
    phoneAuth:        inUse('PHONE_AUTH_PURCHASED', 'PHONE_AUTH_USED'),
    idCheck:          inUse('ID_CHECK_PURCHASED', 'ID_CHECK_USED'),
    idVerifyGovId:    inUse('ID_VERIFY_GOVID_EID_AUTH_PURCHASED', 'ID_VERIFY_GOVID_EID_AUTH_USED'),
    clickwraps:       inUse('CLICKWRAPS_PURCHASED', 'CLICKWRAPS_USED'),
    agreementActions: inUse('AGREEMENT_ACTIONS_PURCHASED', 'AGREEMENT_ACTIONS_USED'),
    workflows:        inUse('WORKFLOW_RUNS_PURCHASED', 'WORKFLOW_RUNS_USAGE'),
    workflowDefs:     inUse('WORKFLOW_DEFINITIONS_PURCHASED', 'WORKFLOW_DEFINITIONS_USAGE'),
    aiExtraction:     inUse('AI_EXTRACTION_PURCHASED', 'AI_EXTRACTION_USAGE'),
    navigator:        inUse('NAVIGATOR_AGREEMENTS_PURCHASED', 'NAVIGATOR_AGREEMENTS_USAGE'),
    navigatorDocs:    inUse('NAVIGATOR_OPEN_DOCUMENT_PURCHASED', 'NAVIGATOR_OPEN_DOCUMENT_USAGE'),
    docGeneration:    inUse('DOCUMENT_GENERATION_FOR_ESIGNATURE_PURCHASED', 'DOCUMENT_GENERATION_FOR_ESIGNATURE_USAGE'),
    multiChannel:     inUse('MULTI_CHANNEL_DELIVERY_PURCHASED', 'MULTI_CHANNEL_DELIVERY_USAGE'),
    premiumDataVerif: inUse('PREMIUM_DATA_VERIFICATIONS_PURCHASED', 'PREMIUM_DATA_VERIFICATIONS_USAGE'),
    idVerification:   inUse('ID_VERIFICATION_PURCHASED', 'ID_VERIFICATION_USAGE'),
    saml:             inUse('SAML_AUTHENTICATION_PURCH', 'SAML_AUTHENTICATION')
  };

  // Build human-readable product list
  var PRODUCT_LABELS = {
    eSignature: 'eSignature',
    clm: 'CLM',
    iam: 'IAM',
    smsDelivery: 'SMS Delivery',
    smsAuth: 'SMS Authentication',
    phoneAuth: 'Phone Authentication',
    idCheck: 'ID Check',
    idVerifyGovId: 'Government ID Verification',
    clickwraps: 'Embedded Signing',
    agreementActions: 'Agreement Actions',
    workflows: 'Maestro Workflows',
    workflowDefs: 'Workflow Definitions',
    aiExtraction: 'AI Extraction',
    navigator: 'Navigator',
    navigatorDocs: 'Navigator Documents',
    docGeneration: 'Document Generation',
    multiChannel: 'Multi-Channel Delivery',
    premiumDataVerif: 'Premium Data Verifications',
    idVerification: 'ID Verification',
    saml: 'SAML Authentication'
  };

  var activeProducts = [];
  var inactiveProducts = [];
  Object.keys(PRODUCT_LABELS).forEach(function(key) {
    if (products[key]) {
      activeProducts.push(PRODUCT_LABELS[key]);
    } else {
      inactiveProducts.push(PRODUCT_LABELS[key]);
    }
  });

  var companyName_ = v(COMPANY_NAME_COL);
  Logger.log('[DataExtractor] Company name: "' + companyName_ + '"');
  Logger.log('[DataExtractor] Industry: ' + v('INDUSTRY') + ' | Country: ' + v('BILLING_COUNTRY'));
  Logger.log('[DataExtractor] Plan: ' + v('ACCOUNT_PLAN') + ' | Term: ' + v('TERM_START_DATE') + ' to ' + v('TERM_END_DATE'));
  Logger.log('[DataExtractor] Envelopes: ' + n('ENVELOPES_SENT') + ' sent / ' + n('ENVELOPES_PURCHASED') + ' purchased');
  Logger.log('[DataExtractor] Seats: ' + n('ACTIVE_SEATS') + ' active / ' + n('SEATS_PURCHASED') + ' purchased');
  Logger.log('[DataExtractor] Integrations: ' + integrationCount + ' detected');
  Logger.log('[DataExtractor] Active products: ' + activeProducts.join(', '));
  Logger.log('[DataExtractor] Inactive products: ' + inactiveProducts.join(', '));

  return {
    identity: {
      name:             companyName_,
      rawName:          v('ACCOUNT_NAME_PLAN_TERM'),
      sfdcParentId:     v('SFDC_PARENT_ACCOUNT_ID'),
      siteId:           v('SITE_ID'),
      docusignAccountId: v('DOCUSIGN_ACCOUNT_ID'),
      salesforceAccountId: v('SALESFORCE_ACCOUNT_ID'),
      sfdcUrl:          v('URL')
    },

    context: {
      industry:     v('INDUSTRY'),
      country:      v('BILLING_COUNTRY'),
      salesChannel: v('SALES_CHANNEL'),
      region:       v('REGION'),
      gtmGroup:     v('GTM_GROUP'),
      gtmGroupName: v('GTM_GROUP_NAME'),
      partnerAccount: v('PARTNER_ACCOUNT')
    },

    contract: {
      plan:               v('ACCOUNT_PLAN'),
      planName:           v('DOCUSIGN_ACCOUNT_PLAN_NAME'),
      chargeModel:        v('CHARGE_MODEL'),
      termStart:          v('TERM_START_DATE'),
      termEnd:            v('TERM_END_DATE'),
      termEndFyq:         v('TERM_END_FYQ'),
      daysUsed:           n('DAYS_USED'),
      daysLeft:           n('DAYS_LEFT'),
      percentComplete:    n('PERCENTAGE_TERM_COMPLETED'),
      monthsLeft:         n('MONTHS_LEFT'),
      isMultiYearRamp:    String(v('IS_MULTI_YEAR_RAMP')).toUpperCase() === 'TRUE'
    },

    consumption: {
      envelopesPurchased:    n('ENVELOPES_PURCHASED'),
      envelopesSent:         n('ENVELOPES_SENT'),
      sent7d:                n('ENVELOPES_SENT_7_DAYS'),
      sent30d:               n('ENVELOPES_SENT_30_DAYS'),
      sent60d:               n('ENVELOPES_SENT_60_DAYS'),
      sent90d:               n('ENVELOPES_SENT_90_DAYS'),
      sent365d:              n('ENVELOPES_SENT_365_DAYS'),
      envelopesExpected:     n('ENVELOPES_EXPECTED'),
      consumptionPerformance: n('CONSUMPTION_PERFORMANCE'),
      usageTrend:            v('USAGE_TREND'),
      usageTrendSeat:        v('USAGE_TREND_SEAT'),
      projectedUsageScore:   n('PROJECTED_USAGE_SCORE'),
      last30dBucket:         v('LAST_30_DAYS_PERFORMANCE_BUCKET'),
      sendVitality:          n('SEND_VITALITY'),
      sendVelocityMom:       v('SEND_VELOCITY_MOM') !== '' ? n('SEND_VELOCITY_MOM') : null,
      completed:             n('ENVELOPES_COMPLETED'),
      completedRate:         n('ENVELOPES_COMPLETED_RATE'),
      declined:              n('ENVELOPES_DECLINED'),
      voided:                n('ENVELOPES_VOIDED'),
      expired:               n('ENVELOPES_EXPIRED'),
      pctDeclined:           n('PERCENT_DECLINED'),
      pctVoided:             n('PERCENT_VOIDED'),
      pctExpired:            n('PERCENT_EXPIRED'),
      usageVsExpected:       n('USAGE_VS_EXPECTED_TO_DATE'),
      pctUsageVsExpected:    n('PERCENTAGE_USAGE_VS_EXPECTED_TO_DATE'),
      projectedSent:         n('PROJECTED_ENVELOPES_SENT'),
      envelopeAllowance:     n('ENVELOPE_ALLOWANCE'),
      plannedSends:          n('PLANNED_SENDS'),
      plannedPerDay:         n('PLANNED_ENVELOPES_USED_PER_DAY')
    },

    integrations: {
      salesforce:    n('ENVELOPES_VIA_SALESFORCE'),
      workday:       n('ENVELOPES_VIA_WORKDAY'),
      sap:           n('ENVELOPES_VIA_SAP'),
      customApi:     n('CUSTOM_API_SENT'),
      pctCustomApi:  n('PERCENT_CUSTOM_API_SENT'),
      powerforms:    n('COUNT_POWERFORM_SENT'),
      bulkSend:      n('COUNT_BULKSEND_SENT'),
      mobileSigns:   n('MOBILE_SIGNS'),
      nonMobileSigns: n('NON_MOBILE_SIGNS'),
      webappSends:   n('ANNUAL_WEBAPP_SENTS'),
      automationSends: n('ANNUAL_AUTOMATION_SENTS'),
      count:         integrationCount
    },

    seats: {
      purchased:      n('SEATS_PURCHASED'),
      active:         n('ACTIVE_SEATS'),
      admin:          n('ADMIN_SEATS'),
      viewer:         n('VIEWER_SEATS'),
      sender:         n('SENDER_SEATS'),
      activationRate: n('PERCENTAGE_SVA'),
      evaRate:        n('PERCENTAGE_EVA'),
      activeSeatsMom: v('ACTIVE_SEATS_MOM') !== '' ? n('ACTIVE_SEATS_MOM') : null,
      unlimited:      String(v('IS_UNLIMITED_SEATS')).toUpperCase() === 'TRUE'
    },

    financial: {
      cmrr:               v('RENEWAL_BASE_CMRR'),
      acv:                n('ACCOUNT_ACV'),
      currency:           v('MRR_CURRENCY'),
      costPerEnvelope:    n('EFFECTIVE_COST_PER_ENVELOPE'),
      costPerSeat:        n('EFFECTIVE_COST_PER_SEAT'),
      reportingMrr:       n('REPORTING_MMR')
    },

    products: products,
    activeProducts: activeProducts,
    inactiveProducts: inactiveProducts,

    people: {
      accountOwner:     v('ACCOUNT_OWNER'),
      accountOwnerMgr:  v('ACCOUNT_OWNER_MANAGER'),
      csm:              v('CSM'),
      csmManager:       v('CSM_MANAGER'),
      renewalManager:   v('SUBSCRIPTION_RENEWAL_MANAGER'),
      renewalMgrMgr:    v('RENEWAL_MANAGER'),
      salesRep:         v('EXECUTIVE_SALES_REP'),
      mdr:              v('MDR')
    }
  };
}

/**
 * Build a sparse data object for a prospect account (no bookscrub row).
 * Matches the shape of a real getCompanyData() return value so downstream code
 * doesn't crash on field access. All usage/financial fields default to 0 or ''.
 *
 * @param {string} companyName
 * @returns {Object}
 */
function buildProspectData(companyName) {
  var noProducts = {
    eSignature: false, clm: false, iam: false, smsDelivery: false,
    smsAuth: false, phoneAuth: false, idCheck: false, idVerifyGovId: false,
    clickwraps: false, agreementActions: false, workflows: false,
    workflowDefs: false, aiExtraction: false, navigator: false,
    navigatorDocs: false, docGeneration: false, multiChannel: false,
    premiumDataVerif: false, idVerification: false, saml: false
  };
  return {
    identity: {
      name: companyName, rawName: companyName, isProspect: true,
      sfdcParentId: '', siteId: '', docusignAccountId: '',
      salesforceAccountId: '', sfdcUrl: ''
    },
    context: {
      industry: '', country: '', salesChannel: '',
      region: '', gtmGroup: '', gtmGroupName: '', partnerAccount: ''
    },
    contract: {
      plan: '', planName: '', chargeModel: '',
      termStart: '', termEnd: '', termEndFyq: '',
      daysUsed: 0, daysLeft: 0, percentComplete: 0,
      monthsLeft: 0, isMultiYearRamp: false
    },
    consumption: {
      envelopesPurchased: 0, envelopesSent: 0,
      sent7d: 0, sent30d: 0, sent60d: 0, sent90d: 0, sent365d: 0,
      envelopesExpected: 0, consumptionPerformance: 0, usageTrend: '',
      usageTrendSeat: '', projectedUsageScore: 0, last30dBucket: '',
      sendVitality: 0, sendVelocityMom: 0, completed: 0, completedRate: 0,
      declined: 0, voided: 0, expired: 0, pctDeclined: 0, pctVoided: 0,
      pctExpired: 0, usageVsExpected: 0, pctUsageVsExpected: 0,
      projectedSent: 0, envelopeAllowance: 0, plannedSends: 0, plannedPerDay: 0
    },
    integrations: {
      salesforce: 0, workday: 0, sap: 0, customApi: 0,
      pctCustomApi: 0, powerforms: 0, bulkSend: 0, mobileSigns: 0,
      nonMobileSigns: 0, webappSends: 0, automationSends: 0, count: 0
    },
    seats: {
      purchased: 0, active: 0, admin: 0, viewer: 0, sender: 0,
      activationRate: 0, evaRate: 0, activeSeatsMom: 0, unlimited: false
    },
    financial: {
      cmrr: '', acv: 0, currency: '', costPerEnvelope: 0,
      costPerSeat: 0, reportingMrr: 0
    },
    products: noProducts,
    activeProducts: [],
    inactiveProducts: [],
    people: {
      accountOwner: '', accountOwnerMgr: '', csm: '', csmManager: '',
      renewalManager: '', renewalMgrMgr: '', salesRep: '', mdr: ''
    }
  };
}

/**
 * Evaluate internal bookscrub data against Docusign product catalog
 * and return pre-qualified product recommendations with reasoning.
 *
 * SIGNAL MATCHING METHODOLOGY:
 * Each product is evaluated against the customer's internal usage data.
 * Signals are deterministic — computed from bookscrub fields, not LLM-guessed.
 *
 * Strength levels:
 *   - "strong": Multiple data points clearly indicate this product would add value.
 *     The customer's usage patterns closely match the product's target use case.
 *   - "moderate": Some data points suggest potential fit. Worth exploring
 *     but needs validation against the customer's actual business needs.
 *   - "exploratory": No strong data signal, but industry/segment patterns
 *     suggest this could be relevant. Requires discovery conversation.
 *
 * Status values:
 *   - "recommended": Product is NOT currently active and signals suggest fit
 *   - "in_use": Product IS currently active (no recommendation needed)
 *   - "not_relevant": No meaningful signals detected
 *
 * @param {Object} data  Output of getCompanyData()
 * @returns {Object} { signals: [...], bundleSignals: [...], summary: "..." }
 */
function generateProductSignals(data) {
  Logger.log('[Signals] Evaluating product signals for ' + data.identity.name);

  var industry = (data.context.industry || '').toLowerCase();
  var isRegulated = REGULATED_INDUSTRIES.some(function(ind) {
    return industry.indexOf(ind) !== -1;
  });

  var products = data.products;
  var consumption = data.consumption;
  var integrations = data.integrations;
  var seats = data.seats;
  var financial = data.financial;

  var signals = [];

  // Helper to build a signal entry
  function addSignal(product, active, strength, reasons, dataPoints) {
    var status = active ? 'in_use' : (strength ? 'recommended' : 'not_relevant');
    signals.push({
      product: product,
      status: status,
      strength: strength || null,
      reasons: reasons,
      dataPoints: dataPoints
    });
  }

  // ── Navigator ───────────────────────────────────────────────────
  (function() {
    var active = products.navigator || products.navigatorDocs;
    var reasons = [];
    var strength = null;
    var dp = { envelopesSent: consumption.envelopesSent, clmActive: products.clm, navigatorActive: active };
    if (!active && products.clm) {
      strength = 'strong';
      reasons.push('CLM is active but Navigator is not — Navigator provides visibility into CLM-managed agreements');
    }
    if (consumption.envelopesSent > 20000) {
      strength = 'strong';
      reasons.push('High envelope volume (' + consumption.envelopesSent.toLocaleString() + ') creates large agreement repository that needs search and reporting');
    } else if (consumption.envelopesSent > 5000) {
      if (!strength) strength = 'moderate';
      reasons.push('Meaningful envelope volume (' + consumption.envelopesSent.toLocaleString() + ') would benefit from agreement analytics');
    }
    addSignal('Navigator', active, strength, reasons, dp);
  })();

  // ── Maestro ─────────────────────────────────────────────────────
  (function() {
    var active = products.workflows || products.workflowDefs;
    var reasons = [];
    var strength = null;
    var dp = {
      pctCustomApi: integrations.pctCustomApi,
      automationSends: integrations.automationSends,
      webappSends: integrations.webappSends,
      integrationCount: integrations.count,
      workflowsActive: active
    };
    if (integrations.pctCustomApi > 50) {
      strength = 'strong';
      reasons.push('API-heavy usage (' + integrations.pctCustomApi.toFixed(0) + '% custom API) — Maestro can orchestrate these automated workflows');
    }
    if (integrations.automationSends > integrations.webappSends && integrations.automationSends > 0) {
      strength = 'strong';
      reasons.push('Automation sends (' + integrations.automationSends.toLocaleString() + ') exceed webapp sends — already automation-oriented, Maestro adds orchestration');
    }
    if (!active && integrations.count >= 2) {
      strength = 'strong';
      reasons.push(integrations.count + ' integrations active without workflow orchestration — Maestro connects these into end-to-end flows');
    }
    if (!strength && integrations.count >= 1) {
      strength = 'moderate';
      reasons.push(integrations.count + ' integration(s) detected — Maestro could orchestrate pre/post-signature steps');
    }
    if (!strength && consumption.sent365d > 1000) {
      strength = 'moderate';
      reasons.push(consumption.sent365d.toLocaleString() + ' envelopes in last 365 days — volume suggests workflow automation opportunity');
    }
    addSignal('Maestro', active, strength, reasons, dp);
  })();

  // ── Agreement Desk ──────────────────────────────────────────────
  (function() {
    var active = false; // No direct bookscrub flag for Agreement Desk
    var reasons = [];
    var strength = null;
    var dp = { clmActive: products.clm, isRegulated: isRegulated };
    if (products.clm) {
      strength = 'moderate';
      reasons.push('CLM is active — Agreement Desk adds intake, collaboration, and AI-assisted review for negotiated agreements');
    }
    if (isRegulated) {
      if (!strength) strength = 'moderate';
      reasons.push('Regulated industry (' + data.context.industry + ') — negotiated agreements likely require structured review');
    }
    addSignal('Agreement Desk', active, strength, reasons, dp);
  })();

  // ── Web Forms ───────────────────────────────────────────────────
  (function() {
    var active = false; // No direct bookscrub flag; infer from webapp sends usage
    var reasons = [];
    var strength = null;
    var dp = {
      powerforms: integrations.powerforms,
      webappSends: integrations.webappSends,
      automationSends: integrations.automationSends
    };
    if (integrations.powerforms > 100) {
      strength = 'strong';
      reasons.push('Heavy PowerForms usage (' + integrations.powerforms.toLocaleString() + ') — Web Forms provides structured intake with better data capture');
    }
    if (integrations.webappSends > integrations.automationSends && integrations.webappSends > 0) {
      strength = 'strong';
      reasons.push('Webapp sends (' + integrations.webappSends.toLocaleString() + ') exceed automation sends — Web Forms can streamline manual data collection');
    }
    if (!strength && integrations.webappSends > 0) {
      strength = 'moderate';
      reasons.push('Webapp send activity detected (' + integrations.webappSends.toLocaleString() + ') — Web Forms could improve intake process');
    }
    addSignal('Web Forms', active, strength, reasons, dp);
  })();

  // ── Agreement Prep (DocGen) ─────────────────────────────────────
  (function() {
    var active = products.docGeneration;
    var reasons = [];
    var strength = null;
    var dp = { docGenActive: active, envelopesSent: consumption.envelopesSent, salesforce: integrations.salesforce };
    if (!active && (consumption.envelopesSent > 5000 || integrations.salesforce > 0)) {
      strength = 'strong';
      if (consumption.envelopesSent > 5000) {
        reasons.push('High volume (' + consumption.envelopesSent.toLocaleString() + ' envelopes) without DocGen — template-based generation would reduce manual document creation');
      }
      if (integrations.salesforce > 0) {
        reasons.push('Salesforce integration active (' + integrations.salesforce.toLocaleString() + ' envelopes) — DocGen can auto-generate agreements from CRM data');
      }
    }
    if (!strength && consumption.envelopesSent > 1000) {
      strength = 'moderate';
      reasons.push('Moderate volume (' + consumption.envelopesSent.toLocaleString() + ' envelopes) — DocGen could streamline agreement creation');
    }
    addSignal('Agreement Prep (DocGen)', active, strength, reasons, dp);
  })();

  // ── eSignature ──────────────────────────────────────────────────
  (function() {
    addSignal('eSignature', true, null, ['Base product — focus on usage optimization'], {});
  })();

  // ── ID Verification (IDV) ──────────────────────────────────────
  (function() {
    var active = products.idVerification || products.idVerifyGovId || products.idCheck;
    var reasons = [];
    var strength = null;
    var dp = { idvActive: active, isRegulated: isRegulated, pctDeclined: consumption.pctDeclined, pctVoided: consumption.pctVoided };
    if (!active && isRegulated) {
      strength = 'strong';
      reasons.push('Regulated industry (' + data.context.industry + ') without ID Verification — compliance likely requires signer identity verification');
    }
    if (consumption.pctDeclined > 5 || consumption.pctVoided > 5) {
      if (!strength) strength = 'moderate';
      reasons.push('Elevated decline/void rates (declined: ' + consumption.pctDeclined.toFixed(1) + '%, voided: ' + consumption.pctVoided.toFixed(1) + '%) — IDV could reduce fraudulent or erroneous signings');
    }
    addSignal('ID Verification (IDV)', active, strength, reasons, dp);
  })();

  // ── App Center ──────────────────────────────────────────────────
  (function() {
    var active = integrations.count > 0;
    var reasons = [];
    var strength = null;
    var dp = { integrationCount: integrations.count, envelopesSent: consumption.envelopesSent };
    if (integrations.count === 0 && consumption.envelopesSent > 1000) {
      strength = 'strong';
      reasons.push('No integrations detected with ' + consumption.envelopesSent.toLocaleString() + ' envelopes — App Center provides 900+ pre-built integrations');
    }
    if (!strength && integrations.count < 3) {
      strength = 'moderate';
      reasons.push('Only ' + integrations.count + ' integration(s) — App Center could connect more business systems');
    }
    addSignal('App Center', active, strength, reasons, dp);
  })();

  // ── Monitor ─────────────────────────────────────────────────────
  (function() {
    var active = false; // No direct bookscrub flag
    var reasons = [];
    var strength = null;
    var dp = { activeSeats: seats.active, adminSeats: seats.admin, integrationCount: integrations.count };
    if (seats.active > 50 || seats.admin > 5) {
      strength = 'strong';
      reasons.push('Large user base (' + seats.active + ' active seats, ' + seats.admin + ' admins) — Monitor provides visibility into account activity and security');
    }
    if (!strength && integrations.count >= 2) {
      strength = 'moderate';
      reasons.push(integrations.count + ' integrations — Monitor tracks API usage and security events across connected systems');
    }
    addSignal('Monitor', active, strength, reasons, dp);
  })();

  // ── Embedded Signing ────────────────────────────────────────────
  (function() {
    var active = products.clickwraps;
    var reasons = [];
    var strength = null;
    var dp = { clickwrapsActive: active, webappSends: integrations.webappSends };
    if (!active && integrations.webappSends > 1000) {
      strength = 'strong';
      reasons.push('High webapp sends (' + integrations.webappSends.toLocaleString() + ') without Embedded Signing — standard terms acceptance needs audit trail');
    }
    if (!strength && !active) {
      strength = 'moderate';
      reasons.push('Embedded Signing not active — could provide click-to-agree for standard terms and policies');
    }
    addSignal('Embedded Signing', active, strength, reasons, dp);
  })();

  // ── Multi-Channel Delivery ──────────────────────────────────────
  (function() {
    var active = products.multiChannel;
    var reasons = [];
    var strength = null;
    var dp = { multiChannelActive: active, envelopesSent: consumption.envelopesSent };
    if (!active && consumption.envelopesSent > 5000) {
      strength = 'strong';
      reasons.push('High volume (' + consumption.envelopesSent.toLocaleString() + ' envelopes) without multi-channel — SMS/WhatsApp delivery could improve signer response rates');
    }
    addSignal('Multi-Channel Delivery', active, strength, reasons, dp);
  })();

  // ── SMS Delivery ────────────────────────────────────────────────
  (function() {
    var active = products.smsDelivery;
    var reasons = [];
    var strength = null;
    var dp = { smsDeliveryActive: active, mobileSigns: integrations.mobileSigns };
    if (!active && integrations.mobileSigns > 0) {
      strength = 'strong';
      reasons.push('Mobile signing activity detected (' + integrations.mobileSigns.toLocaleString() + ' mobile signs) without SMS delivery — SMS would reach mobile-first signers faster');
    }
    if (!strength && !active && consumption.envelopesSent > 1000) {
      strength = 'moderate';
      reasons.push('Moderate volume without SMS delivery — could improve signing turnaround');
    }
    addSignal('SMS Delivery', active, strength, reasons, dp);
  })();

  // ── SMS Authentication ──────────────────────────────────────────
  (function() {
    var active = products.smsAuth;
    var reasons = [];
    var strength = null;
    var dp = { smsAuthActive: active, isRegulated: isRegulated };
    if (!active && isRegulated) {
      strength = 'strong';
      reasons.push('Regulated industry (' + data.context.industry + ') without SMS authentication — 2FA compliance likely required');
    }
    if (!strength && !active && consumption.envelopesSent > 1000) {
      strength = 'moderate';
      reasons.push('No SMS authentication with meaningful volume — could strengthen signer verification');
    }
    addSignal('SMS Authentication', active, strength, reasons, dp);
  })();

  // ── Phone Authentication ────────────────────────────────────────
  (function() {
    var active = products.phoneAuth;
    var reasons = [];
    var strength = null;
    var dp = { phoneAuthActive: active, isRegulated: isRegulated };
    if (!active && isRegulated) {
      strength = 'strong';
      reasons.push('Regulated industry (' + data.context.industry + ') without phone authentication — voice verification adds security for high-value agreements');
    }
    if (!strength && !active) {
      strength = 'moderate';
      reasons.push('Phone authentication not active — available for high-security use cases');
    }
    addSignal('Phone Authentication', active, strength, reasons, dp);
  })();

  // ── SAML/SSO ────────────────────────────────────────────────────
  (function() {
    var active = products.saml;
    var reasons = [];
    var strength = null;
    var dp = { samlActive: active, activeSeats: seats.active };
    if (!active && seats.active > 20) {
      strength = 'strong';
      reasons.push(seats.active + ' active seats without SAML/SSO — centralized access control and provisioning would reduce admin burden');
    } else if (!active && seats.active > 5) {
      strength = 'moderate';
      reasons.push(seats.active + ' active seats without SAML/SSO — SSO would simplify user management');
    }
    addSignal('SAML/SSO', active, strength, reasons, dp);
  })();

  // ── Bundle-Level Signals ────────────────────────────────────────
  var bundleSignals = [];

  // Count strong/moderate component recommendations
  var recommended = signals.filter(function(s) { return s.status === 'recommended'; });
  var strongRecs = recommended.filter(function(s) { return s.strength === 'strong'; });
  var recNames = recommended.map(function(s) { return s.product; });

  // IAM Core: multiple component recommendations suggest bundle
  if (strongRecs.length >= 3) {
    bundleSignals.push({
      bundle: 'IAM Core',
      strength: 'strong',
      reasons: [strongRecs.length + ' strong product recommendations — IAM Core bundle covers ' + DOCUSIGN_CATALOG.bundles[0].includes.join(', ')],
      recommendedComponents: recNames.slice(0, 5)
    });
  } else if (recommended.length >= 3) {
    bundleSignals.push({
      bundle: 'IAM Core',
      strength: 'moderate',
      reasons: [recommended.length + ' product recommendations suggest IAM Core platform upgrade'],
      recommendedComponents: recNames.slice(0, 5)
    });
  }

  // IAM for Sales: Salesforce + DocGen/WebForms
  var hasSalesforce = integrations.salesforce > 0;
  var docGenRec = recNames.indexOf('Agreement Prep (DocGen)') !== -1;
  var webFormsRec = recNames.indexOf('Web Forms') !== -1;
  if (hasSalesforce && (docGenRec || webFormsRec)) {
    var salesReasons = ['Salesforce integration active with ' + integrations.salesforce.toLocaleString() + ' envelopes'];
    var salesComponents = [];
    if (docGenRec) {
      salesReasons.push('DocGen not active — would automate proposal generation from CRM data');
      salesComponents.push('Agreement Prep (DocGen)');
    }
    if (webFormsRec) {
      salesReasons.push('Web Forms recommended — structured intake for sales workflows');
      salesComponents.push('Web Forms');
    }
    salesComponents.push('Maestro');
    bundleSignals.push({
      bundle: 'IAM for Sales',
      strength: 'strong',
      reasons: salesReasons,
      recommendedComponents: salesComponents
    });
  }

  // IAM for CX: high decline rates + mobile activity + customer-facing patterns
  var highDecline = consumption.pctDeclined > 5 || consumption.pctExpired > 5;
  var hasMobile = integrations.mobileSigns > 0;
  if (highDecline || hasMobile) {
    var cxReasons = [];
    if (highDecline) cxReasons.push('Elevated decline/expire rates (declined: ' + consumption.pctDeclined.toFixed(1) + '%, expired: ' + consumption.pctExpired.toFixed(1) + '%) — IAM for CX improves customer-facing experience');
    if (hasMobile) cxReasons.push('Mobile signing activity (' + integrations.mobileSigns.toLocaleString() + ') indicates customer-facing agreements');
    bundleSignals.push({
      bundle: 'IAM for CX',
      strength: (highDecline && hasMobile) ? 'strong' : 'moderate',
      reasons: cxReasons,
      recommendedComponents: ['Web Forms', 'Maestro', 'Navigator']
    });
  }

  // CLM: high ACV + no CLM + high volume
  if (!products.clm && financial.acv > 50000 && consumption.envelopesSent > 5000) {
    bundleSignals.push({
      bundle: 'CLM',
      strength: 'strong',
      reasons: [
        '$' + financial.acv.toLocaleString() + ' ACV without CLM — high-value account needs contract lifecycle management',
        consumption.envelopesSent.toLocaleString() + ' envelopes indicate significant agreement volume needing centralized management'
      ],
      recommendedComponents: ['CLM']
    });
  } else if (!products.clm && isRegulated) {
    bundleSignals.push({
      bundle: 'CLM',
      strength: 'moderate',
      reasons: ['Regulated industry (' + data.context.industry + ') without CLM — contract risk management likely needed'],
      recommendedComponents: ['CLM']
    });
  }

  // ── Build Summary Text ──────────────────────────────────────────
  var summaryLines = [];
  var strongProds = signals.filter(function(s) { return s.status === 'recommended' && s.strength === 'strong'; });
  var moderateProds = signals.filter(function(s) { return s.status === 'recommended' && s.strength === 'moderate'; });
  var inUseProds = signals.filter(function(s) { return s.status === 'in_use'; });

  if (strongProds.length > 0) {
    summaryLines.push('Strong recommendations: ' + strongProds.map(function(s) {
      return s.product + ' (' + (s.reasons[0] || '').substring(0, 60) + ')';
    }).join(', '));
  }
  if (moderateProds.length > 0) {
    summaryLines.push('Moderate recommendations: ' + moderateProds.map(function(s) {
      return s.product + ' (' + (s.reasons[0] || '').substring(0, 60) + ')';
    }).join(', '));
  }
  if (bundleSignals.length > 0) {
    summaryLines.push('Bundle opportunities: ' + bundleSignals.map(function(b) {
      return b.bundle + ' (' + b.strength + ')';
    }).join(', '));
  }
  if (inUseProds.length > 0) {
    summaryLines.push('Already in use: ' + inUseProds.map(function(s) { return s.product; }).join(', '));
  }

  var summary = summaryLines.join('\n');

  Logger.log('[Signals] Strong: ' + strongProds.length + ', Moderate: ' + moderateProds.length +
    ', In Use: ' + inUseProds.length + ', Bundles: ' + bundleSignals.length);
  Logger.log('[Signals] Summary:\n' + summary);

  return {
    signals: signals,
    bundleSignals: bundleSignals,
    summary: summary
  };
}

/**
 * Generate a deterministic fallback agreement landscape when LLM Call 3 fails.
 * Combines BASE_AGREEMENTS with industry-specific overlays and maps agreements
 * to departments from the business map.
 *
 * @param {Object} data            Output of getCompanyData() (needs data.context.industry)
 * @param {Object} accountProfile  Result from LLM Call 1 (business units)
 * @param {Object} businessMap     Result from LLM Call 2 (org hierarchy with agreement intensity)
 * @returns {Object} { agreements: [...], sources: [], _fallback: true }
 */
function generateFallbackAgreementLandscape(data, accountProfile, businessMap) {
  Logger.log('[Fallback] Generating deterministic agreement landscape...');

  var industry = (data.context.industry || '').toLowerCase();

  // ── 1. Start with base agreements ───────────────────────────────────
  var agreements = BASE_AGREEMENTS.map(function(a) {
    return {
      agreementType: a.agreementType,
      category: a.category,
      contractType: a.contractType,
      volume: a.volume,
      complexity: a.complexity,
      description: a.description,
      departmentHint: a.departmentHint,
      primaryBusinessUnit: ''
    };
  });

  // ── 2. Add industry-specific agreements ─────────────────────────────
  var industryAgreements = null;
  var matchedKeyword = '';
  var industryKeys = Object.keys(INDUSTRY_AGREEMENTS);
  for (var i = 0; i < industryKeys.length; i++) {
    if (industry.indexOf(industryKeys[i]) !== -1) {
      industryAgreements = INDUSTRY_AGREEMENTS[industryKeys[i]];
      matchedKeyword = industryKeys[i];
      break;
    }
  }

  if (!industryAgreements) {
    industryAgreements = DEFAULT_INDUSTRY_AGREEMENTS;
    matchedKeyword = '(default)';
  }

  Logger.log('[Fallback] Industry "' + industry + '" matched keyword: ' + matchedKeyword +
    ' (' + industryAgreements.length + ' additional agreements)');

  // Deduplicate: skip industry agreements that share a name with a base agreement
  var existingNames = {};
  agreements.forEach(function(a) { existingNames[a.agreementType.toLowerCase()] = true; });

  industryAgreements.forEach(function(a) {
    if (!existingNames[a.agreementType.toLowerCase()]) {
      agreements.push({
        agreementType: a.agreementType,
        category: a.category,
        contractType: a.contractType,
        volume: a.volume,
        complexity: a.complexity,
        description: a.description,
        departmentHint: a.departmentHint,
        primaryBusinessUnit: ''
      });
      existingNames[a.agreementType.toLowerCase()] = true;
    }
  });

  // ── 3. Match departments from businessMap ───────────────────────────
  var deptLookup = {};  // lowercase name → { name, agreementIntensity }
  var nodes = (businessMap && businessMap.nodes) || [];

  if (nodes.length > 0) {
    nodes.forEach(function(n) {
      if (n.level === 'department' || n.level === 'bu') {
        deptLookup[(n.name || '').toLowerCase()] = {
          name: n.name,
          agreementIntensity: (n.agreementIntensity || '').toLowerCase()
        };
      }
    });

    // Hint-to-department matching keywords
    var hintKeywords = {
      procurement: ['procurement', 'purchasing', 'supply chain', 'sourcing'],
      hr: ['human resources', 'hr', 'people', 'talent', 'workforce'],
      legal: ['legal', 'compliance', 'regulatory', 'governance', 'risk'],
      sales: ['sales', 'revenue', 'commercial', 'business development', 'go-to-market'],
      finance: ['finance', 'treasury', 'accounting', 'controller', 'cfo'],
      operations: ['operations', 'ops', 'delivery', 'service', 'support', 'customer']
    };

    agreements.forEach(function(a) {
      var hint = (a.departmentHint || '').toLowerCase();
      var keywords = hintKeywords[hint] || [hint];
      var bestMatch = null;

      // Search department names for keyword matches
      var deptNames = Object.keys(deptLookup);
      for (var k = 0; k < keywords.length && !bestMatch; k++) {
        for (var d = 0; d < deptNames.length; d++) {
          if (deptNames[d].indexOf(keywords[k]) !== -1) {
            bestMatch = deptLookup[deptNames[d]];
            break;
          }
        }
      }

      if (bestMatch) {
        a.primaryBusinessUnit = bestMatch.name;
        // Boost volume for high-intensity departments
        if (bestMatch.agreementIntensity === 'high') {
          a.volume = Math.min(10, a.volume + 1);
        }
      }
    });
  }

  // ── 4. Fallback BU names from accountProfile ────────────────────────
  if (nodes.length === 0 && accountProfile && accountProfile.businessUnits && accountProfile.businessUnits.length > 0) {
    var buNames = accountProfile.businessUnits.map(function(bu) { return bu.name || ''; });
    Logger.log('[Fallback] No businessMap nodes; using accountProfile BU names: ' + buNames.join(', '));

    // Simple assignment: rotate BU names across agreements
    agreements.forEach(function(a, idx) {
      if (!a.primaryBusinessUnit) {
        a.primaryBusinessUnit = buNames[idx % buNames.length];
      }
    });
  }

  // ── 5. Sort, number, and cap at 15 ─────────────────────────────────
  agreements.sort(function(a, b) {
    return (b.volume + b.complexity) - (a.volume + a.complexity);
  });

  agreements = agreements.slice(0, 15);

  agreements.forEach(function(a, idx) {
    a.number = idx + 1;
    delete a.departmentHint;  // clean up internal field
  });

  Logger.log('[Fallback] Generated ' + agreements.length + ' fallback agreements');

  return {
    agreements: agreements,
    sources: [],
    _fallback: true
  };
}

/**
 * Produce a concise text summary of internal data for use as LLM context.
 * @param {Object} data  Output of getCompanyData
 * @param {Object} [productSignals]  Output of generateProductSignals (optional)
 * @returns {string}
 */
function summarizeForLLM(data, productSignals) {
  if (data.identity.isProspect) {
    return 'Prospect: ' + data.identity.name + '. No existing Docusign usage data available.\n' +
           'This is a net-new opportunity with no current product footprint.';
  }
  var lines = [];
  lines.push('Company: ' + data.identity.name);
  lines.push('Industry: ' + data.context.industry);
  lines.push('Country: ' + data.context.country);
  lines.push('Docusign Plan: ' + data.contract.plan);
  lines.push('Contract Term: ' + data.contract.termStart + ' to ' + data.contract.termEnd);
  var termPct = data.contract.percentComplete;
  lines.push('Term Completion: ' + (termPct > 100 ? 'Term elapsed (' + termPct.toFixed(1) + '%)' : termPct.toFixed(1) + '%'));
  lines.push('Envelopes Purchased: ' + data.consumption.envelopesPurchased.toLocaleString());
  lines.push('Envelopes Sent: ' + data.consumption.envelopesSent.toLocaleString());
  lines.push('Consumption Pacing: ' + data.consumption.consumptionPerformance.toFixed(1) + '%');
  lines.push('Usage Trend: ' + data.consumption.usageTrend);
  lines.push('Seats Purchased: ' + data.seats.purchased);
  lines.push('Active Seats: ' + data.seats.active);
  lines.push('Seat Activation: ' + data.seats.activationRate.toFixed(1) + '%');
  lines.push('Integration Count: ' + data.integrations.count);
  if (data.integrations.salesforce > 0) lines.push('  - Salesforce: ' + data.integrations.salesforce + ' envelopes');
  if (data.integrations.workday > 0)    lines.push('  - Workday: ' + data.integrations.workday + ' envelopes');
  if (data.integrations.sap > 0)        lines.push('  - SAP: ' + data.integrations.sap + ' envelopes');
  if (data.integrations.customApi > 0)  lines.push('  - Custom API: ' + data.integrations.customApi + ' envelopes');
  lines.push('Active Docusign Products: ' + data.activeProducts.join(', '));
  lines.push('Unused Docusign Products: ' + data.inactiveProducts.join(', '));
  lines.push('ACV: $' + data.financial.acv.toLocaleString());
  lines.push('Sales Channel: ' + data.context.salesChannel);

  // ── Envelope Velocity ─────────────────────────────────────────
  lines.push('Envelope Velocity: 7d=' + data.consumption.sent7d.toLocaleString() +
    ', 30d=' + data.consumption.sent30d.toLocaleString() +
    ', 60d=' + data.consumption.sent60d.toLocaleString() +
    ', 90d=' + data.consumption.sent90d.toLocaleString() +
    ', 365d=' + data.consumption.sent365d.toLocaleString());

  // ── Void/Expire/Decline Rates ─────────────────────────────────
  lines.push('Transaction Rates: Declined=' + data.consumption.pctDeclined.toFixed(1) + '%' +
    ', Voided=' + data.consumption.pctVoided.toFixed(1) + '%' +
    ', Expired=' + data.consumption.pctExpired.toFixed(1) + '%' +
    ', Completed=' + data.consumption.completedRate.toFixed(1) + '%');

  // ── Automation vs Webapp Split ────────────────────────────────
  var totalSends = data.integrations.webappSends + data.integrations.automationSends;
  if (totalSends > 0) {
    var webappPct = ((data.integrations.webappSends / totalSends) * 100).toFixed(1);
    var automationPct = ((data.integrations.automationSends / totalSends) * 100).toFixed(1);
    lines.push('Send Split: Webapp=' + data.integrations.webappSends.toLocaleString() + ' (' + webappPct + '%)' +
      ', Automation=' + data.integrations.automationSends.toLocaleString() + ' (' + automationPct + '%)');
  }

  // ── Product Signal Summary ────────────────────────────────────
  if (productSignals && productSignals.summary) {
    lines.push('');
    lines.push('--- PRODUCT SIGNAL ANALYSIS ---');
    lines.push(productSignals.summary);
  }

  return lines.join('\n');
}
