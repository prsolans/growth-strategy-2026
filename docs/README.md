# Growth Strategy Generator

The Growth Strategy Generator is a Google Apps Script tool that produces a comprehensive growth strategy document for any Docusign customer account. It combines internal usage data from a "bookscrub" spreadsheet with LLM-powered web research to deliver a ready-to-use Google Doc containing account intelligence, product recommendations, and an action plan for the account team.

## How to Run

1. Open the Google Sheet containing the bookscrub data.
2. Click **Growth Strategy** in the menu bar.
3. Select **Generate for Company...** to open the company picker dialog.
4. Type a company name to search, select it from the results, and click **Generate Growth Strategy**.
5. The tool processes internal data, runs 5 LLM research calls, and builds a Google Doc. A link to the finished document appears in the dialog when complete.

## What the Output Document Contains

The generated Google Doc includes 9 sections:

| # | Section | What It Covers |
|---|---------|---------------|
| 1 | Company Profile | Overview, business units, key metrics (customers, employees, financials) |
| 2 | Business Performance & Strategy | Three-year trend, strategic initiatives, SWOT analysis |
| 3 | Executive Contacts & Technology | Key executives to engage, technology stack, systems integrators |
| 4 | Business Map | Organizational hierarchy (BU > Department > Function) with agreement intensity |
| 5 | Docusign Footprint | Current products, contract details, consumption, seats, integrations |
| 6 | Account Health Analysis | 10-indicator health scorecard with green/yellow/red ratings |
| 7 | Agreement Landscape | Top 20 agreement types scored by volume and complexity |
| 8 | Contract Commerce Estimate | Commerce flowing through agreements by department and type |
| 9 | Priority Map | Company priorities mapped to Docusign capabilities, expansion opportunities, action plan |

A **Sources** section at the end lists all web sources cited during LLM research.

## Data Sources

- **Bookscrub sheet** -- The sole internal data source. Contains account, usage, product, and financial data for each customer. See [Data Dictionary](data-dictionary.md) for full details.
- **LLM web research** -- An internal LLM endpoint with Bing grounding performs live web research to fill in company intelligence (profile, org structure, agreements, financials).

## Further Documentation

| Document | Description |
|----------|-------------|
| [Signal Matching](signal-matching.md) | How the tool matches customer data to Docusign product recommendations -- standalone, shareable with stakeholders |
| [Data Dictionary](data-dictionary.md) | Every bookscrub field the tool accesses, what it tells us, and how it is used |
| [Architecture](architecture.md) | Technical reference: execution flow, file roles, LLM pipeline, error handling |
