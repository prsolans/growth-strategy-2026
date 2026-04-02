# Glean Agent — Hybrid Conversion Guide (Bookscrub + GAS Trigger)

This guide describes how to run the Growth Strategy Generator as a **Glean agent**
while keeping the existing Google Sheet as the data source and Google Apps Script as
the trigger. No Snowflake, no new infrastructure beyond what already exists.

---

## Architecture Overview

```
User (in Google Sheet)
        │
        ▼
  GAS Menu Item
  "Generate in Glean"
        │
        ├─ 1. Extract bookscrub row(s) → structured JSON payload
        ├─ 2. Run enrichment (Wikidata + Wikipedia + SEC EDGAR proxy)
        ├─ 3. POST to Glean Agent API  ──────────────────────────────┐
        │                                                             │
        ▼                                                             ▼
  GAS polls for result                                     Glean Agent receives:
  or writes webhook URL                                    - Company name
  to Batch Status sheet                                    - Pre-extracted internal data
                                                           - Enrichment data (EDGAR etc.)
                                                           - "Generate the full report" instruction
                                                                      │
                                                           Steps 3–8 (unchanged from GLEAN_WORKFLOW.md):
                                                           internal search → web research →
                                                           synthesize → create Google Doc
                                                                      │
                                                                      ▼
                                                             Google Doc URL returned
                                                             (written back to sheet by GAS)
```

**Key insight**: GAS does what it's already good at (data extraction, enrichment, sheet I/O).
Glean does what GAS is slow at (multi-step reasoning, web research, document generation).
The two hand off via the Glean API.

---

## What Changes vs. the Current GAS-Only Flow

| Step | Current (GAS only) | Hybrid |
|------|--------------------|--------|
| Data extraction | `DataExtractor.gs` | Same — unchanged |
| Enrichment (EDGAR, Wikipedia, Wikidata) | `DataEnricher.gs` | Same — unchanged |
| LLM research (5 calls) | `Researcher.gs` → infra endpoint | Glean workflow steps |
| Document generation | `DocGenerator.gs` → Drive API | Glean "Create Google Doc" step |
| Trigger | Menu / BatchRunner | Menu / BatchRunner (calls Glean API instead) |
| Output URL | Returned from `generateGrowthStrategyDoc()` | Returned from Glean API response |

The entire GAS data layer stays in place. Only the LLM calls and doc generation move to Glean.

---

## Step 1: Glean Agent Setup

### 1.1 Create the Agent

In Glean, create a new agent:
- **Name**: Growth Strategy Generator
- **Instructions**: Use `prompts/GLEAN_PROMPT.md` verbatim, **except** replace the
  "Book Scrub Data" section with the text below.

**Replacement data source section:**
```
1. **Internal Account Data**: The user's message will contain a structured JSON block
   labelled `INTERNAL_DATA`. This is pre-extracted from the Docusign bookscrub and
   enrichment APIs by the calling system. Do NOT search for or fetch this data yourself —
   it has already been collected. Parse the JSON and use it exactly as you would use
   the book scrub. All field names match the data dictionary.

   If the JSON block is absent, respond: "No internal data was provided. Please re-run
   the report from the Growth Strategy menu in Google Sheets."
```

### 1.2 Knowledge Sources

Add the **Docusign Product Catalog** document as a knowledge source (unchanged).

No Google Drive bookscrub file needed — data arrives in the message payload.

### 1.3 Workflow Steps

Use the steps from `GLEAN_WORKFLOW.md` with these changes:

| Step | Change |
|------|--------|
| Step 1 (Ask for company name) | **Remove** — GAS provides the company name in the API call |
| Step 2 (Read bookscrub document) | **Replace** with: "Parse the `INTERNAL_DATA` JSON block from the user message" |
| Steps 3–9 | **Unchanged** |

The agent should begin immediately with Step 3 (health & signal analysis) as soon as it
receives a message with `INTERNAL_DATA` present.

---

## Step 2: GAS Changes

A new function replaces `generateGrowthStrategyDoc()` as the trigger point for Glean-backed reports.

### 2.1 New Function: `triggerGleanReport()`

Add this to a new file `src/GleanTrigger.gs`:

```javascript
var PROP_GLEAN_API_KEY    = 'GLEAN_API_KEY';
var PROP_GLEAN_AGENT_ID   = 'GLEAN_AGENT_ID';    // agent ID from Glean UI
var PROP_GLEAN_API_BASE   = 'GLEAN_API_BASE';     // e.g. https://yourco.glean.com/api/v1

/**
 * Trigger a growth strategy report via Glean Agent API.
 * Extracts bookscrub data + enrichment, POSTs to Glean, returns doc URL.
 *
 * @param {string}  companyName  Cleaned company name
 * @param {Object}  groupData    Optional GTM group data object (or null for single account)
 * @returns {string}             Google Doc URL from Glean
 */
function triggerGleanReport(companyName, groupData) {

  // ── 1. Extract internal data (same as current flow) ──────────────
  var internalData = groupData || getCompanyData(companyName);
  if (!internalData || !internalData.identity) {
    throw new Error('No bookscrub data found for: ' + companyName);
  }

  // ── 2. Run enrichment (Wikidata + Wikipedia + SEC EDGAR) ──────────
  var enrichment = {};
  try {
    enrichment = enrichCompanyData(
      internalData.identity.name,
      internalData.context.industry
    );
  } catch (e) {
    Logger.log('[Glean] Enrichment failed (non-fatal): ' + e.message);
  }

  // ── 3. Build the message payload ──────────────────────────────────
  var isGroup = !!(groupData && groupData.isGtmGroup);
  var prompt = buildGleanPrompt(internalData, enrichment, isGroup);

  // ── 4. Call Glean Agent API ───────────────────────────────────────
  var docUrl = callGleanAgentApi(prompt);

  return docUrl;
}

/**
 * Build the natural-language message to send to the Glean agent.
 * Embeds internal data + enrichment as a labelled JSON block.
 */
function buildGleanPrompt(internalData, enrichment, isGroup) {
  var companyName = internalData.identity.name;
  var header = isGroup
    ? 'Generate a Growth Strategy report for the GTM group: **' + companyName +
      '** (Group ID: ' + internalData.context.gtmGroup + ').'
    : 'Generate a Growth Strategy report for: **' + companyName + '**.';

  var payload = {
    internal: internalData,
    enrichment: enrichment
  };

  return header + '\n\n' +
    'The following internal account data has been pre-extracted. ' +
    'Use it as the primary source for all internal usage sections.\n\n' +
    '```json\nINTERNAL_DATA\n' + JSON.stringify(payload, null, 2) + '\n```\n\n' +
    'Generate the complete 9-section Growth Strategy document and return the Google Doc URL.';
}

/**
 * POST to the Glean Agent Chat API and extract the Google Doc URL from the response.
 */
function callGleanAgentApi(prompt) {
  var apiBase   = PropertiesService.getScriptProperties().getProperty(PROP_GLEAN_API_BASE);
  var apiKey    = PropertiesService.getScriptProperties().getProperty(PROP_GLEAN_API_KEY);
  var agentId   = PropertiesService.getScriptProperties().getProperty(PROP_GLEAN_AGENT_ID);

  if (!apiBase || !apiKey || !agentId) {
    throw new Error('Glean API not configured. Set GLEAN_API_BASE, GLEAN_API_KEY, and GLEAN_AGENT_ID in script properties.');
  }

  var payload = {
    agentId: agentId,
    messages: [{ role: 'user', content: prompt }]
  };

  var response = UrlFetchApp.fetch(apiBase + '/chat', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer ' + apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  var body = response.getContentText();

  if (code !== 200) {
    throw new Error('Glean API returned HTTP ' + code + ': ' + body.substring(0, 500));
  }

  // Extract Google Doc URL from the Glean response text
  var data = JSON.parse(body);
  var responseText = data.message || data.content || body;
  var urlMatch = responseText.match(/https:\/\/docs\.google\.com\/document\/d\/[^\s"'<>]+/);

  if (!urlMatch) {
    Logger.log('[Glean] Full response: ' + responseText.substring(0, 1000));
    throw new Error('Glean response did not contain a Google Doc URL. Check Glean agent logs.');
  }

  return urlMatch[0];
}
```

### 2.2 Wire Into Menu

In `Menu.gs`, add a parallel menu item alongside the existing "Generate for Company":

```javascript
ui.createMenu('Growth Strategy')
  // ... existing items ...
  .addSeparator()
  .addItem('Generate in Glean (AI Agent)', 'generateForCompanyViaGlean')
```

And the handler:

```javascript
function generateForCompanyViaGlean() {
  var companyName = promptForCompanyName();  // reuse existing picker
  if (!companyName) return;

  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Sending to Glean... this may take 2–3 minutes.', 'Glean', 15
  );

  try {
    var docUrl = triggerGleanReport(companyName, null);
    SpreadsheetApp.getUi().alert(
      'Report ready!\n\n' + docUrl
    );
  } catch (e) {
    SpreadsheetApp.getUi().alert('Glean report failed: ' + e.message);
  }
}
```

### 2.3 GTM Group Support (no change to caller)

`generateGrowthStrategyDocForGroup()` can call `triggerGleanReport()` with the existing
`groupData` object — no structural changes needed because `groupData` already has the
same shape as single-account data with `isGtmGroup: true`.

```javascript
function generateGrowthStrategyDocForGroupViaGlean(gtmGroupId, email, channelId) {
  var groupData = getGtmGroupData(gtmGroupId);
  return triggerGleanReport(groupData.identity.name, groupData);
}
```

---

## Step 3: SEC EDGAR — What Changes (Nothing)

The current `DataEnricher.gs` pipeline is unchanged:

1. `enrichCompanyData()` runs Wikidata → Wikipedia → SEC EDGAR proxy (via Cloudflare Worker)
2. The enrichment object is serialized into the `INTERNAL_DATA` JSON block
3. Glean receives it pre-fetched — no need for Glean to call EDGAR directly

The Cloudflare Worker (`workers/sec-edgar-proxy/`) stays in place as-is. The only difference
is the consumer: instead of injecting enrichment into an LLM prompt in `Researcher.gs`,
it's embedded in the JSON payload sent to Glean.

If you later want Glean to call EDGAR itself (e.g. for freshness), you can expose the
Cloudflare Worker URL as an API tool in the Glean agent config and remove it from the
GAS payload. But for the hybrid: GAS fetches it, Glean consumes it.

---

## Step 4: Script Properties to Set

Add these to the existing script properties (via **Growth Strategy > Settings** or directly):

| Property | Value |
|----------|-------|
| `GLEAN_API_BASE` | Your Glean instance API base URL (e.g. `https://yourco.glean.com/api/v1`) |
| `GLEAN_API_KEY` | Glean API key with agent chat permissions |
| `GLEAN_AGENT_ID` | Agent ID from the Glean agent configuration page |

Existing properties (`INFRA_API_KEY`, `INFRA_API_USER`, `OUTPUT_FOLDER_ID`, `SEC_PROXY_URL`)
are unchanged and still used by the non-Glean path.

---

## Step 5: Running Both Paths in Parallel

During the transition, both paths can run side by side:

| Menu Item | Path | Uses |
|-----------|------|------|
| Generate for Company... | Original GAS path | infra LLM endpoint + GAS doc builder |
| Generate in Glean | Hybrid path | GAS data extraction + Glean research + Glean doc builder |
| Batch Generate All | Original batch | infra LLM (unchanged) |

This lets you compare output quality between the two paths on the same accounts before
committing to Glean exclusively.

---

## Step 6: Limitations and Known Issues

**GAS execution timeout**: GAS has a 6-minute execution limit. If Glean takes longer than
~5 minutes to respond, the `callGleanAgentApi()` call will time out before receiving the
doc URL. Mitigations:

- Option A: Trigger asynchronously — GAS fires the Glean call and records the conversation
  ID in the Batch Status sheet; a second trigger polls for completion. Requires Glean API
  to support async polling (check your Glean API docs).
- Option B: Accept the timeout and have the user retrieve the doc URL directly from Glean
  chat. GAS shows "Report sent to Glean — check the Growth Strategy channel" rather than
  blocking for the URL.
- Option C: For batch runs, keep using the original GAS path (which already completes in
  ~2–3 min per company). Use Glean only for on-demand single-company requests where a
  user is waiting.

**Payload size**: The `INTERNAL_DATA` JSON block is ~3–5 KB per account, or ~15–25 KB
for a GTM group with 10+ accounts. Well within Glean's context limits.

**EDGAR for private companies**: No change from current behavior — `enrichCompanyData()`
skips EDGAR if no ticker or CIK is available, and Glean's web research fills the gap.

---

## Appendix: File Reference

| File | Role in Hybrid |
|------|---------------|
| `src/GleanTrigger.gs` | New — Glean API caller, payload builder (create this file) |
| `src/DataExtractor.gs` | Unchanged — provides `getCompanyData()` and `getGtmGroupData()` |
| `src/DataEnricher.gs` | Unchanged — provides `enrichCompanyData()` with EDGAR + Wikipedia |
| `src/Menu.gs` | Add "Generate in Glean" menu item and handler |
| `src/BatchRunner.gs` | Unchanged for now — keep original path for batch |
| `prompts/GLEAN_PROMPT.md` | Update Book Scrub section as described in §1.1 |
| `prompts/GLEAN_WORKFLOW.md` | Remove Step 1, replace Step 2, keep Steps 3–9 |
| `workers/sec-edgar-proxy/` | Unchanged — still called by GAS DataEnricher |
