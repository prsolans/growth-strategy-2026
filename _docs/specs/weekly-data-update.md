# Weekly Data Update: Snowflake → Google Sheets Automation

> **Status:** Investigation complete — recommendation ready for review
> **Last updated:** 2026-04-14

---

## 1. Problem

The bookscrub Google Sheet (~18K rows x 245 columns, ~4.4M cells) is refreshed manually via Snowflake CSV export. This creates data staleness (days to weeks) and depends on a human remembering to run the export. A weekly automated refresh would keep the AR tool's input data current.

---

## 2. Options Evaluated

### Option 1: Snowflake Google Sheets Connector

Snowflake offers a native Sheets add-on (available via Snowflake Marketplace) that queries Snowflake from a sidebar in Google Sheets.

- **No scheduled refresh** — manual pull only
- Practical row limits for wide datasets (245 cols may timeout)
- Requires per-user Snowflake credentials

**Verdict:** Ruled out — no automation capability.

---

### Option 2: GAS Time-Based Trigger + Snowflake REST API (Recommended)

A weekly `ScriptApp.newTrigger().timeBased().everyWeeks(1)` fires a GAS function that:
1. Calls Snowflake SQL REST API (`/api/v2/statements`) with async mode
2. Polls for query completion
3. Writes results to the bookscrub sheet in batched chunks

**Auth:** Key pair JWT (RSA private key stored in Script Properties).

**Pros:**
- Keeps everything in existing GAS infrastructure — no new services
- Familiar patterns (already using `UrlFetchApp` for LLM calls, Glean, SEC proxy)
- Weekly trigger is a one-liner to set up

**Cons / Risks:**
- GAS 6-minute execution limit (30 min for Workspace accounts) — writing 4.4M cells requires a batched continuation pattern (chain triggers, write 500-1000 rows per invocation)
- GAS heap limit ~50 MB — may need to stream rather than load all data at once
- Snowflake REST API JWT auth setup is ~2-3 hours of initial work

**Effort:** Medium (~1-2 days including auth setup and batched write pattern)

---

### Option 3a: Cloudflare Worker Cron

A Cloudflare Worker with a cron trigger (`cron = "0 9 * * 1"`) calls Snowflake, then writes to Sheets.

- Existing Worker infrastructure in this repo (`workers/sec-edgar-proxy/`)
- **30-second wall-clock limit** is a hard constraint — writing 4.4M cells in one invocation is not realistic
- Would need Durable Objects or multi-step cron pattern for chunking

**Verdict:** Feasible but adds unnecessary chunking complexity.

---

### Option 3b: Google Cloud Function/Run + Cloud Scheduler

A Cloud Run service (or Cloud Function 2nd gen) triggered weekly by Cloud Scheduler.

- 60-minute timeout (Cloud Run) — no execution time concerns
- Service account auth for both Snowflake and Sheets API
- Free at weekly cadence

**Pros:**
- Most reliable for this data volume — no timeout games
- Clean separation of concerns

**Cons:**
- Requires GCP project setup, service account, IAM configuration
- New infrastructure to maintain outside the GAS ecosystem

**Effort:** Medium (~2-3 days including GCP setup)

---

### Option 4: Snowflake Tasks + External Function

Snowflake-native scheduling that pushes data to an HTTP endpoint.

- Requires Snowflake `SYSADMIN` access to configure Tasks and External Network Access
- External Function has ~4 MB batch limit — needs stateful accumulation
- Most infrastructure-heavy option

**Verdict:** Over-engineered for a weekly refresh. Ruled out.

---

## 3. Recommendation

**Primary: Option 2 (GAS trigger + Snowflake REST API)**

This is the best fit because:
- Zero new infrastructure — everything stays in the GAS project
- The batched continuation pattern (write N rows, set a trigger for the next batch) is the same pattern `BatchRunner.gs` already uses
- Auth setup (JWT key pair) is a one-time cost

**Fallback: Option 3b (Cloud Function/Run)** if the GAS execution time limit proves too painful after prototyping.

---

## 4. Implementation Sketch (Option 2)

```
Weekly trigger fires
  → snowflakeRefresh()
    → Submit async query to Snowflake REST API
    → Poll for completion (with backoff)
    → Store query result handle in Script Properties
    → Set a continuation trigger (1 second)
  → snowflakeWriteChunk()
    → Read next 500 rows from Snowflake result set (paginated)
    → Write to bookscrub sheet via setValues()
    → If more rows: set another continuation trigger
    → If done: log completion, invalidate picker cache
```

New files:
- `src/SnowflakeSync.gs` — all sync logic (query, auth, batched write)
- Script Properties: `SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USER`, `SNOWFLAKE_PRIVATE_KEY`, `SNOWFLAKE_WAREHOUSE`, `SNOWFLAKE_QUERY`

---

## 5. Open Questions

- **What Snowflake query produces the bookscrub export today?** Need to document the exact SQL.
- **Auth:** How does the current manual export authenticate? Can the same credentials be reused for API access?
- **Staleness tolerance:** Is weekly sufficient, or should we support on-demand refresh too?
- **Workspace plan:** Is the GAS project on a Google Workspace plan (30-min timeout) or consumer (6-min)?
- **Snowflake access:** Do we have API access (REST API enabled), or only UI/SnowSQL access today?
