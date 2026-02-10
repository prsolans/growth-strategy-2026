/**
 * XBRL concept extraction from SEC EDGAR companyfacts JSON.
 *
 * Each metric has a prioritized list of US-GAAP (or DEI) concept names.
 * extractLatestAnnual() walks the list, filters to 10-K / FY filings,
 * and returns the most recent value.
 */

const CONCEPT_MAP = {
  revenue: [
    'Revenues',
    'RevenueFromContractWithCustomerExcludingAssessedTax',
    'RevenueFromContractWithCustomerIncludingAssessedTax',
    'SalesRevenueNet',
    'SalesRevenueGoodsNet',
    'InterestAndDividendIncomeOperating',       // banks
    'InterestIncomeExpenseNet',                  // banks alt
    'TotalRevenuesAndOtherIncome',
  ],
  cogs: [
    'CostOfGoodsAndServicesSold',
    'CostOfRevenue',
    'CostOfGoodsSold',
  ],
  opex: [
    'OperatingExpenses',
    'CostsAndExpenses',
    'NoninterestExpense',                        // banks
    'OperatingCostsAndExpenses',
    'SellingGeneralAndAdministrativeExpense',
  ],
  capex: [
    'PaymentsToAcquirePropertyPlantAndEquipment',
    'CapitalExpenditureDiscontinuedOperations',
    'PaymentsToAcquireProductiveAssets',
  ],
  netIncome: [
    'NetIncomeLoss',
    'ProfitLoss',
    'NetIncomeLossAvailableToCommonStockholdersBasic',
    'ComprehensiveIncomeNetOfTax',
  ],
};

// Employees live under facts.dei, not facts["us-gaap"]
const EMPLOYEE_CONCEPTS = ['EntityNumberOfEmployees'];

/**
 * Extract the latest annual (10-K, FY) value for a list of concept names.
 *
 * @param {Object} factsSection  e.g. facts["us-gaap"] or facts["dei"]
 * @param {string[]} concepts    Prioritized concept names to try
 * @returns {{ value: number, period: string } | null}
 */
export function extractLatestAnnual(factsSection, concepts) {
  if (!factsSection) return null;

  // Check ALL concepts and return the one with the most recent filing date.
  // Companies change concept names over time (e.g., "Revenues" →
  // "RevenueFromContractWithCustomerExcludingAssessedTax"), so the first
  // concept in the list may only have old data.
  let best = null;

  for (const concept of concepts) {
    const entry = factsSection[concept];
    if (!entry) continue;

    const units = entry.units;
    if (!units) continue;

    // Try USD units first, then pure numbers (for employee counts etc.)
    const records = units.USD || units.pure || Object.values(units)[0];
    if (!records || !records.length) continue;

    // Filter to 10-K annual filings (fp = "FY")
    const annuals = records.filter(
      (r) => r.form === '10-K' && r.fp === 'FY'
    );
    if (!annuals.length) continue;

    // Sort by end date descending → latest first
    annuals.sort((a, b) => (b.end || '').localeCompare(a.end || ''));

    const latest = annuals[0];
    const candidate = { value: latest.val, period: (latest.end || '').slice(0, 4) };

    if (!best || candidate.period > best.period) {
      best = candidate;
    }
  }

  return best;
}

/**
 * Extract all financial metrics from an SEC EDGAR companyfacts response.
 *
 * @param {Object} companyfacts  Full JSON from data.sec.gov/api/xbrl/companyfacts/
 * @returns {{ financials: Object, filingPeriod: string|null }}
 */
export function extractAllMetrics(companyfacts) {
  const usGaap = companyfacts.facts && companyfacts.facts['us-gaap'];
  const dei = companyfacts.facts && companyfacts.facts['dei'];

  const financials = {};
  let filingPeriod = null;

  for (const [metric, concepts] of Object.entries(CONCEPT_MAP)) {
    const result = extractLatestAnnual(usGaap, concepts);
    if (result) {
      financials[metric] = result.value;
      if (result.period && (!filingPeriod || result.period > filingPeriod)) {
        filingPeriod = result.period;
      }
    } else {
      financials[metric] = null;
    }
  }

  // Employees from DEI section
  const empResult = extractLatestAnnual(dei, EMPLOYEE_CONCEPTS);
  financials.employees = empResult ? empResult.value : null;

  return { financials, filingPeriod };
}
