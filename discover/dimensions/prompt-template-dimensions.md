**Role:** You are a Principal Software Engineer specializing in Intuit Enterprise Suite (IES) integrations.
 
**Context:** I am developing a `{{language_framework}}` application. I need to implement a workflow that uses the IES Dimensions APIs to tag `{{type_of_transaction}}`. Assume the application already has a valid OAuth 2.0 access token and IES realmId (Company ID) and environment (production or sandbox) available in the `.env` file. Focus strictly on the API integration logic.

**References:**
- Dimensions documentation: `{{dimension_Api_documentation}}`
- GraphQL schema reference: `{{graphql_schema}}`
- REST V3 API documentation: `{{rest_v3_api_documentation}}`
- OAuth 2.0 documentation: `{{oauth2-documentation}}`
 
---
 
## Task 1: Pre-flight & Discovery (GraphQL)
 
**Capability Check:** Write code to check if the connected QuickBooks company supports Dimensions. 
*(Note: If the GraphQL query returns a 403 or a 'Feature Not Enabled' error, trigger a user-friendly error: "Dimensions are only available for Intuit Enterprise Suite accounts.")*
 
- **Endpoint:** `{{graphql_endpoint_production}}` or `{{graphql_endpoint_sandbox}}`. Refer to `{{graphql_schema}}`
 
### Discovery Flow (two-step, implement in this order):
 
#### Step A - Fetch dimension definitions
Use `appFoundationsActiveCustomDimensionDefinitions` to get all active dimensions.
- **Extract:** `id` (this is the `definitionId`), `label`, `active` from each node.
- **Query:** `{{dimension_discovery_query}}`
- Count the number of dimensions received.
- **Empty State Handling:** If no dimensions, catch this state, provide an error ("No dimensions found. Please set them up in QuickBooks."), and provide a redirect link to: `{{create_dimension_qbo_ui}}`.
 
#### Step B - Fetch values for each definition
For each `definitionId` from Step A, call `appFoundationsActiveCustomDimensionValues` with filters: `{ definitionId: "<definitionId>", parentId: null }`.
- **Extract:** `id` (this is the `valueId` for `CustomExtensions`), `definitionId`, `fullyQualifiedLabel`.
- **Constraint:** The `valueId` used for `{{type_of_transaction}}` tagging MUST come from the `appFoundationsActiveCustomDimensionValues` query response, not from the definitions query.
- Pass `definitionId` as the filter to fetch values; use the returned `id` as `valueId`.
- **Values Query** (use `definitionId` from definitions as a filter): `{{dimension_values_query}}`
 
*(Note: substitute with the actual definition id from the `appFoundationsActiveCustomDimensionDefinitions` response.)*
 
---
 
## Task 2: Dynamic Transaction Creation (REST V3)

> **Host:** Task 1 uses the GraphQL endpoint above; Task 2 is **REST V3** — prepend the REST base URL (Production `https://{{rest_baseurl_production}}`, Sandbox `https://{{rest_baseurl_sandbox}}`, select by `QBO_ENV`) to the `/v3/company/...` path below. Do not send REST calls to the GraphQL host.

{{transaction_creation_instructions}}

### Data flow for CustomExtensions:
- **`definitionId`**: from `appFoundationsActiveCustomDimensionDefinitions` (`node.id`)
- **`valueId`**: from `appFoundationsActiveCustomDimensionValues` (`node.id`), fetched by passing `definitionId` in the filters parameter
- `CustomExtensions.AssociatedValues.Key` = `definitionId`
- `CustomExtensions.AssociatedValues.Value` = `valueId`
 
### API Details:
- **Endpoint:** `{{transaction_v3_api_endpoint}}`
- **Documentation:** Refer to `{{rest_v3_api_documentation}}` and `{{dimension_Api_documentation}}`
 
### Payload Structure:
Ensure the Line items include the `CustomExtensions` array exactly as follows:
```json
{{custom_extensions_structure}}
```
 
**Constraints:** 
- Use `minorversion={{minorversion}}` to ensure `CustomExtensions` are processed.
- Each transaction line can have a maximum of one `AssociatedValues.value` per dimension.
 
---
 
## Task 3: Read & Hydrate for UI (The "Readable Format" Logic) 
 
Once the transaction is created, I need to display it to the user.
 
- **Fetch:** using `{{get_transaction_endpoint}}`.
- **Data Hydration:** The API returns IDs (keys/values) in `CustomExtensions.AssociatedValues` for each `{{type_of_transaction}}` line. Write a helper function that maps these IDs back to the human-readable names (e.g., "Region: North") using the cached data from the GraphQL discovery in Task 1.
- **Display Logic:** Format the output to show each `{{type_of_transaction}}` Line, the item name, the amount, and a comma-separated list of the associated Dimension Names and values.
- **Line Filtering:** Only hydrate and display appropriate `{{type_of_transaction}}` lines. Exclude system lines (`SubTotalLineDetail`, `GroupLineDetail`, `DiscountLineDetail`, `TaxLineDetail`) that QuickBooks adds automatically—these are not product lines and have no dimensions.
 
---
 
## Technical Best Practices:
 
- **Caching:** Implement a strategy to cache Dimension definitions for 1 hour to avoid excessive GraphQL calls.
- **Error Handling:** Include specific blocks for 401 Unauthorized (token refresh) and 400 Bad Request (invalid Dimension ID).
- **Observability:** Include structured logging. You MUST capture and log the `intuit_tid` header from Intuit API responses for traceability. NEVER log access tokens, OAuth secrets, or PII.
- **Typing:** (If applicable) Provide `{{typing_system}}` interfaces for the `CustomExtensions` and `Dimension` objects.
- **Output (integration mode: `{{integration_mode}}`):** Provide modular, clean code and a runnable verification example.
  - **If mode is `new`:** Create a self-contained project in a dedicated folder named `ies-dimensions-{{language_framework}}` (no spaces). Include a `README.md` explaining how to run the code, a dependency manifest, and a brief architectural diagram showing the data flow from GraphQL to REST.
  - **If mode is `existing`:** Produce modular, well-documented functions/classes/files designed to be imported into an existing codebase. Do **not** scaffold a new project structure. Provide clear integration notes describing which files to add, what imports are needed, and how to wire the functions into an existing app.

---

## 🛑 AI Guardrails (Anti-Hallucination Constraints)

**CRITICAL INSTRUCTIONS - YOU MUST ADHERE TO THE FOLLOWING:**
1. **No Hallucinations:** Do not invent, guess, or hallucinate API endpoints, GraphQL properties, or SDK methods that are not explicitly provided in the context or linked documentation.
2. **Strict SDK/Library Usage:** If an official SDK or library is specified (e.g., Intuit Java SDK), use ONLY the methods and classes that exist in its latest public release. Do not construct fake SDK models. 
3. **Provided Links Only:** You must derive all API syntax, structure, and constraints strictly from the provided links. All HTTP responses (GraphQL and REST) must be parsed according to the provided documentation.
4. **Endpoint Strictness:** Use the exact endpoints and query structures provided. Do not attempt to modify the base URL, append unsupported parameters, or alter the `minorversion={{minorversion}}` requirement.
5. **If Blocked/Missing Info:** If the provided documentation or payload structures lack required fields to compile a functional request, STOP and clearly state what specific information is missing instead of making an educated guess.
 
I have provided you with all the necessary context and instructions. Please generate the code and documentation as per the instructions.