# Data Sources

This document describes every data source the Account Research tool draws from, how data flows through the system, and what each source contributes to the final document.

---

## Two Generation Pipelines

The tool offers two pipelines accessible from the **Account Research** menu. Both produce the same 9-section Google Doc output. The Glean pipeline is the successor — it's richer because it has access to Docusign's internal knowledge base.

| Menu item | Pipeline | LLM | External knowledge |
|---|---|---|---|
| Generate for Company… | **Original (v1)** | OpenAI GPT-4o via INFRA | Bing web search (optional) |
| Generate via Glean… | **Glean (v2)** | Google Gemini via Glean agent + INFRA | Glean internal index + web search |

Both pipelines share the same upstream inputs (bookscrub sheet, enrichment APIs) and the same downstream output (Google Doc written by `DocGenerator.gs`). The difference is in the middle: how the LLM is called and what knowledge it can access.

---

## Source 1 — Bookscrub Sheet (Internal, Primary)

**What it is:** The Docusign Book of Business export. A Google Sheet with one row per account, containing subscription, consumption, and product data pulled from Salesforce/billing systems.

**How it's read:** `DataExtractor.gs → getCompanyData()` reads targeted columns defined in `COLUMN_GROUPS` in `Config.gs`. No full-sheet load — only the columns the tool needs are fetched.

**What it provides:**

| Data group | Examples |
|---|---|
| Identity | Account name, Salesforce ID, GTM group ID |
| Contract | Plan tier, ARR, ACV, contract start/end, seats purchased |
| Consumption | Envelopes sent vs. purchased, utilisation rate |
| Product signals | Which Docusign products are active (IAM, CLM, Notary, etc.) |
| Relationship | Account owner, SE, renewal date |
| Industry & segment | Industry classification, company size band |

**Signal matching:** `DataExtractor.gs → generateProductSignals()` scores 15 products + 4 bundles against the raw data to produce a structured signal map. This is injected into every LLM call as ground truth — the LLM cannot contradict it.

**GTM groups:** Multiple accounts can be grouped by a Salesforce GTM group ID. `getGtmGroupData()` aggregates all accounts in the group into a single payload, summing ACV, envelopes, and seats.

---

## Source 2 — SEC EDGAR (Public API, via Cloudflare Worker)

**What it is:** The U.S. Securities and Exchange Commission's EDGAR database of public company filings. The tool queries the XBRL financial data from 10-K annual reports.

**How it's accessed:** GAS cannot call the SEC EDGAR API directly due to CORS restrictions. A Cloudflare Worker (`workers/sec-edgar-proxy/`) proxies the request. The Worker URL is stored as the `SEC_PROXY_URL` script property.

**Lookup path:** Company name → Wikidata CIK → SEC EDGAR XBRL API (or ticker → CIK resolved by the proxy)

**What it provides:**

| Field | Source |
|---|---|
| Revenue | 10-K XBRL `Revenues` or `RevenueFromContractWithCustomer` |
| COGS, OpEx, CapEx, Net Income | 10-K XBRL financial statements |
| Employee count | 10-K XBRL `EntityNumberOfEmployees` |
| Business segment revenue | XBRL segment dimension data |
| Filing period | `EntityFiscalYearEnd` — used to label data with the correct FY |
| SIC industry description | SEC SIC code lookup |

**How it's used downstream:** SEC financials are injected into LLM prompts as `=== VERIFIED FINANCIALS (SEC EDGAR 10-K) ===` blocks. The `enforceVerifiedData()` function in `Researcher.gs` then overwrites any conflicting AI estimates in the response before the doc is written. This means SEC data is authoritative — the LLM cannot hallucinate revenue figures.

---

## Source 3 — Wikipedia (Public API)

**What it is:** The Wikipedia REST API and MediaWiki API, used to fetch stable company overview text.

**Endpoints used:**
- `https://en.wikipedia.org/w/api.php?action=query&list=search` — find the correct article title
- `https://en.wikipedia.org/api/rest_v1/page/summary/{title}` — fetch the intro extract
- `https://en.wikipedia.org/w/api.php?action=query&prop=pageprops` — resolve Wikipedia title → Wikidata QID

**What it provides:** A 2–3 sentence company overview used in the Company Profile section and injected into LLM prompts. The Wikipedia title is also used as the reliable bridge to find the correct Wikidata entity (more trustworthy than a raw Wikidata text search, which can match subsidiaries or unrelated entities).

---

## Source 4 — Wikidata (Public API)

**What it is:** Wikidata's structured knowledge base, accessed via the Wikibase API.

**Endpoint:** `https://www.wikidata.org/w/api.php`

**Lookup:** Wikipedia title → QID via `pageprops` → entity claims via `wbgetentities`

**What it provides:**

| Field | Wikidata property |
|---|---|
| CEO / head of organization | P169 |
| Headquarters location | P159 |
| Founding date | P571 |
| Stock ticker | P249 (or P414 qualifier) |
| SEC CIK number | P5531 |
| Industry classification | P452 |

The CIK from Wikidata (P5531) is what drives the SEC EDGAR lookup — it's the key that links a company name to its EDGAR filing record.

---

## Source 5 — INFRA Proxy: `/openai` (Original Pipeline)

**URL:** `https://infra.agreementsdemo.com/openai`
**Auth:** `DOCU-INFRA-IC-KEY` + `DOCU-INFRA-IC-USER` headers
**Model:** GPT-4o (`v: "4o"`)

**What it is:** An internal Docusign proxy that authenticates to OpenAI on behalf of the tool. Supports an optional Bing grounding parameter (`gb=1`) that grounds responses in live web search results; currently the Bing-grounded endpoint is broken so `gb=0` is primary and `gb=1` is the retry fallback.

**Data flow:** GAS sends `{ v, sr, ur }` (model, system prompt, user prompt). The proxy returns either a plain text JSON response or a `{ Result: "..." }` envelope depending on the `gb` flag. `tryParseJson()` normalises both.

**Five sequential LLM calls per document:**

| Call | Input context | Output |
|---|---|---|
| 1 — Account Profile | Company name + bookscrub summary + SEC/Wikipedia/Wikidata enrichment | Company overview, BUs, SWOT, executives, tech stack |
| 2 — Business Map | Call 1 output | Org hierarchy: BU → Dept → Function with agreement intensity scores |
| 3 — Agreement Landscape | Calls 1+2 | Top 20 agreement types scored by volume + complexity |
| 4 — Contract Commerce | Calls 1+3 + SEC financials | Dollar estimates of commerce by department and agreement type |
| 5 — Priority Map | All prior calls + product signals + full product catalog | Expansion recommendations, big bets, action plan |

Each call is wrapped in try/catch. A failed call returns `{}` and the affected document section renders a fallback. Call 3 has an additional simplified-prompt retry; if that also fails, `generateFallbackAgreementLandscape()` produces a deterministic agreement landscape from industry config tables in `Config.gs`.

---

## Source 6 — INFRA Proxy: `/glean` (Glean Pipeline)

**URL:** `https://infra.agreementsdemo.com/glean`
**Auth:** same `DOCU-INFRA-IC-KEY` + `DOCU-INFRA-IC-USER` headers

**What it is:** An internal proxy to a Glean agent backed by Google Gemini. The Glean agent has access to Docusign's internal Glean search index (CRM records, deal notes, account history, internal documents) as well as external web search. GAS drives the agent through a structured 5-step workflow using `STEP: <name>` markers to route each message to the correct agent branch.

**Five steps per document (2 parallel + 3 sequential):**

| Step | Runs | Input | Output |
|---|---|---|---|
| `company-search` | Parallel | Company name + industry | Glean internal knowledge summary |
| `web-search` | Parallel | Company name + industry | External web research summary |
| `think1` | Sequential | Full bookscrub payload + both research summaries | `accountProfile` JSON |
| `think2` | Sequential | Payload + `accountProfile` | `businessMap` + `agreementLandscape` + `contractCommerce` JSON |
| `think3` | Sequential | Payload + `accountProfile` + think2 data | `briefing` + `bigBets` JSON |

Steps 1+2 use `UrlFetchApp.fetchAll()` for true parallelism. Steps 3–5 are sequential because each depends on the previous output. Think steps retry up to 3× on HTTP 500/502 (with a 60s wait). Research step failures are non-fatal — the think steps degrade gracefully with empty research strings.

**Key difference vs. original pipeline:** The `company-search` step queries Glean's internal index, meaning the LLM can ground its analysis in Docusign's actual internal data about the account — deal history, previous QBRs, renewal notes, open opportunities — rather than only public web information.

---

## Data Assembly and Flow Summary

```
Bookscrub Sheet
  └─ getCompanyData()          Internal usage, contract, consumption data
  └─ generateProductSignals()  Product signal map (15 products + 4 bundles)

Public APIs (DataEnricher.gs, runs before LLM calls)
  └─ Wikipedia     Company overview text
  └─ Wikidata      CEO, HQ, founding date, ticker, CIK
  └─ SEC EDGAR     Revenue, financials, segment data from 10-K filings
     (via Cloudflare Worker proxy — workers/sec-edgar-proxy/)

All above assembled into: { account, productSignals, enrichment }
            │
            ├─ Original pipeline (Researcher.gs)
            │    5 sequential calls → infra.agreementsdemo.com/openai
            │    enforceVerifiedData() overwrites AI estimates with SEC facts
            │
            └─ Glean pipeline (GleanTrigger.gs)
                 2 parallel research steps → infra.agreementsdemo.com/glean
                 3 sequential think steps  → infra.agreementsdemo.com/glean
                 (Glean agent has access to internal index + web search)

Both pipelines → DocGenerator.gs → generateAccountResearchDoc()
                                    9-section Google Doc saved to Drive
```

---

## What Each Source Contributes to the Final Document

| Document section | Bookscrub | SEC EDGAR | Wikipedia/Wikidata | LLM (OpenAI or Glean) |
|---|:---:|:---:|:---:|:---:|
| 1. Company Profile | ✓ (identity) | ✓ (revenue, employees) | ✓ (overview, CEO, HQ) | ✓ (synthesis) |
| 2. Business Performance & Strategy | | ✓ (financials, segments) | | ✓ |
| 3. Executive Contacts & Technology | | | ✓ (CEO) | ✓ |
| 4. Business Map | | | | ✓ |
| 5. Docusign Footprint | ✓ (products, consumption) | | | ✓ (current use cases) |
| 6. Account Health Analysis | ✓ (all metrics) | | | — (no LLM) |
| 7. Agreement Landscape | | | | ✓ |
| 8. Contract Commerce Estimate | | ✓ (revenue anchor) | | ✓ |
| 9. Priority Map | ✓ (signals, catalog) | | | ✓ |
| Sources appendix | | ✓ | ✓ | ✓ (deduplicated, filtered) |

Section 6 (Account Health Analysis) is the only section with no LLM dependency — it is computed entirely from bookscrub data.
