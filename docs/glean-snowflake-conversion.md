# Glean Agent Conversion Guide: Growth Strategy Generator (Snowflake Edition)

This guide documents how to recreate the Google Apps Script Growth Strategy Generator as a Glean agent backed by Snowflake instead of the bookscrub Google Sheet.

---

## What This Is

The GAS tool generates a 9-section executive-ready growth strategy Google Doc for any Docusign customer account. It combines:
1. **Internal data** (account usage, product adoption, financials, contract details)
2. **5 sequential LLM research calls** (company profile → business map → agreement landscape → contract commerce → priority action plan)
3. **A structured Google Doc** as output

The Glean version replaces the Google Sheet data source with direct Snowflake queries, uses Glean's workflow engine for the sequential research calls, and outputs to Google Docs via Glean's document creation action.

---

## Architecture Comparison

| Component | GAS Version | Glean Version |
|-----------|-------------|---------------|
| Data source | Google Sheet (bookscrub) | Snowflake SQL queries |
| LLM calls | 5 sequential calls to `infra.agreementsdemo.com/openai` | Glean workflow steps (Think / Analyze) |
| Web research | Bing-grounded LLM | OpenAI Web Search step |
| Output | Google Doc created via Drive API | Glean "Create Google Doc" action |
| GTM group support | Aggregates multiple rows by GTM_GROUP ID | Snowflake GROUP BY query |
| Triggering | Menu item in Google Sheet | Glean chat (type company name) |

---

## Step 1: Snowflake Setup

### 1.1 Required Tables / Views

The agent needs a single Snowflake view that approximates the bookscrub. The fields below map directly from the data dictionary. Recommended view name: `GROWTH_STRATEGY.ACCOUNT_DATA_V`.

#### Identity & Context
```sql
ACCOUNT_NAME,           -- cleaned company name (equiv. to COMPANY_NAME derived field)
SFDC_PARENT_ACCOUNT_ID,
SITE_ID,
DOCUSIGN_ACCOUNT_ID,
SALESFORCE_ACCOUNT_ID,
INDUSTRY,
BILLING_COUNTRY,
SALES_CHANNEL,
REGION,
GTM_GROUP,              -- Salesforce group ID (e.g. aSr1W000000Arp3SAC)
GTM_GROUP_NAME,         -- human-readable group name
PARTNER_ACCOUNT
```

#### Contract
```sql
ACCOUNT_PLAN,
DOCUSIGN_ACCOUNT_PLAN_NAME,
CHARGE_MODEL,           -- 'seat' or 'envelope'
TERM_START_DATE,
TERM_END_DATE,
TERM_END_FYQ,
DAYS_USED,
DAYS_LEFT,
PERCENTAGE_TERM_COMPLETED,
MONTHS_LEFT,
IS_MULTI_YEAR_RAMP
```

#### Consumption
```sql
ENVELOPES_PURCHASED,
ENVELOPES_SENT,
ENVELOPES_SENT_7_DAYS,
ENVELOPES_SENT_30_DAYS,
ENVELOPES_SENT_60_DAYS,
ENVELOPES_SENT_90_DAYS,
ENVELOPES_SENT_365_DAYS,
CONSUMPTION_PERFORMANCE,
USAGE_TREND,            -- 'Over Trending' | 'On Track' | 'Under Trending'
PROJECTED_USAGE_SCORE,
SEND_VITALITY,
SEND_VELOCITY_MOM,      -- month-over-month % change
ENVELOPES_COMPLETED,
ENVELOPES_COMPLETED_RATE,
ENVELOPES_DECLINED,
ENVELOPES_VOIDED,
ENVELOPES_EXPIRED,
PERCENT_DECLINED,
PERCENT_VOIDED,
PERCENT_EXPIRED,
PROJECTED_ENVELOPES_SENT
```

#### Integrations
```sql
ENVELOPES_VIA_SALESFORCE,
ENVELOPES_VIA_WORKDAY,
ENVELOPES_VIA_SAP,
CUSTOM_API_SENT,
PERCENT_CUSTOM_API_SENT,
COUNT_POWERFORM_SENT,
COUNT_BULKSEND_SENT,
MOBILE_SIGNS,
ANNUAL_WEBAPP_SENTS,
ANNUAL_AUTOMATION_SENTS
```

#### Seats
```sql
SEATS_PURCHASED,
ACTIVE_SEATS,
ADMIN_SEATS,
VIEWER_SEATS,
SENDER_SEATS,
PERCENTAGE_SVA,         -- seat activation rate %
ACTIVE_SEATS_MOM,       -- MoM seat growth %
IS_UNLIMITED_SEATS
```

#### Financial
```sql
RENEWAL_BASE_CMRR,
ACCOUNT_ACV,
MRR_CURRENCY,
EFFECTIVE_COST_PER_ENVELOPE,
EFFECTIVE_COST_PER_SEAT
```

#### Products (purchased + usage flags)
```sql
IS_CLM_ACCOUNT,
IS_IAM,
SMS_DELIVERY_PURCHASED, SMS_DELIVERY_USED,
SMS_AUTH_PURCHASED, SMS_AUTH_USED,
PHONE_AUTH_PURCHASED, PHONE_AUTH_USED,
ID_CHECK_PURCHASED, ID_CHECK_USED,
ID_VERIFY_GOVID_EID_AUTH_PURCHASED, ID_VERIFY_GOVID_EID_AUTH_USED,
CLICKWRAPS_PURCHASED, CLICKWRAPS_USED,
AGREEMENT_ACTIONS_PURCHASED, AGREEMENT_ACTIONS_USED,
WORKFLOW_RUNS_PURCHASED, WORKFLOW_RUNS_USAGE,
WORKFLOW_DEFINITIONS_PURCHASED, WORKFLOW_DEFINITIONS_USAGE,
AI_EXTRACTION_PURCHASED, AI_EXTRACTION_USAGE,
NAVIGATOR_OPEN_DOCUMENT_PURCHASED, NAVIGATOR_OPEN_DOCUMENT_USAGE,
NAVIGATOR_AGREEMENTS_PURCHASED, NAVIGATOR_AGREEMENTS_USAGE,
DOCUMENT_GENERATION_FOR_ESIGNATURE_PURCHASED, DOCUMENT_GENERATION_FOR_ESIGNATURE_USAGE,
MULTI_CHANNEL_DELIVERY_PURCHASED, MULTI_CHANNEL_DELIVERY_USAGE,
ID_VERIFICATION_PURCHASED, ID_VERIFICATION_USAGE,
SAML_AUTHENTICATION, SAML_AUTHENTICATION_PURCH
```

#### People
```sql
ACCOUNT_OWNER,
CSM,
SUBSCRIPTION_RENEWAL_MANAGER,
EXECUTIVE_SALES_REP
```

### 1.2 GTM Group Support

For GTM group reports, the agent needs to aggregate across multiple accounts. The simplest approach is a second Snowflake query (or view) that the agent calls when a GTM group report is requested:

```sql
-- GTM group aggregate view: GROWTH_STRATEGY.GTM_GROUP_DATA_V
SELECT
  GTM_GROUP,
  GTM_GROUP_NAME,
  COUNT(*)                          AS ACCOUNT_COUNT,
  -- Use highest-ACV account as the "primary" for LLM research
  MAX_BY(ACCOUNT_NAME, ACCOUNT_ACV) AS PRIMARY_ACCOUNT_NAME,
  MAX_BY(INDUSTRY, ACCOUNT_ACV)     AS PRIMARY_INDUSTRY,
  -- Financial totals
  SUM(ACCOUNT_ACV)                  AS TOTAL_ACV,
  SUM(RENEWAL_BASE_CMRR)            AS TOTAL_CMRR,
  -- Consumption totals
  SUM(ENVELOPES_PURCHASED)          AS TOTAL_ENVELOPES_PURCHASED,
  SUM(ENVELOPES_SENT)               AS TOTAL_ENVELOPES_SENT,
  SUM(ENVELOPES_SENT_30_DAYS)       AS TOTAL_ENVELOPES_SENT_30D,
  -- Seat totals
  SUM(SEATS_PURCHASED)              AS TOTAL_SEATS_PURCHASED,
  SUM(ACTIVE_SEATS)                 AS TOTAL_ACTIVE_SEATS,
  -- Product adoption (any account in group = group has it)
  MAX(IS_CLM_ACCOUNT::INT)          AS HAS_CLM,
  MAX(IS_IAM::INT)                  AS HAS_IAM,
  MAX(NAVIGATOR_AGREEMENTS_USAGE)   AS HAS_NAVIGATOR,
  -- ...repeat for all product flags
  ARRAY_AGG(ACCOUNT_NAME)           AS ACCOUNT_NAMES
FROM GROWTH_STRATEGY.ACCOUNT_DATA_V
GROUP BY GTM_GROUP, GTM_GROUP_NAME
```

---

## Step 2: Glean Agent Configuration

### 2.1 Agent Setup

In Glean, create a new agent:
- **Name**: Growth Strategy Generator
- **Description**: Generates an executive-ready growth strategy document for any Docusign customer account or GTM group.
- **Instructions**: Use the contents of `prompts/GLEAN_PROMPT.md` as the base system prompt, with the "Book Scrub Data" section replaced (see §2.2 below).

### 2.2 Updated Data Source Instruction

Replace the "Book Scrub Data" section of `GLEAN_PROMPT.md` with:

```
1. **Snowflake Account Data**: Query the Snowflake view `GROWTH_STRATEGY.ACCOUNT_DATA_V` using the
   Snowflake connector. Look up the account by ACCOUNT_NAME (case-insensitive partial match).
   If the user provides a GTM group ID or name, query `GROWTH_STRATEGY.GTM_GROUP_DATA_V` instead
   and use the PRIMARY_ACCOUNT_NAME for all external research. This is the ONLY source for internal
   usage data — always retrieve it before running any external research.
```

### 2.3 Knowledge Sources

Add the following as knowledge sources on the agent (unchanged from the GAS/Gemini version):
- **Docusign Product Catalog** document — required for signal matching and bundle recommendations

### 2.4 Snowflake Connector

Configure a Snowflake connector in Glean with:
- Read-only credentials scoped to the `GROWTH_STRATEGY` schema
- The agent should be able to run SELECT queries only — no writes needed

---

## Step 3: Workflow Steps

The workflow follows the same 9-step structure as `GLEAN_WORKFLOW.md`, with Step 2 (data retrieval) changed to use Snowflake instead of Google Drive.

### Step 1 — Ask for Input

**Action type:** Respond

Ask the user for either:
- A company name (for a single-account report)
- A GTM group ID or name (for a group report)

```
"What would you like to generate a Growth Strategy for? You can provide:
- A company name (e.g. 'Acme Corporation')
- A GTM group ID (e.g. 'aSr1W000000Arp3SAC') or group name"
```

---

### Step 2 — Query Snowflake

**Action type:** Run Snowflake query

**Single account query:**
```sql
SELECT *
FROM GROWTH_STRATEGY.ACCOUNT_DATA_V
WHERE LOWER(ACCOUNT_NAME) LIKE LOWER('%{user_input}%')
ORDER BY ACCOUNT_ACV DESC
LIMIT 1
```

**GTM group query** (if user provides a group ID or name):
```sql
-- Get group aggregate
SELECT * FROM GROWTH_STRATEGY.GTM_GROUP_DATA_V
WHERE GTM_GROUP = '{group_id}'
   OR LOWER(GTM_GROUP_NAME) LIKE LOWER('%{group_name}%');

-- Also get per-account detail for the Docusign Footprint section
SELECT
  ACCOUNT_NAME, ACCOUNT_ACV, ACCOUNT_PLAN, CHARGE_MODEL,
  TERM_END_DATE, MONTHS_LEFT, ENVELOPES_PURCHASED, ENVELOPES_SENT,
  SEATS_PURCHASED, ACTIVE_SEATS, PERCENTAGE_SVA,
  IS_CLM_ACCOUNT, IS_IAM, NAVIGATOR_AGREEMENTS_USAGE
  -- add other product flags as needed
FROM GROWTH_STRATEGY.ACCOUNT_DATA_V
WHERE GTM_GROUP = '{group_id}'
ORDER BY ACCOUNT_ACV DESC;
```

If no results: respond to the user that the account was not found and ask them to verify.

---

### Step 3 — Compute Health & Product Signals

**Action type:** Analyze data

Same logic as `GLEAN_WORKFLOW.md` Step 3 — unchanged. Run the 10 health indicators and product signal classifications against the Snowflake data returned in Step 2.

**GTM groups**: Run health analysis against aggregated totals where applicable (consumption pacing, seat activation, product breadth). Skip indicators that don't aggregate cleanly (e.g. send velocity MoM — use the primary account's value).

---

### Step 4 — Internal Docusign Search

**Action type:** Company search (unchanged from `GLEAN_WORKFLOW.md` Step 4)

Search Glean for internal Docusign knowledge about the company.

---

### Step 5 — External Web Research

**Action type:** OpenAI Web Search (unchanged from `GLEAN_WORKFLOW.md` Step 5)

Use `PRIMARY_ACCOUNT_NAME` (from Snowflake) as the company name for all external research — never the GTM group ID.

---

### Step 6 — Synthesize Company Analysis

**Action type:** Think (unchanged from `GLEAN_WORKFLOW.md` Step 6)

Build the business map, agreement landscape, and contract commerce estimate.

---

### Step 7 — Synthesize Docusign Strategy

**Action type:** Think (unchanged from `GLEAN_WORKFLOW.md` Step 7)

Build the priority map and executive briefing.

---

### Step 8 — Create Google Doc

**Action type:** Create Google Doc

Title format:
- Single account: `[Company Name] | Growth Strategy`
- GTM group: `[Primary Company Name] | Growth Strategy [GTM GROUP: {group_id}]`

For GTM group reports, the **Docusign Footprint** section should show:

**Accounts in GTM Group** (table: Account Name | ACV | Plan | Envelopes Sent | Active Seats | Seat Activation %)

**Group Context** (table: GTM Group | Industry | Region | Total ACV | Account Count)

**Consumption & Usage** (table: one row per account + GROUP TOTAL row; columns: Account | Envelopes Purchased | Sent | Consumption % | Usage Trend)

Omit the Account Health section entirely for GTM group reports (health is meaningful at the individual account level; group aggregates are misleading).

---

### Step 9 — Respond with Summary

**Action type:** Respond (unchanged from `GLEAN_WORKFLOW.md` Step 9)

Provide the Google Doc link and a brief summary: company, health status, top 3 opportunities, any urgent flags.

---

## Step 4: Key Differences from GAS Version

| Behavior | GAS Version | Glean Version |
|----------|-------------|---------------|
| Company name lookup | `extractCompanyName()` strips plan/term/partner suffixes from a single concatenated field | Snowflake view should have a clean `ACCOUNT_NAME` column — no parsing needed |
| GTM group ID vs. name | ID stored in `GTM_GROUP`, name in `GTM_GROUP_NAME` — code historically confused these | Snowflake query explicitly selects the right column for each purpose |
| Company name for LLM research | `data.identity.name` = highest-ACV account's name | `PRIMARY_ACCOUNT_NAME` from the GTM aggregate view (same logic) |
| Column position changes | Fragile — any column reorder broke the tool | Not applicable — Snowflake uses named columns |
| Signal matching | Hardcoded thresholds in `DataExtractor.gs` | Described in the Docusign Product Catalog knowledge source — the LLM applies them |
| Fallback agreement landscape | Deterministic fallback from `Config.gs` industry tables | LLM falls back to industry knowledge naturally |
| Health scorecard | Computed in `DocGenerator.gs` `analyzeAccountHealth()` | Computed in the "Analyze data" workflow step |

---

## Step 5: Testing

### Single Account
Trigger the agent with a known company name (e.g. "Salesforce"). Verify:
- Snowflake data is retrieved correctly
- Health indicators match what the bookscrub showed for this account
- Product signals are correct (no "in use" products recommended)
- Google Doc is created with all 9 sections

### GTM Group
Trigger with the test group ID `aSr1W000000Arp3SAC`. Verify:
- `PRIMARY_ACCOUNT_NAME` (not the ID) is used for external research
- Docusign Footprint section shows per-account table with GROUP TOTAL
- Account Health section is omitted
- Doc title includes `[GTM GROUP: aSr1W000000Arp3SAC]`

### Edge Cases
- Company not found → should prompt user to verify name
- GTM group with only one account → should treat as single account (or still use group format, depending on preference)
- Account with no Snowflake data for a field → should note "Data not available" in the relevant section

---

## Appendix: File Reference

| File | Purpose |
|------|---------|
| `prompts/GLEAN_PROMPT.md` | Base system prompt for the Glean agent (update Book Scrub section) |
| `prompts/GLEAN_WORKFLOW.md` | Step-by-step workflow (Steps 3–9 reusable as-is; update Step 2) |
| `docs/data-dictionary.md` | Full field reference — use this to map Snowflake column names |
| `docs/signal-matching.md` | Product signal evaluation logic |
| `docs/ACCOUNT_HEALTH_ANALYSIS.md` | Health indicator definitions and thresholds |
| `prompts/call1-5-*.md` | LLM prompt specs — useful reference for Glean Think step instructions |
