# Signal Matching Reference

## How Recommendations Work

The Growth Strategy Generator includes a deterministic signal-matching engine that evaluates a customer's internal usage data against every product in the Docusign catalog. This step runs entirely in code -- it is not LLM-generated or guessed. Each product is checked against specific data thresholds derived from the bookscrub sheet, and the result is a structured list of recommendations with transparent reasoning.

Signals are assigned one of three strength levels and one of three status values:

| Strength | Meaning |
|----------|---------|
| **Strong** | Multiple data points clearly indicate the product would add value. The customer's usage patterns closely match the product's target use case. |
| **Moderate** | Some data points suggest potential fit. Worth exploring but needs validation against the customer's actual business needs. |
| **Exploratory** | No strong data signal, but industry or segment patterns suggest relevance. Requires a discovery conversation. |

| Status | Meaning |
|--------|---------|
| **recommended** | Product is NOT currently active and signals suggest fit |
| **in_use** | Product IS currently active (no recommendation needed) |
| **not_relevant** | No meaningful signals detected |

---

## Component-Level Signals

The engine evaluates 15 individual Docusign products. The table below shows what triggers a strong or moderate recommendation for each, and which bookscrub fields drive the evaluation.

| Product | Strong Signal | Moderate Signal | Key Data Fields |
|---------|--------------|-----------------|-----------------|
| **Navigator** | Envelopes sent > 20,000 OR CLM active without Navigator | Envelopes sent > 5,000 | `ENVELOPES_SENT`, `IS_CLM_ACCOUNT`, `NAVIGATOR_AGREEMENTS_PURCHASED/USAGE` |
| **Maestro** | Custom API > 50% of sends OR automation sends > webapp sends OR 2+ integrations without workflows | 1+ integration OR 365-day sends > 1,000 | `PERCENT_CUSTOM_API_SENT`, `ANNUAL_AUTOMATION_SENTS`, `ANNUAL_WEBAPP_SENTS`, integration counts, `WORKFLOW_RUNS_PURCHASED/USAGE` |
| **Agreement Desk** | CLM active (moderate only -- no strong signal from data alone) | CLM active OR regulated industry | `IS_CLM_ACCOUNT`, `INDUSTRY` |
| **Web Forms** | PowerForms > 100 OR webapp sends > automation sends | Webapp sends > 0 | `COUNT_POWERFORM_SENT`, `ANNUAL_WEBAPP_SENTS`, `ANNUAL_AUTOMATION_SENTS` |
| **Agreement Prep (DocGen)** | Not using DocGen AND (envelopes sent > 5,000 OR Salesforce integration active) | Envelopes sent > 1,000 | `DOCUMENT_GENERATION_FOR_ESIGNATURE_PURCHASED/USAGE`, `ENVELOPES_SENT`, `ENVELOPES_VIA_SALESFORCE` |
| **eSignature** | Base product -- all accounts have this. Focus is on usage optimization, not recommendation. | -- | -- |
| **ID Verification (IDV)** | Not using IDV AND regulated industry | Declined rate > 5% OR voided rate > 5% | `ID_VERIFICATION_PURCHASED/USAGE`, `ID_VERIFY_GOVID_EID_AUTH_PURCHASED/USAGE`, `ID_CHECK_PURCHASED/USAGE`, `INDUSTRY`, `PERCENT_DECLINED`, `PERCENT_VOIDED` |
| **App Center** | No integrations AND envelopes sent > 1,000 | Fewer than 3 integrations | Integration counts (`ENVELOPES_VIA_SALESFORCE`, `ENVELOPES_VIA_WORKDAY`, `ENVELOPES_VIA_SAP`, `CUSTOM_API_SENT`, `COUNT_POWERFORM_SENT`, `COUNT_BULKSEND_SENT`), `ENVELOPES_SENT` |
| **Monitor** | Active seats > 50 OR admin seats > 5 | 2+ integrations | `ACTIVE_SEATS`, `ADMIN_SEATS`, integration counts |
| **Clickwraps** | Not using Clickwraps AND webapp sends > 1,000 | Not using Clickwraps (any account) | `CLICKWRAPS_PURCHASED/USAGE`, `ANNUAL_WEBAPP_SENTS` |
| **Multi-Channel Delivery** | Not using multi-channel AND envelopes sent > 5,000 | -- | `MULTI_CHANNEL_DELIVERY_PURCHASED/USAGE`, `ENVELOPES_SENT` |
| **SMS Delivery** | Not using SMS delivery AND mobile signs > 0 | Envelopes sent > 1,000 | `SMS_DELIVERY_PURCHASED/USAGE`, `MOBILE_SIGNS`, `ENVELOPES_SENT` |
| **SMS Authentication** | Not using SMS auth AND regulated industry | Envelopes sent > 1,000 | `SMS_AUTH_PURCHASED/USAGE`, `INDUSTRY`, `ENVELOPES_SENT` |
| **Phone Authentication** | Not using phone auth AND regulated industry | Not using phone auth (any account) | `PHONE_AUTH_PURCHASED/USAGE`, `INDUSTRY` |
| **SAML/SSO** | Not using SAML AND active seats > 20 | Not using SAML AND active seats > 5 | `SAML_AUTHENTICATION_PURCH`, `SAML_AUTHENTICATION`, `ACTIVE_SEATS` |

---

## Bundle-Level Signals

After evaluating individual components, the engine checks whether the pattern of recommendations suggests a bundle-level opportunity. Four bundles are evaluated:

| Bundle | Trigger | Strength | Components Included |
|--------|---------|----------|-------------------|
| **IAM Core** | 3+ strong component recommendations | Strong | eSignature, Maestro, Web Forms, Agreement Prep, Navigator, App Center |
| **IAM Core** | 3+ total component recommendations (fewer than 3 strong) | Moderate | Same as above |
| **IAM for Sales** | Salesforce integration active AND (DocGen or Web Forms recommended) | Strong | eSignature, Maestro, Web Forms, Agreement Prep, Navigator, App Center, CRM Integration |
| **IAM for CX** | High decline/expire rates AND mobile signing activity | Strong | eSignature, Maestro, Web Forms, Agreement Prep, Navigator, App Center |
| **IAM for CX** | High decline/expire rates OR mobile signing activity (not both) | Moderate | Same as above |
| **CLM** | ACV > $50,000 AND not using CLM AND envelopes sent > 5,000 | Strong | Contract authoring, Negotiation, Repository, Obligation tracking |
| **CLM** | Regulated industry AND not using CLM | Moderate | Same as above |

---

## Regulated Industry Detection

Certain products receive stronger recommendations when the customer operates in a regulated industry. The tool checks the `INDUSTRY` field (case-insensitive substring match) against these 8 industries:

- Financial Services
- Banking
- Insurance
- Healthcare
- Pharmaceutical
- Government
- Legal
- Energy

Products affected by regulated industry detection:

| Product | Effect |
|---------|--------|
| ID Verification (IDV) | Strong signal if not using IDV |
| SMS Authentication | Strong signal if not using SMS auth |
| Phone Authentication | Strong signal if not using phone auth |
| Agreement Desk | Moderate signal |
| CLM (bundle) | Moderate signal if not using CLM |

---

## How Signals Feed the LLM

Signal matching output is passed to LLM Call 5 (Priority Map synthesis) as pre-qualified context. The signal summary text is injected into the LLM's system prompt under a "PRE-QUALIFIED PRODUCT SIGNALS" heading. This serves three purposes:

1. **Grounding** -- The LLM does not guess which products to recommend. It receives a curated list of recommendations derived from actual usage data and builds its priority map around them.
2. **Filtering** -- Products marked as `in_use` are excluded from new-opportunity recommendations. The LLM is explicitly instructed not to recommend products the customer already has.
3. **Prioritization** -- Strong-signal products are prioritized over moderate ones in the expansion opportunities and action plan sections of the output document.

The LLM adds business context (company strategy, industry trends, department-level opportunities) on top of the signal-matched recommendations, but the product selection itself is data-driven and deterministic.
