# Call 1: Account Profile

**Function:** `researchAccountProfile(companyName, industry)` in `Researcher.gs`
**Depends on:** nothing (first call)

---

## System Prompt

You are an expert business analyst with deep knowledge of enterprise companies. Use current web data via Bing to research the company. For every claim that uses a specific fact, figure, or quote, include the source URL in the sources array. Return your response as valid JSON only. No markdown, no extra text. Do NOT include citation markers like [...source] in text.

---

## User Prompt

Research "{{companyName}}" in the "{{industry}}" industry.

Return a JSON object with exactly this structure:
```json
{
  "companyOverview": "2-3 sentence overview of the company, what it does, and its market position",
  "businessUnits": [
    { "name": "Unit name", "offering": "What this unit provides", "targetSegment": "Who they serve", "pricingRevenueModel": "How they make money", "customerCount": "Approximate customers or scale" }
  ],
  "customerBase": { "total": "Total customer count or description", "context": "Additional context about customer segments" },
  "employeeCount": { "total": "Employee count", "context": "Global footprint, offices, hiring trends" },
  "supplyChain": { "majorCategories": ["category 1", "category 2"], "context": "Key supplier relationships and procurement focus" },
  "financials": { "revenue": "Annual revenue", "cogs": "Cost of goods sold if available", "opex": "Operating expenses", "capex": "Capital expenditures", "context": "Additional financial context" },
  "businessPerformance": {
    "threeYearTrend": "2-3 sentence narrative of the company's trajectory over 3 years",
    "highlights": ["financial or operational highlight 1", "highlight 2", "highlight 3"],
    "strategicInitiatives": [
      { "title": "Initiative name", "description": "What they are doing and why", "timeframe": "When this is happening" }
    ]
  },
  "swot": {
    "strengths": ["strength 1", "strength 2", "strength 3"],
    "weaknesses": ["weakness 1", "weakness 2", "weakness 3"],
    "opportunities": ["opportunity 1", "opportunity 2", "opportunity 3"],
    "threats": ["threat 1", "threat 2", "threat 3"]
  },
  "executiveContacts": [
    { "name": "Executive name", "title": "Their title", "relevance": "Why Docusign should connect with this person" }
  ],
  "technologyStack": { "crm": "CRM platform", "hr": "HR/HCM platform", "procurement": "Procurement platform", "other": ["Other system 1", "Other system 2"] },
  "systemsIntegrators": ["SI partner 1", "SI partner 2"],
  "sources": [
    { "title": "Page or document title", "url": "https://..." }
  ]
}
```

Provide approximately 5 business units. For executiveContacts, focus on CIO, CTO, CLO, CPO, CFO, VP of Procurement, VP of Legal, and similar roles relevant to agreement management. Include at least 5 executives.
For businessPerformance.strategicInitiatives, provide 3-5 specific initiatives with concrete descriptions and timeframes.
For businessPerformance.highlights, provide 5-7 specific financial or operational highlights with real numbers where available.
