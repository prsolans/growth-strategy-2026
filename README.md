# Growth Strategy Report Generator

A Google Apps Script tool that generates comprehensive, AI-researched growth strategy Google Docs for Docusign customer accounts. It reads internal bookscrub usage data, enriches it with public data sources, runs a 7-call sequential/parallel LLM research pipeline, and produces a branded, multi-section strategic document saved to Google Drive.

Designed for on-demand use by sales reps via the Genius Bar infrastructure.

---

## System Architecture

```mermaid
graph TB
    subgraph Inputs
        SHEET["📊 Bookscrub Google Sheet\n(internal usage data\n~200+ accounts)"]
        SALES["👤 Sales Rep\n(company name trigger)"]
    end

    subgraph GAS["Google Apps Script (src/)"]
        MENU["Menu.gs\nonOpen() · company picker\nsettings prompts"]
        EXTRACT["DataExtractor.gs\nsheet parsing\nsignal matching\nsummarizeForLLM()"]
        ENRICH["DataEnricher.gs\nWikipedia · Wikidata\nSEC EDGAR (optional)"]
        RESEARCH["Researcher.gs\n7 LLM calls\ncallLLMJson() · callLLMJsonParallel()\ntryParseJson() · cleanCitations()"]
        DOCGEN["DocGenerator.gs\ngenerateGrowthStrategyDoc()\n9 section builders\nchart helpers"]
        BATCH["BatchRunner.gs\nunattended bulk generation\nLockService · trigger scheduling"]
        CONFIG["Config.gs\nLLM endpoint · COLUMN_GROUPS\nDOCUSIGN_CATALOG\nBASE_AGREEMENTS · INDUSTRY_AGREEMENTS"]
    end

    subgraph External
        LLM["🤖 LLM Endpoint\ninfra.agreementsdemo.com/openai\n(Bing-grounded · GPT-4o)"]
        WIKI["🌐 Wikipedia / Wikidata APIs\ncompany overview · CIK · ticker"]
        SEC["🏛 SEC EDGAR\n(via Cloudflare Worker proxy)\nfinancials · segment revenue"]
        DRIVE["📁 Google Drive\noutput folder\nsaved .gdoc files"]
    end

    SALES -->|"Generate for Company..."| MENU
    SHEET -->|"getCompanyData()"| EXTRACT
    MENU --> EXTRACT
    EXTRACT --> ENRICH
    ENRICH -->|"Wikipedia · Wikidata"| WIKI
    ENRICH -->|"CIK / ticker lookup"| SEC
    EXTRACT --> RESEARCH
    ENRICH --> RESEARCH
    CONFIG --> RESEARCH
    RESEARCH <-->|"POST /openai"| LLM
    RESEARCH --> DOCGEN
    DOCGEN -->|"DocumentApp.create()"| DRIVE
    BATCH -->|"time-based triggers\nchunk processing"| DOCGEN
```

---

## Execution Flow

```mermaid
flowchart TD
    A([Sales rep triggers\nGenerate for Company]) --> B[getCompanyData\nparse bookscrub sheet\nmatch 230 columns]
    B --> C[generateProductSignals\n15 products · 4 bundles\nStrong / Moderate / In Use]
    C --> D[enrichCompanyData\nWikipedia overview\nSEC EDGAR financials]
    D --> E{Enrichment\nsucceeded?}
    E -- yes --> F[enforceEnrichedData\noverwrite LLM hallucinations\nwith verified facts]
    E -- no --> F

    F --> G[LLM Call 1\nAccount Profile\nsequential · ~23s]
    G --> H[LLM Calls 2+3+4\nBusiness Map · Agreement Landscape\nContract Commerce\nparallel · ~26s]

    H --> I{All 3\nsucceeded?}
    I -- yes --> K
    I -- no --> J[Retry failed calls\nindividually\n~20s each]
    J --> K[LLM Call 5\nPriority Map\nsequential · ~20s]
    K --> L[LLM Calls 6+7\nExecutive Briefing · Big Bet Initiatives\nparallel · ~17s]

    L --> M[DocumentApp.create\nbuild header + 6 front sections\n+ appendix]
    M --> N[Save to Drive\nreturn doc URL]

    style G fill:#1B0B3B,color:#fff
    style H fill:#1B0B3B,color:#fff
    style K fill:#1B0B3B,color:#fff
    style L fill:#1B0B3B,color:#fff
```

---

## LLM Pipeline — Call Dependencies & Fallbacks

```mermaid
flowchart LR
    subgraph S1["Sequential"]
        C1["Call 1\nresearchAccountProfile()\n\nOutputs:\ncompanyOverview · businessUnits\nfinancials · SWOT\nexecutiveContacts · technologyStack"]
    end

    subgraph P1["Parallel"]
        C2["Call 2\nbuildCall2Request()\nBusiness Map\n\nOutputs:\nnodes[] — BU › Dept › Function\nagreementIntensity per node"]
        C3["Call 3\nbuildCall3Request()\nAgreement Landscape\n\nOutputs:\nagreements[20] — type · volume\ncomplexity · contractType · BU"]
        C4["Call 4\nbuildCall4Request()\nContract Commerce\n\nOutputs:\ncommerceByDepartment\ncommerceByAgreementType\npainPoints"]
    end

    subgraph S2["Sequential"]
        C5["Call 5\nsynthesizePriorityMap()\n\nInputs: ALL prior calls\n+ product signals\n+ DOCUSIGN_CATALOG\n\nOutputs:\ncurrentUseCases · priorityMapping\nexpansionOpportunities · actionPlan"]
    end

    subgraph P2["Parallel"]
        C6["Call 6\nbuildCall6Request()\nExecutive Briefing\n\nOutputs:\nintroText · priorities[3]"]
        C7["Call 7\nbuildCall7Request()\nBig Bet Initiatives\n\nOutputs:\nbigBets[] — one per BU\ntitle · solution · rationale\nestimatedAnnualValue · opportunityScore"]
    end

    C1 --> C2 & C3 & C4
    C2 & C3 & C4 --> C5
    C5 --> C6 & C7

    C3 -. "parse fail\n→ retry individually" .-> C3R["Call 3 Retry\nresearchAgreementLandscape()\n~20s"]
    C3R -. "double fail\n→ deterministic fallback" .-> FB["generateFallbackAgreementLandscape()\nfrom Config.gs industry tables\nno LLM required"]

    style C1 fill:#1B0B3B,color:#fff
    style C2 fill:#1B0B3B,color:#fff
    style C3 fill:#1B0B3B,color:#fff
    style C4 fill:#1B0B3B,color:#fff
    style C5 fill:#00B388,color:#fff
    style C6 fill:#1B0B3B,color:#fff
    style C7 fill:#1B0B3B,color:#fff
    style FB fill:#888,color:#fff
```

---

## Output Document Structure

```mermaid
flowchart TD
    HDR["🏷 Branded Header\nDocusign logo · company name · generated date"]

    subgraph FRONT["Front Matter — 6 Sections"]
        S1["Section 1\nDocusign Today\ncontract table · seat/envelope metrics"]
        S2["Section 2\nProduct Adoption Opportunity\nsignal-matched recommendations"]
        S3["Section 3\nAccount Health\n6-indicator scorecard"]
        S4["Section 4\nStrategic Initiatives\nexecutive briefing · priorities"]
        S5["Section 5\nLong-Term Opportunity Map\nBig Bets per BU (matrix + LTOM)"]
        S6["Section 6\nHigh Value — Top 3 Big Bets\ntransposed summary matrix"]
    end

    subgraph APP["Appendix — Full Supporting Detail"]
        A1["Company Profile\noverview · BUs · financials · customer base"]
        A2["Business Performance & Strategy\nSWOT · strategic priorities"]
        A3["Executive Contacts & Technology\nexec list · tech stack · SIs"]
        A4["Priority Map\nuse cases · expansion · action plan"]
        A5["Agreement Landscape\nquadrant guide · 20-type table\nbusiness map org hierarchy"]
        A6["Contract Commerce Estimate\ncommerce by dept · by agreement type\nbar chart (if ≥3 depts have $ values)"]
        A7["Docusign Footprint\nproduct adoption table · signal reasons"]
        A8["Executive Meeting Briefing\nexec-ready narrative"]
        A9["Big Bet Detail\nfull initiative cards — one per BU"]
        A10["Data Sources & Methodology"]
    end

    HDR --> S1 --> S2 --> S3
    S3 --> S4 --> S5 --> S6
    S6 --> APP

    note1["Sections 1–3: internal data only\n(suppressed for prospects)"]
    note2["Sections 4–6: AI-synthesized strategy\n(shown for all accounts)"]

    style HDR fill:#1B0B3B,color:#fff
    style S1 fill:#00695C,color:#fff
    style S2 fill:#00695C,color:#fff
    style S3 fill:#00695C,color:#fff
    style S4 fill:#1B0B3B,color:#fff
    style S5 fill:#1B0B3B,color:#fff
    style S6 fill:#1B0B3B,color:#fff
```

---

## Signal Matching

Product signals are evaluated by `generateProductSignals()` in `DataExtractor.gs`. Each of the 15 products + 4 bundles is scored as **Strong**, **Moderate**, **In Use**, or not applicable based on bookscrub column values.

```mermaid
flowchart LR
    RAW["Bookscrub columns\nenvelopes · seats · integrations\nproduct flags · API calls\nmobile signs · webapp sends"]

    RAW --> EVAL["Evaluate 15 products\n+ 4 bundles\nper product rule set\n(Config.gs DOCUSIGN_CATALOG)"]

    EVAL --> STRONG["Strong signal\n—\nNot in use AND\nclear usage trigger\n(e.g. high volume, no Navigator)"]
    EVAL --> MOD["Moderate signal\n—\nNot in use but\nweaker indicator"]
    EVAL --> USE["In Use\n—\nproduct already purchased\nor detected active"]

    STRONG & MOD --> SUMMARY["summarizeForLLM()\ntext block injected into\nCall 5 + Call 7 system prompts"]
    USE --> SUMMARY

    SUMMARY --> GUARDRAIL["LLM guardrail:\nDo NOT recommend\nIn Use products\nas core Big Bets"]
```

---

## Batch Runner Flow

For unattended bulk generation across many accounts:

```mermaid
flowchart TD
    START(["startBatchGeneration()\noperator triggers once"])
    START --> LOCK["Acquire LockService\n(prevent concurrent runs)"]
    LOCK --> INIT["Read Batch Status sheet\nfind pending rows"]
    INIT --> TRIGGER["Create time-based trigger\nevery 5 minutes"]

    TRIGGER --> CHUNK["_batchGenerateChunkBody()\nfires every 5 min"]
    CHUNK --> STUCK["Mark any stuck 'running' rows\nas 'failed' with error message"]
    STUCK --> LOOP["Process up to 2 pending rows\nper trigger fire"]

    LOOP --> GEN["generateGrowthStrategyDoc()\n~2 min per company"]
    GEN --> STATUS{Success?}
    STATUS -- yes --> MARK_DONE["Set row → 'done'\nwrite doc URL"]
    STATUS -- no --> MARK_FAIL["Set row → 'failed'\nwrite error message"]

    MARK_DONE & MARK_FAIL --> MORE{More\npending rows?}
    MORE -- yes --> WAIT["Wait for next\n5-min trigger fire"]
    MORE -- no --> CLEANUP["Delete trigger\nrelease lock\nBatch complete"]

    WAIT --> CHUNK
```

---

## File Reference

| File | Role |
|---|---|
| `src/Config.gs` | LLM endpoint, `COLUMN_GROUPS`, `DOCUSIGN_CATALOG`, `BASE_AGREEMENTS`, `INDUSTRY_AGREEMENTS`, logo base64 |
| `src/DataExtractor.gs` | Bookscrub sheet parsing, signal matching, `summarizeForLLM()`, deterministic agreement fallback |
| `src/Researcher.gs` | All 7 LLM calls, `callLLMJson()`, `callLLMJsonParallel()`, `tryParseJson()`, `cleanCitations()` |
| `src/DocGenerator.gs` | `generateGrowthStrategyDoc()` orchestration, `addDocumentHeader()`, all section builders, chart helpers |
| `src/Menu.gs` | `onOpen()`, company picker dialog, settings prompts, `testGenerate()` |
| `src/DataEnricher.gs` | Wikipedia / Wikidata / SEC EDGAR enrichment (controlled by `ENRICHMENT_ENABLED` in Config.gs) |
| `src/BatchRunner.gs` | Unattended bulk generation via time-based triggers and LockService |
| `workers/sec-edgar-proxy/` | Cloudflare Worker that proxies SEC EDGAR API calls to avoid CORS restrictions from GAS |

---

## Deployment

```bash
# Push local .gs changes to Google Apps Script
clasp push

# Pull latest from Apps Script (if edited in browser)
clasp pull

# Deploy SEC EDGAR Cloudflare Worker
cd workers/sec-edgar-proxy && npm run deploy
```

**Required Script Properties** (set via **Growth Strategy > Settings** menu):

| Property | Description |
|---|---|
| `INFRA_API_KEY` | API key for the internal LLM endpoint |
| `INFRA_API_USER` | API user for the internal LLM endpoint |
| `OUTPUT_FOLDER_ID` | Google Drive folder ID where docs are saved |
| `SEC_PROXY_URL` | URL of the deployed Cloudflare Worker (optional) |
