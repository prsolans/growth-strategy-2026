# Glean Agent: Account Research Tool — Manual Setup Guide (v5)

GAS-orchestrated multi-step workflow. GAS calls the same agent endpoint 5 times,
each time passing a different `step` field in the JSON body. Glean routes to the
matching branch by checking that field.

Steps 1+2 run in parallel from GAS (UrlFetchApp.fetchAll).
Steps 3→5 run sequentially, each receiving prior results as context.

GAS assembles all JSON results and builds the full Google Doc.

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

> **Note:** 276 characters — within the 300-character limit.

- **Knowledge sources**: Add the **Docusign Product Catalog** document

---

## Payload Format (from GAS)

Every call sends a JSON body with two top-level fields:

```json
{
  "step": "think1",
  "companyNameForResearch": "...message content..."
}
```

The `step` field drives branch routing. The `companyNameForResearch` field carries
the data the active branch needs.

---

## Branching

Add a **Branch** step as the first step in the agent. Five branches, evaluated top-to-bottom.
Each branch condition matches on the `step` field in the JSON body.

| Branch | Condition | Runs |
|--------|-----------|------|
| 1 | Message contains `STEP: company-search` | Company Search → Respond |
| 2 | Message contains `STEP: web-search` | Web Search → Respond |
| 3 | Message contains `STEP: think1` | Think → Respond |
| 4 | Message contains `STEP: think2` | Think → Respond |
| 5 | Message contains `STEP: think3` | Think → Respond |

---

## Branch 1 — Company Search (internal Glean)

**Condition:** Message contains `STEP: company-search`

### Step: Company Search

**Action type:** Company search

**Instructions:**
```
The message contains COMPANY and INDUSTRY fields in companyNameForResearch.

Search Glean for recent internal Docusign activity related to that company.
Limit to: Google Docs and Slack only. Last 6 months only.

Look for:
- Account plans, QBRs, or strategy docs
- Recent customer meeting notes or call summaries
- Slack discussions about this customer

Summarize findings in 3–5 bullet points. If nothing found, write "No internal results found."
```

### Step: Respond

**Action type:** Respond

**Instructions:**
```
Return your internal research summary as plain text. No JSON, no formatting — just
the bullet-point summary. GAS will store this and pass it to the Think steps.
```

---

## Branch 2 — Web Search (external research)

**Condition:** Message contains `STEP: web-search`

### Step: Web Search

**Action type:** OpenAI Web Search

**Instructions:**
```
The message contains COMPANY and INDUSTRY fields in companyNameForResearch.

Research the following about that company:
1. Company overview: what it does, market position, scale
2. Business units: 5–6 with offerings, target segments, revenue models, and
   estimated segment revenues (specific dollar figures where available)
3. Financials: revenue, COGS, OpEx, CapEx, net income — most recent fiscal year
4. Three-year performance trend and 5–7 specific financial/operational highlights
5. Strategic initiatives: 3–5 active initiatives with descriptions and timeframes
6. SWOT: 3+ items per quadrant
7. Executive contacts: 5+ relevant to agreement management (CIO, CTO, CLO, CFO,
   VP Legal, VP Procurement) — current executives only
8. Technology stack: CRM, HCM, Procurement, ERP platforms; systems integrators
9. Organizational structure: major BUs, key departments, shared services

Focus on earnings reports, press releases, LinkedIn, and company websites.
```

### Step: Respond

**Action type:** Respond

**Instructions:**
~~~
Return a compact JSON object — facts and numbers only, no prose. Keep it under 4,000 characters.

```json
{
  "overview": "2-sentence company description",
  "businessUnits": [
    { "name": "...", "revenue": "$XB", "offering": "one-line description" }
  ],
  "financials": { "revenue": "$XB", "cogs": "$XB", "opex": "$XB", "capex": "$XB", "netIncome": "$XB" },
  "threeYearTrend": "1–2 sentences on performance trajectory",
  "highlights": ["specific fact with number", "specific fact with number"],
  "strategicInitiatives": [{ "title": "...", "description": "one line", "timeframe": "..." }],
  "swot": {
    "strengths": ["...", "..."],
    "weaknesses": ["...", "..."],
    "opportunities": ["...", "..."],
    "threats": ["...", "..."]
  },
  "executives": [{ "name": "...", "title": "..." }],
  "techStack": { "crm": "...", "hr": "...", "procurement": "...", "erp": "...", "other": ["..."] },
  "systemsIntegrators": ["..."]
}
```

No prose sections. No explanatory text. Return only the JSON code block.
~~~

---

## Branch 3 — Think 1: Company Profile Synthesis

**Condition:** Message contains `STEP: think1`

### Step: Think

**Action type:** Think

**Instructions:**
```
The message JSON contains:
  step: "think1"
  companyNameForResearch: full account payload JSON (account, productSignals, enrichment)
  INTERNAL_RESEARCH: internal Glean search summary (may be empty)
  EXTERNAL_RESEARCH: compact JSON from web-search step (overview, businessUnits, financials,
                     highlights, strategicInitiatives, swot, executives, techStack)

Parse companyNameForResearch. Extract and store:
- account.identity.name (company name), account.context.industry
- enrichment.* fields — use *Formatted values for all financial display
- productSignals — do NOT recompute, use exactly as provided
- account.activeProducts, account.products
- All account.consumption, account.seats, account.financial, account.integrations fields

Compute Account Health Indicators (skip if account.isGtmGroup === true):
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

Synthesize accountProfile using companyNameForResearch enrichment + EXTERNAL_RESEARCH + INTERNAL_RESEARCH:

- companyOverview: 2–3 sentence narrative

- businessUnits: 5–6 units, always include Corporate/Shared Services as last entry
  Each: name, offering (2–4 specific capabilities), targetSegment (specific buyer types),
  pricingRevenueModel, segmentRevenue (dollar figure — never blank), customerCount

- customerBase: { total, context }
- employeeCount: { total, context }
- supplyChain: { majorCategories[], context }
- financials: { revenue, cogs, opex, capex, netIncome } — use enrichment.*Formatted where available

- businessPerformance:
    threeYearTrend: 2–3 sentences
    highlights: 5–7 specific data points with real numbers
    strategicInitiatives: 3–5 items each { title, description, timeframe }

- swot: { strengths[], weaknesses[], opportunities[], threats[] } — 3+ items each

- executiveContacts: 5+ current executives
  Each: { name, title, relevance } — focus on CIO, CTO, CLO, CFO, VP Legal, VP Procurement

- technologyStack: { crm, hr, procurement, other[] }
- systemsIntegrators: string array
```

### Step: Respond

**Action type:** Respond

**Instructions:**
~~~
Return ONLY the accountProfile JSON object in a code block:

```json
{
  "accountProfile": { ...full object from Think... }
}
```

No other text. No commentary.
~~~

---

## Branch 4 — Think 2: Business Map, Agreement Landscape & Contract Commerce

**Condition:** Message contains `STEP: think2`

### Step: Think

**Action type:** Think

**Instructions:**
```
The message JSON contains:
  step: "think2"
  companyNameForResearch: full account payload JSON (for enrichment.financials reference)
  ACCOUNT_PROFILE: the complete accountProfile JSON produced in Think 1

Using ACCOUNT_PROFILE and companyNameForResearch enrichment, build three analyses:

━━━ BUSINESS MAP ━━━

Flat list of org nodes at three levels: bu, department, function.
Always include Corporate/Shared Services BU with Legal, Finance, HR, IT, Procurement.
Every BU from accountProfile.businessUnits must appear as a bu-level node.

Each node:
  level:              "bu" | "department" | "function"
  name:               node name
  agreementIntensity: "High" | "Medium" | "Low"
  parentName:         parent name (empty string for BU-level nodes)

━━━ AGREEMENT LANDSCAPE ━━━

15–20 agreement types, sorted by combined score (volume + complexity) descending.

Each entry:
  number:              1-based integer
  agreementType:       name
  category:            "Internal" | "External"
  primaryBusinessUnit: owning BU
  volume:              1–10 (how many per year relative to scale)
  complexity:          1–10 (negotiation cycles, legal review, multi-party)
  contractType:        "Negotiated" | "Non-negotiated" | "Form-based" | "Regulatory"
  description:         1 sentence

━━━ CONTRACT COMMERCE ESTIMATE ━━━

Ground estimates in enrichment.financials. Use industry benchmarks where needed.

estimatedCommerce:
  totalRevenue:  dollar string (revenue flowing through agreements)
  spendManaged:  dollar string (third-party spend under agreement)
  opex:          dollar string (OpEx governed by agreements)

commercialRelationships:
  employees, suppliers, customers, partners — formatted counts

commerceByDepartment: 5+ items
  { department, estimatedAnnualValue, primaryAgreementTypes[] }

commerceByAgreementType: 5+ items (highest value first)
  { agreementType, estimatedAnnualValue, volume }

painPoints: 3–5 items
  { title, description (2–3 sentences) }
```

### Step: Respond

**Action type:** Respond

**Instructions:**
~~~
Return ONLY the three JSON objects in a single code block:

```json
{
  "businessMap": { "nodes": [...] },
  "agreementLandscape": { "agreements": [...] },
  "contractCommerce": {
    "estimatedCommerce": {...},
    "commercialRelationships": {...},
    "commerceByDepartment": [...],
    "commerceByAgreementType": [...],
    "painPoints": [...]
  }
}
```

No other text. No commentary.
~~~

---

## Branch 5 — Think 3: Docusign Strategy

**Condition:** Message contains `STEP: think3`

### Step: Think

**Action type:** Think

**Instructions:**
```
The message JSON contains:
  step: "think3"
  companyNameForResearch: full account payload JSON (use productSignals from here)
  ACCOUNT_PROFILE: complete accountProfile from Think 1
  APPENDIX_DATA: businessMap + agreementLandscape + contractCommerce from Think 2

Using ALL prior data, synthesize the Docusign account research.

CRITICAL RULES:
- Never recommend a product whose productSignals status is "in_use"
- Prioritize "strong" signal products. Include "moderate" as secondary
- Every recommendation must cite the specific usage data that supports it

━━━ BRIEFING ━━━

introText: 1–2 sentences on the company's current strategic focus (no citations)

priorities: exactly 3 items, each:
  title: bold title with parenthetical context if helpful
  body: 3–4 sentence paragraph connecting a company initiative (from
        accountProfile.businessPerformance.strategicInitiatives) to Docusign
        capabilities. Bold key data points, dollar figures, Docusign product names.
        Italic for key terms. Natural prose — no bullets.

━━━ BIG BETS ━━━

3–5 ranked opportunities. For each:
  number:              1-based rank
  title:               opportunity name
  opportunityScore:    "High" | "Medium" | "Low"
  targetBusinessUnit:  which BU from businessMap
  executiveSponsor:    title only — no names
  companyInitiative:   the specific strategicInitiative this aligns to
  useCase:             specific Docusign use case
  painPoint:           current pain being solved
  rationale:           why this is a priority now
  solution:
    description:       2–3 sentence narrative
    primaryProducts:   Docusign product names
    integrations:      relevant tech stack integrations from technologyStack
  sizeAndScope:        estimated scale (e.g. "500 contracts/month across 3 BUs")

━━━ PRIORITY MAP ━━━

currentUseCases:
  summary:    1–2 sentence description of how the account currently uses Docusign
  products:   list of active product names (productSignals status "in_use")
  useCases:   list of current use cases inferred from product usage
  techStack:  brief description of their tech stack relevant to Docusign integrations

priorityMapping: 3–5 items connecting company initiatives to Docusign capabilities
  companyPriority:     name of the strategic initiative
  priorityDetails:     2–3 specific details about this initiative
  docusignCapability:  the Docusign product or capability that addresses it
  businessImpact:      specific business outcome enabled

expansionOpportunities: 3–5 ranked expansion products (complement bigBets, don't duplicate)
  product:       Docusign product name
  useCase:       specific use case
  businessValue: quantified or described value
  department:    target department

actionPlan: 3–5 immediate next steps for the AE
  action:    specific action
  owner:     role responsible (AE, SE, CSM, etc.)
  rationale: why this action matters now
```

### Step: Respond

**Action type:** Respond

**Instructions:**
~~~
Return ONLY the briefing, bigBets, and priorityMap JSON in a code block:

```json
{
  "briefing": {
    "introText": "string",
    "priorities": [{ "title": "string", "body": "string" }]
  },
  "bigBets": {
    "bigBets": [{ ...full object per big bet... }]
  },
  "priorityMap": {
    "currentUseCases": { "summary": "string", "products": ["string"], "useCases": ["string"], "techStack": "string" },
    "priorityMapping": [{ "companyPriority": "string", "priorityDetails": ["string"], "docusignCapability": "string", "businessImpact": "string" }],
    "expansionOpportunities": [{ "product": "string", "useCase": "string", "businessValue": "string", "department": "string" }],
    "actionPlan": [{ "action": "string", "owner": "string", "rationale": "string" }]
  }
}
```

No other text. No commentary.
~~~
