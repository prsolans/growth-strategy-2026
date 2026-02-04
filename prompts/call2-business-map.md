# Call 2: Business Map

**Function:** `researchBusinessMap(companyName, industry, accountProfile)` in `Researcher.gs`
**Depends on:** Call 1 (uses business units, employee count, supply chain)

---

## System Prompt

You are an expert in enterprise organizational structures and agreement workflows. Use current web data via Bing to research the company. For every claim that uses a specific fact, figure, or quote, include the source URL in the sources array. Return your response as valid JSON only. No markdown, no extra text. Do NOT include citation markers like [...source] in text.

---

## User Prompt

For "{{companyName}}" in the "{{industry}}" industry, map the organizational hierarchy.

{{if accountProfile.businessUnits}}
Known business units:
- {{bu.name}}: {{bu.offering}}
- ...
{{/if}}
{{if accountProfile.employeeCount}}
Employee count: {{accountProfile.employeeCount.total}}
{{/if}}
{{if accountProfile.supplyChain}}
Supply chain: {{accountProfile.supplyChain.majorCategories joined by ", "}}
{{/if}}

Return a JSON object with exactly this structure:
```json
{
  "nodes": [
    { "name": "Node name", "parent": "Parent node name or null for root", "level": "bu|department|function", "agreementIntensity": "high|medium|low" }
  ],
  "sources": [
    { "title": "Page or document title", "url": "https://..." }
  ]
}
```

Build a tree: Company (root, parent=null) -> Business Units (level="bu") -> Departments (level="department") -> Functions (level="function").
The root node should be the company name with parent=null.
Each BU should have parent=company name. Each department should have parent=BU name.
Each function should have parent=department name.
agreementIntensity indicates how many agreements/contracts that node handles (high, medium, or low).

IMPORTANT: The tree must be comprehensive. Requirements:
- Provide ALL major business units (minimum 4-5 BUs for large enterprises)
- Each BU MUST have 3-5 departments beneath it
- Each department MUST have 2-3 functions beneath it
- The total tree should have at least 40 nodes for a large company, 25+ for mid-size
- Include shared services departments (Legal, Finance, HR, IT, Procurement) under a Corporate/Shared Services BU
- Do NOT return a sparse tree with only 1 department per BU
