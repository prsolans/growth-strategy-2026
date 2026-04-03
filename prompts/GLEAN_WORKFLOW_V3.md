# Glean Agent: Account Research Tool — Manual Setup Guide (v3)

4-step workflow. Steps 1–2 gather research. Step 3 thinks and produces a
single structured JSON. Step 4 returns the JSON.

---

## Agent Settings (before adding steps)

- **Name**: Account Research Tool
- **Description**: Generates an executive-ready account research report for any Docusign customer account. Triggered programmatically from Google Sheets — receives pre-extracted account data as a JSON payload.
- **Instructions** (paste into the Instructions field):

```
You are a Docusign Account Research Analyst. INTERNAL_DATA JSON in the message contains
pre-extracted bookscrub data and enrichment — use it as the authoritative source.
Do not re-fetch internal data. Spell Docusign with a capital D, small s. Begin immediately.
```

> **Note:** The Instructions field has a 300-character limit. The above is ~230 chars.

- **Knowledge sources**: Add the **Docusign Product Catalog** document

---

## Step 1 — Company Search: Internal Docusign Knowledge

**Action type:** Company search

**Instructions:**
```
Search Glean for recent internal Docusign activity related to the company identified
in the user's message (account.identity.name in the INTERNAL_DATA JSON).

Limit to: Google Docs and Slack only. Last 6 months only.

Look for:
- Account plans, QBRs, or strategy docs
- Recent customer meeting notes or call summaries
- Slack discussions about this customer

Summarize any relevant findings in 3–5 bullet points. If nothing found, note that
and move on. Store for use in Step 3.
```

---

## Step 2 — Web Search: External Company Research

**Action type:** OpenAI Web Search

**Instructions:**
```
The user's message contains a JSON block labelled INTERNAL_DATA. Extract the
company name from account.identity.name and industry from account.context.industry.

Research the following about that company:
1. Company overview: what it does, market position, scale
2. Business units: 4–5 with offerings, target segments, revenue models, and
   estimated segment revenues (use specific dollar figures where available)
3. Financials: revenue, COGS, OpEx, CapEx, net income — most recent fiscal year.
   If enrichment data is present in INTERNAL_DATA, use it as a cross-reference.
4. Three-year performance trend and 5–7 specific financial/operational highlights
5. Strategic initiatives: 3–5 active initiatives with descriptions and timeframes
6. SWOT: 3+ items per quadrant
7. Executive contacts: 5+ relevant to agreement management (CIO, CTO, CLO, CFO,
   VP Legal, VP Procurement) — current executives only
8. Technology stack: CRM, HCM, Procurement, ERP platforms; systems integrators
9. Organizational structure: major BUs, key departments, shared services

Focus on earnings reports, press releases, LinkedIn, and company websites.
Store all findings for Step 3.
```

---

## Step 3 — Think: Full Analysis → Structured JSON

**Action type:** Think

**Instructions:**
```
Work through all five sections below in order. Each builds on the previous.
At the end, produce a single JSON object (the OUTPUT FORMAT defined at the
bottom of this step). Do NOT output anything to the user yet — store the JSON
for Step 4.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION A — PARSE INTERNAL DATA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Parse the INTERNAL_DATA JSON from the user's message. The three top-level keys are:
  account         — bookscrub data (identity, context, contract, consumption,
                    integrations, seats, financial, products, people, isGtmGroup)
  productSignals  — pre-computed signal map (In Use / Strong Signal / Moderate Signal /
                    Not Relevant). Do NOT recompute. Use exactly as provided.
  enrichment      — verified public data (revenue, COGS, OpEx, CapEx, netIncome,
                    employees, CEO, HQ, ticker, segments, overview)

Store all fields for use in Sections B–E.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION B — COMPANY PROFILE SYNTHESIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Using web research (Step 2), internal Glean knowledge (Step 1), and enrichment
from Section A. Prefer enrichment.* formatted values for all financial figures.

Produce the accountProfile object:
- companyOverview: 2–3 sentence company narrative
- businessUnits: 5–6 units (always include Corporate/Shared Services last)
  Each: name, offering (2–4 specific capabilities), targetSegment (specific buyer types),
  pricingRevenueModel, segmentRevenue (dollar figure — never blank), customerCount
- customerBase: total (count) and context (1 sentence)
- employeeCount: total (count) and context (1 sentence)
- supplyChain: majorCategories[] and context (1 sentence)
- financials: revenue, cogs, opex, capex, netIncome, context — use enrichment.* where available
- businessPerformance: threeYearTrend (2–3 sentences), highlights[] (5–7 specific data points
  with real numbers), strategicInitiatives[] (3–5 items — title, description, timeframe)
- swot: strengths, weaknesses, opportunities, threats — 3+ items each
- executiveContacts: 5+ current executives — name, title, relevance to Docusign
  (CIO, CTO, CLO, CFO, VP Legal, VP Procurement focus)
- technologyStack: crm, hr, procurement, other[]
- systemsIntegrators: list of SI partners

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION C — ORG STRUCTURE AND AGREEMENT LANDSCAPE (internal)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

For internal use in this Think step only — NOT output in the final JSON.

Using Section B company profile and Step 2 web research, build a mental model of:
- The org hierarchy: 4–5 BUs and their key departments (including Corporate/Shared Services)
- The top 10–15 agreement types by volume and complexity
- Commerce estimates by department

Use this to inform the quality of bigBets and briefing in Section D.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION D — DOCUSIGN STRATEGY AND EXECUTIVE BRIEFING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Using ALL prior sections. Never recommend a product whose signal is "In Use".
Prioritize "Strong Signal". Include "Moderate Signal" as secondary.
Every recommendation must cite the specific usage data that supports it.

briefing:
- introText: 1–2 sentence opening on the company's current strategic focus (no citations)
- priorities: exactly 3 items — each with:
    title: bold title with parenthetical context if helpful
    body: 3–4 sentence paragraph connecting a company initiative to Docusign capabilities.
          Bold key data points, dollar figures, and Docusign product names.
          Italic for key terms. Natural prose — no bullets.

bigBets:
- bigBets: 3–5 ranked opportunities — for each:
    number (1-based rank), title, opportunityScore ("High" / "Medium" / "Low"),
    targetBusinessUnit, executiveSponsor (title only — no names),
    companyInitiative (the Section B strategic initiative this aligns to),
    useCase (specific Docusign use case),
    painPoint (current pain being solved),
    rationale (why this is a priority now),
    solution:
      description (2–3 sentence narrative),
      primaryProducts[] (Docusign product names),
      integrations[] (relevant tech stack integrations)
    sizeAndScope (estimated scale — e.g. "500 contracts/month across 3 BUs")

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Output ONLY the strategic front-material needed for the executive document.
Do not output full company profile, business map, agreement landscape, or
commerce estimates — those are appendix material handled separately.

Produce a single JSON object with this exact structure:

{
  "briefing": {
    "introText": "string",
    "priorities": [
      { "title": "string", "body": "string" }
    ]
  },

  "bigBets": {
    "bigBets": [
      {
        "number": 1,
        "title": "string",
        "opportunityScore": "High | Medium | Low",
        "targetBusinessUnit": "string",
        "executiveSponsor": "string",
        "companyInitiative": "string",
        "useCase": "string",
        "painPoint": "string",
        "rationale": "string",
        "solution": {
          "description": "string",
          "primaryProducts": ["string"],
          "integrations": ["string"]
        },
        "sizeAndScope": "string"
      }
    ]
  },

  "accountProfile": {
    "businessUnits": [
      {
        "name": "string",
        "offering": "string",
        "segmentRevenue": "string",
        "customerCount": "string"
      }
    ]
  },

  "businessMap": {
    "nodes": [
      {
        "level": "bu",
        "name": "string",
        "agreementIntensity": "High | Medium | Low",
        "parentName": ""
      }
    ]
  },

  "contractCommerce": {
    "commerceByDepartment": [
      {
        "department": "string",
        "estimatedAnnualValue": "string",
        "primaryAgreementTypes": ["string"]
      }
    ]
  }
}
```

---

## Step 4 — Respond: Return the JSON

**Action type:** Respond

**Instructions:**
```
Return the complete JSON object produced in Step 3.

Output it as a clean code block:

```json
{ ...full JSON from Step 3... }
```

Do not summarize. Do not add commentary. Return the raw JSON only.
```
