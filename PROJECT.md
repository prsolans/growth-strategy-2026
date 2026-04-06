# Account Research — PROJECT.md

## Meta
linear_project: Account Research
staleness_days: 7

## Goal
A Google Apps Script tool that generates comprehensive account research Google Docs for Docusign customer accounts. It reads internal bookscrub usage data, runs 5 sequential LLM research calls, and produces a 9-section strategic document covering company profile, business map, agreement landscape, contract commerce estimates, and a priority action plan. The tool is designed for on-demand use by sales reps via the existing Genius Bar infrastructure.

## Current milestone
**Genius Bar Rollout** — due 2026-04-03
- In scope:
  - Genius Bar integration live for on-demand report generation (OpenAI pipeline)
  - Confirm trigger, status updates, and Drive link delivery with Angel
- Done when: A rep can trigger a report from GB and receive a working link with no engineering involvement

## Success metrics
- Report triggered from Genius Bar completes without errors
- Rep receives correct Drive link and status updates
- No manual intervention required

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
1. Data collection & company name normalization — ✅ Done (PRS-44)
2. Batch report generation (200 companies) — ✅ Done (PRS-38)
3. Genius Bar integration (on-demand via OpenAI pipeline) — 🔴 PRS-45, due TODAY
4. Glean investigation — ongoing, not blocking rollout (PRS-118)

## Strategy note (2026-04-03)
Reverting to the OpenAI pipeline as the primary output — this is what was approved, delivered for the first 300 accounts, and what stakeholders are happy with. Genius Bar integration goes live on this path first.

Glean integration continues as a parallel investigation track (quality and speed issues need more time to resolve properly) but is not a dependency for rollout.

## Current focus
**PRS-45 (Genius Bar integration) — due today.** Coordinate with Angel to confirm:
1. Trigger mechanism from GB is wired correctly
2. Status updates during generation are delivered to the right place
3. Drive link is returned to the rep on completion

## Open questions
- **Gong API access**: Is there an internal Gong integration available for tooling? What access level would be needed to pull call data per account? (See PRS-50)
- **100 Handshakes**: API-driven org chart enrichment opportunity. (See PRS-102)
