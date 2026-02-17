# Glean Workflow: Growth Strategy Generator

Step-by-step instructions to manually build the Growth Strategy Generator as a Glean multi-step workflow.

---

## Prerequisites

- Add the Google Drive file **"Book Scrub - Full NA Enterprise - PRS AGENT"** as a data source on the agent
- Add the **Docusign Product Catalog** document as a knowledge source on the agent
- Set agent instructions to the contents of `GLEAN_PROMPT.md` (or a shortened version — the workflow steps below carry the detailed logic)

---

## Step 1: Respond — Ask for Company Name

**Action type:** Respond

**Instructions:**
```
Ask the user: "What company would you like to generate a Growth Strategy for?"

Wait for the user to provide a company name before proceeding.
```

---

## Step 2: Read Document — Extract Book Scrub Data

**Action type:** Read document

**Instructions:**
```
Read the Google Drive file named exactly "Book Scrub - Full NA Enterprise - PRS AGENT".
This is the ONLY book scrub file to use — ignore all other files with "book scrub" in the name.

Find the row matching the company name the user provided. Extract ALL columns for that company, including:
- Identity: Account name, SFDC parent ID, site ID, Docusign account ID, Salesforce account ID
- Context: Industry, country, sales channel, region, GTM group
- Contract: Plan, plan name, charge model, term start, term end, term end FYQ, days used, days left, percent complete, months left
- Consumption: Envelopes purchased, envelopes sent, sent 7d/30d/60d/90d/365d, consumption performance, usage trend, send velocity MoM, completed, completion rate, declined, voided, expired, pct declined/voided/expired
- Integrations: Salesforce, Workday, SAP, Custom API, pct Custom API, PowerForms, Bulk Send, mobile signs, webapp sends, automation sends, integration count
- Seats: Purchased, active, admin, viewer, sender, activation rate, active seats MoM
- Financial: CMRR, ACV, currency, cost per envelope, cost per seat
- Products: CLM, IAM, SMS Delivery, SMS Auth, Phone Auth, ID Check, IDV, Clickwraps, Agreement Actions, Workflows, AI Extraction, Navigator, DocGen, Multi-Channel, SAML, Monitor
- People: Account owner, CSM, renewal manager, sales rep

If the company is not found, respond to the user that the company was not found in the book scrub data and ask them to verify the name.
```

---

## Step 3: Analyze Data — Compute Health & Product Signals

**Action type:** Analyze data

**Instructions:**
```
Using the book scrub data extracted in the previous step, compute the following analyses:

ACCOUNT HEALTH INDICATORS — evaluate each and assign Healthy / Watch / Concern / No Data:
1. Consumption Pacing: Compare consumption% to term%. Ratio >= 0.9 = Healthy, >= 0.6 = Watch, < 0.6 = Concern
2. Usage Trend: "Over-utilizing" or "On Track" = Healthy, "Under-utilizing" = Concern
3. Send Velocity (MoM): > 10% = Healthy, -10% to 10% = Watch, < -10% = Concern
4. Seat Activation: >= 70% = Healthy, >= 30% = Watch, < 30% = Concern
5. Seat Growth (MoM): > 0% = Healthy, >= -5% = Watch, < -5% = Concern
6. Integration Depth: >= 3 = Healthy, >= 1 = Watch, 0 = Concern
7. Transaction Health: < 5% failures = Healthy, < 15% = Watch, >= 15% = Concern
8. Product Breadth: >= 5 active products = Healthy, >= 2 = Watch, < 2 = Concern
9. Renewal Proximity: > 6 months = Healthy, 3-6 months = Watch, <= 3 months = Concern
10. Charge Model: Note seat-based vs envelope-based and flag implications

PRODUCT SIGNAL ANALYSIS — for each Docusign product, classify as In Use / Strong Signal / Moderate Signal / Not Relevant using the signal criteria from the Docusign Product Catalog knowledge source. List the specific data points that support each classification.

BUNDLE RECOMMENDATIONS — evaluate fit for IAM Core, IAM for Sales, IAM for CX, and CLM bundles using the upgrade signal criteria from the catalog.

Compile: list of active products, list of unused/available products, and an overall health summary (X healthy, Y watch, Z concern).
```

---

## Step 4: Company Search — Internal Docusign Knowledge

**Action type:** Company search

**Instructions:**
```
Search for internal Docusign documents, conversations, and data related to the company name the user provided. Look for:
- Account plans or strategy documents
- Customer meeting notes or call summaries
- Support tickets or escalations
- Internal discussions about this customer
- Any existing Docusign product usage details or deployment notes

Summarize any relevant findings that could inform the growth strategy.
```

---

## Step 5: OpenAI Web Search — External Company Research

**Action type:** OpenAI Web Search

**Instructions:**
```
Research the following about the company:

1. COMPANY PROFILE: What the company does, market position, business units (~5), customer base, employee count, supply chain
2. FINANCIALS: Revenue, COGS, OpEx, CapEx with context
3. BUSINESS PERFORMANCE: Three-year trend narrative, 5-7 financial/operational highlights with real numbers, 3-5 strategic initiatives with descriptions and timeframes
4. SWOT: 3+ strengths, weaknesses, opportunities, threats
5. EXECUTIVE CONTACTS: 5+ executives relevant to agreement management (CIO, CTO, CLO, CPO, CFO, VP Procurement, VP Legal) with name, title, and why Docusign should connect
6. TECHNOLOGY STACK: CRM, HR/HCM, Procurement platforms, other systems, systems integrator partners
7. ORGANIZATIONAL STRUCTURE: Major business units, key departments, shared services structure

Focus on publicly available information from earnings reports, press releases, LinkedIn, and company websites.
```

---

## Step 6: Think — Synthesize Company Analysis

**Action type:** Think

**Instructions:**
```
Using the external research from the web search, the internal data from the book scrub, and any internal Docusign knowledge found, synthesize the following analyses. Do NOT output to the user — this is internal reasoning.

BUSINESS MAP:
Build an organizational hierarchy: Company (root) -> 4-5 Business Units -> 3-5 departments per BU -> 2-3 functions per department. Include shared services (Legal, Finance, HR, IT, Procurement). Rate each node's agreement intensity as High, Medium, or Low.

AGREEMENT LANDSCAPE:
Identify 15-20 agreement types the company manages. For each: name, category (Internal/External), primary business unit, volume (1-10), complexity (1-10), type (Negotiated/Non-negotiated/Form-based/Regulatory). Sort by combined score (volume + complexity) descending. Assign quadrants: High Volume/High Complexity (V>=5, C>=5), HV/LC, LV/HC, LV/LC.

CONTRACT COMMERCE ESTIMATE:
Estimate: total revenue flowing through agreements, spend managed, OpEx. Count commercial relationships (employees, suppliers, customers, partners). Estimate commerce by department (5+ departments with annual value and primary agreement types). Estimate commerce by agreement type (5+ types). Identify 3-5 agreement pain points.

Use realistic figures based on the company's known financials and industry benchmarks.
```

---

## Step 7: Think — Synthesize Docusign Strategy

**Action type:** Think

**Instructions:**
```
Using ALL prior analysis (book scrub data, health indicators, product signals, external research, business map, agreement landscape, contract commerce), synthesize the Docusign growth strategy. Do NOT output to the user — this is internal reasoning.

PRIORITY MAP:
- Map 5-7 company strategic initiatives to specific Docusign capabilities. For each: the company priority, priority details, the Docusign capability that maps to it, and quantified business impact.
- Identify 5+ expansion opportunities. For each: Docusign product, specific use case, business value, target department. Prioritize strong-signal products from the product signal analysis. Do NOT recommend products the customer already has.
- Score the top 3 opportunities by combining initiative alignment (does it connect to a strategic initiative?) and white space (is it a new product for them?).
- Recommend which IAM bundle or CLM fits, with signal strength, key components, and rationale.
- Create an action plan with 5+ specific next steps. For each: the action, owner role (AE, CSM, SA, etc.), and rationale.

EXECUTIVE MEETING BRIEFING:
Write a concise executive briefing:
- Intro: 1-2 sentences setting context about the company's strategic focus. No citations.
- Exactly 3 numbered priorities, each with:
  - A bold title (with parenthetical context if relevant)
  - A 3-4 sentence body paragraph connecting the company initiative to Docusign capabilities
  - Use **bold** for data points, dollar figures, company names, and Docusign product names
  - Use *italic* for emphasis on specific terms
- Write as natural prose, not bullet points.

Always spell Docusign with a capital D and a small s.
```

---

## Step 8: Create Google Doc — Generate Final Document

**Action type:** Create Google doc

**Instructions:**
```
Create a Google Doc titled "[Company Name] | Growth Strategy".

Write the complete document with the following sections in this exact order. Use proper headings, tables, bold, and italic formatting throughout.

SECTION 0: EXECUTIVE MEETING BRIEFING
- Heading: "[Company Name]: Executive Meeting Briefing"
- The intro paragraph and 3 numbered priorities from the executive briefing synthesis

SECTION 1: COMPANY PROFILE
- Heading: "Company Profile"
- Company overview paragraph
- Business Units table: Name | Offering | Target Segment | Revenue Model | Customers
- Key Metrics table: Customer Base, Employees, Supply Chain, Revenue, COGS, OpEx, CapEx

SECTION 2: ACCOUNT HEALTH ANALYSIS
- Heading: "Account Health Analysis"
- Health Scorecard table: Indicator | Status | Assessment (10 rows)
- Overall Assessment summary and narrative

SECTION 3: PRIORITY MAP
- Heading: "Priority Map"
- Top 3 Opportunities table: # | Opportunity | White Space | Initiative Alignment | Business Value
- Company Priorities table: Company Priority | Priority Details | Docusign Capability | Business Impact
- Recommended Bundles with signal strength and rationale
- Expansion Opportunities table: Product | Use Case | Business Value | Target Department
- Action Plan table: Action | Owner | Rationale

SECTION 4: DOCUSIGN FOOTPRINT
- Heading: "Docusign Footprint"
- Current Use Cases, Contract & Account, Consumption & Usage, Send Velocity, Transaction Health, Seats, Integrations, Product Adoption — all from book scrub data

SECTION 5: BUSINESS PERFORMANCE & STRATEGY
- Heading: "Business Performance & Strategy"
- Three-Year Trend, Highlights, Strategic Initiatives table, SWOT Analysis

SECTION 6: EXECUTIVE CONTACTS & TECHNOLOGY
- Heading: "Executive Contacts & Technology"
- Key Executive Contacts table, Technology Stack table, Systems Integrators

SECTION 7: BUSINESS MAP
- Heading: "Business Map"
- Organizational Hierarchy table: Business Unit | Department | Function | Agreement Intensity

SECTION 8: AGREEMENT LANDSCAPE
- Heading: "Agreement Landscape"
- Agreement Details table: # | Agreement Type | Category | Business Unit | Volume | Complexity | Type | Quadrant
- Agreement descriptions

SECTION 9: CONTRACT COMMERCE ESTIMATE
- Heading: "Contract Commerce Estimate"
- Estimated Commerce, Commercial Relationships, Commerce by Department table, Commerce by Agreement Type table, Agreement Pain Points

SOURCES
- Heading: "Sources"
- All external sources with titles and URLs
```

---

## Step 9: Respond — Deliver the Document

**Action type:** Respond

**Instructions:**
```
Tell the user the Growth Strategy document has been created. Provide the link to the Google Doc.

Then provide a brief summary:
- Company name and industry
- Overall account health (X healthy, Y watch, Z concern)
- Top 3 expansion opportunities (product name and one-line rationale each)
- Any urgent flags (renewal proximity, declining usage, etc.)
```
