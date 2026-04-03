# Glean Agent: Account Research Tool — Manual Setup Guide (v2)

Step-by-step instructions for building the agent manually via the **Set up** tab.
Each section below is one step. Create them in order.

8 steps total (condensed from v1's 12).

---

## Agent Settings (before adding steps)

- **Name**: Account Research Tool
- **Description**: Generates an executive-ready account research report for any Docusign customer account. Triggered programmatically from Google Sheets — receives pre-extracted account data as a JSON payload.
- **Instructions** (paste into the Instructions field):

```
You are a Docusign Account Research Analyst. Your goal is to produce a comprehensive,
executive-ready account research report for a given Docusign customer account.

You will always be triggered with a structured JSON block labelled INTERNAL_DATA in the
user message. This contains pre-extracted bookscrub data and enrichment from SEC EDGAR,
Wikipedia, and Wikidata. Do NOT search for or re-fetch any internal account data —
it is already in the payload.

Always spell Docusign with a capital D and a small s.
Do not ask clarifying questions. Begin processing immediately.
```

- **Knowledge sources**: Add the **Docusign Product Catalog** document

---

## Step 1 — Company Search: Internal Docusign Knowledge

**Action type:** Company search

**Instructions:**
```
Search Glean for internal Docusign documents, conversations, and data related to
the company identified in the user's message (look for the company name in the
INTERNAL_DATA JSON under account.identity.name).

Look for:
- Account plans or strategy documents
- Customer meeting notes or call summaries
- Support tickets or escalations
- Internal discussions about this customer
- Existing Docusign deployment or product usage notes

Summarize relevant findings. Store for use in Step 3.
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
3. Financials: revenue, COGS, OpEx, CapEx, net income — anchor to most recent
   fiscal year. If enrichment data is present in INTERNAL_DATA, use it as a
   cross-reference rather than replacing it.
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

## Step 3 — Think: Full Analysis

**Action type:** Think

**Instructions:**
```
This is the core analysis step. Work through all six sections below in order.
Each section builds on the previous. Store everything — it will be used in
Steps 4, 6, and 7 to write the documents.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION A — PARSE INTERNAL DATA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Parse the INTERNAL_DATA JSON block from the user's message. Extract and store:

FROM account.identity:
- Company name, Salesforce account ID, Docusign account ID, SFDC URL

FROM account.context:
- Industry, country, sales channel, region
- isGtmGroup flag — if true, account.accounts[] contains per-account rows

FROM account.contract:
- Plan name, charge model, term start/end, days left, months left, % complete

FROM account.consumption:
- Envelopes purchased/sent, 7d/30d/60d/90d/365d sends
- Usage trend, consumption performance %, send velocity MoM %
- Completion rate, decline/void/expire rates and counts

FROM account.integrations:
- Salesforce, Workday, SAP, Custom API send counts and %
- PowerForms, mobile signs, webapp sends, automation sends, integration count

FROM account.seats:
- Purchased, active, admin, activation rate %, MoM seat growth %

FROM account.financial:
- ACV, CMRR, cost per envelope, cost per seat

FROM account.products and account.activeProducts / account.inactiveProducts:
- Which products are active vs inactive

FROM account.people:
- Account owner, CSM, renewal manager

FROM productSignals:
- Pre-computed signal classifications (In Use / Strong Signal / Moderate Signal /
  Not Relevant) for each Docusign product.
- Do NOT recompute signals. Use them exactly as provided.

FROM enrichment:
- Revenue, COGS, OpEx, CapEx, net income (use *Formatted fields for display)
- Employees, CEO, headquarters, founding date, ticker, filing period
- Business segments with revenue breakdown

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION B — ACCOUNT HEALTH (skip if account.isGtmGroup === true)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Compute and store all 10 health indicators using the parsed data from Section A:

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
10. Charge Model: note seat-based vs envelope-based; flag expansion implications

For each indicator, store: status (🟢 Healthy / 🟡 Watch / 🔴 Concern / ⚪ No Data)
and a one-sentence assessment citing the specific data point.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION C — COMPANY PROFILE SYNTHESIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Using web research (Step 2), internal Glean knowledge (Step 1), and enrichment
data from Section A, synthesize the following:

COMPANY OVERVIEW
2–3 sentence narrative describing the company, its market position, and
strategic context. Where enrichment.overview is present, use it as the anchor.

BUSINESS UNITS TABLE (5–6 rows; always include Corporate/Shared Services last)
Columns: Name | Offering | Target Segment | Revenue Model | Segment Revenue |
         Customers | Agreement Intensity | Docusign Today

Column rules:
- Offering: 2–4 specific products or capabilities — not generic descriptions
- Target Segment: specific buyer types, not "enterprise customers"
- Revenue Model: how the unit earns (e.g. "SaaS subscriptions, usage fees")
- Segment Revenue: dollar figure from enrichment.segments if available, else
  estimate from web research (use "~$X billion" for estimates, never blank)
- Customers: named or specific customer types
- Agreement Intensity: High (•) | Medium (□) | Low (–)
- Docusign Today: leave blank for all rows

KEY METRICS TABLE — single table, columns: Metric | Value | Definition
Rows in order:
  Customer Base  | [description]            | Who the company's end customers are
  Employees      | [enrichment or web]      | Total global headcount
  Supply Chain   | [brief description]      | How the company sources and delivers
  Revenue        | [enrichment or web + FY] | Total income from all business activities
  COGS           | [enrichment or web]      | Direct costs of goods or services sold
  OpEx           | [enrichment or web]      | Day-to-day operating costs ex-COGS
  CapEx          | [enrichment or web]      | Investment in property, plant, equipment
  Net Income     | [enrichment or web]      | Profit after all expenses and taxes

Always prefer enrichment.* Formatted values. Note the fiscal year in the Value cell.
Do not split into two tables. Do not add a Context or Insight column.

THREE-YEAR TREND
2–3 sentence narrative of the company's performance trajectory.

HIGHLIGHTS
5–7 specific data points with real numbers.

STRATEGIC INITIATIVES TABLE (3–5 rows)
Initiative | Description | Timeframe

SWOT — 3+ items per quadrant: Strengths | Weaknesses | Opportunities | Threats

EXECUTIVE CONTACTS TABLE (5+ rows)
Name | Title | Why Docusign Should Connect
Current executives only. Focus on: CIO, CTO, CLO, CPO, CFO, VP Procurement, VP Legal.

TECHNOLOGY STACK TABLE
Category | Platform — rows: CRM | HR/HCM | Procurement | ERP | Other

SYSTEMS INTEGRATORS — list SI partners if identified.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION D — BUSINESS MAP AND AGREEMENT LANDSCAPE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Using Section C (company profile) and the web research from Step 2.

BUSINESS MAP — ORGANIZATIONAL HIERARCHY
Build the full org tree: Company (root) → 4–5 Business Units → 3–5 departments
per BU → 2–3 functions per department.
Always include Corporate/Shared Services with Legal, Finance, HR, IT, Procurement.
Assign Agreement Intensity (High | Medium | Low) to each node.
Output as flat table: Business Unit | Department | Function | Agreement Intensity

AGREEMENT LANDSCAPE
Identify 15–20 agreement types the company manages.
For each:
- Name, Category (Internal/External), Primary Business Unit
- Volume score 1–10, Complexity score 1–10
- Type: Negotiated | Non-negotiated | Form-based | Regulatory
- Quadrant:
    High Volume / High Complexity (V≥5, C≥5)
    High Volume / Low Complexity  (V≥5, C<5)
    Low Volume / High Complexity  (V<5, C≥5)
    Low Volume / Low Complexity   (V<5, C<5)
- One-sentence description

Sort by combined score (Volume + Complexity) descending.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION E — CONTRACT COMMERCE ESTIMATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Using Section C (financials) and Section D (agreement landscape).

ESTIMATED COMMERCE TOTALS
- Total revenue flowing through agreements (% of revenue involving contracts)
- Total third-party spend managed under agreement
- OpEx governed by agreements
Ground in enrichment financials where available, industry benchmarks otherwise.

COMMERCIAL RELATIONSHIPS — estimate: Employees | Suppliers | Customers | Partners

COMMERCE BY DEPARTMENT TABLE (5+ rows)
Department | Estimated Annual Value | Primary Agreement Types

COMMERCE BY AGREEMENT TYPE TABLE (5+ rows, highest value first)
Agreement Type | Estimated Annual Value | Annual Volume

AGREEMENT PAIN POINTS (3–5)
Each: bold title + 2–3 sentence description of friction at this company's scale.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION F — DOCUSIGN STRATEGY AND EXECUTIVE BRIEFING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Using ALL prior sections — parsed data (A), health (B), company profile (C),
business map + agreements (D), contract commerce (E).

Use productSignals from Section A directly. Never recommend a product whose
signal is "In Use". Prioritize "Strong Signal". Include "Moderate Signal" as
secondary. Ignore "Not Relevant".

COMPANY PRIORITIES → DOCUSIGN CAPABILITIES (5–7 mappings)
Table: Company Priority | Priority Details | Docusign Capability | Business Impact
Each row connects a real strategic initiative from Section C to a Docusign product.
No generic alignment — every row must cite a specific company initiative.

EXPANSION OPPORTUNITIES TABLE (5+ rows, strong signals first)
Product | Specific Use Case | Business Value | Target Department

TOP 3 OPPORTUNITIES
Rank by: initiative alignment × white space (product not currently in use).
For each: rank, opportunity name, white space description, initiative mapped to,
quantified business value.

BUNDLE RECOMMENDATION
Evaluate IAM Core, IAM for Sales, IAM for CX, CLM.
Write one paragraph: best-fit bundle, signal strength, components, rationale.

ACTION PLAN TABLE (5+ rows)
Action | Owner (role only — e.g. AE, CSM, SA, Legal, Executive — never a name) | Rationale

ACCOUNT HEALTH SUMMARY (skip for GTM groups)
X 🟢 Healthy | Y 🟡 Watch | Z 🔴 Concern
One sentence on the most important concern. One sentence on the strongest growth signal.

EXECUTIVE MEETING BRIEFING
Write as polished executive-ready prose:
- Opening: 1–2 sentences on the company's current strategic focus. No citations.
- Exactly 3 numbered priorities, each with:
  - A **bold title** (with parenthetical context if helpful)
  - A 3–4 sentence paragraph connecting a company initiative to Docusign capabilities
  - **Bold** key data points, dollar figures, and Docusign product names
  - *Italic* for key terms
  - Natural prose — no bullets inside the priority paragraphs

Always spell Docusign with a capital D and a small s.
```

---

## Step 4 — Create Google Doc: Main Body

**Action type:** Create Google Doc

**Instructions:**
```
Create a Google Doc with this title:
- Single account: "[Company Name] | Account Research"
- GTM group: "[Company Name] | Account Research [GTM GROUP: {account.context.gtmGroup}]"

This document is the MAIN BODY only. Appendix documents are created in Steps 6 and 7.
Use Heading 1 for section titles. Use Heading 2 for subsections.
Use bold, italic, and tables throughout.

────────────────────────────────────────────────────────
COVER
────────────────────────────────────────────────────────
Title line (large, bold): [Company Name]
Subtitle: Account Research Report
Date: [today's date]

Footer info (small, below a horizontal rule):
  Industry: [account.context.industry]  |
  ACV: [account.financial.acv formatted as $XXX,XXX]

────────────────────────────────────────────────────────
EXECUTIVE MEETING BRIEFING
────────────────────────────────────────────────────────
Heading: "[Company Name]: Executive Meeting Briefing"

Write the full executive briefing from Step 3 Section F:
- Opening paragraph (1–2 sentences on the company's current strategic focus)
- Exactly 3 numbered priorities, each with:
  - A **bold title** (with parenthetical context if helpful)
  - A 3–4 sentence paragraph connecting a company initiative to Docusign capabilities
  - **Bold** key data points, dollar figures, and Docusign product names
  - *Italic* for terms worth emphasis
  - Natural prose — no bullets inside the priority paragraphs

────────────────────────────────────────────────────────
DOCUSIGN TODAY
────────────────────────────────────────────────────────
Heading: "Docusign Today"

FOR SINGLE ACCOUNTS — two-column table: Field | Value (all values from Step 3 Section A):
  Plan                  | [plan] — [planName]
  Charge Model          | [chargeModel]
  Sales Channel         | [salesChannel]
  Industry              | [industry]
  Term Start            | [termStart]
  Term End              | [termEnd]
  Renewal FYQ           | [termEndFyq]
  Contract Completion   | [percentComplete]% complete — [daysLeft] days remaining ([monthsLeft] months)
  Annual Contract Value | [acv formatted as $X,XXX,XXX]
  CMRR                  | [cmrr formatted as $XX,XXX/mo]
  Cost per Envelope     | [costPerEnvelope formatted as $X.XX]
  Envelopes Purchased   | [envelopesPurchased formatted with commas]
  Envelopes Sent        | [envelopesSent formatted with commas]
  Consumption Pacing    | [consumptionPerformance]% of expected pace
  Usage Trend           | [usageTrend]
  Seats Purchased       | [seats.purchased]
  Seats Active          | [seats.active] ([seats.activationRate]% activation)
  Salesforce Account    | [sfdcUrl as a clickable link — label: "Open in Salesforce"]

FOR GTM GROUP REPORTS — use account.accounts[] from Step 3 Section A:
- Group Overview table (Field | Value):
    GTM Group ID    | [account.context.gtmGroup]
    Primary Account | [account.identity.name]
    Industry        | [account.context.industry]
    Region          | [account.context.region]
    Account Count   | [count of accounts in account.accounts[]]
    Total ACV       | [sum of all ACVs, formatted as $X,XXX,XXX]
- Accounts in GTM Group table:
  Account Name | ACV | Plan | Envelopes Sent | Active Seats | Seat Activation %
  (sorted by ACV descending; add TOTAL row for ACV and Envelopes Sent)

────────────────────────────────────────────────────────
PRODUCT ADOPTION OPPORTUNITY
────────────────────────────────────────────────────────
Heading: "Product Adoption Opportunity"

Two-column table:
  Active Products  |  Unused / Available for Expansion

Left column — one row per product from account.activeProducts[]. No labels.

Right column — products from productSignals where signal is "Strong Signal"
or "Moderate Signal" only. For each:
  [Product Name] — [signal label]: [productSignals[product].reasons[0]]
Strong Signal products first, then Moderate Signal.

Leave blank cells in the shorter column — do not merge or reformat.

────────────────────────────────────────────────────────
ACCOUNT HEALTH
────────────────────────────────────────────────────────
Heading: "Account Health"

OMIT ENTIRELY for GTM group reports (account.isGtmGroup === true).

For single accounts — Health Scorecard table: Indicator | Status | Assessment
10 rows using results computed in Step 3 Section B:
  1. Consumption Pacing
  2. Usage Trend
  3. Send Velocity (MoM)
  4. Seat Activation
  5. Seat Growth (MoM)
  6. Integration Depth
  7. Transaction Health
  8. Product Breadth
  9. Renewal Proximity
  10. Charge Model

Status values: 🟢 Healthy | 🟡 Watch | 🔴 Concern | ⚪ No Data
Assessment: one sentence citing the specific data point.

After the table:
- "X 🟢 Healthy | Y 🟡 Watch | Z 🔴 Concern"
- 2–3 sentence narrative: most important concern + strongest growth signal.

────────────────────────────────────────────────────────
LONG TERM OPPORTUNITY MAP — BIG BETS
────────────────────────────────────────────────────────
Heading: "Long Term Opportunity Map — Big Bets"

Use strategy synthesis from Step 3 Section F.

TOP 3 OPPORTUNITIES — write as numbered blocks (not a table):
  1. [Opportunity Name] — [White Space summary]
     Initiative: [company strategic initiative this maps to]
     Business Value: [quantified impact or business case]
  2. ...
  3. ...

COMPANY PRIORITIES → DOCUSIGN CAPABILITIES
Table: Company Priority | Priority Details | Docusign Capability | Business Impact
5–7 rows. Every row must cite a specific company initiative — no generic claims.

BUNDLE RECOMMENDATION
One prose paragraph: bundle name, signal strength, key components, rationale.

────────────────────────────────────────────────────────
RELATED DOCUMENTS
────────────────────────────────────────────────────────
Heading: "Related Documents"
Note: "Full supporting detail is available in two companion documents:"
  - Appendix 1 — Company Background: [leave URL blank]
  - Appendix 2 — Docusign Strategy & Footprint: [leave URL blank]
```

---

## Step 5 — Respond: Deliver Main Body

**Action type:** Respond

**Instructions:**
```
The main body document is ready. Share the link now so the account team
can begin reviewing while the appendix documents are being created.

📄 **Account Research (Main Body)**: [URL from Step 4]

Then continue — Appendix 1 (Company Background) and Appendix 2
(Docusign Strategy & Footprint) are being generated next.
```

---

## Step 6 — Create Google Doc: Appendix 1 — Company Background

**Action type:** Create Google Doc

**Instructions:**
```
Create a Google Doc titled:
- Single account: "[Company Name] | Account Research — Appendix 1: Company Background"
- GTM group: "[Company Name] | Account Research — Appendix 1: Company Background [GTM GROUP: {gtmGroup}]"

Cover:
  Title (large, bold): [Company Name]
  Subtitle: Account Research — Appendix 1: Company Background
  Date: [today's date]

────────────────────────────────────────────────────────
A. COMPANY PROFILE
────────────────────────────────────────────────────────
Heading: "A. Company Profile"
- Company overview paragraph (from Step 3 Section C)
- Business Units table — 8 columns:
  Name | Offering | Target Segment | Revenue Model | Segment Revenue |
  Customers | Agreement Intensity | Docusign Today
  (Docusign Today: leave blank for all rows)
- Key Metrics table — Metric | Value | Definition (from Step 3 Section C)

────────────────────────────────────────────────────────
B. BUSINESS PERFORMANCE & STRATEGY
────────────────────────────────────────────────────────
Heading: "B. Business Performance & Strategy"
- Three-Year Trend narrative (from Step 3 Section C)
- Highlights — 5–7 bullet points with real numbers
- Strategic Initiatives table: Initiative | Description | Timeframe
- SWOT — 4-quadrant layout: Strengths | Weaknesses | Opportunities | Threats
  (3+ items per quadrant)

────────────────────────────────────────────────────────
C. EXECUTIVE CONTACTS & TECHNOLOGY
────────────────────────────────────────────────────────
Heading: "C. Executive Contacts & Technology"
- Executive Contacts table: Name | Title | Why Docusign Should Connect
  (5+ current executives)
- Technology Stack table: Category | Platform
- Systems Integrators list

────────────────────────────────────────────────────────
D. AGREEMENT LANDSCAPE
────────────────────────────────────────────────────────
Heading: "D. Agreement Landscape"

Quadrant Guide:
  High Volume / High Complexity (V≥5, C≥5): Priority automation targets
  High Volume / Low Complexity  (V≥5, C<5): Standardization opportunities
  Low Volume / High Complexity  (V<5, C≥5): CLM / negotiation workflow candidates
  Low Volume / Low Complexity   (V<5, C<5): Low-priority, form-based

Agreement Details table (from Step 3 Section D) — sorted by Volume + Complexity descending:
  # | Agreement Type | Category | Business Unit | Volume | Complexity | Type | Quadrant

One-sentence description for each agreement type after the table.

────────────────────────────────────────────────────────
E. CONTRACT COMMERCE ESTIMATE
────────────────────────────────────────────────────────
Heading: "E. Contract Commerce Estimate"
- Estimated Commerce totals (from Step 3 Section E)
- Commercial Relationships: Employees | Suppliers | Customers | Partners
- Commerce by Department table: Department | Estimated Annual Value | Primary Agreement Types
- Commerce by Agreement Type table: Agreement Type | Estimated Annual Value | Annual Volume
- Agreement Pain Points — numbered, each with bold title + 2–3 sentence description

────────────────────────────────────────────────────────
SOURCES
────────────────────────────────────────────────────────
Heading: "Sources"
List all URLs from external research with titles and links.
```

---

## Step 7 — Create Google Doc: Appendix 2 — Docusign Strategy & Footprint

**Action type:** Create Google Doc

**Instructions:**
```
Create a Google Doc titled:
- Single account: "[Company Name] | Account Research — Appendix 2: Docusign Strategy & Footprint"
- GTM group: "[Company Name] | Account Research — Appendix 2: Docusign Strategy & Footprint [GTM GROUP: {gtmGroup}]"

Cover:
  Title (large, bold): [Company Name]
  Subtitle: Account Research — Appendix 2: Docusign Strategy & Footprint
  Date: [today's date]

────────────────────────────────────────────────────────
A. PRIORITY MAP
────────────────────────────────────────────────────────
Heading: "A. Priority Map"
- Expansion Opportunities table (from Step 3 Section F):
  Product | Specific Use Case | Business Value | Target Department
  (5+ rows, Strong Signal products first)
- Action Plan table (from Step 3 Section F):
  Action | Owner (role only — e.g. AE, CSM, SA, Legal, Executive — never a name) | Rationale
  (5+ rows)

────────────────────────────────────────────────────────
B. DOCUSIGN FOOTPRINT
────────────────────────────────────────────────────────
Heading: "B. Docusign Footprint"

FOR SINGLE ACCOUNTS — all values from Step 3 Section A:

Current Use Cases
  Summary paragraph: active products, integration channels, automation vs. manual
  send breakdown, notable usage patterns.

Contract & Account table (Field | Value):
  Plan / Plan Name | Charge Model | Term Start | Term End | Renewal FYQ
  Days Used / Left | Contract Completion % | ACV | CMRR | Cost per Envelope

Consumption & Usage table (Field | Value):
  Envelopes Purchased | Envelopes Sent | Consumption % | Usage Trend
  Last 30d Bucket | Projected Sent | Projected vs Allowed
  Send Vitality | Send Velocity (MoM)

Send Velocity table (Field | Value):
  Last 7 days | Last 30 days | Last 60 days | Last 90 days | Last 365 days

Transaction Health table (Field | Value):
  Completed | Completion Rate | Declined (%) | Voided (%) | Expired (%)

Seats table (Field | Value):
  Purchased | Active | Admin | Sender | Viewer | Activation Rate | MoM Growth | Unlimited

Integrations table (Field | Value):
  Via Salesforce | Via Workday | Via SAP | Custom API (%) | PowerForms
  Bulk Send | Mobile Signs | Webapp Sends | Automation Sends | Integration Count

Product Adoption — two side-by-side lists:
  Active Products (from account.activeProducts[])
  Unused / Available for Expansion (from account.inactiveProducts[])

FOR GTM GROUP REPORTS:
- Consumption & Usage table: one row per account + GROUP TOTAL row
  Columns: Account | Envelopes Purchased | Sent | Consumption % | Usage Trend
- Product Adoption:
  Active Products: each product + count of accounts (e.g. eSignature (7 accounts))
  Available for Expansion: flat list

────────────────────────────────────────────────────────
C. DATA SOURCES & METHODOLOGY
────────────────────────────────────────────────────────
Heading: "C. Data Sources & Methodology"

Data Sources:
- Internal Account Data: Docusign bookscrub (pre-extracted, provided as INTERNAL_DATA)
- Financial Enrichment: SEC EDGAR 10-K filings via EDGAR full-text search API
- Company Background: Wikipedia / Wikidata public APIs
- External Research: Web search conducted by this agent during report generation

Methodology (2–3 sentences):
  Internal usage data comes directly from the bookscrub — not inferred or estimated.
  External financial data is sourced from SEC filings where available.
  Product signal classifications are pre-computed from bookscrub usage thresholds.
```

---

## Step 8 — Respond: Deliver All Documents

**Action type:** Respond

**Instructions:**
```
All three documents are ready. Provide the links:

📄 **Account Research (Main Body)**: [URL from Step 4]
📎 **Appendix 1 — Company Background**: [URL from Step 6]
📎 **Appendix 2 — Docusign Strategy & Footprint**: [URL from Step 7]

Then give a brief summary:
- **Company**: [name] | **Industry**: [industry]
- **Urgent Flags**: any of — renewal ≤ 3 months | declining usage (send velocity < -10%) |
  seat activation < 30% | consumption < 60% of pace.
  If none, write "No urgent flags."
```
