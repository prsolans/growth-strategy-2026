# Glean Agent: Account Research Tool — Manual Setup Guide (v4)

6-step workflow. Steps 1–2 gather research. Steps 3–5 are three sequential Think
prompts that build the full analysis. Step 6 returns the complete JSON.

The three Think steps map directly to document sections:
- Think 1 → Company Profile (accountProfile)
- Think 2 → Org Structure, Agreement Landscape, Contract Commerce
- Think 3 → Docusign Strategy (bigBets, briefing) + full JSON assembly

---

## Agent Settings (before adding steps)

- **Name**: Account Research Tool
- **Description**: Generates an executive-ready account research report for any Docusign customer account. Triggered programmatically from Google Sheets — receives pre-extracted account data as a JSON payload.
- **Instructions** (paste into the Instructions field):

```
You are a Docusign Account Research Analyst. The companyNameForResearch field in the
message contains pre-extracted bookscrub data and enrichment — use it as the authoritative
source. Do not re-fetch internal data. Spell Docusign with a capital D, small s. Begin immediately.
```

> **Note:** The Instructions field has a 300-character limit. The above is ~230 chars.

- **Knowledge sources**: Add the **Docusign Product Catalog** document

---

## Step 1 — Company Search: Internal Docusign Knowledge

**Action type:** Company search

**Instructions:**
```
Search Glean for recent internal Docusign activity related to the company identified
in the user's message (account.identity.name in the companyNameForResearch field).

Limit to: Google Docs and Slack only. Last 6 months only.

Look for:
- Account plans, QBRs, or strategy docs
- Recent customer meeting notes or call summaries
- Slack discussions about this customer

Summarize any relevant findings in 3–5 bullet points. If nothing found, note that
and move on. Store for use in Think steps.
```

---

## Step 2 — Web Search: External Company Research

**Action type:** OpenAI Web Search

**Instructions:**
```
The user's message is a JSON object. The companyNameForResearch field contains
the full account payload as a JSON string. Parse it and extract the company name
from account.identity.name and industry from account.context.industry.

Research the following about that company:
1. Company overview: what it does, market position, scale
2. Business units: 5–6 with offerings, target segments, revenue models, and
   estimated segment revenues (use specific dollar figures where available)
3. Financials: revenue, COGS, OpEx, CapEx, net income — most recent fiscal year.
   If enrichment data is present in the JSON, use it as a cross-reference.
4. Three-year performance trend and 5–7 specific financial/operational highlights
5. Strategic initiatives: 3–5 active initiatives with descriptions and timeframes
6. SWOT: 3+ items per quadrant
7. Executive contacts: 5+ relevant to agreement management (CIO, CTO, CLO, CFO,
   VP Legal, VP Procurement) — current executives only
8. Technology stack: CRM, HCM, Procurement, ERP platforms; systems integrators
9. Organizational structure: major BUs, key departments, shared services

Focus on earnings reports, press releases, LinkedIn, and company websites.
Store all findings for the Think steps.
```

---

## Step 3 — Think: Company Profile Synthesis

**Action type:** Think

**Instructions:**
```
Using the web research from Step 2, internal Glean knowledge from Step 1, and the
JSON in the user's message, produce a complete company profile.

PARSING FIRST: the user's message has a companyNameForResearch field containing
the full account payload as a JSON string. Parse it and extract:
- account.identity.name (company name)
- account.context.industry
- enrichment.* fields (revenue, cogs, opex, capex, netIncome, employees, CEO, HQ,
  ticker, segments, segmentType, filingPeriod — use *Formatted fields for display)
- productSignals (pre-computed — do NOT recompute, use directly)
- account.products and account.activeProducts

Compute and store Account Health Indicators (skip entirely if account.isGtmGroup === true):
1. Consumption Pacing: (envelopesSent / envelopesPurchased) ÷ (percentComplete / 100)
   ≥ 0.9 = Healthy | ≥ 0.6 = Watch | < 0.6 = Concern
2. Usage Trend: "Over Trending" or "On Track" = Healthy | "Under Trending" = Concern
3. Send Velocity MoM: > 10% = Healthy | -10% to 10% = Watch | < -10% = Concern
4. Seat Activation: ≥ 70% = Healthy | ≥ 30% = Watch | < 30% = Concern
5. Seat Growth MoM: > 0% = Healthy | ≥ -5% = Watch | < -5% = Concern
6. Integration Depth: ≥ 3 = Healthy | ≥ 1 = Watch | 0 = Concern
7. Transaction Health: failure rate = (pctDeclined + pctVoided + pctExpired)
   < 5% = Healthy | < 15% = Watch | ≥ 15% = Concern
8. Product Breadth: ≥ 5 active products = Healthy | ≥ 2 = Watch | < 2 = Concern
9. Renewal Proximity: monthsLeft > 6 = Healthy | 3–6 = Watch | ≤ 3 = Concern
10. Charge Model: note seat-based vs envelope-based and flag implications for expansion

COMPANY PROFILE — synthesize from web research, internal Glean knowledge, and enrichment.
Prefer enrichment.* formatted values for all financial figures.

Produce the accountProfile object with these exact fields:

- companyOverview: 2–3 sentence company narrative

- businessUnits: 5–6 units (always include Corporate/Shared Services as last entry)
  Each: name, offering (2–4 specific capabilities), targetSegment (specific buyer types),
  pricingRevenueModel (how revenue is earned), segmentRevenue (dollar figure — never blank),
  customerCount (named or specific customer types — not generic phrases)

- customerBase: { total (count or description), context (1 sentence) }
- employeeCount: { total (number), context (1 sentence) }
- supplyChain: { majorCategories (string array), context (1 sentence) }

- financials: { revenue, cogs, opex, capex, netIncome }
  Use enrichment.*Formatted values where available.

- businessPerformance:
  - threeYearTrend: 2–3 sentence narrative
  - highlights: array of 5–7 specific data points with real numbers
  - strategicInitiatives: array of 3–5 items, each { title, description, timeframe }

- swot: { strengths[], weaknesses[], opportunities[], threats[] } — 3+ items each

- executiveContacts: array of 5+ current executives
  Each: { name, title, relevance (why Docusign should engage them) }
  Focus on: CIO, CTO, CLO, CFO, VP Legal, VP Procurement

- technologyStack: { crm, hr, procurement, other[] }
- systemsIntegrators: string array of SI partners

Do NOT output anything yet. Store the complete accountProfile object for Step 5.
```

---

## Step 4 — Think: Business Map, Agreement Landscape & Contract Commerce

**Action type:** Think

**Instructions:**
```
Using the company profile from Step 3 and the web research from Step 2, build three
analyses. Do NOT output to the user — store all results for Step 5.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUSINESS MAP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Build the full org tree as a flat list of nodes. Three levels: bu, department, function.
Always include a Corporate/Shared Services BU with Legal, Finance, HR, IT, and Procurement.
Every BU from the company profile must appear as its own node (level = "bu", parentName = "").

For each node:
  level:              "bu" | "department" | "function"
  name:               node name
  agreementIntensity: "High" | "Medium" | "Low"
  parentName:         parent node name (empty string for BU-level nodes)

Store as businessMap.nodes[].

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AGREEMENT LANDSCAPE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Identify 15–20 agreement types this company manages across its BUs.
Sort by combined score (volume + complexity) descending.

For each agreement type:
  number:              sequential integer (1-based)
  agreementType:       agreement name
  category:            "Internal" | "External"
  primaryBusinessUnit: which BU owns this agreement type
  volume:              1–10 score (how many per year relative to company scale)
  complexity:          1–10 score (negotiation cycles, legal review, multi-party)
  contractType:        "Negotiated" | "Non-negotiated" | "Form-based" | "Regulatory"
  description:         1-sentence description

Quadrant (derived from scores — include in your reasoning but not in the JSON;
GAS calculates this from volume + complexity):
  V≥5 and C≥5 = HV/HC | V≥5 and C<5 = HV/LC | V<5 and C≥5 = LV/HC | V<5 and C<5 = LV/LC

Store as agreementLandscape.agreements[].

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTRACT COMMERCE ESTIMATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Using the company profile, agreement landscape, and enrichment financials, estimate:

estimatedCommerce:
  totalRevenue:  formatted dollar string (% of total revenue flowing through agreements)
  spendManaged:  formatted dollar string (total third-party spend under agreement)
  opex:          formatted dollar string (OpEx governed by agreements)

commercialRelationships:
  employees: formatted count
  suppliers: formatted count
  customers: formatted count
  partners:  formatted count

commerceByDepartment: array of 5+ items, each:
  department:            department name
  estimatedAnnualValue:  formatted dollar string
  primaryAgreementTypes: string array

commerceByAgreementType: array of 5+ items (highest value first), each:
  agreementType:        agreement type name
  estimatedAnnualValue: formatted dollar string
  volume:               formatted volume string (e.g. "~2,400/year")

painPoints: array of 3–5 items, each:
  title:       short title
  description: 2–3 sentences describing the friction or risk at this company's scale

Store all three as businessMap, agreementLandscape, contractCommerce.
Do NOT output anything yet.
```

---

## Step 5 — Think: Docusign Strategy + Full JSON Assembly

**Action type:** Think

**Instructions:**
```
Using ALL prior analysis — company profile (Step 3), business map + agreement
landscape + contract commerce (Step 4), and parsed account data + product
signals (Step 3 parsing) — produce the Docusign account research.

Then assemble the complete JSON output.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DOCUSIGN STRATEGY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Never recommend a product whose signal is "In Use".
Prioritize "Strong Signal" products. Include "Moderate Signal" as secondary.
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
    companyInitiative (the Step 3 strategic initiative this aligns to),
    useCase (specific Docusign use case),
    painPoint (current pain being solved),
    rationale (why this is a priority now),
    solution:
      description (2–3 sentence narrative),
      primaryProducts[] (Docusign product names),
      integrations[] (relevant tech stack integrations)
    sizeAndScope (estimated scale — e.g. "500 contracts/month across 3 BUs")

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FULL JSON ASSEMBLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Assemble the complete output JSON using all results from Steps 3, 4, and 5.
Store for Step 6 — do NOT output yet.

The JSON must use these exact top-level keys and shapes:

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
    "companyOverview": "string",
    "businessUnits": [
      {
        "name": "string",
        "offering": "string",
        "targetSegment": "string",
        "pricingRevenueModel": "string",
        "segmentRevenue": "string",
        "customerCount": "string"
      }
    ],
    "customerBase": { "total": "string", "context": "string" },
    "employeeCount": { "total": "string", "context": "string" },
    "supplyChain": { "majorCategories": ["string"], "context": "string" },
    "financials": {
      "revenue": "string",
      "cogs": "string",
      "opex": "string",
      "capex": "string",
      "netIncome": "string"
    },
    "businessPerformance": {
      "threeYearTrend": "string",
      "highlights": ["string"],
      "strategicInitiatives": [
        { "title": "string", "description": "string", "timeframe": "string" }
      ]
    },
    "swot": {
      "strengths": ["string"],
      "weaknesses": ["string"],
      "opportunities": ["string"],
      "threats": ["string"]
    },
    "executiveContacts": [
      { "name": "string", "title": "string", "relevance": "string" }
    ],
    "technologyStack": {
      "crm": "string",
      "hr": "string",
      "procurement": "string",
      "other": ["string"]
    },
    "systemsIntegrators": ["string"]
  },

  "businessMap": {
    "nodes": [
      {
        "level": "bu | department | function",
        "name": "string",
        "agreementIntensity": "High | Medium | Low",
        "parentName": "string"
      }
    ]
  },

  "agreementLandscape": {
    "agreements": [
      {
        "number": 1,
        "agreementType": "string",
        "category": "Internal | External",
        "primaryBusinessUnit": "string",
        "volume": 8,
        "complexity": 7,
        "contractType": "Negotiated | Non-negotiated | Form-based | Regulatory",
        "description": "string"
      }
    ]
  },

  "contractCommerce": {
    "estimatedCommerce": {
      "totalRevenue": "string",
      "spendManaged": "string",
      "opex": "string"
    },
    "commercialRelationships": {
      "employees": "string",
      "suppliers": "string",
      "customers": "string",
      "partners": "string"
    },
    "commerceByDepartment": [
      {
        "department": "string",
        "estimatedAnnualValue": "string",
        "primaryAgreementTypes": ["string"]
      }
    ],
    "commerceByAgreementType": [
      {
        "agreementType": "string",
        "estimatedAnnualValue": "string",
        "volume": "string"
      }
    ],
    "painPoints": [
      { "title": "string", "description": "string" }
    ]
  }
}
```

---

## Step 6 — Respond: Return the JSON

**Action type:** Respond

**Instructions:**
```
Return the complete JSON object assembled in Step 5.

Output it as a clean code block:

```json
{ ...full JSON from Step 5... }
```

Do not summarize. Do not add commentary. Return the raw JSON only.
```
