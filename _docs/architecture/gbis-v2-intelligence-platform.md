# GBIS v2 — Intelligence Platform Architecture

## The Problem

Three tools exist in isolation:

| Tool | What it does | Data it holds |
|---|---|---|
| **AR** (Account Research) | Glean research → LLM synthesis → docs | 7 intelligence objects, bookscrub, enrichment |
| **GVS** (Guided Value Selling) | Discovery wizard → ROI model → value decks | Financial estimates, briefs, narratives, slides |
| **GBIS** (Genius Bar) | Rep coaching game → triggers AR | Leaderboard scores |

Each runs its own Glean calls. None shares intelligence with the others. The Dashboard (Command Center) lives inside AR but should be the front door to everything. There's no unified cache, no content factory, no way to generate multiple outputs from the same research.

## The Fix

GBIS v2 becomes the **intelligence platform** — it owns the cache, the dashboard, and the content factory. AR and GVS become **services** that produce intelligence and deliverables. All three share a Drive-based cache.

```
┌─────────────────────────────────────────────────────────┐
│                    GBIS v2 (Platform)                    │
│                                                         │
│  Dashboard ─── Content Factory ─── Game                 │
│       │              │                │                 │
│       ▼              ▼                │                 │
│  ┌─────────┐   ┌───────────┐         │                 │
│  │ Cache   │   │ Output    │         │                 │
│  │ Store   │   │ Generators│         │                 │
│  │ (Drive) │   │ (L3)      │         │                 │
│  └────┬────┘   └───────────┘         │                 │
│       │                              │                 │
└───────┼──────────────────────────────┼─────────────────┘
        │                              │
   reads/writes                   writes job
        │                              │
   ┌────▼────┐                    ┌────▼────┐
   │   📁    │                    │  Jobs   │
   │  Drive  │◄───writes──┐      │  Sheet  │
   │  Cache  │            │      └────┬────┘
   └────┬────┘            │           │
        │                 │      polls│
   ┌────▼────┐       ┌────┴────┐     │
   │   AR    │       │   GVS   │◄────┘ (future)
   │ Service │       │ Service │
   └─────────┘       └─────────┘
```

---

## What Each Project Owns

### GBIS v2 (Intelligence Platform)

**New role:** Front door to all account intelligence. Owns the cache and the UI.

| Component | Purpose |
|---|---|
| **CacheStore.gs** | Drive-based L1/L2 read/write with `_index.json` and `LockService` |
| **Dashboard.html** | Command Center — moved from AR to GBIS |
| **DashboardServer.gs** | Backend for dashboard — reads cache, coordinates services |
| **OutputGenerators.gs** | L3 content factory — reads L2, produces deliverables |
| **Game.html + Code.gs** | Existing rep coaching game (already here) |

**Reads:** L1/L2 from Drive cache, deliverables log, GVS history
**Writes:** L3 outputs, deliverables log, `_index.json`
**Coordinates:** Triggers AR via Jobs sheet, deep-links to GVS

### AR (Research Service)

**Same role, new responsibility:** Write to Drive cache after research + synthesis.

| What changes | How |
|---|---|
| `gatherResearch()` extracted | Standalone function, writes L1 to Drive cache |
| `synthesizeIntelligence()` extracted | Standalone function, writes L2 to Drive cache |
| `triggerGleanReport()` checks cache | Skips work if L1/L2 are fresh |
| `_cacheARResult()` dual-writes | Sheet (backward compat) + Drive cache |
| Dashboard removed | Served by GBIS v2 instead |

**Reads:** Bookscrub sheet, Glean API, LLM API
**Writes:** L1 + L2 to Drive cache, docs to output folder, AR_Cache sheet

### GVS (Value Service)

**Current:** Fully standalone, own Glean calls, no shared state.
**Future:** Reads L1/L2 from Drive cache, logs deliverables for Content Factory.

| Phase | Integration |
|---|---|
| **Now (passive)** | GBIS reads GVS log sheet for deliverable history. Deep-links to GVS with `?company=` param. No GVS code changes. |
| **Next (active)** | GVS logs deliverables to shared Deliverables sheet. GBIS Content Factory shows GVS outputs alongside AR outputs. |
| **Later (integrated)** | GVS reads L1 from Drive cache instead of running its own Glean calls. Shares research with AR. |

---

## Shared Drive Cache

```
📁 {INTELLIGENCE_CACHE_FOLDER_ID}/
  _index.json                 ← company name → folder ID (O(1) lookups)
  📁 Acme Corp/
    research.json             ← L1: bookscrub + enrichment + Glean + productSignals
    intelligence.json         ← L2: 7 synthesized objects
    meta.json                 ← timestamps, staleness, pipeline version
  📁 BigCo Inc/
    ...
```

**AR writes L1 + L2.** GBIS reads L1 + L2 for dashboard display and L3 generation. GVS reads L1 (later) to skip redundant Glean calls.

Both GBIS and AR reference the same Drive folder via script property `INTELLIGENCE_CACHE_FOLDER_ID`.

### Data Shapes

**research.json** (L1 — written by AR):
```js
{
  data: { /* getCompanyData() output */ },
  productSignals: { /* generateProductSignals() output */ },
  enrichment: { /* enrichCompanyData() output */ },
  gleanResearch: { internal: "...", external: "..." }
}
```

**intelligence.json** (L2 — written by AR):
```js
{
  accountProfile: {},
  businessMap: {},
  agreementLandscape: {},
  contractCommerce: {},
  priorityMap: {},
  briefing: {},
  bigBets: {}
}
```

**meta.json**:
```js
{
  companyName: "Acme Corp",
  l1GeneratedAt: "2026-04-15T10:30:00Z",
  l2GeneratedAt: "2026-04-15T10:35:00Z",
  l1Pipeline: "glean",
  l2Pipeline: "glean",
  version: 1
}
```

---

## Coordination Patterns

### GBIS → AR: "Run research for this company"

Current pattern (keep it): GBIS writes a job row to the shared Jobs sheet. AR's `pollPendingJobs()` picks it up, runs the pipeline, writes L1 + L2 to Drive cache, updates job status.

```
GBIS                    Jobs Sheet              AR
 │                         │                     │
 ├─ appendRow(pending) ──► │                     │
 │                         │ ◄── pollPendingJobs()│
 │                         │ ──► runGameARJob()   │
 │                         │         │            │
 │                         │    gatherResearch()  │
 │                         │    → writes L1       │
 │                         │    synthesizeIntel() │
 │                         │    → writes L2       │
 │                         │    generateDocs()    │
 │                         │         │            │
 │ ◄── checkJobStatus() ── │ ◄── update(done) ── │
 │                         │                     │
 ▼ read L2 from Drive      │                     │
```

### GBIS → GVS: "Show value deliverables"

**Phase 1 (passive):** GBIS reads the GVS log spreadsheet (`GVS_LOG_SHEET_ID`) to display GVS submissions as deliverables in the Content Factory. Deep-links to GVS web app with `?company=CompanyName` for the user to generate new value cases.

**Phase 2 (active):** GVS writes to the shared Deliverables sheet when it generates a deck or brief. GBIS picks these up automatically.

**Phase 3 (integrated):** GVS reads L1 from the Drive cache. When a user opens GVS for "Acme Corp", it checks if fresh Glean research exists in the cache. If yes, it skips its own `callGleanResearch()` and uses the cached data. Saves ~30s and ensures consistent intelligence across tools.

### Dashboard → Content Factory: "Generate a follow-up email"

```
Dashboard                GBIS Server              Drive Cache
 │                          │                         │
 ├─ generateOutput() ─────►│                         │
 │  (companyName, type)     │                         │
 │                          ├─ getIntelligenceCache()─►│
 │                          │◄─ L2 intelligence ──────│
 │                          │                         │
 │                          ├─ LLM call (1) ─────────►│ (external)
 │                          │◄─ generated content ────│
 │                          │                         │
 │                          ├─ logDeliverable() ──────►│ (Deliverables sheet)
 │◄─ { title, url, text } ─│                         │
```

---

## Build Phases

### Phase 1: CacheStore in AR (zero risk, additive)

Add Drive cache write capability to AR. Nothing changes about the existing pipeline — cache writes are appended after existing operations.

| Task | File | Change |
|---|---|---|
| Create CacheStore.gs | `AR: src/CacheStore.gs` | New file — Drive read/write, `_index.json`, `LockService` |
| Extract `gatherResearch()` | `AR: src/GleanTrigger.gs` | Extract from `triggerGleanReport()`, add `writeResearchCache()` |
| Extract `synthesizeIntelligence()` | `AR: src/GleanTrigger.gs` | Extract from `triggerGleanReport()`, add `writeIntelligenceCache()` |
| Add cache folder config | `AR: src/Config.gs` | Add `INTELLIGENCE_CACHE_FOLDER_ID` property |
| Add setup menu item | `AR: src/Menu.gs` | "Set Cache Folder ID" option |

**Verify:** Run AR for a test company → check Drive folder for research.json + intelligence.json + meta.json.

### Phase 2: Wire cache into AR pipeline (low risk)

`triggerGleanReport()` checks cache before running. Same output, but repeat runs are instant.

| Task | File | Change |
|---|---|---|
| Cache-first `triggerGleanReport()` | `AR: src/GleanTrigger.gs` | Check `isResearchStale()` / `isIntelligenceStale()` before work |
| Dual-write `_cacheARResult()` | `AR: src/DocGenerator.gs` | Write to Drive cache after writing to AR_Cache sheet |

**Verify:** Run AR for same company twice → second run completes in seconds.

### Phase 3: GBIS v2 — Dashboard + Content Factory (new build)

Build GBIS v2 as the intelligence platform. This is a **new build** in the existing GBIS project — replace the current thin game wrapper with the full platform.

| Task | File | Change |
|---|---|---|
| CacheStore reader | `GBIS: src/CacheStore.gs` | Read-only version — `getResearchCache()`, `getIntelligenceCache()`, `isResearchStale()` |
| Move Dashboard | `GBIS: src/Dashboard.html` | Move from AR, update `google.script.run` calls to GBIS server functions |
| Dashboard server | `GBIS: src/DashboardServer.gs` | Drive-first `getDashboardData()`, live bookscrub data, deliverables |
| Output generators | `GBIS: src/OutputGenerators.gs` | `generateOutput()` + individual generators, starting with `generateFollowUpEmail` |
| GVS integration | `GBIS: src/DashboardServer.gs` | Read GVS log sheet for deliverables, deep-link to GVS |
| Update `doGet()` | `GBIS: src/Code.gs` | Route `?view=dashboard` to Dashboard.html |
| Config | `GBIS: src/Config.gs` | Add `INTELLIGENCE_CACHE_FOLDER_ID`, `GVS_LOG_SHEET_ID`, `GVS_URL` |

**Ship order for generators:**
1. `generateFollowUpEmail` — validate L2→L3 pattern (single LLM call, plain text)
2. `generateBrief` + `generateFullReport` — no LLM, just doc assembly from L2
3. `generateValueCase`, `generatePOVDeck`, `generateChampionBrief` — LLM + doc creation

**Verify:** Open GBIS dashboard → select account with L2 cache → Content Factory shows "Generate" buttons → click Follow-Up Email → output appears in ~30s.

### Phase 4: AR cleanup + batch (parallel with Phase 3)

| Task | File | Change |
|---|---|---|
| Remove Dashboard from AR | `AR: src/Dashboard.html` | Delete (served by GBIS now) |
| Remove DashboardServer from AR | `AR: src/DashboardServer.gs` | Delete (lives in GBIS now) |
| Update `doGet()` | `AR: src/GameServer.gs` | Remove `?view=dashboard` routing |
| Switch batch to Glean | `AR: src/BatchRunner.gs` | One-line change to use `triggerGleanReport()` |
| Add research-only batch | `AR: src/BatchRunner.gs` | `initResearchBatch()` + `batchResearchChunk()` for L1 pre-warming |

### Phase 5: GVS integration (after Phase 3)

| Task | File | Change |
|---|---|---|
| Log deliverables from GVS | `GVS: src/Code.gs` | After generating deck/brief, write row to shared Deliverables sheet |
| Accept `?company=` param | `GVS: src/Code.gs` | Pre-fill company field from URL param |
| Read L1 from Drive cache | `GVS: src/Code.gs` | Check cache before `callGleanResearch()` — use cached Glean if fresh |

### Phase 6: Migration + cleanup

| Task | File | Change |
|---|---|---|
| Migrate AR_Cache to Drive | `AR: src/CacheStore.gs` | `migrateAllARCacheToDrive()` batch function |
| Deprecate AR_Cache sheet | `AR: src/DocGenerator.gs` | Remove sheet writes, Drive-only |

---

## Phase Sequencing

```
Phase 1 (CacheStore in AR)              — zero risk, additive
  ↓
Phase 2 (wire cache into AR pipeline)   — low risk, same behavior
  ↓
  ├── Phase 3 (GBIS v2 platform)        — new build, new project
  ├── Phase 4 (AR cleanup + batch)      — remove dashboard, add batch
  ├── Phase 5 (GVS integration)         — incremental, no breaking changes
  └── Phase 6 (Migration + cleanup)     — data migration
```

Phases 3–6 are independent after Phase 2.

---

## Script Properties

### AR Project
| Property | Purpose |
|---|---|
| `INTELLIGENCE_CACHE_FOLDER_ID` | Shared Drive cache folder (new) |
| `INFRA_API_KEY` | LLM/Glean proxy auth (existing) |
| `INFRA_API_USER` | LLM/Glean proxy auth (existing) |
| `OUTPUT_FOLDER_ID` | Generated docs folder (existing) |

### GBIS v2 Project
| Property | Purpose |
|---|---|
| `GBIS_SHEET_ID` | Game backing sheet (existing) |
| `BOOKSCRUB_SHEET_ID` | Shared sheet with AR — Jobs tab (existing) |
| `INTELLIGENCE_CACHE_FOLDER_ID` | Shared Drive cache folder (new) |
| `GVS_LOG_SHEET_ID` | GVS submission history (new) |
| `GVS_URL` | GVS web app URL for deep-links (new) |
| `INFRA_API_KEY` | LLM proxy auth — for L3 generators (new) |
| `INFRA_API_USER` | LLM proxy auth — for L3 generators (new) |

### GVS Project (Phase 5)
| Property | Purpose |
|---|---|
| `INTELLIGENCE_CACHE_FOLDER_ID` | Shared Drive cache folder (new) |

---

## What This Enables

| Capability | How |
|---|---|
| **Single front door** | GBIS dashboard shows AR intelligence, GVS value cases, and Content Factory — one URL for reps |
| **Research once, use everywhere** | AR writes L1/L2 to Drive. GBIS reads for dashboard + generators. GVS reads for value cases. |
| **Content factory at scale** | Each generator is one LLM call reading cached L2. New output types = new prompt template. |
| **1K+ companies** | Batch pre-warms L1 weekly. L2 synthesized on first access, cached for all users. |
| **100+ users** | Everyone reads same cache. Only L3 (cheap, fast) runs per-user. |
| **GVS + AR unified** | Rep sees value cases and research docs in one place. GVS deep-linked from dashboard. |
| **Independent evolution** | AR, GVS, GBIS deploy independently. Shared cache is the contract. |

---

## Critical Files Summary

| Project | File | Action |
|---|---|---|
| AR | `src/CacheStore.gs` | **Create** — Drive cache write + read + index + locking |
| AR | `src/GleanTrigger.gs` | **Modify** — extract functions, add cache checks |
| AR | `src/DocGenerator.gs` | **Modify** — dual-write to Drive cache |
| AR | `src/Config.gs` | **Modify** — add INTELLIGENCE_CACHE_FOLDER_ID |
| AR | `src/Menu.gs` | **Modify** — add setup menu item |
| AR | `src/Dashboard.html` | **Delete** (Phase 4) — moved to GBIS |
| AR | `src/DashboardServer.gs` | **Delete** (Phase 4) — moved to GBIS |
| AR | `src/BatchRunner.gs` | **Modify** (Phase 4) — Glean pipeline + research-only batch |
| GBIS | `src/CacheStore.gs` | **Create** — read-only cache functions |
| GBIS | `src/Dashboard.html` | **Create** — moved from AR, updated |
| GBIS | `src/DashboardServer.gs` | **Create** — dashboard backend + GVS integration |
| GBIS | `src/OutputGenerators.gs` | **Create** — L3 generator registry |
| GBIS | `src/Config.gs` | **Create** — shared constants + properties |
| GBIS | `src/Code.gs` | **Modify** — add dashboard routing |
| GVS | `src/Code.gs` | **Modify** (Phase 5) — deliverable logging + cache reads |
