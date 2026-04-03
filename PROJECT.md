# Account Research — PROJECT.md

## Meta
linear_project: Account Research
staleness_days: 7

## Goal
A Google Apps Script tool that generates comprehensive account research Google Docs for Docusign customer accounts. It reads internal bookscrub usage data, runs 5 sequential LLM research calls, and produces a 9-section strategic document covering company profile, business map, agreement landscape, contract commerce estimates, and a priority action plan. The tool is designed for on-demand use by sales reps via the existing Genius Bar infrastructure.

## Current milestone
**Outputs Delivered** — no hard date yet
- In scope:
  - Collect bookscrub data for 200 additional companies
  - Transform/normalize company names
  - Run and deliver reports for all target companies
- Done when: All reports successfully generated and delivered without manual intervention

## Success metrics
- 200 additional companies have clean, normalized names in the bookscrub
- Reports successfully generated for all target companies without errors
- Batch runner completes unattended without manual intervention

## Stakeholders
- Craig Doud — Final reviewer
- Angel Arbeteta Hernandez — Technical collaborator
- Adam Meyers — Content review collaborator

## Feature shape (per phase)
A complete phase requires:
- [ ] A Linear issue exists for this phase
- [ ] Inputs and outputs are defined in the issue description
- [ ] Blocker relationship to the next phase is set in Linear
- [ ] Acceptance criteria are specific and verifiable

Current phases (in order):
1. Data collection & company name normalization — ✅ Done (PRS-44 closed)
2. Batch report generation (200 companies) — ✅ Done (PRS-38 closed)
3. Genius Bar integration (on-demand generation via sales infrastructure) — PRS-45, In Progress
4. Platform optimization / Glean — PRS-108 (test full report flow in Glean)

## Current focus
PRS-107 (GTM_GROUP-based report generation) is the active priority — due 2026-03-30. PRS-110 (add new accounts) and PRS-45 (Genius Bar integration) are both blocked on PRS-107 completing.

PRS-45 is in progress for individual company and prospect reports. Final acceptance requires GTM_GROUP support (PRS-107) and confirmed writeback of report URL to the bookscrub spreadsheet.

## Open questions
- **Gong API access**: Is there an internal Gong integration available for tooling? What access level would be needed to pull call data per account? (See PRS-50)
- **100 Handshakes**: API-driven org chart enrichment opportunity. (See PRS-102)
