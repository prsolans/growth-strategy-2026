# Data Dictionary

## Overview

The Growth Strategy Generator reads from a single internal data source: the **bookscrub sheet**. This is a Google Sheets spreadsheet where each row represents a Docusign customer account and columns contain account metadata, usage metrics, product adoption flags, and financial data.

The tool does not access any external databases, CRM systems, or customer-facing APIs. All internal data comes from the columns listed below. The tool also creates one derived column (`COMPANY_NAME`) by parsing the existing `ACCOUNT_NAME_PLAN_TERM` field.

The columns are organized into 9 logical groups. Each group is described below with its fields, what they tell us, and how the tool uses them.

---

## 1. Identity

Account identifiers used for company lookup and document titling.

| Field | What It Tells Us | How It Is Used |
|-------|-----------------|----------------|
| `ACCOUNT_NAME_PLAN_TERM` | Combined account name, plan, and term dates in a single string | Parsed to extract the company name; displayed in doc title |
| `SFDC_PARENT_ACCOUNT_ID` | Salesforce parent account identifier | Included in the identity data block passed to the LLM |
| `SITE_ID` | Docusign site identifier | Included in identity data for reference |
| `DOCUSIGN_ACCOUNT_ID` | Docusign account identifier | Included in identity data for reference |
| `SALESFORCE_ACCOUNT_ID` | Salesforce account identifier | Included in identity data for reference |
| `URL` | Salesforce account URL | Included in identity data for reference |

---

## 2. Context

Industry, geography, and sales classification. Drives regulated-industry detection and provides the LLM with targeting context.

| Field | What It Tells Us | How It Is Used |
|-------|-----------------|----------------|
| `INDUSTRY` | Customer's industry classification | Checked against 8 regulated industries (financial services, banking, insurance, healthcare, pharmaceutical, government, legal, energy) to trigger stronger IDV, SMS Auth, Phone Auth, Agreement Desk, and CLM signals. Passed to LLM for research targeting. |
| `BILLING_COUNTRY` | Country of the billing address | Passed to LLM as geographic context |
| `SALES_CHANNEL` | Direct, partner, or other sales channel | Displayed in the Docusign Footprint section |
| `REGION` | Geographic sales region | Passed to LLM as context |
| `GTM_GROUP` | Go-to-market group code | Passed to LLM as context |
| `GTM_GROUP_NAME` | Go-to-market group name | Passed to LLM as context |
| `PARTNER_ACCOUNT` | Whether the account is partner-managed | Passed to LLM as context |

---

## 3. Contract

Plan type, term dates, and time remaining. Drives the health scorecard's renewal proximity and consumption pacing indicators.

| Field | What It Tells Us | How It Is Used |
|-------|-----------------|----------------|
| `ACCOUNT_PLAN` | Docusign plan tier (e.g., Business Pro, Enterprise Pro) | Displayed in Docusign Footprint; included in LLM summary |
| `DOCUSIGN_ACCOUNT_PLAN_NAME` | Full plan name | Displayed in Docusign Footprint |
| `CHARGE_MODEL` | Seat-based or envelope-based billing | Health scorecard: determines whether seat or envelope metrics are the primary health indicator |
| `TERM_START_DATE` | Contract start date | Displayed in Docusign Footprint; used to calculate term completion |
| `TERM_END_DATE` | Contract end date | Health scorecard: drives renewal proximity indicator |
| `TERM_END_FYQ` | Fiscal year quarter of renewal | Displayed in health scorecard renewal proximity detail |
| `DAYS_USED` | Days elapsed since term start | Displayed in Docusign Footprint |
| `DAYS_LEFT` | Days remaining until renewal | Displayed in Docusign Footprint |
| `PERCENTAGE_TERM_COMPLETED` | Percentage of the contract term elapsed | Health scorecard: combined with consumption data to calculate pacing ratio |
| `MONTHS_LEFT` | Months remaining until renewal | Health scorecard: <=3 = red (imminent), <=6 = yellow (approaching), >6 = green (runway) |
| `IS_MULTI_YEAR_RAMP` | Whether the contract has a ramp schedule | Displayed in Docusign Footprint |

---

## 4. Consumption

Envelope volume, velocity, and transaction outcomes. Drives signal matching thresholds and multiple health scorecard indicators.

| Field | What It Tells Us | How It Is Used |
|-------|-----------------|----------------|
| `ENVELOPES_PURCHASED` | Total envelopes in the contract | Health scorecard: pacing ratio = sent / purchased vs. term completion |
| `ENVELOPES_SENT` | Total envelopes sent to date | Signal matching: Navigator (>20k strong, >5k moderate), DocGen (>5k strong, >1k moderate), Multi-Channel (>5k strong), SMS Delivery (>1k moderate), SMS Auth (>1k moderate), App Center (>1k strong), Maestro 365d check. LLM summary. |
| `ENVELOPES_SENT_7_DAYS` | Envelopes sent in the last 7 days | LLM summary (envelope velocity); displayed in Docusign Footprint |
| `ENVELOPES_SENT_30_DAYS` | Envelopes sent in the last 30 days | LLM summary (envelope velocity); displayed in Docusign Footprint |
| `ENVELOPES_SENT_60_DAYS` | Envelopes sent in the last 60 days | LLM summary (envelope velocity); displayed in Docusign Footprint |
| `ENVELOPES_SENT_90_DAYS` | Envelopes sent in the last 90 days | LLM summary (envelope velocity); displayed in Docusign Footprint |
| `ENVELOPES_SENT_365_DAYS` | Envelopes sent in the last 365 days | Signal matching: Maestro moderate (>1k). LLM summary. |
| `ENVELOPES_EXPECTED` | Expected envelopes at this point in the term | LLM summary context |
| `CONSUMPTION_PERFORMANCE` | Performance vs. expected consumption (%) | LLM summary; displayed in Docusign Footprint |
| `USAGE_TREND` | Trend label (Over Trending, On Track, Under Trending) | Health scorecard: maps to green/yellow/red. LLM summary. |
| `USAGE_TREND_SEAT` | Seat-based usage trend | LLM summary context |
| `PROJECTED_USAGE_SCORE` | Projected usage score | Displayed in Docusign Footprint |
| `LAST_30_DAYS_PERFORMANCE_BUCKET` | Performance bucket for recent 30-day period | Displayed in Docusign Footprint |
| `SEND_VITALITY` | Vitality score for send activity | Displayed in Docusign Footprint |
| `SEND_VELOCITY_MOM` | Month-over-month change in send velocity (%) | Health scorecard: >10% = green, -10% to 10% = yellow, <-10% = red |
| `ENVELOPES_COMPLETED` | Total envelopes completed | Displayed in Docusign Footprint |
| `ENVELOPES_COMPLETED_RATE` | Completion rate (%) | Health scorecard: used with fail rate. LLM summary. |
| `ENVELOPES_DECLINED` | Envelopes declined by recipients | Displayed in Docusign Footprint |
| `ENVELOPES_VOIDED` | Envelopes voided by sender | Displayed in Docusign Footprint |
| `ENVELOPES_EXPIRED` | Envelopes that expired | Displayed in Docusign Footprint |
| `PERCENT_DECLINED` | Decline rate (%) | Signal matching: IDV moderate (>5%). Health scorecard: part of fail rate. LLM summary. |
| `PERCENT_VOIDED` | Void rate (%) | Signal matching: IDV moderate (>5%). Health scorecard: part of fail rate. LLM summary. |
| `PERCENT_EXPIRED` | Expire rate (%) | Health scorecard: IAM for CX bundle trigger (>5%). LLM summary. |
| `PERCENTAGE_USAGE_VS_EXPECTED_TO_DATE` | Usage vs. expected at current point in term | LLM summary context |
| `USAGE_VS_EXPECTED_TO_DATE` | Absolute usage vs. expected | LLM summary context |
| `PROJECTED_ENVELOPES_SENT` | Projected total envelopes by end of term | Displayed in Docusign Footprint |
| `ENVELOPE_ALLOWANCE` | Envelope allowance for the contract | Displayed in Docusign Footprint |
| `PLANNED_SENDS` | Planned sends | Displayed in Docusign Footprint |
| `PLANNED_ENVELOPES_USED_PER_DAY` | Planned daily send rate | LLM summary context |

---

## 5. Integrations

Integration usage across Salesforce, Workday, SAP, custom API, PowerForms, BulkSend, and mobile. Drives signal matching for Maestro, DocGen, Web Forms, App Center, Monitor, and bundle-level recommendations.

| Field | What It Tells Us | How It Is Used |
|-------|-----------------|----------------|
| `ENVELOPES_VIA_SALESFORCE` | Envelopes sent through Salesforce | Signal matching: DocGen strong (>0), IAM for Sales bundle (>0). Integration count. LLM summary. |
| `ENVELOPES_VIA_WORKDAY` | Envelopes sent through Workday | Integration count. LLM summary. |
| `ENVELOPES_VIA_SAP` | Envelopes sent through SAP | Integration count. LLM summary. |
| `CUSTOM_API_SENT` | Envelopes sent via custom API | Integration count. LLM summary. |
| `PERCENT_CUSTOM_API_SENT` | Percentage of envelopes via custom API | Signal matching: Maestro strong (>50%). Health scorecard integration depth. |
| `COUNT_POWERFORM_SENT` | PowerForms envelopes sent | Signal matching: Web Forms strong (>100). Integration count. |
| `PERCENT_POWERFORM_SENT` | Percentage via PowerForms | Not currently used in signal matching; available in raw data |
| `COUNT_BULKSEND_SENT` | Bulk Send envelopes sent | Integration count |
| `PERCENT_BULKSEND_SENT` | Percentage via Bulk Send | Not currently used in signal matching; available in raw data |
| `MOBILE_SIGNS` | Signing events from mobile devices | Signal matching: SMS Delivery strong (>0). IAM for CX bundle trigger. |
| `NON_MOBILE_SIGNS` | Signing events from non-mobile devices | Displayed in Docusign Footprint for context |
| `ANNUAL_WEBAPP_SENTS` | Envelopes sent via web application per year | Signal matching: Maestro (compared to automation sends), Web Forms strong (> automation sends), Clickwraps strong (>1k). LLM summary (send split). |
| `ANNUAL_AUTOMATION_SENTS` | Envelopes sent via automation per year | Signal matching: Maestro strong (> webapp sends), Web Forms comparison. LLM summary (send split). |

---

## 6. Seats

User seat counts and activation rates. Drives signal matching for SAML/SSO and Monitor, and multiple health scorecard indicators.

| Field | What It Tells Us | How It Is Used |
|-------|-----------------|----------------|
| `SEATS_PURCHASED` | Total seats in the contract | Health scorecard: seat activation denominator |
| `ACTIVE_SEATS` | Currently active user seats | Signal matching: SAML/SSO strong (>20), moderate (>5). Monitor strong (>50). Health scorecard: seat activation rate. LLM summary. |
| `ADMIN_SEATS` | Administrator seats | Signal matching: Monitor strong (>5) |
| `VIEWER_SEATS` | Viewer-only seats | Displayed in Docusign Footprint |
| `SENDER_SEATS` | Sender seats | Displayed in Docusign Footprint |
| `SEATS_ACTIVATION_SENT` | Seat activation invitations sent | Not directly used; available in raw data |
| `PERCENTAGE_SVA` | Seat vs. activation rate (%) | Health scorecard: >=70% green, >=30% yellow, <30% red. LLM summary. |
| `PERCENTAGE_EVA` | Envelope vs. activation rate | LLM summary context |
| `ACTIVE_SEATS_MOM` | Month-over-month change in active seats (%) | Health scorecard: >0% green, >=-5% yellow, <-5% red |
| `IS_UNLIMITED_SEATS` | Whether the account has unlimited seats | Displayed in Docusign Footprint |

---

## 7. Financial

Account value and cost metrics. Drives the CLM bundle signal and provides LLM context for sizing the opportunity.

| Field | What It Tells Us | How It Is Used |
|-------|-----------------|----------------|
| `RENEWAL_BASE_CMRR` | Committed monthly recurring revenue at renewal | Displayed in Docusign Footprint |
| `ACCOUNT_ACV` | Annual contract value | Signal matching: CLM bundle strong (>$50,000). Health scorecard: growth opportunity callout. LLM summary. |
| `MRR_CURRENCY` | Currency of the MRR | LLM summary context |
| `EFFECTIVE_COST_PER_ENVELOPE` | Cost per envelope metric | Displayed in Docusign Footprint |
| `EFFECTIVE_COST_PER_SEAT` | Cost per seat metric | Displayed in Docusign Footprint |
| `REPORTING_MMR` | Reporting monthly recurring revenue | LLM summary context |

---

## 8. Products

Purchased and usage flags for each Docusign product. Determines which products are already in use vs. available for recommendation.

| Field | What It Tells Us | How It Is Used |
|-------|-----------------|----------------|
| `IS_CLM_ACCOUNT` | Whether the account has CLM | Signal matching: Navigator strong trigger, Agreement Desk trigger. CLM bundle exclusion. |
| `IS_IAM` | Whether the account is on an IAM plan | Product adoption display |
| `SMS_DELIVERY_PURCHASED` / `SMS_DELIVERY_USED` | SMS Delivery adoption | Signal matching: determines if SMS Delivery is in_use |
| `SMS_AUTH_PURCHASED` / `SMS_AUTH_USED` | SMS Authentication adoption | Signal matching: determines if SMS Auth is in_use |
| `PHONE_AUTH_PURCHASED` / `PHONE_AUTH_USED` | Phone Authentication adoption | Signal matching: determines if Phone Auth is in_use |
| `ID_CHECK_PURCHASED` / `ID_CHECK_USED` | ID Check adoption | Signal matching: IDV in_use flag |
| `ID_VERIFY_GOVID_EID_AUTH_PURCHASED` / `ID_VERIFY_GOVID_EID_AUTH_USED` | Government ID Verification adoption | Signal matching: IDV in_use flag |
| `CLICKWRAPS_PURCHASED` / `CLICKWRAPS_USED` | Clickwraps adoption | Signal matching: determines if Clickwraps is in_use |
| `AGREEMENT_ACTIONS_PURCHASED` / `AGREEMENT_ACTIONS_USED` | Agreement Actions adoption | Product adoption display |
| `WORKFLOW_RUNS_PURCHASED` / `WORKFLOW_RUNS_USAGE` | Maestro Workflow runs | Signal matching: determines if Maestro is in_use |
| `WORKFLOW_DEFINITIONS_PURCHASED` / `WORKFLOW_DEFINITIONS_USAGE` | Workflow definitions | Signal matching: additional Maestro in_use check |
| `AI_EXTRACTION_PURCHASED` / `AI_EXTRACTION_USAGE` | AI Extraction adoption | Product adoption display |
| `NAVIGATOR_OPEN_DOCUMENT_PURCHASED` / `NAVIGATOR_OPEN_DOCUMENT_USAGE` | Navigator document access | Signal matching: Navigator in_use flag |
| `NAVIGATOR_AGREEMENTS_PURCHASED` / `NAVIGATOR_AGREEMENTS_USAGE` | Navigator agreements | Signal matching: Navigator in_use flag |
| `DOCUMENT_GENERATION_FOR_ESIGNATURE_PURCHASED` / `DOCUMENT_GENERATION_FOR_ESIGNATURE_USAGE` | Document Generation (DocGen) | Signal matching: determines if DocGen is in_use |
| `WEBAPP_SENDS_PURCHASED` / `WEBAPP_SENDS_USAGE` | Web app send entitlement and usage | Product adoption display |
| `AUTOMATION_SENDS_PURCHASED` / `AUTOMATION_SENDS_USAGE` | Automation send entitlement and usage | Product adoption display |
| `SEAT_FULL_USER_PURCHASED` / `SEAT_FULL_USER_USAGE` | Full user seat entitlement | Product adoption display |
| `SEAT_VIEWER_USER_PURCHASED` / `SEAT_VIEWER_USER_USAGE` | Viewer user seat entitlement | Product adoption display |
| `MULTI_CHANNEL_DELIVERY_PURCHASED` / `MULTI_CHANNEL_DELIVERY_USAGE` | Multi-Channel Delivery adoption | Signal matching: determines if multi-channel is in_use |
| `PREMIUM_DATA_VERIFICATIONS_PURCHASED` / `PREMIUM_DATA_VERIFICATIONS_USAGE` | Premium Data Verifications | Product adoption display |
| `ID_VERIFICATION_PURCHASED` / `ID_VERIFICATION_USAGE` | ID Verification adoption | Signal matching: IDV in_use flag |
| `SAML_AUTHENTICATION` / `SAML_AUTHENTICATION_PURCH` | SAML/SSO adoption | Signal matching: determines if SAML is in_use |

---

## 9. People

Account team contacts. Included in the document for reference but not used in signal matching or health scoring.

| Field | What It Tells Us | How It Is Used |
|-------|-----------------|----------------|
| `ACCOUNT_OWNER` | Account owner (sales rep) | Included in the data object for LLM context |
| `ACCOUNT_OWNER_MANAGER` | Account owner's manager | Included in the data object for LLM context |
| `CSM` | Customer Success Manager | Included in the data object for LLM context |
| `CSM_MANAGER` | CSM's manager | Included in the data object for LLM context |
| `SUBSCRIPTION_RENEWAL_MANAGER` | Renewal manager | Included in the data object for LLM context |
| `RENEWAL_MANAGER` | Renewal manager's manager | Included in the data object for LLM context |
| `EXECUTIVE_SALES_REP` | Executive sales rep | Included in the data object for LLM context |
| `MDR` | Market Development Rep | Included in the data object for LLM context |

---

## What Is NOT Accessed

The tool does **not** access:

- Customer credentials, passwords, or authentication tokens
- Individual signer personal data (names, emails, addresses)
- Envelope contents or agreement document text
- Any data source outside the bookscrub sheet columns listed above
- Any Docusign Admin API or eSignature API endpoints

All web research performed by the LLM uses publicly available information via Bing search grounding.
