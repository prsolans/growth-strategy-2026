# Architecture

## System Overview

The Growth Strategy Generator is built on **Google Apps Script** and uses three Google APIs:

- **Google Sheets API** -- reads the bookscrub data source
- **Google Docs API** -- creates and formats the output document
- **Google Drive API** -- moves the document to a configured output folder

The tool calls an **internal LLM endpoint** (`infra.agreementsdemo.com/openai`) that proxies to an OpenAI model (GPT-4o) with **Bing grounding** enabled. This endpoint accepts a system prompt and user prompt, performs web research via Bing, and returns a JSON-wrapped response with optional citation metadata.

There are no external npm packages, third-party APIs, or build steps. The project uses [clasp](https://github.com/nicholasgasior/clasp) for local development and deployment to Google Apps Script.

---

## File Roles

| File | Role | Key Functions |
|------|------|--------------|
| `Config.gs` | Constants, product catalog, column mappings | `getConfig()`, `getApiKey()`, `getApiUser()`, `getOutputFolder()`; defines `COLUMN_GROUPS`, `REGULATED_INDUSTRIES`, `DOCUSIGN_CATALOG`, `BASE_AGREEMENTS`, `INDUSTRY_AGREEMENTS`, `DEFAULT_INDUSTRY_AGREEMENTS` |
| `DataExtractor.gs` | Sheet extraction, signal matching, LLM summary, fallback generators | `getCompanyData()`, `generateProductSignals()`, `summarizeForLLM()`, `generateFallbackAgreementLandscape()`, `getCompanyNames()`, `extractCompanyName()` |
| `Researcher.gs` | 5 LLM calls, JSON parsing, citation handling | `callLLM()`, `callLLMJson()`, `tryParseJson()`, `researchAccountProfile()`, `researchBusinessMap()`, `researchAgreementLandscape()`, `researchContractCommerce()`, `synthesizePriorityMap()` |
| `DocGenerator.gs` | Orchestration, 9-section doc rendering, styling | `generateGrowthStrategyDoc()`, `addCompanyProfileSection()`, `addAccountHealthSection()`, `analyzeAccountHealth()`, `addPriorityMapSection()`, `addStyledTable()`, `createBarChart()` |
| `Menu.gs` | UI entry points, company picker dialog | `onOpen()`, `showCompanyPicker()`, `testGenerate()`, `promptApiKey()`, `promptApiUser()`, `promptOutputFolder()` |

---

## Execution Flow

The main entry point is `generateGrowthStrategyDoc(companyName)` in `DocGenerator.gs`. Here is the step-by-step flow:

### Step 1: Extract Internal Data

```
getCompanyData(companyName)          -- DataExtractor.gs
  -> buildHeaderIndex(sheet)         -- maps header names to column indices
  -> ensureCompanyNameColumn(sheet)  -- creates COMPANY_NAME column if missing
  -> findCompanyRow(data, name)      -- locates the row by company name
  -> returns structured object with 9 groups: identity, context, contract,
     consumption, integrations, seats, financial, products, people

generateProductSignals(data)         -- DataExtractor.gs
  -> evaluates 15 products against data thresholds
  -> evaluates 4 bundles against component recommendations
  -> returns { signals: [...], bundleSignals: [...], summary: "..." }

summarizeForLLM(data, productSignals) -- DataExtractor.gs
  -> produces a flat text summary of all internal data for LLM context
```

### Step 2: Run 5 Sequential LLM Calls

Each call builds on the results of previous calls. They run sequentially because each uses prior output as input context.

```
Call 1: researchAccountProfile(name, industry)
  -> returns company overview, BUs, financials, SWOT, executives, tech stack

Call 2: researchBusinessMap(name, industry, accountProfile)
  -> receives Call 1 results as context
  -> returns organizational hierarchy (BU > Department > Function)

Call 3: researchAgreementLandscape(name, industry, accountProfile, businessMap)
  -> receives Call 1 + Call 2 results as context
  -> returns top 20 agreement types with volume/complexity scores

Call 4: researchContractCommerce(name, industry, accountProfile, agreementLandscape)
  -> receives Call 1 + Call 3 results as context
  -> returns commerce estimates by department and agreement type

Call 5: synthesizePriorityMap(name, internalSummary, externalResearch, productSignals)
  -> receives ALL prior results + internal data summary + signal matching output
  -> product catalog and signal summary injected into system prompt
  -> returns priority mapping, expansion opportunities, action plan
```

### Step 3: Build the Google Doc

```
DocumentApp.create(title)           -- creates the doc
DriveApp.getFolderById(id).addFile  -- moves to output folder
body.setMargin*(...)                -- sets page margins

9 section builders called in sequence:
  1. addCompanyProfileSection()      -- Call 1 data
  2. addBusinessPerformanceSection() -- Call 1 data
  3. addExecutivesAndTechSection()   -- Call 1 data
  4. addBusinessMapSection()         -- Call 2 data
  5. addDocusignTodaySection()       -- internal data + Call 5 current use cases
  6. addAccountHealthSection()       -- internal data only (no LLM)
  7. addAgreementLandscapeSection()  -- Call 3 data
  8. addContractCommerceSection()    -- Call 4 data
  9. addPriorityMapSection()         -- Call 5 data

collectSources() + addSourcesSection() -- appended after section 9

doc.saveAndClose()
```

---

## Data Flow Diagram

```
Bookscrub Sheet
      |
      v
 DataExtractor
  getCompanyData()
      |
      +-----> generateProductSignals()
      |               |
      +-----> summarizeForLLM()
      |               |
      v               v
 Researcher (5 sequential LLM calls)
  Call 1: Account Profile  ──────────────────┐
  Call 2: Business Map  (uses Call 1) ───────┤
  Call 3: Agreement Landscape  (uses 1+2) ───┤
  Call 4: Contract Commerce  (uses 1+3) ─────┤
  Call 5: Priority Map  (uses ALL + signals) ┤
      |                                      |
      v                                      v
 DocGenerator                          Product Signals
  9 section builders                   (deterministic)
      |
      v
 Google Doc
  (saved to Drive folder)
```

---

## LLM Call Pipeline

All LLM calls go through `callLLMJson()` which handles the HTTP request, response envelope unwrapping, JSON parsing, citation stripping, and retry logic.

| Call | Function | Input Context | Output | What It Does |
|------|----------|---------------|--------|-------------|
| 1 | `researchAccountProfile()` | Company name, industry | Company overview, business units, financials, SWOT, executives, tech stack, systems integrators | Comprehensive company intelligence from web research |
| 2 | `researchBusinessMap()` | Company name, industry, Call 1 business units + employee count + supply chain | Hierarchical org tree: nodes with parent, level (bu/department/function), agreement intensity | Maps the organization to identify agreement-heavy areas |
| 3 | `researchAgreementLandscape()` | Company name, industry, Call 1 business units + financials, Call 2 departments | 20 agreement types with volume (1-10), complexity (1-10), contract type, business unit | Identifies what types of agreements the company manages |
| 4 | `researchContractCommerce()` | Company name, industry, Call 1 financials + employees + customers, Call 3 top 10 agreements | Estimated commerce, commercial relationships, commerce by department, commerce by agreement type, pain points | Quantifies the dollar value flowing through agreements |
| 5 | `synthesizePriorityMap()` | Internal data summary, condensed external research (Calls 1-4), product catalog, signal matching summary | Current use cases, priority mappings (company priority -> Docusign capability), expansion opportunities, action plan | Synthesizes everything into actionable recommendations |

Call 5 is unique in that it receives the Docusign product catalog and pre-qualified signal matching results in the **system prompt**, while all other context goes in the user prompt. This ensures the LLM grounds its recommendations in actual data rather than guessing which products to recommend.

---

## Account Health Scorecard

Section 6 of the output document is generated entirely from internal data with no LLM involvement. The `analyzeAccountHealth()` function evaluates 10 indicators:

| # | Indicator | Green | Yellow | Red | Data Fields |
|---|-----------|-------|--------|-----|-------------|
| 1 | Consumption Pacing | Pacing ratio >= 0.9 | Pacing ratio >= 0.6 | Pacing ratio < 0.6 | `ENVELOPES_SENT`, `ENVELOPES_PURCHASED`, `PERCENTAGE_TERM_COMPLETED` |
| 2 | Usage Trend | Over trending or on track | -- | Under trending | `USAGE_TREND` |
| 3 | Send Velocity (MoM) | > +10% | -10% to +10% | < -10% | `SEND_VELOCITY_MOM` |
| 4 | Seat Activation | >= 70% | >= 30% | < 30% | `PERCENTAGE_SVA`, `SEATS_PURCHASED`, `ACTIVE_SEATS` |
| 5 | Seat Growth (MoM) | > 0% | >= -5% | < -5% | `ACTIVE_SEATS_MOM` |
| 6 | Integration Depth | 3+ integrations | 1-2 integrations | 0 integrations | Integration counts (Salesforce, Workday, SAP, API, PowerForms, BulkSend) |
| 7 | Transaction Health | Fail rate < 5% | Fail rate 5-15% | Fail rate > 15% | `ENVELOPES_COMPLETED_RATE`, `PERCENT_DECLINED`, `PERCENT_VOIDED`, `PERCENT_EXPIRED` |
| 8 | Product Breadth | 5+ products active | 2-4 products active | 1 product active | Active/inactive product counts |
| 9 | Renewal Proximity | > 6 months left | 3-6 months left | <= 3 months left | `MONTHS_LEFT`, `TERM_END_FYQ` |
| 10 | Charge Model | -- | Always yellow (informational) | -- | `CHARGE_MODEL` |

The scorecard renders as a color-coded table in the document, followed by an overall assessment narrative that highlights red-flag areas and growth opportunities.

---

## Output Document Structure

| # | Section | Data Source | Builder Function |
|---|---------|------------|-----------------|
| 1 | Company Profile | LLM Call 1 | `addCompanyProfileSection()` |
| 2 | Business Performance & Strategy | LLM Call 1 | `addBusinessPerformanceSection()` |
| 3 | Executive Contacts & Technology | LLM Call 1 | `addExecutivesAndTechSection()` |
| 4 | Business Map | LLM Call 2 | `addBusinessMapSection()` |
| 5 | Docusign Footprint | Internal data + LLM Call 5 (current use cases) | `addDocusignTodaySection()` |
| 6 | Account Health Analysis | Internal data only | `addAccountHealthSection()` |
| 7 | Agreement Landscape | LLM Call 3 | `addAgreementLandscapeSection()` |
| 8 | Contract Commerce Estimate | LLM Call 4 | `addContractCommerceSection()` |
| 9 | Priority Map | LLM Call 5 | `addPriorityMapSection()` |
| -- | Sources | All LLM calls (deduplicated) | `addSourcesSection()` |

---

## Error Handling

The system handles failures at multiple levels:

### LLM Call Failures

Each of the 5 LLM calls in `generateGrowthStrategyDoc()` is wrapped in a try/catch block. If a call fails, the result is set to an empty object `{}` and execution continues with the remaining calls. This means partial documents can be generated even if some research calls fail -- the affected sections will show "data not available" messages.

```
try {
  accountProfile = researchAccountProfile(name, industry);
} catch (e) {
  accountProfile = {};  // section will render with fallback content
}
```

### JSON Parse Retries

`callLLMJson()` implements a two-attempt strategy:

1. **First attempt** -- calls `callLLM()` and passes the response through `tryParseJson()`.
2. **Retry with nudge** -- if parsing fails, appends an explicit instruction to the user prompt asking for valid JSON, then calls the LLM again.
3. **Parse failure** -- if both attempts fail, throws an error (caught by the per-call try/catch above).

### Response Envelope Unwrapping

`tryParseJson()` handles multiple response formats from the LLM endpoint:

- Standard envelope: `{ "Result": { "text": "...JSON..." } }`
- Flat envelope: `{ "response": "..." }` or `{ "content": "..." }`
- Markdown-fenced JSON: strips `` ```json ... ``` `` wrappers
- Embedded JSON: finds the first `{` to last `}` substring and attempts to parse it

### Citation Stripping

The LLM endpoint with Bing grounding sometimes injects citation markers like `【3:2†source】` into response text. The `cleanCitations()` function recursively strips these markers from all string values in the parsed JSON to keep the output document clean.

### Call 3 Resilience

`researchAgreementLandscape()` has an additional fallback: if the first attempt (requesting 20 agreement types with full constraints) fails, it retries with a simplified prompt requesting only 15 agreement types with fewer formatting constraints.

### Agreement Landscape Fallback

If Call 3 (Agreement Landscape) fails — both the full prompt and the simplified retry — the system falls back to `generateFallbackAgreementLandscape()` in `DataExtractor.gs`. This function produces a deterministic, code-based agreement landscape using three inputs already available at that point: the industry from the bookscrub sheet, the account profile from Call 1 (business units, financials), and the business map from Call 2 (departments with agreement intensity ratings).

The fallback combines 8 universal base agreement types (`BASE_AGREEMENTS` in `Config.gs`) with industry-specific overlays (`INDUSTRY_AGREEMENTS` in `Config.gs`) matched by case-insensitive substring on the industry field. It then maps each agreement to the best-matching department from the business map using `departmentHint` keywords, and boosts volume scores for departments tagged with high agreement intensity. The result is capped at 15 agreements, sorted by combined volume + complexity score, and tagged with `_fallback: true` so the document renderer can display an explanatory note. The fallback output uses the same `{ agreements: [...], sources: [] }` shape as the LLM response, so downstream calls (Call 4 and Call 5) continue to work without modification.

### Source URL Filtering

`collectSources()` filters out hallucinated or placeholder URLs using blocked patterns (`internal.docusign`, `example.com`, `localhost`, etc.) before including them in the Sources section.
