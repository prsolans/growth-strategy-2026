# 1Growth Strategy Report Generator

A Google Apps Script tool that generates comprehensive, AI-researched growth strategy Google Docs for Docusign customer accounts. It reads internal bookscrub usage data, enriches it with public data sources, runs a 7-call sequential/parallel LLM research pipeline, and produces a branded, multi-section strategic document saved to Google Drive.

Designed for on-demand use by sales reps via the Genius Bar infrastructure.

---

## System Architecture

```mermaid
graph TB
    TRIGGER["👤 Sales Rep<br/>triggers via Genius Bar<br/>or direct menu"]

    subgraph SOURCES["Data Sources"]
        INTERNAL["📊 Internal Docusign Data<br/>Book of Business / Bookscrub<br/>Envelopes · Seats · Products<br/>Usage signals · Contract details"]
        PUBLIC["🌐 Public Data Sources<br/>Wikipedia · Wikidata · SEC EDGAR<br/>Company overviews · Financials<br/>Segment revenue · Employee counts"]
    end

    subgraph PIPELINE["AI Research Pipeline"]
        ENRICH["Data Enrichment<br/>Anchor LLM to verified facts<br/>Overwrite hallucinations with<br/>real company data"]
        LLM["7 LLM Research Calls<br/>Bing-grounded GPT-4o<br/>Sequential + parallel execution<br/>~2 min end-to-end"]
        SIGNALS["Product Signal Matching<br/>15 products scored against usage<br/>Strong / Moderate / In Use<br/>Injected into LLM as guardrails"]
    end

    subgraph OUTPUT["Output"]
        DOC["📄 Branded Google Doc<br/>6 front sections + appendix<br/>Saved to configured Drive folder<br/>URL returned to caller"]
    end

    TRIGGER --> PIPELINE
    INTERNAL --> SIGNALS
    INTERNAL --> ENRICH
    PUBLIC --> ENRICH
    SIGNALS --> LLM
    ENRICH --> LLM
    LLM --> OUTPUT
```



---

## Execution Flow

```mermaid
flowchart TD
    A(["👤 Sales rep triggers<br/>Generate for Company"]) --> B["Parse bookscrub sheet<br/>Read 230 columns of<br/>internal usage data"]
    B --> C["Score product signals<br/>15 products + 4 bundles<br/>Strong / Moderate / In Use"]
    C --> D["Enrich with public data<br/>Wikipedia overview<br/>SEC EDGAR financials"]
    D --> E{"Enrichment<br/>succeeded?"}
    E -- yes --> F["Enforce verified data<br/>overwrite any LLM<br/>hallucinations"]
    E -- no --> F

    F --> G["LLM Call 1<br/>Account Profile<br/>sequential · ~23s"]
    G --> H["LLM Calls 2+3+4<br/>Business Map · Agreement Landscape<br/>Contract Commerce<br/>parallel · ~26s"]

    H --> I{"All 3<br/>succeeded?"}
    I -- yes --> K
    I -- no --> J["Retry failed calls<br/>individually · ~20s each"]
    J --> K["LLM Call 5<br/>Priority Map<br/>sequential · ~20s"]
    K --> L["LLM Calls 6+7<br/>Executive Briefing + Big Bets<br/>parallel · ~17s"]

    L --> M["Build Google Doc<br/>header + 6 front sections<br/>+ appendix"]
    M --> N["Save to Drive<br/>return doc URL"]
```



---

## LLM Pipeline — Call Dependencies & Fallbacks

```mermaid
flowchart LR
    subgraph S1["Sequential"]
        C1["Call 1<br/>Account Profile<br/><br/>companyOverview · businessUnits<br/>financials · SWOT<br/>executiveContacts · technologyStack"]
    end

    subgraph P1["Parallel"]
        C2["Call 2<br/>Business Map<br/><br/>nodes — BU › Dept › Function<br/>agreementIntensity per node"]
        C3["Call 3<br/>Agreement Landscape<br/><br/>agreements — type · volume<br/>complexity · contractType · BU"]
        C4["Call 4<br/>Contract Commerce<br/><br/>commerceByDepartment<br/>commerceByAgreementType<br/>painPoints"]
    end

    subgraph S2["Sequential"]
        C5["Call 5<br/>Priority Map<br/><br/>Uses ALL prior calls<br/>+ product signals<br/>+ full product catalog<br/><br/>currentUseCases · priorityMapping<br/>expansionOpportunities · actionPlan"]
    end

    subgraph P2["Parallel"]
        C6["Call 6<br/>Executive Briefing<br/><br/>introText · priorities"]
        C7["Call 7<br/>Big Bet Initiatives<br/><br/>One initiative per BU<br/>title · solution · rationale<br/>estimatedAnnualValue · score"]
    end

    C1 --> C2 & C3 & C4
    C2 & C3 & C4 --> C5
    C5 --> C6 & C7

    C3 -. "parse fail → retry" .-> C3R["Call 3 Retry<br/>simplified prompt<br/>~20s"]
    C3R -. "double fail → deterministic" .-> FB["Fallback Agreement Landscape<br/>generated from industry config<br/>no LLM required"]
```



---

## Output Document Structure

```mermaid
flowchart TD
    HDR["🏷 Branded Header<br/>Docusign logo · company name · generated date"]

    subgraph FRONT["Front Matter — 6 Sections"]
        S1["Section 1 — Docusign Today<br/>Contract table · seat and envelope metrics<br/>Source: internal data only"]
        S2["Section 2 — Product Adoption Opportunity<br/>Signal-matched product recommendations<br/>Source: internal data only"]
        S3["Section 3 — Account Health<br/>6-indicator health scorecard<br/>Source: internal data only"]
        S4["Section 4 — Strategic Initiatives<br/>Executive briefing · priorities<br/>Source: AI — Call 6"]
        S5["Section 5 — Long-Term Opportunity Map<br/>Big Bets per BU · LTOM matrix<br/>Source: AI — Calls 5 + 7"]
        S6["Section 6 — Top 3 Big Bets<br/>Transposed summary matrix<br/>Source: AI — Call 7"]
    end

    subgraph APP["Appendix — Supporting Detail"]
        A1["Company Profile<br/>Overview · BUs · Financials · Customer base"]
        A2["Business Performance<br/>SWOT · Strategic priorities"]
        A3["Executives & Technology<br/>Exec contacts · Tech stack · SIs"]
        A4["Priority Map<br/>Use cases · Expansion · Action plan"]
        A5["Agreement Landscape<br/>Quadrant guide · 20-type table · Business map"]
        A6["Contract Commerce Estimate<br/>Commerce by dept + agreement type · bar chart"]
        A7["Docusign Footprint<br/>Product adoption · Signal reasons"]
        A8["Executive Meeting Briefing<br/>Exec-ready narrative"]
        A9["Big Bet Detail<br/>Full initiative cards — one per BU"]
        A10["Data Sources & Methodology"]
    end

    HDR --> S1 --> S2 --> S3 --> S4 --> S5 --> S6 --> APP
```



---

## Signal Matching

Product signals are evaluated against bookscrub data. Each of the 15 products + 4 bundles is scored as **Strong**, **Moderate**, or **In Use** and injected into the LLM as guardrails to ground recommendations.

```mermaid
flowchart LR
    RAW["Bookscrub Usage Data<br/>Envelopes · Seats · Integrations<br/>Product flags · API calls<br/>Mobile signs · Webapp sends"]

    RAW --> EVAL["Evaluate 15 products + 4 bundles<br/>per-product rule set"]

    EVAL --> STRONG["Strong Signal<br/>Not in use AND<br/>clear usage trigger present"]
    EVAL --> MOD["Moderate Signal<br/>Not in use,<br/>weaker indicator"]
    EVAL --> USE["In Use<br/>Already purchased<br/>or detected active"]

    STRONG & MOD & USE --> SUMMARY["Signal summary injected into<br/>Priority Map + Big Bets prompts"]

    SUMMARY --> GUARDRAIL["LLM guardrail:<br/>Never recommend In Use products<br/>as core Big Bet opportunities"]
```



---

## Batch Runner Flow

For unattended bulk generation across many accounts:

```mermaid
flowchart TD
    START(["Operator starts batch<br/>triggers once"]) --> LOCK["Acquire LockService<br/>prevent concurrent runs"]
    LOCK --> TRIGGER["Create time-based trigger<br/>fires every 5 minutes"]

    TRIGGER --> CHUNK["Chunk execution fires"]
    CHUNK --> STUCK["Mark stuck running rows as failed<br/>prevents duplicate doc generation"]
    STUCK --> LOOP["Process up to 2 pending rows<br/>per trigger fire"]

    LOOP --> GEN["Generate report<br/>~2 min per company"]
    GEN --> STATUS{"Success?"}
    STATUS -- yes --> MARK_DONE["Set row to done<br/>write doc URL"]
    STATUS -- no --> MARK_FAIL["Set row to failed<br/>write error message"]

    MARK_DONE & MARK_FAIL --> MORE{"More<br/>pending rows?"}
    MORE -- yes --> WAIT["Wait for next<br/>5-min trigger fire"]
    MORE -- no --> CLEANUP["Delete trigger · release lock<br/>Batch complete"]

    WAIT --> CHUNK
```



---

## File Reference


| File                       | Role                                                                                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/Config.gs`            | LLM endpoint, `COLUMN_GROUPS`, `DOCUSIGN_CATALOG`, `BASE_AGREEMENTS`, `INDUSTRY_AGREEMENTS`, logo base64 |
| `src/DataExtractor.gs`     | Bookscrub sheet parsing, signal matching, `summarizeForLLM()`, deterministic agreement fallback          |
| `src/Researcher.gs`        | All 7 LLM calls, `callLLMJson()`, `callLLMJsonParallel()`, `tryParseJson()`, `cleanCitations()`          |
| `src/DocGenerator.gs`      | `generateGrowthStrategyDoc()` orchestration, `addDocumentHeader()`, all section builders, chart helpers  |
| `src/Menu.gs`              | `onOpen()`, company picker dialog, settings prompts, `testGenerate()`                                    |
| `src/DataEnricher.gs`      | Wikipedia / Wikidata / SEC EDGAR enrichment (controlled by `ENRICHMENT_ENABLED` in Config.gs)            |
| `src/BatchRunner.gs`       | Unattended bulk generation via time-based triggers and LockService                                       |
| `workers/sec-edgar-proxy/` | Cloudflare Worker that proxies SEC EDGAR API calls to avoid CORS restrictions from GAS                   |


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


| Property           | Description                                      |
| ------------------ | ------------------------------------------------ |
| `INFRA_API_KEY`    | API key for the internal LLM endpoint            |
| `INFRA_API_USER`   | API user for the internal LLM endpoint           |
| `OUTPUT_FOLDER_ID` | Google Drive folder ID where docs are saved      |
| `SEC_PROXY_URL`    | URL of the deployed Cloudflare Worker (optional) |


