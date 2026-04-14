# Portal Integration Planning: Account Research in the Unified Dashboard

> **Status:** Planning artifact
> **Depends on:** Two-doc output (brief + full report), Glean pipeline as default
> **Last updated:** 2026-04-14

---

## 1. Context

The unified portal is a central dashboard where three tools converge:

| Tool | Current State | Output Format |
|------|--------------|---------------|
| **Account Research (AR)** | GAS + Glean pipeline → Google Docs (brief + full) | Two Google Docs per account |
| **Guided Value Selling (GVS)** | Web app with slide generation | Interactive web view + Google Slides |
| **Discovery** | Future — not yet built | TBD |

The portal needs to surface AR outputs alongside GVS and Discovery so reps have a single starting point for any account.

---

## 2. AR Integration Points

### 2.1 Account Dashboard Card

Each account in the portal dashboard shows a card with:

- **Company name** and key identifiers (industry, plan tier, ACV)
- **Brief status:** Link to the latest Account Brief (if generated)
- **Full report status:** Link to the latest Full Report
- **Last generated date**
- **Generate / Regenerate button** — triggers a new AR run via the Glean pipeline

Data source: The Batch Status sheet already tracks company name, brief URL, full URL, run date, and status. The portal reads this sheet (or a dedicated API) to populate cards.

### 2.2 Generation Trigger

The portal needs an endpoint to kick off AR generation without the Google Sheets UI:

- **Option A: Direct GAS web app endpoint** — `doPost()` handler in GAS that accepts `{ companyName, email }` and returns `{ jobId }`. The portal polls `checkJobStatus(jobId)` for completion. This is how `GameServer.gs` already works.
- **Option B: Cloudflare Worker proxy** — a `/api/generate` endpoint that calls the GAS web app. Adds CORS support and auth middleware.

**Recommendation:** Option A already exists. The portal calls the deployed GAS web app URL with the same payload format as `GameServer.gs`. No new backend needed.

### 2.3 Status Polling

The portal polls for completion using the same `checkJobStatus(jobId)` pattern:

```
POST /exec { action: "checkJobStatus", jobId: "..." }
→ { status: "done", docUrl: "<brief>", fullUrl: "<full>" }
```

The Game.html already implements this polling loop (4-second interval). The portal replicates it.

### 2.4 Document Embedding

Google Docs can be embedded in iframes:

```
https://docs.google.com/document/d/{DOC_ID}/preview
```

The portal can show the brief inline and link to the full report. Alternatively, the portal shows only links (simpler, avoids iframe auth complexity).

**Recommendation:** Start with links only. Embedding requires the viewing user to have Google Drive access to the doc. Links are simpler and work immediately.

---

## 3. Data Flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Portal UI  │────→│ GAS Web App  │────→│  Glean Pipeline  │
│  (React?)   │     │  doPost()    │     │  triggerGleanReport()
│             │←────│  checkJob()  │←────│  → Brief + Full Doc
└─────────────┘     └──────────────┘     └─────────────────┘
       │                    │
       │              ┌─────┴──────┐
       │              │ Jobs Sheet │  jobId, status, briefUrl, fullUrl
       │              └────────────┘
       │
       ├──→ GVS (existing web app)
       └──→ Discovery (future)
```

---

## 4. Portal Views

### 4.1 Account List View

- Table/grid of all accounts from the bookscrub sheet
- Columns: Company Name, Industry, ACV, Plan, Last AR Date, Brief Link, Full Link
- Filter by industry, plan tier, ACV range
- Sort by any column
- "Generate" button per row

### 4.2 Account Detail View

- **Header:** Company name, industry, key metrics
- **Tabs:**
  - **Account Research** — links to Brief and Full Report, generation controls
  - **Value Selling** — link to GVS for this account (if generated)
  - **Discovery** — future placeholder
- **Activity feed:** Generation history (dates, status, links)

### 4.3 Batch Operations

- Select multiple accounts → "Generate All"
- Progress indicator (reuses batch status tracking)
- Download links when complete

---

## 5. Auth & Access

- Portal authenticates users via Google OAuth (same auth as the Google Sheet)
- AR doc access inherits from the output folder permissions
- GAS web app uses `doPost()` with a shared secret or Google OAuth token

---

## 6. Migration Path

| Phase | Scope | Effort |
|-------|-------|--------|
| **Phase 1** | Static portal that reads Batch Status sheet + links to docs | 1-2 days |
| **Phase 2** | Add generate/regenerate buttons via GAS doPost() | 2-3 days |
| **Phase 3** | Integrate GVS links + account detail view | 1-2 days |
| **Phase 4** | Inline doc preview (iframe) + batch operations | 3-5 days |

---

## 7. Open Questions

- **Portal hosting:** Cloudflare Pages? Vercel? Internal platform?
- **Auth model:** Google OAuth flow for portal access, or SSO via internal identity provider?
- **GVS integration:** Does GVS have a programmatic API, or is it UI-only today?
- **Discovery tool:** What are the planned inputs/outputs? This affects the account detail view design.
- **Bookscrub access:** Should the portal read directly from the Google Sheet, or should we expose a GAS API endpoint that returns account data as JSON?
