# Web UI Exploration: Account Research as a Web App

> **Status:** Exploratory planning artifact — not yet approved for implementation
> **Context:** Assess what it would take to replace the Google Doc output with a web-based interface that includes slide generation, inspired by the guided-value-selling (GVS) tool's UX pattern.

---

## 1. What We're Replacing (and What We're Keeping)

The current tool has three layers:

| Layer | Current | Target |
|-------|---------|--------|
| **Input** | Bookscrub Google Sheet + company name dialog | Web form (with optional sheet import or Glean lookup) |
| **Processing** | 7 sequential/parallel LLM calls in GAS | Same pipeline, moved to a proper backend |
| **Output** | Google Doc (9-section narrative report) | Interactive web report + slide deck generation |

The LLM pipeline logic, signal matching, fallback chains, and product catalog are all worth keeping nearly as-is. The investment is in the input layer and the output layer.

---

## 2. Inspiration from Guided Value Selling

The GVS tool demonstrates the target UX pattern:

- **Wizard to results**: Guided inputs → loading state → rendered results view
- **Sliding drawer**: Contextual AI assistance (Glean, AI estimator) without leaving the main flow
- **Slide generation**: Server-side `generateSlides()` copies a Drive template, fills `__tag__` placeholders with AI-generated prose, returns a link — directly adaptable
- **Narrative on demand**: AI-generated bullets / email / briefs rendered inline in the results view
- **Fallback-first**: All AI calls degrade gracefully to deterministic output

What GVS does NOT have that we need:
- A long async pipeline (GVS AI calls are single, fast; ours are 7-call chains that take 60–90s)
- A complex multi-section structured output (GVS renders a calc result; we render a 12-section research report)
- Internal data integration (bookscrub reading and signal matching)

---

## 3. Proposed Architecture

```
┌──────────────────────────────────────────────────────┐
│                   Browser (SPA)                       │
│  Step 1: Account input (name, industry, mode)         │
│  Step 2: Loading view (streaming progress per call)   │
│  Step 3: Results view (12 sections, collapsible)      │
│          └─ "Generate Deck" button → Google Slides    │
│          └─ Drawer: Glean context, source debug       │
└────────────────────────┬─────────────────────────────┘
                         │ HTTP / Server-Sent Events
┌────────────────────────▼─────────────────────────────┐
│                   Backend                             │
│  POST /generate → starts pipeline job                 │
│  GET  /status/:id → SSE stream of call progress       │
│  POST /slides    → generates deck, returns URL        │
│                                                       │
│  Pipeline (mirrors current GAS execution):            │
│    [1] enrichment (Wikipedia/Wikidata/SEC EDGAR)      │
│    [2] bookscrub lookup (Sheet API or CSV upload)     │
│    [3] LLM Call 1 (account profile)                   │
│    [4] LLM Calls 2+3+4 (parallel)                     │
│    [5] LLM Call 5 (priority map)                      │
│    [6] LLM Calls 6+7 (parallel)                       │
└───────────────────────────────────────────────────────┘
```

### Backend options

**Option A: GAS Web App (like GVS)**
- Same deployment model as today — `clasp push`, served from Apps Script
- Slide generation already proven (GVS's `generateSlides()` is directly portable)
- But: GAS has a **30-second execution timeout per request**, and our pipeline takes 60–90s. Workarounds exist (polling, continuation tokens) but are brittle.
- Verdict: Works only if we can split pipeline into multiple chained requests or use a background trigger + poll model. High implementation risk.

**Option B: Cloudflare Worker (like our SEC EDGAR proxy)**
- We already have a worker deployment. Could extend to host the full pipeline.
- Worker CPU time limit is 30s on the free plan, 5 min on paid — still potentially tight for 7 LLM calls.
- No Google Drive/Slides API access natively.
- Verdict: Good for a lightweight proxy layer, not ideal as the primary pipeline host.

**Option C: Node.js / Bun server (standalone)**
- Full control over pipeline timing, SSE streaming, parallelism
- Can call Google Slides API via service account for deck generation
- Can be hosted on Cloudflare Workers (with Durable Objects), Fly.io, or as a local tool
- Verdict: **Recommended**. Most flexibility, cleanest architecture, easiest to test locally.

---

## 4. UI Design: Inspired by GVS

### Input Step
Replace the current modal dialog with a clean single-step form:

```
┌──────────────────────────────────────────────────┐
│  Account Name         [____________________]      │
│  Industry             [dropdown]                  │
│  Mode                 ○ Customer  ○ Prospect      │
│                                                   │
│  Data source:                                     │
│  ○ Fetch from bookscrub sheet (auto)              │
│  ○ Upload CSV snapshot                            │
│  ○ Prospect mode (no internal data)               │
│                                                   │
│              [  Generate Report  ]                │
└──────────────────────────────────────────────────┘
```

Optionally: blur on account name fires a Glean lookup (same pattern as GVS step 1) and populates the drawer with company context before the main run starts.

### Loading / Progress View
The 7-call pipeline needs a progress indicator. Use SSE from the backend to stream call-by-call status:

```
  Researching account profile...        ✓ (3.2s)
  Mapping business structure...         ● running
  Analyzing agreement landscape...      ○ queued
  Estimating contract commerce...       ○ queued
  Synthesizing priority map...          ○ queued
  Generating executive briefing...      ○ queued
  Identifying big bet initiatives...    ○ queued
```

This replaces the current GAS "please wait" modal and gives the user confidence the tool is working.

### Results View
Render the 12 sections as an interactive web page rather than a Google Doc:
- Collapsible section headers (expand/collapse each of the 12 sections)
- Tables rendered as HTML with Docusign brand styling (same color palette)
- Account health scorecard with green/yellow/red pills
- Business map as an interactive org chart (D3 or similar) instead of a flat table
- "Generate Deck" button in a sticky header bar
- Drawer (same pattern as GVS): Glean context tab, source URLs tab, raw JSON inspector

### Slide Generation
Directly port GVS's `generateSlides()` approach:
1. Define an Account Research slide template in Google Slides with `__tag__` placeholders
2. Map the 12 sections to ~30 slide text tags
3. Call the same LLM endpoint for prospect-specific prose (equivalent to GVS's `callAIForSlideContent`)
4. Use Google Slides API to copy the template + `replaceAllText()` each tag
5. Return the deck URL — open in new tab

One template per report type (customer vs. prospect), same as GVS's LOB-per-template pattern.

---

## 5. Key Technical Challenges

### 5a. Pipeline Duration
The current pipeline takes 60–90 seconds end-to-end. Any non-GAS hosting handles this fine. For GAS hosting, we'd need to either:
- Accept the UX limitation of a 30s page refresh (not good)
- Use GAS ScriptApp triggers + poll model (complex)
- Keep generation in GAS but add a web frontend that polls a cached result (feasible)

### 5b. Bookscrub Data Access
The bookscrub sheet is the critical internal data source. Options:
- **Live Sheet API read** (current GAS approach) — requires OAuth, easy from GAS, more complex from a Node backend
- **CSV export + upload** — user downloads and uploads before generating (friction, but works anywhere)
- **Scheduled sync** — a GAS trigger pushes a JSON snapshot to Cloudflare KV or a simple store daily; the web app reads from there (cleanest for a standalone server)

### 5c. Auth / Access Control
The GVS tool handles this with `access: DOMAIN` — only Docusign org users can access. A standalone server needs its own auth:
- **Simplest**: Basic HTTP auth or a shared token passed in the URL (good for internal tools)
- **Proper**: Google OAuth with domain restriction (same security model as GVS, more setup)

### 5d. Google Slides API (Service Account)
GVS's slide generation runs `as USER_ACCESSING` — it creates the deck in the user's Drive. A Node backend needs a **service account** with access to a shared Slides template, and must share the generated deck back to the user. Manageable but requires one-time setup.

### 5e. Business Map Visualization
The current flat Business Map table is a weak representation of the org hierarchy data. A web UI can render this as an actual tree/org chart (D3 hierarchy, React Flow, or similar) — one of the biggest visual wins of moving to a web interface.

---

## 6. Recommended Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend | Vanilla HTML + CSS + JS (like GVS) | No build toolchain, easy to maintain, proven pattern |
| OR | React + Vite (if components get complex) | Better DX for the 12-section results view |
| Backend | Bun + Hono (lightweight, fast) | Fast to write, runs locally and on Cloudflare Workers |
| LLM proxy | Same `infra.agreementsdemo.com` endpoint | No change to LLM integration |
| Slide generation | Google Slides API via service account | Proven pattern from GVS, same output quality |
| Hosting | Cloudflare Workers + KV (for bookscrub snapshot) | Simple ops, already familiar infra |
| OR | Local-only Bun server | Lowest friction for internal team tool |
| Auth | Google OAuth (domain-restricted) | Matches GVS's access model |

---

## 7. Implementation Scope (High-Level)

If this moves to a worktree, these would be the major workstreams:

### Phase 1 — Backend pipeline server
- [ ] Port LLM pipeline from GAS to Bun/Node (Calls 1–7, parallel structure, fallbacks)
- [ ] Port signal matching, `tryParseJson`, `extractString`, `cleanCitations` to JS/TS
- [ ] Add SSE endpoint for streaming call progress
- [ ] Bookscrub data ingestion (CSV upload or Sheet API)
- [ ] Test against known accounts

### Phase 2 — Web frontend
- [ ] Input form (account name, industry, mode, data source)
- [ ] Progress / loading view (SSE consumer)
- [ ] Results view (12 sections, HTML tables, health scorecard)
- [ ] GVS-style sliding drawer (Glean context, source inspector)
- [ ] Brand styling (match Docusign color palette from DocGenerator.gs)

### Phase 3 — Slide generation
- [ ] Design Account Research slide template in Google Slides (tag mapping)
- [ ] Implement `generateSlides()` equivalent (service account + `replaceAllText`)
- [ ] Add AI slide content generation call (equivalent to GVS's `callAIForSlideContent`)
- [ ] Wire "Generate Deck" button in results view

### Phase 4 — Polish
- [ ] Business map as interactive org chart visualization
- [ ] Auth (Google OAuth, domain-restricted)
- [ ] Logging (equivalent to GVS's Sheet-based submission log)
- [ ] Deployment (Cloudflare Worker or internal server)

---

## 8. What This Is NOT

- This is **not** a replacement for the Glean pipeline (that's a separate path and already works)
- This is **not** a public-facing product — it's still an internal sales rep tool
- The GAS version would remain as a fallback during transition

---

## 9. Open Questions

1. **Where does the bookscrub live?** The daily CSV sync approach is cleanest for a standalone server — is that acceptable, or does it need to be live?
2. **Slide template scope**: One universal template, or separate customer vs. prospect templates (like GVS's LOB templates)?
3. **Auth level**: Domain-restricted web app (like GVS) or something simpler (shared token)?
4. **Hosting**: Should this be a deployed service (Cloudflare/Fly) or a "run locally" tool for now?
5. **GAS deprecation**: Is the goal to eventually replace the GAS tool, or run both in parallel indefinitely?
