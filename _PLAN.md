# Account Research — Output & Pipeline Update

## Milestone: "Output & Pipeline Update"

### 1. Two-Doc Output (Brief + Full Report)
- [x] Create `_buildBriefDoc()` in DocGenerator.gs — builds only the 6 primary sections
- [x] Modify `_buildResearchDoc()` to produce both docs and add cross-reference links
- [x] Update `generateAccountResearchDoc()` to return brief URL (backward compat)
- [x] Update `generateAccountResearchDocFromGlean()` to return brief URL
- [x] Update `logToStatusSheet()` for 6-column layout (BRIEF_URL + FULL_URL)
- [x] Update BatchRunner.gs column constants and batch processing
- [x] Update all picker dialogs (company, GTM, Glean, prospect) to show both links
- [x] Update GameServer.gs + Game.html to show both doc links
- [x] Add cross-reference "View Full Report →" / "View Account Brief →" links in each doc
- [ ] Deploy and test with a real account

### 2. Deploy Glean Pipeline to Genius Bar
- [x] Make Glean the default pipeline — top menu items route to Glean
- [x] Move INFRA pickers to [Legacy] section in menu
- [x] Update prospect dialog to use Glean pipeline
- [x] Update GameServer.gs to route through Glean (triggerGleanReport)
- [x] Remove "Glean Agent" badge from pickers (now default)
- [ ] Test with a few accounts to verify Glean web search quality

### 3. Investigate Weekly Data Updates
- [x] Research Snowflake → Sheets automation options
- [x] Write spec: `_docs/specs/weekly-data-update.md`
- [ ] Get answers to open questions (Snowflake query, auth, Workspace plan)

### 4. Portal Integration Planning
- [x] Write spec: `_docs/specs/portal-integration.md`
- [ ] Review with team and answer open questions
