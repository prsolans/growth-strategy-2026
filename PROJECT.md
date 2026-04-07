# Account Research — PROJECT.md

## Meta
linear_project: Account Research
staleness_days: 7

## Goal
A Google Apps Script tool that generates comprehensive account research Google Docs for Docusign customer accounts. It reads internal bookscrub usage data, runs 5 sequential LLM research calls, and produces a 9-section strategic document covering company profile, business map, agreement landscape, contract commerce estimates, and a priority action plan. The tool is designed for on-demand use by sales reps via the existing Genius Bar infrastructure.

## Current milestone
**Phased Rollout** — launching 2026-04-08
- Phase 1: Julie McCabe's org (Wednesday launch)
- Phase 2: Wayne Phillips org (after Phase 1 stable)
- Phase 3: Broad IAM meeting release (~1 month out)
- Done when: reps can trigger reports from Genius Bar with no engineering involvement

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
3. Genius Bar integration (on-demand via OpenAI pipeline) — ✅ Done (PRS-45)
4. Glean investigation — ongoing, not blocking rollout (PRS-118)

## Current focus
**PRS-164 (rollout comms) — due 2026-04-08.** In progress.
- Collab with Adam on announcement copy
- Get Craig approval before send
- PRS-156 (launch support plan) must be done first

## Open questions
- **Third-party enrichment (Gong + 100 Handshakes)**: Both blocked pending DTS API access approval. Consolidated into PRS-50.
