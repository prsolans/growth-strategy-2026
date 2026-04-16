# Account Health Score — How It Works

The Account Health section of the research doc uses **deterministic, rule-based scoring** applied to internal Docusign account metrics. No AI or LLM estimation is involved — every indicator is computed directly from Book of Business data.

---

## Traffic-Light System

Each indicator is assigned one of four statuses:

| Status | Meaning | Action |
|--------|---------|--------|
| **Green** | Healthy | No action needed |
| **Yellow** | Watch | Monitor or investigate |
| **Red** | Concern | Action recommended |
| **Gray** | No Data | Metric unavailable for this account |

---

## The 10 Health Indicators

### 1. Consumption Pacing

Are envelopes being used at a rate that matches the contract timeline?

**How it works:** Compares the percentage of purchased envelopes consumed against the percentage of the contract term elapsed.

```
pacingRatio = (envelopesSent / envelopesPurchased) / (% of contract term elapsed)
```

| Pacing Ratio | Status | Label |
|-------------|--------|-------|
| >= 0.9 | Green | On Track |
| 0.6 – 0.89 | Yellow | Slightly Behind |
| < 0.6 | Red | Significantly Behind |
| No envelope data | Gray | No Data |

**Example:** An account has sent 45% of purchased envelopes and is 50% through its contract term. Pacing ratio = 0.90 — **Green (On Track)**.

**Edge case:** If the contract term has elapsed (> 100% complete), the term percentage is capped at 100% for the ratio calculation, and a note is appended indicating the term has expired.

---

### 2. Usage Trend

Directional indicator from the Book of Business usage trend classification.

**How it works:** Matches keywords in the `USAGE_TREND` field.

| Trend contains | Status | Label |
|---------------|--------|-------|
| "over" | Green | Over Trending |
| "on" or "track" | Green | On Track |
| "under" | Red | Under Trending |
| Anything else / empty | Gray | No Data |

**Why it matters:** Over-trending accounts are upsell candidates at renewal. Under-trending accounts may have dormant use cases or onboarding gaps.

---

### 3. Send Velocity (MoM)

Month-over-month change in envelope send volume — is usage growing, flat, or declining?

| MoM Change | Status | Label |
|-----------|--------|-------|
| > +10% | Green | Accelerating |
| -10% to +10% | Yellow | Flat |
| < -10% | Red | Decelerating |
| No data | Gray | No Data |

---

### 4. Seat Activation

What percentage of purchased seats are actively being used?

| Activation Rate | Status | Label |
|----------------|--------|-------|
| >= 70% | Green | Healthy |
| 30% – 69% | Yellow | Moderate |
| < 30% | Red | Low |
| Active seats but no purchased limit | Yellow | Unmetered |
| No seat data | Gray | No Data |

**Shelfware risk:** Red status signals significant shelfware — purchased seats that aren't being used. This is both a retention risk (customer isn't getting value) and an engagement opportunity.

---

### 5. Seat Growth (MoM)

Month-over-month change in active seat count — is the user base expanding or contracting?

| MoM Change | Status | Label |
|-----------|--------|-------|
| > 0% | Green | Growing |
| -5% to 0% | Yellow | Stable |
| < -5% | Red | Contracting |
| No data | Gray | No Data |

---

### 6. Integration Depth

Number of detected integration types (Salesforce, Workday, SAP, Custom API, PowerForms, Bulk Send) as a proxy for platform stickiness.

| Integration Count | Status | Label |
|------------------|--------|-------|
| >= 3 | Green | Deeply Embedded |
| 1 – 2 | Yellow | Moderate |
| 0 | Red | Low Stickiness |

**Switching cost signal:** Accounts with 3+ integrations have high switching costs and are strong retention candidates. Zero integrations (web-app-only usage) means the customer could easily switch to a competitor.

**API detail:** For accounts with 1–2 integrations, the system also checks whether more than 50% of sends are API-driven. If so, the account is noted as "technically committed" despite the moderate integration count.

---

### 7. Transaction Health

How successfully are envelopes completing? Measures the combined failure rate across declined, voided, and expired transactions.

```
failRate = pctDeclined + pctVoided + pctExpired
```

| Failure Rate | Status | Label |
|-------------|--------|-------|
| < 5% | Green | Healthy |
| 5% – 14% | Yellow | Moderate Issues |
| >= 15% | Red | High Failure Rate |
| No completion data | Gray | No Data |

**What to investigate:** High failure rates often point to signer experience issues — confusing workflows, wrong email addresses, or overly complex signing processes.

---

### 8. Product Breadth

How many Docusign products is the account actively using vs. how many are available?

| Active Products | Status | Label |
|----------------|--------|-------|
| >= 5 | Green | Broad Adoption |
| 2 – 4 | Yellow | Moderate |
| 1 | Red | Single Product |

**Whitespace signal:** Single-product accounts have the most expansion potential but are also least sticky. Multi-product customers are significantly harder to displace.

---

### 9. Renewal Proximity

How much time remains until the contract renewal date?

| Months Left | Status | Label |
|------------|--------|-------|
| <= 3 | Red | Imminent |
| 4 – 6 | Yellow | Approaching |
| > 6 | Green | Runway |
| No renewal date | Gray | No Data |

**Action triggers:**
- **Red (Imminent):** Renewal conversation should already be active.
- **Yellow (Approaching):** Time to begin renewal planning and build the expansion case.
- **Green (Runway):** Focus on building value and identifying expansion opportunities.

---

### 10. Charge Model

This is a **contextual indicator**, not a health score. It tells you which metrics matter most for this account.

| Model | Label | What to prioritize |
|-------|-------|-------------------|
| Seat-based | Seat-Based | Focus on Seat Activation (#4) and Seat Growth (#5) |
| Envelope-based | Envelope-Based | Focus on Consumption Pacing (#1) and Send Velocity (#3) |

---

## Single-Account Presentation

For a single Docusign account, the health section renders a **full scorecard table** with all 10 indicators:

| Indicator | Status | Assessment |
|-----------|--------|------------|
| Consumption Pacing | On Track | Consumption at 72% vs 68% through term (1.06x ratio). |
| Usage Trend | On Track | On Track. |
| Send Velocity (MoM) | Flat | Send volume changed 3% month-over-month. Stable but not growing. |
| ... | ... | ... |

Each row is color-coded using the traffic-light system. The Status column shows the label text on the corresponding background color (green, yellow, red, or gray).

### Overall Assessment

Below the scorecard, a narrative summary is generated:

1. **Summary line:** Count of indicators by status — e.g., *"6 healthy, 2 watch, 1 concern, 1 no data — out of 10 indicators evaluated."*

2. **Charge model context:** Calls out which metrics to prioritize based on whether the account is seat-based or envelope-based.

3. **Red flag callouts:** Every red indicator is listed with its full detail text so the reader immediately sees what needs attention.

4. **Growth opportunity:** If Product Breadth is not green, highlights the number of unadopted products and the current ACV to frame the expansion case.

5. **Retention risk:** If Integration Depth is red (zero integrations), explicitly recommends prioritizing Salesforce or API integration to increase switching cost.

---

## Multi-Account (GTM Group) Presentation

When multiple Docusign accounts are linked under the same GTM Group (e.g., a parent company with separate regional or divisional accounts), the health section uses a different presentation optimized for comparison.

### How GTM Groups Work

The bookscrub data links accounts via the `GTM_GROUP` field. When a company name resolves to a GTM Group, all member accounts are loaded and analyzed individually. The research doc covers the group as a single entity, but the health section scores each account separately.

### Health Summary Table

Instead of a full 10-indicator scorecard, the multi-account view renders a **compact summary table**:

| Account | Healthy | Watch | Concern | Status |
|---------|---------|-------|---------|--------|
| Acme Corp (US) | 6 | 2 | 1 | At Risk |
| Acme Corp (EMEA) | 7 | 3 | 0 | Watch |
| Acme Corp (APAC) | 8 | 1 | 0 | Watch |

**Column definitions:**

- **Account:** The account name from the bookscrub identity data.
- **Healthy / Watch / Concern:** Count of indicators that scored green, yellow, or red respectively. Gray (no data) indicators are excluded from these counts.
- **Status:** A single rollup label for the account:

| Condition | Status Label |
|-----------|-------------|
| Any red indicators | **At Risk** |
| No red, but any yellow | **Watch** |
| All green (no red or yellow) | **Healthy** |

The Status column is color-coded: At Risk on red background, Watch on yellow, Healthy on green.

### What's Different from Single-Account

| Aspect | Single Account | Multi-Account (GTM Group) |
|--------|---------------|--------------------------|
| **Scorecard** | Full 10-row table with indicator names, status labels, and detail text | Compact summary — one row per account with indicator counts |
| **Overall Assessment** | Narrative with red-flag callouts, growth opportunities, retention risk | Not shown — the summary table replaces it |
| **Indicator detail** | Every indicator's assessment text is visible | Only the count of green/yellow/red per account |
| **Scoring** | `analyzeAccountHealth()` runs once against the single account's data | `analyzeAccountHealth()` runs independently for each member account |

### How Each Account Is Scored

Each account in the GTM Group is scored using exactly the same 10 indicators and thresholds as a single account. The system:

1. Iterates over each member account in the group
2. Runs `analyzeAccountHealth()` against that account's individual data (not the aggregated group data)
3. Counts how many of the 10 indicators scored green, yellow, or red
4. Assigns the rollup status (At Risk / Watch / Healthy)

This means the contract term, consumption pacing, seat activation, and all other metrics reflect each account's specific situation — not a blended average across the group.

### Why No Full Scorecard for Groups

The multi-account view intentionally omits the per-indicator detail to keep the section scannable. A GTM Group with 5 accounts would produce 50 indicator rows — too dense for a research doc that's meant to be read quickly. The compact table gives an at-a-glance comparison and flags which accounts need attention. Reps can then dive into individual account data for specifics.

---

## Data Source

All health score inputs come from the internal Docusign Book of Business spreadsheet, extracted by the `DataExtractor.gs` module. No external APIs or LLM calls are used. The health section is the only section of the research doc that is entirely AI-free.

### Key Bookscrub Fields Used

| Indicator | Bookscrub Fields |
|-----------|-----------------|
| Consumption Pacing | `ENVELOPES_SENT`, `ENVELOPES_PURCHASED`, `PERCENTAGE_TERM_COMPLETED` |
| Usage Trend | `USAGE_TREND` |
| Send Velocity | `SEND_VELOCITY_MOM` |
| Seat Activation | `SEATS_PURCHASED`, `ACTIVE_SEATS`, `PERCENTAGE_SVA` |
| Seat Growth | `ACTIVE_SEATS_MOM` |
| Integration Depth | `ENVELOPES_VIA_SALESFORCE`, `ENVELOPES_VIA_WORKDAY`, `ENVELOPES_VIA_SAP`, `CUSTOM_API_SENT`, `COUNT_POWERFORM_SENT`, `COUNT_BULKSEND_SENT` |
| Transaction Health | `ENVELOPES_COMPLETED_RATE`, `PERCENT_DECLINED`, `PERCENT_VOIDED`, `PERCENT_EXPIRED` |
| Product Breadth | Derived from product signal matching (15 products + 4 bundles) |
| Renewal Proximity | `MONTHS_LEFT`, `TERM_END_FYQ` |
| Charge Model | `CHARGE_MODEL` |
