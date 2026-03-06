/**
 * Configuration and constants for Growth Strategy Generator.
 */

// ── Script Property Keys ──────────────────────────────────────────────
var PROP_API_KEY       = 'INFRA_API_KEY';
var PROP_API_USER      = 'INFRA_API_USER';
var PROP_OUTPUT_FOLDER = 'OUTPUT_FOLDER_ID';

var LLM_ENDPOINT = 'https://infra.agreementsdemo.com/openai?gb=1';
var LLM_MODEL    = '4o';

// ── Docusign logo (base64 JPEG) ───────────────────────────────────────
// Used in the document header. Sourced from Genius Bar header implementation.
var DOCUSIGN_LOGO_BASE64 = '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';


// ── Data Enrichment Configuration ────────────────────────────────────
var ENRICHMENT_ENABLED = true;   // Master on/off switch for public API enrichment

var PROP_SEC_PROXY_URL = 'SEC_PROXY_URL';     // Script property for SEC EDGAR proxy URL
var WIKI_API_URL     = 'https://en.wikipedia.org/api/rest_v1';
var WIKIDATA_API_URL = 'https://www.wikidata.org/w/api.php';

// ── Helpers to read Script Properties ─────────────────────────────────

function getConfig(key) {
  var val = PropertiesService.getScriptProperties().getProperty(key);
  if (!val) {
    throw new Error('Missing script property: ' + key + '. Set it via File > Project Properties > Script Properties.');
  }
  return val;
}

function getApiKey()       { return getConfig(PROP_API_KEY); }
function getApiUser()      { return getConfig(PROP_API_USER); }
function getOutputFolder() { return getConfig(PROP_OUTPUT_FOLDER); }

// ── Column Groups ─────────────────────────────────────────────────────
// Maps logical groups to the header names in the Book Scrub sheet.
// DataExtractor uses these to pull only the columns we care about.

var COLUMN_GROUPS = {

  identity: [
    'ACCOUNT_NAME_PLAN_TERM',
    'SFDC_PARENT_ACCOUNT_ID',
    'SITE_ID',
    'DOCUSIGN_ACCOUNT_ID',
    'SALESFORCE_ACCOUNT_ID',
    'URL'
  ],

  context: [
    'INDUSTRY',
    'BILLING_COUNTRY',
    'SALES_CHANNEL',
    'REGION',
    'GTM_GROUP',
    'GTM_GROUP_NAME',
    'PARTNER_ACCOUNT'
  ],

  contract: [
    'ACCOUNT_PLAN',
    'DOCUSIGN_ACCOUNT_PLAN_NAME',
    'CHARGE_MODEL',
    'TERM_START_DATE',
    'TERM_END_DATE',
    'TERM_END_FYQ',
    'DAYS_USED',
    'DAYS_LEFT',
    'PERCENTAGE_TERM_COMPLETED',
    'MONTHS_LEFT',
    'IS_MULTI_YEAR_RAMP'
  ],

  consumption: [
    'ENVELOPES_PURCHASED',
    'ENVELOPES_SENT',
    'ENVELOPES_SENT_7_DAYS',
    'ENVELOPES_SENT_30_DAYS',
    'ENVELOPES_SENT_60_DAYS',
    'ENVELOPES_SENT_90_DAYS',
    'ENVELOPES_SENT_365_DAYS',
    'ENVELOPES_EXPECTED',
    'CONSUMPTION_PERFORMANCE',
    'USAGE_TREND',
    'USAGE_TREND_SEAT',
    'PROJECTED_USAGE_SCORE',
    'LAST_30_DAYS_PERFORMANCE_BUCKET',
    'SEND_VITALITY',
    'SEND_VELOCITY_MOM',
    'ENVELOPES_COMPLETED',
    'ENVELOPES_COMPLETED_RATE',
    'ENVELOPES_DECLINED',
    'ENVELOPES_VOIDED',
    'ENVELOPES_EXPIRED',
    'PERCENT_DECLINED',
    'PERCENT_VOIDED',
    'PERCENT_EXPIRED',
    'PERCENTAGE_USAGE_VS_EXPECTED_TO_DATE',
    'USAGE_VS_EXPECTED_TO_DATE',
    'PROJECTED_ENVELOPES_SENT',
    'ENVELOPE_ALLOWANCE',
    'PLANNED_SENDS',
    'PLANNED_ENVELOPES_USED_PER_DAY'
  ],

  integrations: [
    'ENVELOPES_VIA_SALESFORCE',
    'ENVELOPES_VIA_WORKDAY',
    'ENVELOPES_VIA_SAP',
    'CUSTOM_API_SENT',
    'PERCENT_CUSTOM_API_SENT',
    'COUNT_POWERFORM_SENT',
    'PERCENT_POWERFORM_SENT',
    'COUNT_BULKSEND_SENT',
    'PERCENT_BULKSEND_SENT',
    'MOBILE_SIGNS',
    'NON_MOBILE_SIGNS',
    'ANNUAL_WEBAPP_SENTS',
    'ANNUAL_AUTOMATION_SENTS'
  ],

  seats: [
    'SEATS_PURCHASED',
    'ACTIVE_SEATS',
    'ADMIN_SEATS',
    'VIEWER_SEATS',
    'SENDER_SEATS',
    'SEATS_ACTIVATION_SENT',
    'PERCENTAGE_SVA',
    'PERCENTAGE_EVA',
    'ACTIVE_SEATS_MOM',
    'IS_UNLIMITED_SEATS'
  ],

  financial: [
    'RENEWAL_BASE_CMRR',
    'ACCOUNT_ACV',
    'MRR_CURRENCY',
    'EFFECTIVE_COST_PER_ENVELOPE',
    'EFFECTIVE_COST_PER_SEAT',
    'REPORTING_MMR'
  ],

  products: [
    'IS_CLM_ACCOUNT',
    'IS_IAM',
    'SMS_DELIVERY_PURCHASED',
    'SMS_DELIVERY_USED',
    'SMS_AUTH_PURCHASED',
    'SMS_AUTH_USED',
    'PHONE_AUTH_PURCHASED',
    'PHONE_AUTH_USED',
    'ID_CHECK_PURCHASED',
    'ID_CHECK_USED',
    'ID_VERIFY_GOVID_EID_AUTH_PURCHASED',
    'ID_VERIFY_GOVID_EID_AUTH_USED',
    'CLICKWRAPS_PURCHASED',
    'CLICKWRAPS_USED',
    'AGREEMENT_ACTIONS_PURCHASED',
    'AGREEMENT_ACTIONS_USED',
    'WORKFLOW_RUNS_PURCHASED',
    'WORKFLOW_RUNS_USAGE',
    'WORKFLOW_DEFINITIONS_PURCHASED',
    'WORKFLOW_DEFINITIONS_USAGE',
    'AI_EXTRACTION_PURCHASED',
    'AI_EXTRACTION_USAGE',
    'NAVIGATOR_OPEN_DOCUMENT_PURCHASED',
    'NAVIGATOR_OPEN_DOCUMENT_USAGE',
    'NAVIGATOR_AGREEMENTS_PURCHASED',
    'NAVIGATOR_AGREEMENTS_USAGE',
    'DOCUMENT_GENERATION_FOR_ESIGNATURE_PURCHASED',
    'DOCUMENT_GENERATION_FOR_ESIGNATURE_USAGE',
    'WEBAPP_SENDS_PURCHASED',
    'WEBAPP_SENDS_USAGE',
    'AUTOMATION_SENDS_PURCHASED',
    'AUTOMATION_SENDS_USAGE',
    'SEAT_FULL_USER_PURCHASED',
    'SEAT_FULL_USER_USAGE',
    'SEAT_VIEWER_USER_PURCHASED',
    'SEAT_VIEWER_USER_USAGE',
    'MULTI_CHANNEL_DELIVERY_PURCHASED',
    'MULTI_CHANNEL_DELIVERY_USAGE',
    'PREMIUM_DATA_VERIFICATIONS_PURCHASED',
    'PREMIUM_DATA_VERIFICATIONS_USAGE',
    'ID_VERIFICATION_PURCHASED',
    'ID_VERIFICATION_USAGE',
    'SAML_AUTHENTICATION',
    'SAML_AUTHENTICATION_PURCH'
  ],

  people: [
    'ACCOUNT_OWNER',
    'ACCOUNT_OWNER_MANAGER',
    'CSM',
    'CSM_MANAGER',
    'SUBSCRIPTION_RENEWAL_MANAGER',
    'RENEWAL_MANAGER',
    'EXECUTIVE_SALES_REP',
    'MDR'
  ]
};

// Flat list of all columns we extract
var ALL_COLUMNS = Object.keys(COLUMN_GROUPS).reduce(function(acc, group) {
  return acc.concat(COLUMN_GROUPS[group]);
}, []);

// ── Regulated Industries ─────────────────────────────────────────────
var REGULATED_INDUSTRIES = [
  'financial services', 'banking', 'insurance', 'healthcare',
  'pharmaceutical', 'government', 'legal', 'energy'
];

// ── Agreement Landscape Fallback Data ────────────────────────────────
// Universal agreement types found in virtually every enterprise.
// Used by generateFallbackAgreementLandscape() when LLM Call 3 fails.

var BASE_AGREEMENTS = [
  { agreementType: 'Non-Disclosure Agreement (NDA)', category: 'External', contractType: 'Non-negotiated', volume: 8, complexity: 2, description: 'Standard confidentiality agreements used before sharing proprietary information with external parties.', departmentHint: 'legal' },
  { agreementType: 'Employment Agreement', category: 'Internal', contractType: 'Form-based', volume: 7, complexity: 4, description: 'Contracts governing the terms of employment including compensation, benefits, and termination clauses.', departmentHint: 'hr' },
  { agreementType: 'Master Service Agreement (MSA)', category: 'External', contractType: 'Negotiated', volume: 6, complexity: 8, description: 'Framework agreements that establish terms for ongoing service relationships with vendors or clients.', departmentHint: 'legal' },
  { agreementType: 'Purchase Order', category: 'External', contractType: 'Form-based', volume: 9, complexity: 2, description: 'Standardized documents authorizing purchases of goods or services from suppliers.', departmentHint: 'procurement' },
  { agreementType: 'Statement of Work (SOW)', category: 'External', contractType: 'Negotiated', volume: 7, complexity: 6, description: 'Project-specific agreements defining scope, deliverables, timelines, and costs under an MSA.', departmentHint: 'operations' },
  { agreementType: 'Vendor/Supplier Agreement', category: 'External', contractType: 'Negotiated', volume: 6, complexity: 6, description: 'Contracts establishing terms with suppliers for ongoing goods or services procurement.', departmentHint: 'procurement' },
  { agreementType: 'Lease Agreement', category: 'External', contractType: 'Negotiated', volume: 3, complexity: 7, description: 'Real estate and equipment lease contracts for office space, facilities, and capital equipment.', departmentHint: 'finance' },
  { agreementType: 'Independent Contractor Agreement', category: 'External', contractType: 'Form-based', volume: 5, complexity: 3, description: 'Agreements with independent contractors defining scope of work, payment terms, and IP ownership.', departmentHint: 'hr' }
];

// Industry-specific agreement overlays keyed by industry keyword.
// Matched using case-insensitive substring, same as REGULATED_INDUSTRIES detection.

var INDUSTRY_AGREEMENTS = {
  'financial services': [
    { agreementType: 'Loan Agreement', category: 'External', contractType: 'Negotiated', volume: 9, complexity: 8, description: 'Credit facility and loan origination documents governing lending terms, interest rates, and repayment schedules.', departmentHint: 'sales' },
    { agreementType: 'Account Opening Agreement', category: 'External', contractType: 'Form-based', volume: 9, complexity: 3, description: 'Standardized agreements for new customer account creation across deposit, investment, and credit products.', departmentHint: 'operations' },
    { agreementType: 'Trading/Brokerage Agreement', category: 'External', contractType: 'Negotiated', volume: 7, complexity: 7, description: 'Agreements governing trading relationships, margin accounts, and brokerage services.', departmentHint: 'sales' },
    { agreementType: 'Regulatory Filing', category: 'External', contractType: 'Regulatory', volume: 6, complexity: 8, description: 'Compliance documents and regulatory submissions required by financial regulators.', departmentHint: 'legal' },
    { agreementType: 'Wire Transfer Authorization', category: 'External', contractType: 'Form-based', volume: 8, complexity: 2, description: 'Authorization forms for wire transfers and electronic fund movements.', departmentHint: 'operations' }
  ],
  'banking': [
    { agreementType: 'Loan Agreement', category: 'External', contractType: 'Negotiated', volume: 9, complexity: 8, description: 'Credit facility and loan origination documents governing lending terms, interest rates, and repayment schedules.', departmentHint: 'sales' },
    { agreementType: 'Account Opening Agreement', category: 'External', contractType: 'Form-based', volume: 9, complexity: 3, description: 'Standardized agreements for new customer account creation across deposit, investment, and credit products.', departmentHint: 'operations' },
    { agreementType: 'Trading/Brokerage Agreement', category: 'External', contractType: 'Negotiated', volume: 7, complexity: 7, description: 'Agreements governing trading relationships, margin accounts, and brokerage services.', departmentHint: 'sales' },
    { agreementType: 'Regulatory Filing', category: 'External', contractType: 'Regulatory', volume: 6, complexity: 8, description: 'Compliance documents and regulatory submissions required by financial regulators.', departmentHint: 'legal' },
    { agreementType: 'Wire Transfer Authorization', category: 'External', contractType: 'Form-based', volume: 8, complexity: 2, description: 'Authorization forms for wire transfers and electronic fund movements.', departmentHint: 'operations' }
  ],
  'insurance': [
    { agreementType: 'Insurance Policy', category: 'External', contractType: 'Form-based', volume: 9, complexity: 6, description: 'Policy documents defining coverage terms, premiums, exclusions, and claims procedures.', departmentHint: 'sales' },
    { agreementType: 'Claims Settlement Agreement', category: 'External', contractType: 'Negotiated', volume: 8, complexity: 7, description: 'Agreements finalizing claim resolutions, payment amounts, and release of liability.', departmentHint: 'operations' },
    { agreementType: 'Reinsurance Treaty', category: 'External', contractType: 'Negotiated', volume: 4, complexity: 9, description: 'Contracts between insurers to transfer portions of risk portfolios.', departmentHint: 'finance' },
    { agreementType: 'Agent/Broker Agreement', category: 'External', contractType: 'Negotiated', volume: 6, complexity: 5, description: 'Agreements with independent agents and brokers defining commissions and distribution terms.', departmentHint: 'sales' }
  ],
  'healthcare': [
    { agreementType: 'Patient Consent Form', category: 'External', contractType: 'Regulatory', volume: 10, complexity: 3, description: 'Consent documents required before medical procedures, treatments, or data sharing.', departmentHint: 'operations' },
    { agreementType: 'Business Associate Agreement (BAA)', category: 'External', contractType: 'Regulatory', volume: 6, complexity: 8, description: 'HIPAA-required agreements with vendors who handle protected health information.', departmentHint: 'legal' },
    { agreementType: 'Provider Agreement', category: 'External', contractType: 'Negotiated', volume: 7, complexity: 7, description: 'Contracts with healthcare providers defining reimbursement rates and network participation.', departmentHint: 'operations' },
    { agreementType: 'Clinical Trial Agreement', category: 'External', contractType: 'Negotiated', volume: 4, complexity: 9, description: 'Research agreements governing clinical study protocols, patient safety, and data rights.', departmentHint: 'legal' },
    { agreementType: 'Informed Consent', category: 'External', contractType: 'Regulatory', volume: 9, complexity: 4, description: 'Detailed consent documents informing patients of risks, benefits, and alternatives for treatments.', departmentHint: 'operations' }
  ],
  'pharmaceutical': [
    { agreementType: 'Patient Consent Form', category: 'External', contractType: 'Regulatory', volume: 10, complexity: 3, description: 'Consent documents required before medical procedures, treatments, or data sharing.', departmentHint: 'operations' },
    { agreementType: 'Business Associate Agreement (BAA)', category: 'External', contractType: 'Regulatory', volume: 6, complexity: 8, description: 'HIPAA-required agreements with vendors who handle protected health information.', departmentHint: 'legal' },
    { agreementType: 'Provider Agreement', category: 'External', contractType: 'Negotiated', volume: 7, complexity: 7, description: 'Contracts with healthcare providers defining reimbursement rates and network participation.', departmentHint: 'operations' },
    { agreementType: 'Clinical Trial Agreement', category: 'External', contractType: 'Negotiated', volume: 4, complexity: 9, description: 'Research agreements governing clinical study protocols, patient safety, and data rights.', departmentHint: 'legal' },
    { agreementType: 'Informed Consent', category: 'External', contractType: 'Regulatory', volume: 9, complexity: 4, description: 'Detailed consent documents informing patients of risks, benefits, and alternatives for treatments.', departmentHint: 'operations' }
  ],
  'government': [
    { agreementType: 'Government Contract (FAR/DFAR)', category: 'External', contractType: 'Regulatory', volume: 6, complexity: 9, description: 'Federal acquisition regulation contracts with strict compliance, reporting, and audit requirements.', departmentHint: 'legal' },
    { agreementType: 'Grant Agreement', category: 'External', contractType: 'Negotiated', volume: 7, complexity: 7, description: 'Agreements governing the distribution and use of government grant funding.', departmentHint: 'finance' },
    { agreementType: 'Interagency Agreement', category: 'Internal', contractType: 'Negotiated', volume: 5, complexity: 6, description: 'Agreements between government agencies for shared services, data, or resources.', departmentHint: 'operations' },
    { agreementType: 'Public Records Request', category: 'External', contractType: 'Regulatory', volume: 7, complexity: 3, description: 'FOIA and public records responses requiring formal documentation and compliance tracking.', departmentHint: 'legal' }
  ],
  'legal': [
    { agreementType: 'Engagement Letter', category: 'External', contractType: 'Negotiated', volume: 8, complexity: 5, description: 'Client engagement agreements defining scope of legal services, fees, and responsibilities.', departmentHint: 'sales' },
    { agreementType: 'Settlement Agreement', category: 'External', contractType: 'Negotiated', volume: 6, complexity: 8, description: 'Agreements resolving disputes, defining settlement terms, and releasing claims.', departmentHint: 'legal' },
    { agreementType: 'IP Assignment Agreement', category: 'External', contractType: 'Negotiated', volume: 5, complexity: 7, description: 'Agreements transferring intellectual property rights between parties.', departmentHint: 'legal' },
    { agreementType: 'Court Filing', category: 'External', contractType: 'Regulatory', volume: 7, complexity: 6, description: 'Legal documents filed with courts requiring proper execution and compliance.', departmentHint: 'legal' }
  ],
  'energy': [
    { agreementType: 'Power Purchase Agreement (PPA)', category: 'External', contractType: 'Negotiated', volume: 5, complexity: 9, description: 'Long-term contracts for the purchase of electricity from power generation facilities.', departmentHint: 'sales' },
    { agreementType: 'Interconnection Agreement', category: 'External', contractType: 'Negotiated', volume: 4, complexity: 8, description: 'Agreements governing the connection of generation facilities to the electrical grid.', departmentHint: 'operations' },
    { agreementType: 'Regulatory Filing', category: 'External', contractType: 'Regulatory', volume: 6, complexity: 8, description: 'Compliance documents and rate filings submitted to energy regulatory bodies.', departmentHint: 'legal' },
    { agreementType: 'Environmental Compliance Agreement', category: 'External', contractType: 'Regulatory', volume: 5, complexity: 7, description: 'Agreements ensuring compliance with environmental regulations, emissions standards, and permits.', departmentHint: 'operations' }
  ],
  'technology': [
    { agreementType: 'SaaS Subscription Agreement', category: 'External', contractType: 'Form-based', volume: 8, complexity: 5, description: 'Software-as-a-service agreements defining subscription terms, SLAs, and data handling.', departmentHint: 'sales' },
    { agreementType: 'Software License Agreement', category: 'External', contractType: 'Negotiated', volume: 7, complexity: 7, description: 'License agreements governing the use, distribution, and modification of software products.', departmentHint: 'sales' },
    { agreementType: 'API/Developer Agreement', category: 'External', contractType: 'Form-based', volume: 7, complexity: 4, description: 'Terms of use for APIs and developer platforms, including usage limits and data policies.', departmentHint: 'operations' },
    { agreementType: 'Reseller Agreement', category: 'External', contractType: 'Negotiated', volume: 5, complexity: 6, description: 'Channel partner agreements defining resale rights, margins, and support responsibilities.', departmentHint: 'sales' }
  ],
  'software': [
    { agreementType: 'SaaS Subscription Agreement', category: 'External', contractType: 'Form-based', volume: 8, complexity: 5, description: 'Software-as-a-service agreements defining subscription terms, SLAs, and data handling.', departmentHint: 'sales' },
    { agreementType: 'Software License Agreement', category: 'External', contractType: 'Negotiated', volume: 7, complexity: 7, description: 'License agreements governing the use, distribution, and modification of software products.', departmentHint: 'sales' },
    { agreementType: 'API/Developer Agreement', category: 'External', contractType: 'Form-based', volume: 7, complexity: 4, description: 'Terms of use for APIs and developer platforms, including usage limits and data policies.', departmentHint: 'operations' },
    { agreementType: 'Reseller Agreement', category: 'External', contractType: 'Negotiated', volume: 5, complexity: 6, description: 'Channel partner agreements defining resale rights, margins, and support responsibilities.', departmentHint: 'sales' }
  ],
  'saas': [
    { agreementType: 'SaaS Subscription Agreement', category: 'External', contractType: 'Form-based', volume: 8, complexity: 5, description: 'Software-as-a-service agreements defining subscription terms, SLAs, and data handling.', departmentHint: 'sales' },
    { agreementType: 'Software License Agreement', category: 'External', contractType: 'Negotiated', volume: 7, complexity: 7, description: 'License agreements governing the use, distribution, and modification of software products.', departmentHint: 'sales' },
    { agreementType: 'API/Developer Agreement', category: 'External', contractType: 'Form-based', volume: 7, complexity: 4, description: 'Terms of use for APIs and developer platforms, including usage limits and data policies.', departmentHint: 'operations' },
    { agreementType: 'Reseller Agreement', category: 'External', contractType: 'Negotiated', volume: 5, complexity: 6, description: 'Channel partner agreements defining resale rights, margins, and support responsibilities.', departmentHint: 'sales' }
  ],
  'manufacturing': [
    { agreementType: 'Supply Agreement', category: 'External', contractType: 'Negotiated', volume: 8, complexity: 7, description: 'Long-term agreements with raw material and component suppliers defining volumes, pricing, and quality standards.', departmentHint: 'procurement' },
    { agreementType: 'Quality Agreement', category: 'External', contractType: 'Negotiated', volume: 6, complexity: 6, description: 'Agreements defining quality standards, testing procedures, and acceptance criteria for supplied goods.', departmentHint: 'operations' },
    { agreementType: 'Bill of Materials Agreement', category: 'Internal', contractType: 'Form-based', volume: 7, complexity: 4, description: 'Documentation of component specifications, sourcing, and assembly requirements for manufactured products.', departmentHint: 'operations' },
    { agreementType: 'Distribution Agreement', category: 'External', contractType: 'Negotiated', volume: 6, complexity: 6, description: 'Agreements with distributors defining territories, pricing, inventory, and logistics responsibilities.', departmentHint: 'sales' }
  ],
  'retail': [
    { agreementType: 'Franchise Agreement', category: 'External', contractType: 'Negotiated', volume: 5, complexity: 8, description: 'Agreements granting franchise rights including brand usage, operational standards, and royalty terms.', departmentHint: 'sales' },
    { agreementType: 'Distribution Agreement', category: 'External', contractType: 'Negotiated', volume: 7, complexity: 6, description: 'Agreements with distributors and wholesalers for product distribution and logistics.', departmentHint: 'sales' },
    { agreementType: 'Merchandising Agreement', category: 'External', contractType: 'Negotiated', volume: 6, complexity: 5, description: 'Agreements for product placement, promotional displays, and co-marketing arrangements.', departmentHint: 'sales' },
    { agreementType: 'Return/Warranty Policy', category: 'External', contractType: 'Form-based', volume: 8, complexity: 3, description: 'Standardized return, refund, and warranty terms presented to customers at point of sale.', departmentHint: 'operations' }
  ],
  'ecommerce': [
    { agreementType: 'Franchise Agreement', category: 'External', contractType: 'Negotiated', volume: 5, complexity: 8, description: 'Agreements granting franchise rights including brand usage, operational standards, and royalty terms.', departmentHint: 'sales' },
    { agreementType: 'Distribution Agreement', category: 'External', contractType: 'Negotiated', volume: 7, complexity: 6, description: 'Agreements with distributors and wholesalers for product distribution and logistics.', departmentHint: 'sales' },
    { agreementType: 'Merchandising Agreement', category: 'External', contractType: 'Negotiated', volume: 6, complexity: 5, description: 'Agreements for product placement, promotional displays, and co-marketing arrangements.', departmentHint: 'sales' },
    { agreementType: 'Return/Warranty Policy', category: 'External', contractType: 'Form-based', volume: 8, complexity: 3, description: 'Standardized return, refund, and warranty terms presented to customers at point of sale.', departmentHint: 'operations' }
  ],
  'consumer': [
    { agreementType: 'Franchise Agreement', category: 'External', contractType: 'Negotiated', volume: 5, complexity: 8, description: 'Agreements granting franchise rights including brand usage, operational standards, and royalty terms.', departmentHint: 'sales' },
    { agreementType: 'Distribution Agreement', category: 'External', contractType: 'Negotiated', volume: 7, complexity: 6, description: 'Agreements with distributors and wholesalers for product distribution and logistics.', departmentHint: 'sales' },
    { agreementType: 'Merchandising Agreement', category: 'External', contractType: 'Negotiated', volume: 6, complexity: 5, description: 'Agreements for product placement, promotional displays, and co-marketing arrangements.', departmentHint: 'sales' },
    { agreementType: 'Return/Warranty Policy', category: 'External', contractType: 'Form-based', volume: 8, complexity: 3, description: 'Standardized return, refund, and warranty terms presented to customers at point of sale.', departmentHint: 'operations' }
  ],
  'professional services': [
    { agreementType: 'Consulting Agreement', category: 'External', contractType: 'Negotiated', volume: 8, complexity: 6, description: 'Agreements defining consulting engagement scope, deliverables, rates, and intellectual property terms.', departmentHint: 'sales' },
    { agreementType: 'Engagement Letter', category: 'External', contractType: 'Negotiated', volume: 7, complexity: 5, description: 'Client engagement agreements defining scope of professional services, fees, and responsibilities.', departmentHint: 'sales' },
    { agreementType: 'Subcontractor Agreement', category: 'External', contractType: 'Negotiated', volume: 6, complexity: 5, description: 'Agreements with subcontractors to deliver portions of client engagements.', departmentHint: 'operations' }
  ],
  'consulting': [
    { agreementType: 'Consulting Agreement', category: 'External', contractType: 'Negotiated', volume: 8, complexity: 6, description: 'Agreements defining consulting engagement scope, deliverables, rates, and intellectual property terms.', departmentHint: 'sales' },
    { agreementType: 'Engagement Letter', category: 'External', contractType: 'Negotiated', volume: 7, complexity: 5, description: 'Client engagement agreements defining scope of professional services, fees, and responsibilities.', departmentHint: 'sales' },
    { agreementType: 'Subcontractor Agreement', category: 'External', contractType: 'Negotiated', volume: 6, complexity: 5, description: 'Agreements with subcontractors to deliver portions of client engagements.', departmentHint: 'operations' }
  ]
};

// Default fallback agreements when industry doesn't match any known keyword
var DEFAULT_INDUSTRY_AGREEMENTS = [
  { agreementType: 'Service Agreement', category: 'External', contractType: 'Negotiated', volume: 7, complexity: 5, description: 'General service agreements defining terms for professional or managed services.', departmentHint: 'operations' },
  { agreementType: 'Consulting Agreement', category: 'External', contractType: 'Negotiated', volume: 6, complexity: 5, description: 'Agreements with external consultants defining scope, rates, and deliverables.', departmentHint: 'operations' },
  { agreementType: 'Partnership Agreement', category: 'External', contractType: 'Negotiated', volume: 4, complexity: 7, description: 'Strategic partnership agreements defining joint ventures, revenue sharing, and collaboration terms.', departmentHint: 'sales' },
  { agreementType: 'Licensing Agreement', category: 'External', contractType: 'Negotiated', volume: 5, complexity: 6, description: 'Agreements granting rights to use intellectual property, technology, or brand assets.', departmentHint: 'legal' }
];

// ── Docusign Product Catalog ─────────────────────────────────────────
// Structured product knowledge for signal matching and LLM context.
// The signal descriptions here are descriptive — actual evaluation logic
// lives in generateProductSignals() in DataExtractor.gs.

var DOCUSIGN_CATALOG = {
  bundles: [
    {
      name: 'IAM Core',
      tiers: ['Standard', 'Professional', 'Enterprise'],
      description: 'Foundation IAM platform for agreement workflows',
      includes: ['eSignature', 'Maestro', 'Web Forms', 'Agreement Prep', 'Navigator', 'App Center'],
      solves: ['manual agreement processes', 'lack of workflow automation', 'disconnected agreement data'],
      upgradeSignals: ['high envelope volume with no automation', 'multiple integrations but no orchestration', 'webapp-heavy usage']
    },
    {
      name: 'IAM for Sales',
      description: 'Agreement workflows embedded in CRM for sales teams',
      includes: ['eSignature', 'Maestro', 'Web Forms', 'Agreement Prep', 'Navigator', 'App Center', 'CRM Integration'],
      solves: ['slow sales cycles', 'manual proposal/quote generation', 'disconnected CRM and agreement data'],
      upgradeSignals: ['Salesforce integration active', 'high webapp sends from sales', 'docGen not active']
    },
    {
      name: 'IAM for CX',
      description: 'Customer-facing agreement experiences',
      includes: ['eSignature', 'Maestro', 'Web Forms', 'Agreement Prep', 'Navigator', 'App Center'],
      solves: ['poor customer onboarding experience', 'high decline/expire rates', 'manual customer-facing processes'],
      upgradeSignals: ['high decline rates', 'mobile signing activity', 'customer-facing industry']
    },
    {
      name: 'CLM',
      description: 'Full contract lifecycle management for complex agreements',
      includes: ['Contract authoring', 'Negotiation', 'Repository', 'Obligation tracking'],
      solves: ['unmanaged contract risk', 'manual negotiation workflows', 'no central agreement repository'],
      upgradeSignals: ['high ACV without CLM', 'high-complexity agreements', 'regulated industry']
    }
  ],
  components: [
    {
      name: 'Navigator',
      description: 'AI-powered agreement repository — search, extract clauses/dates/obligations, report on agreement portfolio',
      solves: ['no visibility into existing agreements', 'manual clause extraction', 'missed obligations and renewals'],
      signals: { strong: 'envelopesSent > 20000 OR (clm AND NOT navigator)', moderate: 'envelopesSent > 5000' }
    },
    {
      name: 'Maestro',
      description: 'No-code workflow builder for pre- and post-signature agreement processes',
      solves: ['manual multi-step processes', 'disconnected pre/post-signature workflows', 'no conditional routing'],
      signals: { strong: 'apiPct > 50% OR automationSends > webappSends OR (NOT workflows AND integrations >= 2)', moderate: 'integrations >= 1 OR sent365d > 1000' }
    },
    {
      name: 'Agreement Desk',
      description: 'Intake, collaboration, and AI-assisted review for negotiated agreements (Limited Availability)',
      solves: ['slow contract negotiation', 'no collaboration on agreements', 'manual redlining'],
      signals: { strong: 'clm active AND high-complexity agreements', moderate: 'regulated or legal-heavy industry' }
    },
    {
      name: 'Web Forms',
      description: 'Structured digital intake forms that pre-fill agreements and trigger workflows',
      solves: ['manual data collection', 'errors from re-keying data', 'no structured intake process'],
      signals: { strong: 'powerforms > 100 OR webappSends > automationSends', moderate: 'webappSends > 0' }
    },
    {
      name: 'Agreement Prep (DocGen)',
      description: 'Generate agreements from templates using data from CRM, forms, or other sources',
      solves: ['manual document creation', 'inconsistent agreement formatting', 'slow proposal generation'],
      signals: { strong: 'NOT docGen AND (envelopesSent > 5000 OR salesforce > 0)', moderate: 'envelopesSent > 1000' }
    },
    {
      name: 'eSignature',
      description: 'Core electronic signature — send, sign, and manage agreements digitally',
      solves: ['paper-based signing', 'slow agreement turnaround', 'no audit trail'],
      signals: { note: 'Base product — all accounts have this. Focus on usage optimization.' }
    },
    {
      name: 'ID Verification (IDV)',
      description: 'Verify signer identity via photo IDs, passports, eIDs, or liveness checks',
      solves: ['signer identity fraud risk', 'compliance requirements for identity verification', 'high-value agreement security'],
      signals: { strong: 'NOT idv AND regulated industry (Finance, Healthcare, Insurance, Government)', moderate: 'pctDeclined > 5 OR pctVoided > 5' }
    },
    {
      name: 'App Center',
      description: 'Pre-built integrations with 900+ business applications',
      solves: ['disconnected business systems', 'manual data transfer between apps', 'no integration without custom dev'],
      signals: { strong: 'integrations == 0 AND envelopesSent > 1000', moderate: 'integrations < 3' }
    },
    {
      name: 'Monitor',
      description: 'Admin visibility into account activity, API usage, and security events',
      solves: ['no admin oversight', 'security blind spots', 'compliance audit gaps'],
      signals: { strong: 'activeSeat > 50 OR adminSeats > 5', moderate: 'integrations >= 2' }
    },
    {
      name: 'Embedded Signing',
      description: 'Click-to-agree for standard terms, privacy policies, and disclosures',
      solves: ['no audit trail for terms acceptance', 'manual terms management', 'compliance gaps on standard agreements'],
      signals: { strong: 'NOT clickwraps AND (webappSends > 1000 OR ecommerce/SaaS industry)', moderate: 'NOT clickwraps' }
    },
    {
      name: 'Multi-Channel Delivery',
      description: 'Deliver agreements via SMS, WhatsApp, and other channels beyond email',
      solves: ['low signer response rates', 'email-only delivery limitations', 'reaching mobile-first audiences'],
      signals: { strong: 'NOT multiChannel AND envelopesSent > 5000', moderate: 'international presence or field workforce' }
    },
    {
      name: 'SMS Delivery',
      description: 'Send signing notifications and links via SMS',
      solves: ['low email open rates', 'reaching signers without reliable email', 'faster signing turnaround'],
      signals: { strong: 'NOT smsDelivery AND (mobileSigns > 0 OR field-heavy industry)', moderate: 'envelopesSent > 1000' }
    },
    {
      name: 'SMS Authentication',
      description: 'Two-factor authentication via SMS for signer verification',
      solves: ['weak signer authentication', 'compliance requirements for 2FA', 'identity verification gaps'],
      signals: { strong: 'NOT smsAuth AND regulated industry', moderate: 'NOT smsAuth AND envelopesSent > 1000' }
    },
    {
      name: 'Phone Authentication',
      description: 'Voice-based signer verification via phone call',
      solves: ['need for voice-based identity verification', 'high-security agreement signing'],
      signals: { strong: 'NOT phoneAuth AND (Finance OR Insurance OR Government)', moderate: 'NOT phoneAuth' }
    },
    {
      name: 'SAML/SSO',
      description: 'Single sign-on and user provisioning via SAML, SCIM, and organizational controls',
      solves: ['manual user provisioning', 'no centralized access control', 'security compliance gaps'],
      signals: { strong: 'NOT saml AND activeSeats > 20', moderate: 'NOT saml AND activeSeats > 5' }
    }
  ]
};
