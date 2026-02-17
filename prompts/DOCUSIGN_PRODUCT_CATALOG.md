# Docusign Product Catalog

Reference document for mapping customer needs to Docusign solutions. Use this catalog to identify expansion opportunities, recommend bundles, and evaluate product signal strength against customer usage data.

---

## Bundles

### IAM Core (Standard / Professional / Enterprise)

Foundation IAM platform for agreement workflows.

**Includes:** eSignature, Maestro, Web Forms, Agreement Prep, Navigator, App Center

**Problems it solves:**
- Manual agreement processes
- Lack of workflow automation
- Disconnected agreement data

**Upgrade signals (from usage data):**
- High envelope volume with no automation
- Multiple integrations but no orchestration
- Webapp-heavy usage (most sends via web app rather than API/automation)

---

### IAM for Sales

Agreement workflows embedded in CRM for sales teams.

**Includes:** eSignature, Maestro, Web Forms, Agreement Prep, Navigator, App Center, CRM Integration

**Problems it solves:**
- Slow sales cycles
- Manual proposal/quote generation
- Disconnected CRM and agreement data

**Upgrade signals (from usage data):**
- Salesforce integration active
- High webapp sends from sales teams
- DocGen (Agreement Prep) not active

---

### IAM for CX

Customer-facing agreement experiences.

**Includes:** eSignature, Maestro, Web Forms, Agreement Prep, Navigator, App Center

**Problems it solves:**
- Poor customer onboarding experience
- High decline/expire rates on agreements
- Manual customer-facing processes

**Upgrade signals (from usage data):**
- High decline rates
- Mobile signing activity
- Customer-facing industry (Financial Services, Insurance, Healthcare, Retail)

---

### CLM (Contract Lifecycle Management)

Full contract lifecycle management for complex agreements.

**Includes:** Contract authoring, Negotiation, Repository, Obligation tracking

**Problems it solves:**
- Unmanaged contract risk
- Manual negotiation workflows
- No central agreement repository

**Upgrade signals (from usage data):**
- High ACV without CLM
- High-complexity agreements in the agreement landscape
- Regulated industry (Financial Services, Healthcare, Government, Energy)

---

## Components

### Navigator

AI-powered agreement repository — search, extract clauses/dates/obligations, report on agreement portfolio.

**Problems it solves:** No visibility into existing agreements, manual clause extraction, missed obligations and renewals.

**Signal evaluation:**
- Strong: Envelopes sent > 20,000 OR (CLM active AND Navigator not active)
- Moderate: Envelopes sent > 5,000

---

### Maestro

No-code workflow builder for pre- and post-signature agreement processes.

**Problems it solves:** Manual multi-step processes, disconnected pre/post-signature workflows, no conditional routing.

**Signal evaluation:**
- Strong: Custom API usage > 50% OR automation sends > webapp sends OR (no workflows AND 2+ integrations)
- Moderate: 1+ integrations OR 1,000+ annual sends

---

### Agreement Desk (Limited Availability)

Intake, collaboration, and AI-assisted review for negotiated agreements.

**Problems it solves:** Slow contract negotiation, no collaboration on agreements, manual redlining.

**Signal evaluation:**
- Strong: CLM active AND high-complexity agreements in landscape
- Moderate: Regulated or legal-heavy industry

---

### Web Forms

Structured digital intake forms that pre-fill agreements and trigger workflows.

**Problems it solves:** Manual data collection, errors from re-keying data, no structured intake process.

**Signal evaluation:**
- Strong: PowerForms > 100 OR webapp sends > automation sends
- Moderate: Webapp sends > 0

---

### Agreement Prep (DocGen)

Generate agreements from templates using data from CRM, forms, or other sources.

**Problems it solves:** Manual document creation, inconsistent agreement formatting, slow proposal generation.

**Signal evaluation:**
- Strong: DocGen not active AND (envelopes sent > 5,000 OR Salesforce integration active)
- Moderate: Envelopes sent > 1,000

---

### eSignature

Core electronic signature — send, sign, and manage agreements digitally.

**Problems it solves:** Paper-based signing, slow agreement turnaround, no audit trail.

**Note:** Base product — all accounts have this. Focus on usage optimization rather than new adoption.

---

### ID Verification (IDV)

Verify signer identity via photo IDs, passports, eIDs, or liveness checks.

**Problems it solves:** Signer identity fraud risk, compliance requirements for identity verification, high-value agreement security.

**Signal evaluation:**
- Strong: IDV not active AND regulated industry (Finance, Healthcare, Insurance, Government)
- Moderate: Declined rate > 5% OR voided rate > 5%

---

### App Center

Pre-built integrations with 900+ business applications.

**Problems it solves:** Disconnected business systems, manual data transfer between apps, no integration without custom development.

**Signal evaluation:**
- Strong: Zero integrations AND envelopes sent > 1,000
- Moderate: Fewer than 3 integrations

---

### Monitor

Admin visibility into account activity, API usage, and security events.

**Problems it solves:** No admin oversight, security blind spots, compliance audit gaps.

**Signal evaluation:**
- Strong: 50+ active seats OR 5+ admin seats
- Moderate: 2+ integrations

---

### Clickwraps

Click-to-agree for standard terms, privacy policies, and disclosures.

**Problems it solves:** No audit trail for terms acceptance, manual terms management, compliance gaps on standard agreements.

**Signal evaluation:**
- Strong: Clickwraps not active AND (webapp sends > 1,000 OR ecommerce/SaaS industry)
- Moderate: Clickwraps not active

---

### Multi-Channel Delivery

Deliver agreements via SMS, WhatsApp, and other channels beyond email.

**Problems it solves:** Low signer response rates, email-only delivery limitations, reaching mobile-first audiences.

**Signal evaluation:**
- Strong: Multi-Channel not active AND envelopes sent > 5,000
- Moderate: International presence or field workforce

---

### SMS Delivery

Send signing notifications and links via SMS.

**Problems it solves:** Low email open rates, reaching signers without reliable email, faster signing turnaround.

**Signal evaluation:**
- Strong: SMS Delivery not active AND (mobile signs > 0 OR field-heavy industry)
- Moderate: Envelopes sent > 1,000

---

### SMS Authentication

Two-factor authentication via SMS for signer verification.

**Problems it solves:** Weak signer authentication, compliance requirements for 2FA, identity verification gaps.

**Signal evaluation:**
- Strong: SMS Auth not active AND regulated industry
- Moderate: SMS Auth not active AND envelopes sent > 1,000

---

### Phone Authentication

Voice-based signer verification via phone call.

**Problems it solves:** Need for voice-based identity verification, high-security agreement signing.

**Signal evaluation:**
- Strong: Phone Auth not active AND (Finance OR Insurance OR Government industry)
- Moderate: Phone Auth not active

---

### SAML/SSO

Single sign-on and user provisioning via SAML, SCIM, and organizational controls.

**Problems it solves:** Manual user provisioning, no centralized access control, security compliance gaps.

**Signal evaluation:**
- Strong: SAML not active AND 20+ active seats
- Moderate: SAML not active AND 5+ active seats
