# Growth Strategy Report Generator

A Google Apps Script tool that generates comprehensive, AI-researched growth strategy Google Docs for Docusign customer accounts. It reads internal bookscrub usage data, enriches it with public data sources, runs a 7-call sequential/parallel LLM research pipeline, and produces a branded, multi-section strategic document saved to Google Drive.

Designed for on-demand use by sales reps via the Genius Bar infrastructure.

---

## System Architecture

```mermaid
graph TB
    subgraph Inputs
        SHEET["📊 Bookscrub Google Sheet<br/>(internal usage data<br/>~200+ accounts)"]
        SALES["👤 Sales Rep<br/>(company name trigger)"]
    end

    subgraph GAS["Google Apps Script (src/)"]
        MENU["Menu.gs<br/>onOpen() · company picker<br/>settings prompts"]
        EXTRACT["DataExtractor.gs<br/>sheet parsing<br/>signal matching<br/>summarizeForLLM()"]
        ENRICH["DataEnricher.gs<br/>Wikipedia · Wikidata<br/>SEC EDGAR (optional)"]
        RESEARCH["Researcher.gs<br/>7 LLM calls<br/>callLLMJson() · callLLMJsonParallel()<br/>tryParseJson() · cleanCitations()"]
        DOCGEN["DocGenerator.gs<br/>generateGrowthStrategyDoc()<br/>9 section builders<br/>chart helpers"]
        BATCH["BatchRunner.gs<br/>unattended bulk generation<br/>LockService · trigger scheduling"]
        CONFIG["Config.gs<br/>LLM endpoint · COLUMN_GROUPS<br/>DOCUSIGN_CATALOG<br/>BASE_AGREEMENTS · INDUSTRY_AGREEMENTS"]
    end

    subgraph External
        LLM["🤖 LLM Endpoint<br/>infra.agreementsdemo.com/openai<br/>(Bing-grounded · GPT-4o)"]
        WIKI["🌐 Wikipedia / Wikidata APIs<br/>company overview · CIK · ticker"]
        SEC["🏛 SEC EDGAR<br/>(via Cloudflare Worker proxy)<br/>financials · segment revenue"]
        DRIVE["📁 Google Drive<br/>output folder<br/>saved .gdoc files"]
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
    BATCH -->|"time-based triggers<br/>chunk processing"| DOCGEN
```

---

## Execution Flow

```mermaid
flowchart TD
    A([Sales rep triggers<br/>Generate for Company]) --> B[getCompanyData<br/>parse bookscrub sheet<br/>match 230 columns]
    B --> C[generateProductSignals<br/>15 products · 4 bundles<br/>Strong / Moderate / In Use]
    C --> D[enrichCompanyData<br/>Wikipedia overview<br/>SEC EDGAR financials]
    D --> E{Enrichment<br/>succeeded?}
    E -- yes --> F[enforceEnrichedData<br/>overwrite LLM hallucinations<br/>with verified facts]
    E -- no --> F

    F --> G[LLM Call 1<br/>Account Profile<br/>sequential · ~23s]
    G --> H[LLM Calls 2+3+4<br/>Business Map · Agreement Landscape<br/>Contract Commerce<br/>parallel · ~26s]

    H --> I{All 3<br/>succeeded?}
    I -- yes --> K
    I -- no --> J[Retry failed calls<br/>individually<br/>~20s each]
    J --> K[LLM Call 5<br/>Priority Map<br/>sequential · ~20s]
    K --> L[LLM Calls 6+7<br/>Executive Briefing · Big Bet Initiatives<br/>parallel · ~17s]

    L --> M[DocumentApp.create<br/>build header + 6 front sections<br/>+ appendix]
    M --> N[Save to Drive<br/>return doc URL]

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
        C1["Call 1<br/>researchAccountProfile()<br/><br/>Outputs:<br/>companyOverview · businessUnits<br/>financials · SWOT<br/>executiveContacts · technologyStack"]
    end

    subgraph P1["Parallel"]
        C2["Call 2<br/>buildCall2Request()<br/>Business Map<br/><br/>Outputs:<br/>nodes[] — BU › Dept › Function<br/>agreementIntensity per node"]
        C3["Call 3<br/>buildCall3Request()<br/>Agreement Landscape<br/><br/>Outputs:<br/>agreements[20] — type · volume<br/>complexity · contractType · BU"]
        C4["Call 4<br/>buildCall4Request()<br/>Contract Commerce<br/><br/>Outputs:<br/>commerceByDepartment<br/>commerceByAgreementType<br/>painPoints"]
    end

    subgraph S2["Sequential"]
        C5["Call 5<br/>synthesizePriorityMap()<br/><br/>Inputs: ALL prior calls<br/>+ product signals<br/>+ DOCUSIGN_CATALOG<br/><br/>Outputs:<br/>currentUseCases · priorityMapping<br/>expansionOpportunities · actionPlan"]
    end

    subgraph P2["Parallel"]
        C6["Call 6<br/>buildCall6Request()<br/>Executive Briefing<br/><br/>Outputs:<br/>introText · priorities[3]"]
        C7["Call 7<br/>buildCall7Request()<br/>Big Bet Initiatives<br/><br/>Outputs:<br/>bigBets[] — one per BU<br/>title · solution · rationale<br/>estimatedAnnualValue · opportunityScore"]
    end

    C1 --> C2 & C3 & C4
    C2 & C3 & C4 --> C5
    C5 --> C6 & C7

    C3 -. "parse fail<br/>→ retry individually" .-> C3R["Call 3 Retry<br/>researchAgreementLandscape()<br/>~20s"]
    C3R -. "double fail<br/>→ deterministic fallback" .-> FB["generateFallbackAgreementLandscape()<br/>from Config.gs industry tables<br/>no LLM required"]

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
    HDR["🏷 Branded Header<br/>Docusign logo · company name · generated date"]

    subgraph FRONT["Front Matter — 6 Sections"]
        S1["Section 1<br/>Docusign Today<br/>contract table · seat/envelope metrics"]
        S2["Section 2<br/>Product Adoption Opportunity<br/>signal-matched recommendations"]
        S3["Section 3<br/>Account Health<br/>6-indicator scorecard"]
        S4["Section 4<br/>Strategic Initiatives<br/>executive briefing · priorities"]
        S5["Section 5<br/>Long-Term Opportunity Map<br/>Big Bets per BU (matrix + LTOM)"]
        S6["Section 6<br/>High Value — Top 3 Big Bets<br/>transposed summary matrix"]
    end

    subgraph APP["Appendix — Full Supporting Detail"]
        A1["Company Profile<br/>overview · BUs · financials · customer base"]
        A2["Business Performance & Strategy<br/>SWOT · strategic priorities"]
        A3["Executive Contacts & Technology<br/>exec list · tech stack · SIs"]
        A4["Priority Map<br/>use cases · expansion · action plan"]
        A5["Agreement Landscape<br/>quadrant guide · 20-type table<br/>business map org hierarchy"]
        A6["Contract Commerce Estimate<br/>commerce by dept · by agreement type<br/>bar chart (if ≥3 depts have $ values)"]
        A7["Docusign Footprint<br/>product adoption table · signal reasons"]
        A8["Executive Meeting Briefing<br/>exec-ready narrative"]
        A9["Big Bet Detail<br/>full initiative cards — one per BU"]
        A10["Data Sources & Methodology"]
    end

    HDR --> S1 --> S2 --> S3
    S3 --> S4 --> S5 --> S6
    S6 --> APP

    note1["Sections 1–3: internal data only<br/>(suppressed for prospects)"]
    note2["Sections 4–6: AI-synthesized strategy<br/>(shown for all accounts)"]

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
    RAW["Bookscrub columns<br/>envelopes · seats · integrations<br/>product flags · API calls<br/>mobile signs · webapp sends"]

    RAW --> EVAL["Evaluate 15 products<br/>+ 4 bundles<br/>per product rule set<br/>(Config.gs DOCUSIGN_CATALOG)"]

    EVAL --> STRONG["Strong signal<br/>—<br/>Not in use AND<br/>clear usage trigger<br/>(e.g. high volume, no Navigator)"]
    EVAL --> MOD["Moderate signal<br/>—<br/>Not in use but<br/>weaker indicator"]
    EVAL --> USE["In Use<br/>—<br/>product already purchased<br/>or detected active"]

    STRONG & MOD --> SUMMARY["summarizeForLLM()<br/>text block injected into<br/>Call 5 + Call 7 system prompts"]
    USE --> SUMMARY

    SUMMARY --> GUARDRAIL["LLM guardrail:<br/>Do NOT recommend<br/>In Use products<br/>as core Big Bets"]
```

---

## Batch Runner Flow

For unattended bulk generation across many accounts:

```mermaid
flowchart TD
    START(["startBatchGeneration()<br/>operator triggers once"])
    START --> LOCK["Acquire LockService<br/>(prevent concurrent runs)"]
    LOCK --> INIT["Read Batch Status sheet<br/>find pending rows"]
    INIT --> TRIGGER["Create time-based trigger<br/>every 5 minutes"]

    TRIGGER --> CHUNK["_batchGenerateChunkBody()<br/>fires every 5 min"]
    CHUNK --> STUCK["Mark any stuck 'running' rows<br/>as 'failed' with error message"]
    STUCK --> LOOP["Process up to 2 pending rows<br/>per trigger fire"]

    LOOP --> GEN["generateGrowthStrategyDoc()<br/>~2 min per company"]
    GEN --> STATUS{Success?}
    STATUS -- yes --> MARK_DONE["Set row → 'done'<br/>write doc URL"]
    STATUS -- no --> MARK_FAIL["Set row → 'failed'<br/>write error message"]

    MARK_DONE & MARK_FAIL --> MORE{More<br/>pending rows?}
    MORE -- yes --> WAIT["Wait for next<br/>5-min trigger fire"]
    MORE -- no --> CLEANUP["Delete trigger<br/>release lock<br/>Batch complete"]

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
