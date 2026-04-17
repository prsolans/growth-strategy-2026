# Account Research — Current Plan

## In Progress

### Dashboard Redesign: Value Selling Command Center (High)
- [x] Phase A: GVS Results Caching — write gvs-results.json to AR Drive cache from GVS
- [x] Phase A: Add getGVSResults() reader + integrate into getDashboardData() payload
- [x] Phase A: Add checkCachedAccounts() for similar customer cross-linking
- [x] Phase B: Redesign header with urgency signals (Health, Renewal, Pacing, Products, ACV)
- [x] Phase B: Move actions (View Brief, View Report, Launch GVS) to header button group
- [x] Phase B: Restructure layout into 3-layer design (Value Story → Intelligence → Account Context)
- [x] Phase B: Build Value Narrative panel (dual-mode: GVS headlines vs exec summary fallback)
- [x] Phase B: Build Value Case panel (promoted from sidebar, hero stats + value drivers)
- [x] Phase B: Redesign Contract & Renewal panel with timeline bar
- [x] Phase B: Enhance Similar Customers with source links + Command Center cross-links
- [x] Phase B: Smart collapse defaults (Layer 2 collapsed when Layer 1 has GVS data)
- [x] Phase B: Update Glean prompts — Branch 6 (sources, conversationStarter) + Branch 7 (trigger flag, context)
- [x] Deploy and verify with test account (GVS-cached + non-cached + empty)
- [ ] Set INTELLIGENCE_CACHE_FOLDER_ID in GVS script properties (same value as AR project)
- [x] Split Dashboard.html into CSS/JS includes (DashboardCSS.html + DashboardJS.html)

### PRS-244: Fix Slack project Drive/Doc OAuth scopes for cache writes (High)
- [ ] Diagnose and fix OAuth scope issues preventing cache writes from Slack-triggered runs

### PRS-222: Validate GVS calculations using PIM editor (Medium)
- [ ] Cross-check GVS calculation outputs against PIM editor values

### PRS-158: Build vision deck for mid-April tease (Urgent)
- [ ] Complete vision deck for stakeholder preview

## Todo

### PRS-207: Create gb-shared library with ROI calculation engine (Urgent)
- [ ] Design and build shared library with ROI calculation logic
- [ ] Wire into dependent projects (PRS-219, PRS-220)

### PRS-212: Add ROI calculation validator to gb-admin (High)
- [ ] Build validation UI/tool in gb-admin for ROI calculations

## Backlog (High Priority)

### PRS-233: Tune health score thresholds to reduce false "At Risk" (High)
- [ ] Analyze current threshold behavior and adjust to reduce false positives

### PRS-232: Surface red/yellow indicator names in GTM group summary (High)
- [ ] Show which specific indicators triggered red/yellow in the GTM summary view

### PRS-223: Plan comms and deployment for mid-May release (High)
- [ ] Draft comms plan, deployment checklist, and rollout strategy

### PRS-221: Regression testing — all consumers (High)
- [ ] Build and run regression tests across all consumer entry points (sheet, Slack, game)

## Backlog (Medium / Low)

- PRS-138: LLM-assisted financial inputs (Medium)
- PRS-139: Improve narrative with outside-in market expertise (Medium)
- PRS-163: Investigate Salesforce + Snowflake data access (Medium)
- PRS-161: GVS reads L2 cache for Smart Start (Medium)
- PRS-162: Deep-link to GVS from GBIS dashboard (Medium)
- PRS-194: Persist runtime customization to backend (Medium)
- PRS-227: Investigate weekly bookscrub data refresh (Medium)
- PRS-235: Develop beta tester feedback plan (Medium)
- PRS-216: Add LLM, Glean, Brand, and Product Catalog to gb-shared (Medium)
- PRS-219: Wire GVS to gb-shared library (Medium)
- PRS-220: Wire growth-strategy to gb-shared library (Medium)
- PRS-210: Publish gb-shared v1 (Urgent — blocked on PRS-207)
- PRS-206: Explore AR conversational agent (Medium)
- PRS-159: Identify executive sponsor and ownership model (High)
- PRS-234: Remove Glean-powered badge from picker dialogs (Low)
- PRS-243: Review dashboard gap analysis — AE perspective (Low)
- PRS-242: Review AE Toolkit alignment positioning (Low)
- PRS-169: Add Genius Bar branding and cross-tool navigation (Low)
- PRS-112: Deploy Docgen for broad utilization (Low)
