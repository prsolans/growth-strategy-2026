# 3-Layer Research Architecture — Content Factory at Scale

## Context

The AR pipeline currently runs everything end-to-end: research (Glean + enrichment, 2-3 min) → synthesis (LLM think steps, 3-5 min) → doc generation (1-2 min). Every output requires a full 7-minute run. This doesn't scale to 1K+ companies, 100+ users, and 6+ output types.

**The fix:** Decouple research, synthesis, and output into three independently cached layers. Research once, synthesize once, generate many outputs cheaply on demand.

```
Layer 1: RESEARCH STORE         → raw data, run once, refresh weekly
Layer 2: INTELLIGENCE OBJECTS   → 7 structured objects, derived from L1 via LLM
Layer 3: OUTPUT GENERATORS      → cheap per-output functions, read L2, one LLM call each
```

---

## Storage: Drive Folder (not Sheet Cells)

```
📁 {AR_CACHE_FOLDER_ID}/
  _index.json             ← company name → folder ID map (O(1) lookups)
  📁 Acme Corp/
    research.json       ← L1: bookscrub + enrichment + Glean text + productSignals
    intelligence.json   ← L2: 7 synthesized objects
    meta.json           ← timestamps, staleness, pipeline version
  📁 BigCo Inc/
    ...
```

No 50K cell limit. No serialization issues. DriveApp reads are fast. Script property `AR_CACHE_FOLDER_ID` points to the root folder.

**`_index.json`** maps company names to Drive folder IDs. Without it, every cache lookup requires `getFoldersByName()` (a Drive API search). With it, lookups use `DriveApp.getFolderById()` — O(1). The index is updated on every `writeResearchCache()` / `writeIntelligenceCache()` call.

**Concurrency:** All cache write operations use `LockService.getScriptLock()` to prevent corruption from concurrent runs (e.g., two users triggering AR for the same company simultaneously).

### Data Shapes

**research.json** (L1):
```json
{
  "data": { "/* getCompanyData() output */" },
  "productSignals": { "/* generateProductSignals() output */" },
  "enrichment": { "/* enrichCompanyData() output */" },
  "gleanResearch": { "internal": "...", "external": "..." }
}
```

**intelligence.json** (L2):
```json
{
  "accountProfile": {},
  "businessMap": {},
  "agreementLandscape": {},
  "contractCommerce": {},
  "priorityMap": {},
  "briefing": {},
  "bigBets": {}
}
```

**meta.json**:
```json
{
  "companyName": "Acme Corp",
  "l1GeneratedAt": "2026-04-15T10:30:00Z",
  "l2GeneratedAt": "2026-04-15T10:35:00Z",
  "l1Pipeline": "glean",
  "l2Pipeline": "glean",
  "version": 1
}
```

---

## Phase 1: CacheStore + Standalone Research/Synthesis Functions

**Goal:** Foundational Drive storage layer + extracted research/synthesis functions. Purely additive — nothing changes about the existing pipeline.

### 1a. Create `CacheStore.gs` (new file)

Drive folder management + JSON read/write:

| Function | Purpose |
|---|---|
| `_getCacheRootFolder()` | Returns Drive folder from `AR_CACHE_FOLDER_ID` property |
| `_getCompanyFolder(name, create)` | Finds/creates company subfolder (uses `_index.json` for O(1) lookup) |
| `_readJsonFile(folder, fileName)` | Reads + parses JSON from Drive file |
| `_writeJsonFile(folder, fileName, obj)` | Creates or overwrites Drive JSON file |
| `_readIndex()` | Reads `_index.json` from root folder → `{ companyName: folderId }` |
| `_updateIndex(companyName, folderId)` | Adds/updates entry in `_index.json` |
| `_withLock(fn)` | Wraps `fn` in `LockService.getScriptLock()` (30s timeout) |
| `getResearchCache(companyName)` | Returns `{ research, meta }` or null |
| `writeResearchCache(companyName, obj, pipeline)` | Writes research.json + updates meta + index (locked) |
| `getIntelligenceCache(companyName)` | Returns `{ intelligence, meta }` or null |
| `writeIntelligenceCache(companyName, obj, pipeline)` | Writes intelligence.json + updates meta + index (locked) |
| `isResearchStale(companyName, maxAgeDays)` | True if L1 missing or older than N days (default 7) |
| `isIntelligenceStale(companyName)` | True if L2 missing or L1 newer than L2 |

### 1b. Extract `gatherResearch()` in GleanTrigger.gs

Extracted from `triggerGleanReport()` lines 83-118:

```javascript
function gatherResearch(companyName, isProspect, prebuiltData) {
  var data = prebuiltData || getCompanyData(companyName, isProspect);
  var productSignals = generateProductSignals(data);
  var enrichment = enrichCompanyData(data.identity.name, data.context.industry);
  var gleanResearch = _runResearchParallel(data.identity.name, data.context.industry);
  var result = { data, productSignals, enrichment, gleanResearch };
  writeResearchCache(companyName, result, 'glean');
  return result;
}
```

### 1c. Extract `synthesizeIntelligence()` in GleanTrigger.gs

Extracted from `triggerGleanReport()` lines 121-161:

```javascript
function synthesizeIntelligence(companyName, research, isProspect) {
  // Build payload from research cache
  // think1 → accountProfile
  // think2 → businessMap, agreementLandscape, contractCommerce
  // think3 → priorityMap, briefing, bigBets
  var intel = { accountProfile, businessMap, agreementLandscape,
                contractCommerce, priorityMap, briefing, bigBets };
  writeIntelligenceCache(companyName, intel, 'glean');
  return intel;
}
```

### 1d. Setup

- [ ] Add `AR_CACHE_FOLDER_ID` constant to Config.gs
- [ ] Add "Set Cache Folder ID" option to Menu.gs
- [ ] Create the Drive folder, set the script property

---

## Phase 2: Wire Cache into Existing Pipeline

**Goal:** `triggerGleanReport()` checks L1/L2 cache before running. Same external behavior, but second runs are instant.

### 2a. Rewrite `triggerGleanReport()` with cache checks

```javascript
function triggerGleanReport(companyName, prebuiltData, isProspect, email, channelId) {
  var research, intel;

  // Check L1 cache
  if (!isResearchStale(companyName)) {
    research = getResearchCache(companyName).research;
  } else {
    research = gatherResearch(companyName, isProspect, prebuiltData);
  }

  // Check L2 cache
  if (!isIntelligenceStale(companyName)) {
    intel = getIntelligenceCache(companyName).intelligence;
  } else {
    intel = synthesizeIntelligence(companyName, research, isProspect);
  }

  // Generate docs (L3)
  return generateAccountResearchDocFromGlean(
    companyName, intel, research.data, research.productSignals,
    research.enrichment, email, channelId, isProspect
  );
}
```

### 2b. Update `_cacheARResult()` for dual-write

After writing to AR_Cache sheet (backward compat), also write to Drive.

### 2c. Update `getDashboardData()` in DashboardServer.gs

Drive-first lookup with AR_Cache sheet fallback.

---

## Phase 3: L3 Output Generators + Content Factory

**Goal:** Each Content Factory item becomes a real generator that reads cached L2 data and produces output in ~30 seconds.

**Sequencing:** Ship one vertical slice first — `generateFollowUpEmail` — to validate the L2→L3 pattern end-to-end before building all generators. It's the simplest (single LLM call, plain text output, no Doc creation) and immediately useful.

### 3a. Create `OutputGenerators.gs` (new file)

| Generator | LLM Call? | Input (from L2) | Output | Ship order |
|---|---|---|---|---|
| `generateFollowUpEmail` | Yes (1 call) | briefing, bigBets + options.meetingNotes | Plain text | **First** |
| `generateBrief` | No | All 7 objects + data | Google Doc (existing `_buildBriefDoc`) | 2nd |
| `generateFullReport` | No | All 7 objects + data | Google Doc (existing `_buildResearchDoc`) | 2nd |
| `generateValueCase` | Yes (1 call) | accountProfile, priorityMap, productSignals | Google Doc | 3rd |
| `generatePOVDeck` | Yes (1 call) | accountProfile, businessMap, enrichment | Google Doc outline | 3rd |
| `generateChampionBrief` | Yes (1 call) | accountProfile, priorityMap, bigBets | Google Doc | 3rd |

Universal entry point:

```javascript
function generateOutput(companyName, outputType, options) {
  var l2 = getIntelligenceCache(companyName);
  var l1 = getResearchCache(companyName);
  if (!l2) throw new Error('No intelligence cache — run AR first');
  var result = generators[outputType].fn(companyName, l2.intelligence, l1.research, options);
  logDeliverable(companyName, outputType, result.title, result.url, 'Content Factory');
  return result;
}
```

### 3b. Wire Content Factory drawer in Dashboard.html

- "Not Started" items get a "Generate" button
- Button calls `google.script.run.generateOutput(currentAccount, type, {})`
- On success, refresh deliverables + show link
- Items needing L2 but no cache exists → "Research Required" state

---

## Phase 4: Batch Runner Update

**Goal:** Batch pipeline populates L1/L2 cache for all companies on a schedule.

### 4a. Switch batch to Glean pipeline

One-line change in BatchRunner.gs:

```javascript
// Before: generateAccountResearchDoc(companyName, "", "", false);
// After:  triggerGleanReport(companyName, null, false, "", "");
```

Since `triggerGleanReport` now checks caches, re-runs skip fresh companies.

### 4b. Add research-only batch mode

- `initResearchBatch()` — same trigger pattern, registers `batchResearchChunk`
- `batchResearchChunk()` — calls `gatherResearch()` only (no synthesis, no docs)
- Higher chunk size (4 per fire) since research is ~2 min vs ~5 min total
- Pre-warms L1 on a weekly schedule without LLM cost

---

## Phase 5: Migration + Cleanup

### 5a. Migrate existing AR_Cache rows to Drive

- `migrateARCacheToDrive(companyName)` — reads sheet row, writes intelligence.json + meta.json
- `migrateAllARCacheToDrive()` — batch-safe, processes chunk per trigger fire

### 5b. Deprecate AR_Cache sheet

- Keep dual-write for one version cycle
- Eventually remove sheet writes, read from Drive only

---

## Phase Sequencing

```
Phase 1 (CacheStore + extract functions)     — zero risk, purely additive
  ↓
Phase 2 (wire cache into pipeline)           — low risk, same external behavior
  ↓
  ├── Phase 3 (Output Generators)            — new capability
  ├── Phase 4 (Batch Runner update)          — one-line change + research batch
  └── Phase 5 (Migration)                    — data migration
```

Phases 3, 4, 5 are independent after Phase 2.

---

## Critical Files

| File | Action |
|---|---|
| `src/CacheStore.gs` | **Create** — all Drive cache read/write/staleness logic |
| `src/OutputGenerators.gs` | **Create** — L3 generator registry + individual generators |
| `src/GleanTrigger.gs` | **Modify** — extract gatherResearch() + synthesizeIntelligence(), rewrite triggerGleanReport() |
| `src/DocGenerator.gs` | **Modify** — update _cacheARResult() dual-write |
| `src/DashboardServer.gs` | **Modify** — Drive-first getDashboardData(), add generateOutputFromDashboard() |
| `src/Dashboard.html` | **Modify** — Content Factory drawer gets Generate buttons |
| `src/BatchRunner.gs` | **Modify** — switch to Glean pipeline, add research-only batch |
| `src/Config.gs` | **Modify** — add AR_CACHE_FOLDER_ID constant |
| `src/Menu.gs` | **Modify** — add setup menu item |

---

## What This Enables at Scale

| Capability | How |
|---|---|
| **1K+ companies** | Batch L1 nightly/weekly. Research cached, never re-run unless stale |
| **100+ users** | Everyone reads the same L1/L2 cache. Only L3 (cheap) runs per-user |
| **Many output types** | Each is a new L3 generator — a prompt template reading L2 |
| **Modification** | User tweaks params (audience, tone, focus) → re-runs L3 only |
| **New output types** | Add a prompt template. Zero changes to L1/L2 |
| **Freshness control** | Dashboard shows "Research: 3 days old" with a refresh button |

---

## Future Considerations (post-launch)

Items deferred from external review — revisit once caching is live and we have real usage data:

- **Volatility-segmented TTLs** — Different staleness thresholds for bookscrub (quarterly) vs Glean research (weekly) vs enrichment (monthly). Start with flat 7-day TTL, segment once we see actual refresh patterns.
- **Observability / metrics** — Cache hit rates, L1/L2 generation latency, error rates. Decide on a backend (logging sheet, external service) once traffic justifies it.
- **Per-object schema versioning** — Version each L2 object independently instead of one global version. Useful when schema changes affect only some objects.
- **L1→L2 dependency map** — Track which L1 fields feed which L2 objects for selective re-synthesis. Currently re-synthesizing all 7 objects costs ~$0.10, so ROI is low.
