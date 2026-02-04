# Call 3: Agreement Landscape

**Function:** `researchAgreementLandscape(companyName, industry, accountProfile, businessMap)` in `Researcher.gs`
**Depends on:** Call 1 (business units, financials, employee count), Call 2 (departments)
**Fallback:** If both attempts fail, falls back to `generateFallbackAgreementLandscape()` in `DataExtractor.gs`

---

## System Prompt

You are an expert in enterprise contract management and agreement workflows. Use current web data via Bing to research the company. For every claim that uses a specific fact, figure, or quote, include the source URL in the sources array. Return your response as valid JSON only. No markdown, no extra text. Do NOT include citation markers like [...source] in text.

---

## User Prompt

For "{{companyName}}" in the "{{industry}}" industry, identify the top 20 agreement types across all business units and departments.
{{if accountProfile.businessUnits}}
Business units: {{bu names joined by ", "}}
{{/if}}
{{if businessMap.nodes with level=department}}
Key departments: {{department names joined by ", "}}
{{/if}}
{{if accountProfile.financials}}
Company financials: Revenue {{financials.revenue}}, Employees {{employeeCount.total}}
{{/if}}

Return a JSON object with exactly this structure:
```json
{
  "agreements": [
    {
      "number": 1,
      "agreementType": "Name of the agreement type",
      "category": "Internal|External",
      "primaryBusinessUnit": "Which BU primarily uses this",
      "volume": 7,
      "complexity": 8,
      "contractType": "Negotiated|Non-negotiated|Form-based|Regulatory",
      "description": "Brief description of this agreement type and its business purpose"
    }
  ],
  "sources": [
    { "title": "Page or document title", "url": "https://..." }
  ]
}
```

Rules:
- Provide exactly 20 agreement types, numbered 1-20
- volume: scale 1-10, how many of this agreement type are executed annually
- complexity: scale 1-10, how complex the negotiation/management process is
- Sort by combined score (volume + complexity) descending
- category: "Internal" for employee/inter-company agreements, "External" for customer/vendor/partner
- contractType: "Negotiated" (custom terms), "Non-negotiated" (standard/click), "Form-based" (templates), "Regulatory" (compliance-driven)
- Include a mix of internal and external agreements across multiple BUs

---

## Simplified Retry (if first attempt fails)

For "{{companyName}}" in the "{{industry}}" industry, list 15 agreement types the company likely manages.

Return JSON: { "agreements": [{ "number": 1, "agreementType": "...", "category": "Internal|External", "primaryBusinessUnit": "...", "volume": 5, "complexity": 5, "contractType": "Negotiated|Non-negotiated|Form-based|Regulatory", "description": "..." }], "sources": [{ "title": "...", "url": "https://..." }] }

volume and complexity are 1-10 scales. Number them 1-15. Return ONLY valid JSON.
