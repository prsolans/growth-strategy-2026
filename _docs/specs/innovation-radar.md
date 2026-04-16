# Innovation Radar: Value Selling & Sales Intelligence

> **Last updated:** 2026-04-03
> **Format:** Forrester-style innovation radar with four quadrants
> **Audience:** Internal roadmap planning for GVS and Account Research Tool
> **Knowledge basis:** Market intelligence through Q1 2025 with extrapolation of announced trends.

---

## Radar Overview

```
                        HIGH IMPACT
                            |
     DIFFERENTIATORS        |        EMERGING / WATCH LIST
     (Leaders have it;      |        (Appearing in 2024-2026;
      it separates them     |         not yet mainstream;
      from the pack)        |         high potential)
                            |
  --------------------------.----------------------------
                            |
     TABLE STAKES           |        OVERHYPED
     (Expected by 2026;     |        (Marketed heavily;
      if you don't have     |         doesn't deliver in
      it, you're behind)    |         practice yet)
                            |
                        LOW IMPACT (currently)
```

---

## Quadrant 1: Table Stakes

*These capabilities are expected in every serious sales tool by 2026. If your tool lacks them, buyers (internal or external) will view it as incomplete.*

### 1.1 AI-Generated Content from Context

**What it is:** Given account data and deal context, AI generates first-draft emails, call summaries, meeting prep briefs, and follow-up messages. Not template fill-in — genuine generative content.

**Why it's table stakes:** Every major vendor (Gong, Seismic, Highspot, Salesloft) shipped this in 2024. By 2026, sales tools without generative AI content feel like word processors without spell check.

**Who does it well:** Gong (call-derived content), Seismic (CRM-derived content), Salesloft (sequence-derived content).

**Internal status:** ✅ STRONG. The Account Research Tool generates complete 12-section documents via 7 LLM calls. GVS generates value bullets, follow-up emails, and champion briefs. This is a clear strength.

### 1.2 CRM Bi-Directional Integration

**What it is:** Real-time read from and write back to Salesforce/HubSpot/Dynamics. Account data flows in; insights, activities, and recommendations flow back.

**Why it's table stakes:** Every commercial tool in the matrix has CRM integration. Reps live in CRM; tools that don't connect to it get abandoned.

**Who does it well:** Gong, Clari, 6sense, People.ai — all have deep Salesforce integration with custom object support.

**Internal status:** ⚠️ GAP. The tools read from a Google Sheet export (bookscrub) with no CRM write-back. This is the single most critical table-stakes gap.

### 1.3 Mobile-Responsive Access

**What it is:** Full tool functionality on mobile devices. Reps review account research, share business cases, and prep for meetings from their phones.

**Why it's table stakes:** Field reps and executives expect mobile access. Every major platform has native mobile apps or responsive web.

**Internal status:** ⚠️ GAP. Google Apps Script bound to a Google Sheet is desktop-only. GVS as an HTML web app may be partially responsive but is not designed for mobile.

### 1.4 SSO and Enterprise Security

**What it is:** SAML/OIDC single sign-on, role-based access control, audit logging, SOC 2 compliance.

**Why it's table stakes:** Enterprise IT mandates SSO for any tool accessing customer data.

**Internal status:** ⚠️ PARTIAL. Google Workspace SSO covers authentication, but there's no dedicated RBAC, audit logging for tool actions, or compliance documentation.

### 1.5 Usage Analytics (Basic)

**What it is:** Track who uses the tool, how often, and which features/outputs are most valuable.

**Why it's table stakes:** Every commercial tool reports usage metrics. Without them, you can't demonstrate value or prioritize improvements.

**Internal status:** ⚠️ GAP. No instrumentation exists in either tool.

### 1.6 Presentation / Deck Generation

**What it is:** Auto-generate branded slide decks from structured data (account research, business cases, proposals).

**Why it's table stakes:** Reps need deliverables they can present. Google Docs are useful but slides are the standard format for executive meetings.

**Who does it well:** Seismic (LiveDocs), Mediafly (content creation), Highspot (smart pages).

**Internal status:** ✅ STRONG. Both GVS and Account Research Tool generate Google Slides decks alongside their primary output.

---

## Quadrant 2: Differentiators

*These capabilities separate the leading tools from the pack. Having them is a competitive advantage; lacking them is survivable but limits impact.*

### 2.1 Multi-Step AI Research Pipelines (Account Intelligence)

**What it is:** Instead of a single AI prompt, the tool runs multiple sequential/parallel AI calls where each builds on prior results — producing research that's more coherent, nuanced, and comprehensive than any single call could achieve.

**Why it differentiates:** Most commercial tools use single-prompt AI. Multi-step pipelines produce dramatically better output for complex research tasks because context accumulates across calls.

**Who does it:** Very few commercial tools. Some enterprise customers (including the Internal baseline) have built custom pipelines. Glean and similar agent frameworks are enabling this.

**Internal status:** ✅ STRONG DIFFERENTIATOR. The Account Research Tool's 7-call pipeline (account profile → business map → agreement landscape → contract commerce → priority map → executive briefing → big bets, with parallel execution of calls 2+3+4 and 6+7) is best-in-class for depth and coherence. The business map, agreement landscape, and contract commerce sections have no commercial equivalent.

### 2.2 Proprietary Data Fusion

**What it is:** Combining internal proprietary data (usage telemetry, renewal data, product adoption, consumption patterns) with external research to produce insights that are both externally informed and internally grounded.

**Why it differentiates:** External-only research is generic. Internal-only data lacks context. The fusion of both — e.g., knowing that a customer's envelope consumption is pacing at 60% AND that their industry is growing 15% YoY — produces uniquely actionable insights.

**Who does it:** No commercial tool does this out-of-the-box for Docusign's specific data. Gong comes closest by fusing conversation data with CRM data.

**Internal status:** ✅ STRONG DIFFERENTIATOR. The bookscrub data integration, signal matching (15 products + 4 bundles), and account health scorecard (10 indicators) are genuinely unique assets.

### 2.3 Quantified Business Case with CFO-Grade Rigor

**What it is:** ROI models that produce defensible financial projections with transparent assumptions, adjustable inputs, sensitivity analysis, and industry benchmarks.

**Why it differentiates:** Most AI-generated business cases produce plausible-sounding numbers that don't survive scrutiny. CFO-grade business cases require methodology transparency, peer benchmarking, and adjustable assumptions.

**Who does it well:** Ecosystems (best in class for post-sale value tracking), Mediafly/Alinean (deepest model library), ValueCore (AI-first approach).

**Internal status:** ✅ STRONG. GVS produces ROI calculations specific to Docusign value drivers (productivity, conversion, cycle time) with transparent inputs. Gap: no post-sale value realization tracking.

### 2.4 Buying Committee Intelligence

**What it is:** Identifying all stakeholders in a buying decision, understanding their individual priorities, tracking engagement with each, and tailoring content per persona.

**Why it differentiates:** Enterprise deals have 6-11 decision-makers (Gartner). Tools that help manage multi-threaded engagement win more deals.

**Who does it well:** Gong (shows all contacts on a deal), 6sense (buying group detection), Ecosystems (value community per stakeholder), People.ai (relationship mapping).

**Internal status:** ⚠️ GAP. Neither tool tracks or adapts to multiple stakeholders.

### 2.5 Content Engagement Tracking

**What it is:** When a seller shares a document, deck, or business case, the tool tracks: who opened it, how long they spent on each section, what they forwarded, and who else viewed it.

**Why it differentiates:** Engagement data is a proxy for buyer interest. Knowing that a CFO spent 5 minutes on the ROI page but skipped the product overview is actionable intelligence.

**Who does it well:** Consensus (demo engagement tracking), Mediafly (content engagement analytics), Seismic (content performance analytics), Highspot (content scoring).

**Internal status:** ⚠️ GAP. Generated Google Docs and Slides have no engagement tracking beyond Google's basic "last viewed" metadata.

### 2.6 Value Realization / Post-Sale Tracking

**What it is:** After the deal closes, tracking whether the promised business value was actually delivered. Connecting pre-sale ROI projections to actual outcomes.

**Why it differentiates:** Most value selling tools stop at the sale. Ecosystems is unique in connecting pre-sale business cases to post-sale value delivery, which strengthens renewal conversations and case studies.

**Internal status:** ⚠️ GAP. Neither tool tracks post-sale value delivery. (Notably, the Account Research Tool's account health scorecard is a partial analog — it measures product health post-sale — but doesn't connect to pre-sale ROI projections.)

---

## Quadrant 3: Emerging / Watch List

*Innovations appearing in 2024-2026 that are not yet mainstream but show high potential. Worth monitoring and potentially piloting.*

### 3.1 Agentic AI Workflows

**What it is:** AI agents that autonomously execute multi-step workflows: research an account, draft a business case, personalize a deck, schedule a meeting, and prepare talking points — all from a single trigger.

**Where it's appearing:**
- Glean agents (the Internal tools' Glean migration is an example)
- Microsoft Copilot Studio (autonomous sales agents)
- Salesforce Einstein Copilot (agentic actions in CRM)
- Gong (emerging agentic deal management features)

**Maturity:** Early. Most implementations are demos or limited pilots. Reliability and hallucination control remain challenges. The Internal tools' Glean migration (replacing 7 discrete LLM calls with a single Glean agent workflow) is a real-world implementation of this trend.

**Potential impact:** Very high. If agentic AI works reliably, it collapses the entire research-to-deliverable workflow into a single request. The tools that get this right first will have a massive UX advantage.

### 3.2 Real-Time Collaborative Value Selling

**What it is:** Instead of the seller building a business case and presenting it, the seller and buyer co-create the business case in real time during a meeting. Interactive, shared screens with live calculations.

**Where it's appearing:**
- Ecosystems has a collaborative "value community" concept
- Mediafly's interactive assessments can be run live with a prospect
- ValueCore is building real-time collaborative business cases

**Maturity:** Early-mid. The technology works; adoption is limited because it requires a behavioral change in how sellers run meetings.

**Potential impact:** High. Collaborative value creation increases buyer commitment and accuracy of the business case.

### 3.3 Buyer Intent from First-Party Signals

**What it is:** Rather than relying on third-party intent data (Bombora, G2), using your own product's telemetry to detect buying signals: a customer's usage patterns change, they start exploring new features, support tickets mention competitive products.

**Where it's appearing:**
- Pendo (product analytics) is adding intent-like signals
- Gainsight (customer success) is building health-to-intent bridges
- Several enterprises are building custom intent models from their own data

**Maturity:** Early. The Internal tools' bookscrub data (consumption pacing, send velocity, seat activation trends) already contains many of these signals — they're just not being classified as "intent" yet.

**Potential impact:** High. First-party intent signals are more accurate and specific than third-party data because they're based on actual product behavior, not proxy web activity.

### 3.4 Generative Competitive Intelligence

**What it is:** AI-powered analysis of competitors' positioning, pricing, product updates, and customer reviews — synthesized into actionable competitive battle cards that update automatically.

**Where it's appearing:**
- Klue (competitive intelligence platform) adding AI synthesis
- Crayon (competitive intelligence) launching AI-generated battle cards
- Seismic and Highspot integrating competitive content recommendations

**Maturity:** Mid. The tools exist; the challenge is accuracy and freshness of competitive data.

**Potential impact:** Medium-High. For the Internal tools: competitive positioning could strengthen the value selling narrative.

### 3.5 AI-Powered Deal Simulation

**What it is:** Before a meeting, AI simulates the conversation: "Based on this account's profile, the CFO will likely object to the implementation timeline. Here's how to handle it, with data from similar won deals."

**Where it's appearing:**
- Gong is building "deal preparation" features using historical conversation data
- Challenger (Korn Ferry ecosystem) has sales methodology baked into coaching tools
- Second Nature (AI role-play for sales training)

**Maturity:** Early. The concept is compelling; execution requires deep historical data and reliable AI reasoning.

**Potential impact:** Medium. More relevant for Gong-like platforms with conversation data than for research/value tools.

### 3.6 Unified Research-to-Value-to-Deliverable Pipelines

**What it is:** A single workflow that goes: (1) research the account, (2) identify value opportunities, (3) calculate ROI, (4) generate a complete deliverable (deck + doc + email) — all automatically, end to end.

**Where it's appearing:** Nowhere fully, yet. The closest implementations:
- The Internal tools (Account Research + GVS) could be connected to achieve this
- Mediafly has pieces of this across their value selling and content modules
- Some enterprises are building this with custom AI agent pipelines

**Maturity:** Very early. This is the logical endpoint of current trends but requires orchestrating multiple AI capabilities.

**Potential impact:** Very high. This is arguably the biggest opportunity for the Internal tools. GVS and Account Research currently operate independently; connecting them into a single pipeline would be a genuine market-leading capability.

---

## Quadrant 4: Overhyped

*Capabilities that get marketed heavily but don't deliver meaningful value in practice yet. Proceed with caution.*

### 4.1 "AI-Powered" Everything (When It's Just Keyword Matching)

**The hype:** Every vendor claims AI. "AI-powered recommendations," "AI-driven insights," "AI content."

**The reality:** Many implementations are simple keyword matching, basic ML classification, or rule-based systems dressed up as AI. True generative AI capabilities are present in fewer tools than marketing suggests.

**What to watch for:** Ask vendors to demonstrate the AI live, with novel inputs. If the "AI" only works well on demo data or pre-configured scenarios, it's likely not genuinely generative.

**Internal relevance:** The Internal tools use real LLM inference (GPT-4o with Bing grounding, 7 research calls). This is genuine AI. Be wary of commercial tools that claim equivalent capabilities without similar depth.

### 4.2 Universal Intent Data Accuracy

**The hype:** "We know exactly which accounts are in-market for your solution, with 95% accuracy."

**The reality:** Third-party intent data (Bombora co-op, G2 buyer intent, TrustRadius) is noisy. False positive rates are high. Intent signals often arrive after the buyer has already engaged (or decided). Attribution is difficult to prove.

**What to watch for:** Demand transparent accuracy metrics. Ask: "Of accounts your platform flagged as high-intent last quarter, what percentage actually entered a pipeline within 90 days?" Most vendors can't or won't answer this.

**Internal relevance:** If integrating intent data, focus on first-party signals (bookscrub behavior changes, support ticket patterns, feature exploration) over third-party intent. The signal-to-noise ratio will be dramatically better.

### 4.3 Fully Autonomous AI Sellers

**The hype:** "AI will handle the entire sales cycle — from prospecting to closing — without human involvement."

**The reality:** AI can automate specific tasks (research, email drafting, call summarization, scheduling). But complex B2B enterprise sales require trust, relationship building, negotiation, and judgment that AI cannot replicate.

**What to watch for:** Tools that promise to replace reps rather than augment them are either targeting very simple transactional sales or overpromising.

**Internal relevance:** The right framing is "AI-augmented seller" not "AI seller." The Internal tools should make reps more effective, not try to bypass them.

### 4.4 Blockchain-Verified ROI Claims

**The hype:** Some value selling vendors have experimented with blockchain or immutable audit trails for ROI claims.

**The reality:** No enterprise buyer has ever asked for blockchain-verified ROI claims. The trust issue in business cases isn't data integrity — it's assumption validity. Blockchain doesn't help with that.

**Internal relevance:** Ignore entirely. Focus on assumption transparency and sensitivity analysis instead.

### 4.5 Predictive Deal Scoring (as Currently Implemented)

**The hype:** "Our AI predicts deal outcomes with 90% accuracy."

**The reality:** Most predictive deal scoring models are trained on historical CRM data, which is incomplete and biased. The models tend to predict what's obvious (large deals with executive engagement close at higher rates) and miss what's not (a competitor entering the deal, a budget cut, a champion leaving).

**What to watch for:** Models that are transparent about their training data, accuracy metrics, and confidence intervals. Clari is arguably the most honest about the limitations of forecasting.

**Internal relevance:** Relevant if building pipeline analytics on top of account research. Be realistic about predictive accuracy; don't build on dirty CRM data.

---

## Roadmap Implications

### From Table Stakes: What to Build Now

1. **CRM integration (Salesforce read/write)** — The #1 gap. Minimum viable: read account data from Salesforce (replacing or supplementing bookscrub sheet); write back a link to the generated doc + key insights as a Salesforce activity/note. This unblocks rep adoption because insights appear where reps already work.

2. **Basic usage analytics** — Instrument both tools to track: who generates reports, for which accounts, how often, and (if possible) whether those accounts progress in pipeline. Even basic event logging to a sheet or BigQuery would provide data to justify continued investment.

3. **Mobile-responsive output trigger** — Consider a lightweight web trigger (Slack command, email trigger, or mobile-responsive web form) as an alternative to the Google Sheet menu → dialog → wait flow.

### From Differentiators: What to Protect and Extend

1. **Protect the multi-step research pipeline** — As the Glean migration proceeds, ensure the output quality matches or exceeds the current 7-call GAS pipeline. The depth of the business map, agreement landscape, and contract commerce sections is unmatched commercially. Do not simplify these to save on LLM costs without verifying output quality is maintained.

2. **Extend the proprietary data advantage** — The bookscrub data is the moat. Expand signal matching beyond 15 products + 4 bundles. Add signals from support ticket patterns, professional services engagement, API usage trends, and integration health. Every additional proprietary signal widens the gap between the Internal tools and anything a commercial vendor could offer.

3. **Add buying committee awareness** — Extend Account Research to identify likely buying committee members (by title/role) and generate persona-specific value messaging. The executive contacts section (from LLM Call 1) already identifies key people; the next step is mapping each to a buying role (economic buyer, technical buyer, champion, coach) and tailoring the priority map per persona.

### From Emerging / Watch List: What to Pilot

1. **Connect GVS and Account Research into a unified pipeline** — This is the single highest-leverage innovation available. Account Research already identifies expansion opportunities and priority capabilities; GVS already calculates ROI for specific capabilities. Connecting them: Account Research identifies "CLM for procurement" as the top opportunity → GVS auto-populates with relevant context → generates a business case for that specific opportunity. This end-to-end flow would be a genuine market-first capability.

2. **Reclassify bookscrub signals as first-party intent** — Consumption pacing, send velocity, seat activation, and integration depth data already contains intent-like signals. A customer with pacing at 40% and declining send velocity near renewal is showing "churn risk intent." A customer with high pacing and active API usage is showing "expansion intent." Building an explicit intent model on top of existing data is high-value and low-cost.

3. **Pilot interactive/collaborative value selling** — Build a mode where the seller and buyer can interact with the GVS ROI model live in a meeting. Start simple: a shareable web view of the GVS output where the buyer can adjust assumptions and see ROI recalculate in real time.

### From Overhyped: What to Avoid

1. **Don't chase third-party intent data integration prematurely** — The signal-to-noise ratio of third-party intent (Bombora, G2) is poor relative to the first-party signals already available in bookscrub data. Start with first-party before investing in third-party data subscriptions.

2. **Don't over-automate the human elements** — The tools should *prepare* the rep, not *replace* the rep. The most valuable output is a well-prepared human walking into a meeting with deep account knowledge and a defensible business case — not an AI-generated email blast.

3. **Don't invest in predictive deal scoring without clean CRM data** — Predictive models are only as good as their training data. Until CRM integration is solid and reps are consistently logging activities, any deal scoring model will produce unreliable results.

---

## Summary: 12-Month Priority Stack

| Priority | Initiative | Quadrant | Effort | Impact |
|---|---|---|---|---|
| 1 | Salesforce CRM integration (read + write-back) | Table Stakes | High | Critical |
| 2 | Connect Account Research → GVS pipeline | Emerging | Medium | Very High |
| 3 | Basic usage analytics instrumentation | Table Stakes | Low | High |
| 4 | First-party intent model from bookscrub signals | Emerging | Medium | High |
| 5 | Buying committee persona mapping | Differentiator | Medium | High |
| 6 | Protect/maintain research pipeline quality through Glean migration | Differentiator | Ongoing | Critical |
| 7 | Expand signal matching (support, PS, API, integrations) | Differentiator | Medium | Medium-High |
| 8 | Interactive/collaborative value selling pilot | Emerging | Medium | Medium |
| 9 | Mobile-responsive generation trigger | Table Stakes | Low | Medium |
| 10 | Content engagement tracking for generated docs | Differentiator | Medium | Medium |

---

*This radar reflects market conditions through Q1 2025 training data with extrapolation of announced trends. Emerging capabilities should be validated against current vendor releases and pilot results before committing roadmap resources.*
