# Command Center Dashboard — Gap Analysis (AE Perspective)

**Date:** 2026-04-16
**Context:** Evaluating the dashboard from an enterprise seller's POV — what's working, what's missing, and where to go next.

---

## What's working

- **Health score** — Single view of account health (pacing ratio, consumption, seat activation) that no one else on the deal team has. Changes how you approach renewal conversations.
- **Product signals / whitespace** — Instantly see what they have and what they don't. Expansion plays are visible without digging through bookscrub.
- **Agreement landscape** — Reframes the conversation from selling SKUs to selling against agreement types. Supports the IAM narrative.
- **Shareable brief** — Can be sent to SC before a prep call or pulled up in a deal review. Intelligence isn't trapped in someone's head.

## What's not working (or missing)

### No deal context layer
The dashboard is pure intelligence — it tells you about the account, not about the deal. No stage tracking, no "what happened last," no "what's next." That lives in Salesforce and Gong, totally disconnected.

### No stakeholder map with deal roles
Business map shows org hierarchy. Exec contacts show names and titles. But: who's the champion? Who's the economic buyer? Who's blocking? Who did I meet last week? The relationship dynamic — the most important thing in an enterprise deal — is absent.

### No activity feed
No recent Gong calls, emails, SC engagements, or CSAM notes. The dashboard is a frozen snapshot. Deals are living things. "This is great context but what happened since Tuesday?"

### No exec-ready output
The full report is too long for a deal review. The brief is still research-oriented. What AEs need for a forecast call: a one-paragraph situation summary. E.g., "Merck is a $450K account at 0.85x pacing, 6 months to renewal, expanding from eSign into CLM for procurement. Champion is VP Legal Ops. Competitive threat from Ironclad. Next step: exec sponsor meeting May 15."

### No competitive tracking
SWOT touches competition at the company level, not the deal level. Who else is in this deal? What did they demo? What's their pricing? Not surfaced.

### No tactical action layer
Priority map has strategic recommendations. AEs need tactical next steps: "Send the ROI analysis your SC built." "Follow up on legal review." "Renewal in 90 days — schedule exec alignment." Intelligence is there to derive these, but no one's synthesizing into a to-do list.

### No team coordination view
Enterprise deals are team sports. AE needs to see: SC demoed CLM on March 3, CSAM flagged a support escalation last week, VC submitted a value case yesterday. Those are all in different systems today.

---

## Blue sky — three big gaps

### 1. Deal context layer
Pull Salesforce opportunity stage + Gong last-call summary + CSAM notes into the dashboard. Not replacing CRM — giving the AE a single pane that combines our intelligence with their deal state. This is what Rob O'Keefe is building manually with Gemini Gems.

### 2. Relationship graph
A stakeholder map showing who you've engaged, who you haven't, who's favorable, who's skeptical. Sourced from Gong contacts + LinkedIn + manual tagging. The org chart without relationship context is just a corporate filing.

### 3. Weekly synthesis
AI-generated "this week on this account" digest combining: health changes, news triggers, recent activity, and a recommended action. Push to Slack Monday morning. The killer feature that makes AEs come back every day instead of once per quarter.

---

## Priority framing

**Value Story (GVS)** is the right next priority — it's the one artifact that directly advances a deal (not just intelligence, a weapon).

The longer play is turning this from a **research tool** into a **deal cockpit**.
