# Adding New Accounts to the Bookscrub Sheet

Step-by-step guide for adding a new Docusign customer account to the bookscrub spreadsheet so the Account Research tool can generate a report for it.

---

## How the Sheet Gets Populated

The bookscrub sheet is a **manual export from Snowflake**. There is no automated pipeline — someone runs the query and pastes the results into the "Full Data" tab. This means:

- Manually added rows will **not be overwritten** (there's no automated refresh)
- Data staleness depends on how recently the export was run
- The `ACCOUNT_NAME_PLAN_TERM` field comes directly from the Snowflake export — it is not manually constructed

## Prerequisites

- Edit access to the [bookscrub Google Sheet](https://docs.google.com/spreadsheets/d/1tyrEBzmADyzvgTX8ltRZO0faaoiXnxrJgo1arzefKAk/edit)
- The account must exist in Salesforce
- Access to Snowflake (for pulling consumption metrics)

---

## Quick Reference: What the Tool Needs

The tool reads ~130 columns organized into 9 groups. Not all are required — many are consumption/product metrics that will simply be blank for new or prospect accounts. The **minimum viable row** needs the fields marked "Required" below.

---

## Step 1 — Add a New Row

1. Open the bookscrub sheet and go to the **Full Data** tab.
2. Add a new row at the bottom. Do not insert rows in the middle — the tool builds lookup indexes by row position.

---

## Step 2 — Fill Required Fields

These are the fields the tool **must have** to find and identify the account.

### Identity (Required)

| Column | What to Enter | Where to Find It |
|--------|--------------|-----------------|
| `ACCOUNT_NAME_PLAN_TERM` | Combined string in the format: `Company Name (Plan Name \|\| YYYY-MM-DD - YYYY-MM-DD)` | Snowflake export — copy this value exactly as it appears in the query output. Example: `Acme Corp (Enterprise Pro \|\| 2025-01-01 - 2026-12-31)` |
| `SALESFORCE_ACCOUNT_ID` | The 18-character Salesforce record ID | Salesforce URL or account detail page |

**Note:** You do NOT need to fill `COMPANY_NAME` — the tool auto-generates it from `ACCOUNT_NAME_PLAN_TERM` by stripping the plan/dates suffix, partner annotations (`via [Partner]`), and parent-company prefixes (`(Parent)`).

### Context (Required)

| Column | What to Enter | Where to Find It |
|--------|--------------|-----------------|
| `INDUSTRY` | Industry classification (e.g., "Technology", "Financial Services", "Healthcare") | Salesforce account record. Must match one of the standard classifications — the tool checks against 8 regulated industries for special signal matching. |
| `GTM_GROUP` | Go-to-market group ID | Salesforce record ID. Links related accounts under the same enterprise parent. |
| `GTM_GROUP_NAME` | Human-readable GTM group name | Salesforce |

### Contract (Required for Health Scoring)

| Column | What to Enter | Where to Find It |
|--------|--------------|-----------------|
| `ACCOUNT_PLAN` | Plan tier (e.g., "Business Pro", "Enterprise Pro") | Salesforce subscription record |
| `CHARGE_MODEL` | `Seat` or `Envelope` | Salesforce — determines whether the health scorecard keys on seat activation or envelope consumption |
| `TERM_START_DATE` | Contract start date (YYYY-MM-DD) | Salesforce subscription |
| `TERM_END_DATE` | Contract end date (YYYY-MM-DD) | Salesforce subscription |

---

## Step 3 — Fill Recommended Fields

These aren't strictly required, but the report will be significantly better with them.

### Consumption

This is the most manual part of the process — these metrics come from a periodic Snowflake data pull.

| Column | What to Enter | Source |
|--------|--------------|--------|
| `ENVELOPES_PURCHASED` | Total envelopes in the contract | Snowflake |
| `ENVELOPES_SENT` | Total envelopes sent to date | Snowflake |
| `ENVELOPES_SENT_30_DAYS` | Envelopes sent in last 30 days | Snowflake |
| `ENVELOPES_SENT_365_DAYS` | Envelopes sent in last 365 days | Snowflake |

### Seats

| Column | What to Enter | Source |
|--------|--------------|--------|
| `SEATS_PURCHASED` | Total seats in the contract | Snowflake |
| `ACTIVE_SEATS` | Currently active user seats | Snowflake |

### Financial

| Column | What to Enter | Source |
|--------|--------------|--------|
| `ACCOUNT_ACV` | Annual contract value (numeric, USD) | Snowflake / Salesforce |

### People

| Column | What to Enter | Source |
|--------|--------------|--------|
| `ACCOUNT_OWNER` | Account owner (sales rep name) | Salesforce |
| `CSM` | Customer Success Manager name | Salesforce |

---

## Step 4 — Product Flags

The tool uses purchased/used column pairs to detect which products are active. For each product the account has, set the `_PURCHASED` column to the entitlement quantity and `_USED` to current usage. Leave both blank if the product isn't part of the contract.

Key product columns:

| Product | Purchased Column | Used Column |
|---------|-----------------|-------------|
| CLM | `IS_CLM_ACCOUNT` | (boolean: TRUE/FALSE) |
| IAM | `IS_IAM` | (boolean: TRUE/FALSE) |
| Navigator | `NAVIGATOR_AGREEMENTS_PURCHASED` | `NAVIGATOR_AGREEMENTS_USAGE` |
| Maestro | `WORKFLOW_RUNS_PURCHASED` | `WORKFLOW_RUNS_USAGE` |
| DocGen | `DOCUMENT_GENERATION_FOR_ESIGNATURE_PURCHASED` | `DOCUMENT_GENERATION_FOR_ESIGNATURE_USAGE` |
| SMS Delivery | `SMS_DELIVERY_PURCHASED` | `SMS_DELIVERY_USED` |
| ID Verification | `ID_VERIFICATION_PURCHASED` | `ID_VERIFICATION_USAGE` |

See the full list of product columns in the [data dictionary](../architecture/data-dictionary.md#8-products).

---

## Step 5 — Verify the Account Resolves

After adding the row:

1. Open the bound Google Sheet
2. Go to **Account Research > Generate for Company...**
3. Search for the company name you added
4. If it appears in the autocomplete, the row is correctly indexed

If it doesn't appear:
- Check that `ACCOUNT_NAME_PLAN_TERM` follows the expected format
- Confirm the row is on the **Full Data** tab (not a different sheet)
- The tool builds its index on each run, so there's no cache to clear

---

## Normalization Rules

The tool applies these normalizations when matching company names:

1. **Case-insensitive** — "acme corp" matches "Acme Corp"
2. **Zero-width character stripping** — invisible Unicode characters are removed
3. **Suffix normalization** — common suffixes are stripped for fuzzy matching: Inc, Corp, Corporation, Ltd, LLC, Co, Company, Group, PLC, N/A, The, Holdings, Bank, &
4. **Punctuation normalization** — commas, periods, parentheses, and hyphens are replaced with spaces

This means `Acme Corporation, Inc.` and `Acme` will both match. The tool tries an exact match first, then falls back to normalized matching.

---

## GTM Group Assignment

The `GTM_GROUP` field links accounts that belong to the same enterprise customer. When a user selects a GTM group (instead of a single account), the tool aggregates data across all accounts in that group.

Rules:
- All accounts under the same enterprise parent should share the same `GTM_GROUP` value
- The value is a Salesforce record ID — copy it from an existing account in the same group, or from the Salesforce parent account record
- If the account is standalone (not part of a group), still fill in the GTM_GROUP — it will just be unique to that account

---

## What You Can Leave Blank

Any column not listed above can be left blank. The tool handles missing data gracefully:
- Missing consumption data → health scorecard shows "N/A" for affected indicators
- Missing product flags → signal matching skips those products (no false positives)
- Missing financial data → LLM receives less context but still generates the report
- Missing people → account team section is sparse but functional

The only hard failure is a missing `ACCOUNT_NAME_PLAN_TERM` — without it, the tool can't identify the row at all.
