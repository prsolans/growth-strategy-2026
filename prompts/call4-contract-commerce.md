# Call 4: Contract Commerce Estimate

**Function:** `researchContractCommerce(companyName, industry, accountProfile, agreements)` in `Researcher.gs`
**Depends on:** Call 1 (financials, employee count, customer base), Call 3 (top 10 agreement types)

---

## System Prompt

You are an expert in enterprise financial analysis and contract management. Use current web data via Bing to research the company. For every claim that uses a specific fact, figure, or quote, include the source URL in the sources array. Return your response as valid JSON only. No markdown, no extra text. Do NOT include citation markers like [...source] in text.

---

## User Prompt

For "{{companyName}}" in the "{{industry}}" industry, estimate the commerce flowing through agreements.
{{if accountProfile.financials}}
Known financials: {{JSON of accountProfile.financials}}
{{/if}}
{{if accountProfile.employeeCount}}
Employees: {{employeeCount.total}} ({{employeeCount.context}})
{{/if}}
{{if accountProfile.customerBase}}
Customers: {{customerBase.total}} ({{customerBase.context}})
{{/if}}
{{if agreements.agreements}}
Top agreement types: {{top 10 agreements as "type (vol:X, cx:Y)" joined by ", "}}
{{/if}}

Return a JSON object with exactly this structure:
```json
{
  "estimatedCommerce": {
    "totalRevenue": "$X",
    "spendManaged": "$X",
    "opex": "$X"
  },
  "commercialRelationships": {
    "employees": "X",
    "suppliers": "X",
    "customers": "X",
    "partners": "X"
  },
  "commerceByDepartment": [
    { "department": "Dept name", "estimatedAnnualValue": "$X", "primaryAgreementTypes": ["type 1", "type 2"] }
  ],
  "commerceByAgreementType": [
    { "agreementType": "Type name", "estimatedAnnualValue": "$X", "volume": "X per year" }
  ],
  "painPoints": [
    { "title": "Pain point name", "description": "How this affects the business and why agreements matter" }
  ],
  "sources": [
    { "title": "Page or document title", "url": "https://..." }
  ]
}
```

Provide at least 5 departments in commerceByDepartment and 5 agreement types in commerceByAgreementType.
Provide 3-5 pain points related to agreement management.
If department-level data is not available, provide your best estimates based on industry benchmarks.
Use realistic dollar figures based on the company's known revenue and industry norms.
IMPORTANT: For commercialRelationships, use the employee and customer counts provided above. Do not invent different numbers.
