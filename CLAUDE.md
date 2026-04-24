# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Session Startup Supplement

After the standard git + plan status report, also present this project quick-reference:

```
📦 Project: growth-strategy-2026 (Google Apps Script + Cloudflare Worker)
   Deploy:   ./deploy.sh "optional description"
             (stamps current timestamp into BUILD_DATE, then clasp push + clasp deploy over the fixed deployment ID)
             (clasp push alone does NOT update the live web app URL)
   Workers:  cd workers/sec-edgar-proxy && npm run deploy
   Test:     Open the deployed web app URL directly (no "Test Generate" in the sheet menu)

🗂 Key files:
   Config.gs        — LLM endpoint, COLUMN_GROUPS, product catalog, industry agreement tables
   DataExtractor.gs — Bookscrub sheet parsing, signal matching, summarizeForLLM()
   Researcher.gs    — 5 LLM calls, callLLMJson() retry/parse, cleanCitations()
   DocGenerator.gs  — generateGrowthStrategyDoc() orchestration, 9 section builders
   Menu.gs          — onOpen(), company picker dialog, settings prompts
   DataEnricher.gs  — Optional SEC EDGAR / Wikipedia enrichment (ENRICHMENT_ENABLED flag)

🤖 LLM pipeline (sequential — each call uses prior results as context):
   Call 1: researchAccountProfile()    → overview, BUs, financials, SWOT, executives, tech
   Call 2: researchBusinessMap()       → org hierarchy BU > Dept > Function (uses Call 1)
   Call 3: researchAgreementLandscape()→ top 20 agreement types scored (uses Calls 1+2)
   Call 4: researchContractCommerce()  → commerce estimates by dept/type (uses Calls 1+3)
   Call 5: synthesizePriorityMap()     → recommendations + action plan (uses ALL + signals)
   Fallback: any call failure → {} + fallback render; Call 3 also has simplified-prompt retry
            Call 3 double-fail → generateFallbackAgreementLandscape() (deterministic, from Config.gs tables)

⚠️  Key conventions:
   extractString(obj, key) — always use for LLM JSON string fields (crash safety)
   tryParseJson()          — handles all envelope formats; extend there, not inline
   cleanCitations()        — strips 【3:2†source】 markers before writing to doc
   COLUMN_GROUPS           — add bookscrub columns in Config.gs, not scattered inline
   Business Map            — all Call 1 BUs + Corporate/Shared Services must appear as nodes
```

## What This Project Is

A **Google Apps Script** tool that generates a comprehensive account research Google Doc for any Docusign customer account. It reads internal usage data from a bookscrub Google Sheet, runs 5 sequential LLM research calls against an internal endpoint (`infra.agreementsdemo.com/openai`), and builds a 9-section Google Doc saved to a configured Drive folder.

There is also a **Cloudflare Worker** (`workers/sec-edgar-proxy/`) that proxies SEC EDGAR API calls to avoid CORS restrictions from Apps Script.

## Development Workflow

### Deploying Apps Script Changes

```bash
# Push local changes to Google Apps Script
clasp push

# Pull latest from Apps Script (to sync if edited in the browser)
clasp pull

# Open the script in the browser
clasp open
```

All `.gs` source files live in `src/`. The `clasp` root is configured to `src/` via `.clasp.json`.

### SEC EDGAR Worker

```bash
cd workers/sec-edgar-proxy
npm run dev      # local dev with wrangler
npm run deploy   # deploy to Cloudflare
```

### Running the Tool

There is no local test runner. To test:
1. Open the bound Google Sheet (bookscrub data source)
2. Click **Account Research > Generate for Company...**
3. Or use **Account Research > Test Generate** to run against a hardcoded company name via `testGenerate()` in `Menu.gs`

Script properties must be configured before first run: `INFRA_API_KEY`, `INFRA_API_USER`, `OUTPUT_FOLDER_ID`, and optionally `SEC_PROXY_URL`. Use the **Account Research > Settings** menu items to set these.

## File Roles

| File | Purpose |
|------|---------|
| `src/Config.gs` | Constants, LLM endpoint, column mappings (`COLUMN_GROUPS`), product catalog (`DOCUSIGN_CATALOG`), industry agreement tables (`BASE_AGREEMENTS`, `INDUSTRY_AGREEMENTS`) |
| `src/DataExtractor.gs` | Reads and parses the bookscrub sheet; runs signal matching against 15 products + 4 bundles; produces `summarizeForLLM()` text block |
| `src/Researcher.gs` | All 5 LLM calls; `callLLMJson()` with retry + JSON parse; citation stripping via `cleanCitations()` |
| `src/DocGenerator.gs` | Orchestration entry point (`generateGrowthStrategyDoc()`); all 9 section builder functions; account health scorecard (`analyzeAccountHealth()`); `addStyledTable()` / `createBarChart()` helpers |
| `src/Menu.gs` | `onOpen()` menu wiring; company picker dialog; settings prompts |
| `src/DataEnricher.gs` | Optional enrichment via Wikipedia/Wikidata and SEC EDGAR proxy; controlled by `ENRICHMENT_ENABLED` flag in Config.gs |

## LLM Call Architecture

5 calls run **sequentially** in `generateGrowthStrategyDoc()` — each uses previous results as context:

1. `researchAccountProfile()` → company overview, BUs, financials, SWOT, executives, tech stack
2. `researchBusinessMap()` → org hierarchy (BU > Department > Function) with agreement intensity — receives Call 1 output
3. `researchAgreementLandscape()` → top 20 agreement types (volume + complexity scored) — receives Calls 1+2
4. `researchContractCommerce()` → commerce estimates by dept/agreement type — receives Calls 1+3
5. `synthesizePriorityMap()` → recommendations, expansion opportunities, action plan — receives all prior results + internal data + product catalog (injected into system prompt)

Each call is wrapped in try/catch; failure produces `{}` and the affected section renders with a fallback. Call 3 has an additional simplified-prompt retry, and if that also fails, `generateFallbackAgreementLandscape()` in `DataExtractor.gs` produces a deterministic agreement landscape from industry config.

## Deployment Rules

- **NEVER run `clasp push` or `clasp deploy` directly** — always use `./deploy.sh`
- **Do NOT deploy after every small change** — batch changes and deploy at checkpoints
- Each deploy burns a GAS version (hard limit of 200). Be conservative.
- `clasp push` alone does NOT update the live web app URL
- After deploying, bump the library version in the Slack project (see memory for details)

## Key Conventions

- **`extractString(obj, key)`** — always use this safety wrapper when pulling string fields from LLM JSON responses to avoid `.toString()` crashes on non-string values
- **JSON parsing** — `tryParseJson()` in `Researcher.gs` handles multiple envelope formats, markdown-fenced JSON, and embedded JSON extraction; extend it there, not inline
- **Citation markers** like `【3:2†source】` are injected by the Bing-grounded endpoint and must be stripped via `cleanCitations()` before writing to the doc
- **Bookscrub columns** are referenced by logical group via `COLUMN_GROUPS` in `Config.gs` — add new columns there, not scattered across files
- **Business Map** — every known BU from Call 1 must appear as its own node; Corporate/Shared Services is always required as an additional node (enforced in both `researchBusinessMap()` and `buildCall2Request()` prompts)
- **`collectSources()`** — filters source URLs before writing to the Sources section; blocks hallucinated/placeholder patterns (`internal.docusign`, `example.com`, `localhost`, etc.); extend the blocklist there, not inline

## Output Document Structure

9 sections built in sequence by `generateGrowthStrategyDoc()`. Section 6 is the only section with no LLM dependency — it derives entirely from internal bookscrub data.

| # | Section | Data Source | Builder Function |
|---|---------|------------|-----------------|
| 1 | Company Profile | Call 1 | `addCompanyProfileSection()` |
| 2 | Business Performance & Strategy | Call 1 | `addBusinessPerformanceSection()` |
| 3 | Executive Contacts & Technology | Call 1 | `addExecutivesAndTechSection()` |
| 4 | Business Map | Call 2 | `addBusinessMapSection()` |
| 5 | Docusign Footprint | Internal data + Call 5 (current use cases) | `addDocusignTodaySection()` |
| 6 | Account Health Analysis | Internal data only | `addAccountHealthSection()` |
| 7 | Agreement Landscape | Call 3 | `addAgreementLandscapeSection()` |
| 8 | Contract Commerce Estimate | Call 4 | `addContractCommerceSection()` |
| 9 | Priority Map | Call 5 | `addPriorityMapSection()` |
| — | Sources | All calls (deduplicated, filtered) | `addSourcesSection()` |

## Docs & Prompts

- `docs/architecture/architecture.md` — detailed execution flow, LLM pipeline, error handling
- `docs/architecture/data-dictionary.md` — every bookscrub column and how it's used
- `docs/architecture/signal-matching.md` — how product signals are evaluated
- `docs/architecture/ACCOUNT_HEALTH_ANALYSIS.md` — health scorecard indicator definitions
- `docs/specs/` — problem statement, glean investigation, web UI exploration, research
- `docs/setup/data-sources.md` — data source configuration reference
- `docs/guides/` — user-facing overviews and field references (HTML/PDF)
- `prompts/call1-5-*.md` — reference specs for each of the 5 GAS LLM calls
- `prompts/GEM_PROMPT.md` — full system prompt for a Google Gemini Gem implementation of the same tool (alternative to GAS, uses a connected Sheet as knowledge source)
- `prompts/GLEAN_PROMPT.md` / `GLEAN_WORKFLOW.md` — system prompt + workflow for a Glean agent implementation
- `context/reference/` — brand assets, style guide, sample output PDFs, bookscrub CSVs
- `context/samples/` — example output docs (Account Research, Agreement Landscape)
- `context/transcripts/` — meeting notes and call recordings
