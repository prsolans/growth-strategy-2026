# Account Health Analysis — Scoring Methodology

The Account Health Analysis section uses **deterministic, rule-based scoring** applied to internal Docusign account metrics. No AI or LLM estimation is involved. Every indicator is computed from Book of Business data and rendered as a traffic-light scorecard.

## Traffic-Light System

Each indicator is assigned one of four statuses:

| Status | Color | Meaning |
|--------|-------|---------|
| Green | `#E6F4EA` bg / `#1E8E3E` text | Healthy — no action needed |
| Yellow | `#FFF8E1` bg / `#F9AB00` text | Watch — monitor or investigate |
| Red | `#FCE8E6` bg / `#D93025` text | Concern — action recommended |
| Gray | `#F5F5F5` bg / `#757575` text | No Data — metric unavailable |

---

## Indicators (10 total)

### 1. Consumption Pacing

Measures whether envelope usage is keeping pace with the contract term.

**Input fields:** `envelopesSent`, `envelopesPurchased`, `percentComplete` (contract term %)

**Formula:**
```
consumptionPct = envelopesSent / envelopesPurchased × 100
pacingRatio    = consumptionPct / termPercentComplete
```

| Pacing Ratio | Status | Label |
|-------------|--------|-------|
| >= 0.9 | Green | On Track |
| 0.6 – 0.89 | Yellow | Slightly Behind |
| < 0.6 | Red | Significantly Behind |
| No data | Gray | No Data |

**Example:** 45% of envelopes consumed at 50% through term → ratio 0.90 → Green.

---

### 2. Usage Trend

Directional indicator from the Book of Business usage trend field.

**Input field:** `usageTrend` (string)

| Trend contains | Status | Label |
|---------------|--------|-------|
| "over" | Green | Over Trending |
| "on" or "track" | Green | On Track |
| "under" | Red | Under Trending |
| Anything else / empty | Gray | No Data |

---

### 3. Send Velocity (MoM)

Month-over-month change in envelope send volume.

**Input field:** `sendVelocityMom` (percentage)

| MoM Change | Status | Label |
|-----------|--------|-------|
| > +10% | Green | Accelerating |
| -10% to +10% | Yellow | Flat |
| < -10% | Red | Decelerating |
| null / 0 | Gray | No Data |

---

### 4. Seat Activation

Percentage of purchased seats that are actively used.

**Input fields:** `seats.purchased`, `seats.active`, `seats.activationRate`

| Activation Rate | Status | Label |
|----------------|--------|-------|
| >= 70% | Green | Healthy |
| 30% – 69% | Yellow | Moderate |
| < 30% | Red | Low |
| Active seats but no purchased limit | Yellow | Unmetered |
| No seat data | Gray | No Data |

**Shelfware risk:** Red status flags significant shelfware — purchased seats that aren't being used.

---

### 5. Seat Growth (MoM)

Month-over-month change in active seat count.

**Input field:** `seats.activeSeatsMom` (percentage)

| MoM Change | Status | Label |
|-----------|--------|-------|
| > 0% | Green | Growing |
| -5% to 0% | Yellow | Stable |
| < -5% | Red | Contracting |
| null / 0 | Gray | No Data |

---

### 6. Integration Depth

Number of detected integrations (Salesforce, API, etc.) as a proxy for platform stickiness.

**Input fields:** `integrations.count`, `integrations.pctCustomApi`

| Integration Count | Status | Label |
|------------------|--------|-------|
| >= 3 | Green | Deeply Embedded |
| 1 – 2 | Yellow | Moderate |
| 0 | Red | Low Stickiness |

**Switching cost signal:** Accounts with 3+ integrations have high switching costs and are strong retention candidates. Zero integrations (web-app-only usage) means the account is easily replaceable.

---

### 7. Transaction Health

Completion rate and failure rate across all envelope transactions.

**Input fields:** `consumption.completedRate`, `consumption.pctDeclined`, `consumption.pctVoided`, `consumption.pctExpired`

**Formula:**
```
failPct = pctDeclined + pctVoided + pctExpired
```

| Failure Rate | Status | Label |
|-------------|--------|-------|
| < 5% | Green | Healthy |
| 5% – 14% | Yellow | Moderate Issues |
| >= 15% | Red | High Failure Rate |
| No completion data | Gray | No Data |

---

### 8. Product Breadth

Count of active Docusign products vs. total available products on the account.

**Input fields:** `activeProducts.length`, `inactiveProducts.length`

| Active Products | Status | Label |
|----------------|--------|-------|
| >= 5 | Green | Broad Adoption |
| 2 – 4 | Yellow | Moderate |
| 1 | Red | Single Product |

**Whitespace signal:** Accounts on a single product have the most expansion potential but are also least sticky.

---

### 9. Renewal Proximity

Months remaining until contract renewal.

**Input fields:** `contract.monthsLeft`, `contract.termEndFyq`

| Months Left | Status | Label |
|------------|--------|-------|
| <= 3 | Red | Imminent |
| 4 – 6 | Yellow | Approaching |
| > 6 | Green | Runway |
| No renewal date | Gray | No Data |

---

### 10. Charge Model

Contextual indicator — not a health score per se, but flags which metrics matter most.

**Input field:** `contract.chargeModel`

| Model | Status | Label | Implication |
|-------|--------|-------|-------------|
| SEAT | Yellow | Seat-Based | Seat activation and growth are primary health metrics |
| Other | Yellow | Envelope-Based | Consumption pacing is the primary health metric |

---

## Overall Assessment

After computing all 10 indicators, the section generates:

1. **Summary counts:** e.g., "6 healthy, 2 watch, 1 concern, 1 no data — out of 10 indicators evaluated"
2. **Charge model context:** Which metrics to prioritize based on the billing model
3. **Red flag narrative:** Each red indicator is called out with its detail text
4. **Growth opportunity:** If product breadth is not green, highlights the number of unadopted products and the current ACV
5. **Retention risk:** If integration depth is red, recommends prioritizing integration to increase switching cost

## Data Source

All input data comes from the internal Docusign Book of Business spreadsheet, extracted by `DataExtractor.gs` via the `getCompanyData()` function. No external APIs or LLM calls are used in this section.
