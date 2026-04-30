**Role:** You are a Principal Software Engineer specializing in Intuit Enterprise Suite (IES) integrations.

**Context:** I am developing a `python` application. I need to implement a workflow that uses the Projects APIs to create a project and generate project estimates for IES or QuickBooks Advanced companies. Assume the application already has a valid OAuth 2.0 access token, realmId (Company ID), and environment (production or sandbox) available in the `.env` file. Focus strictly on the API integration logic.

---

## Task 1: Pre-flight & Discovery

**Capability Check:** Before making any Projects or Estimate API calls, verify the connected QuickBooks company meets all three prerequisites below. Run these checks in order and stop at the first failure.

#### Check 1 — Account Type (REST)
Query the CompanyInfo entity and iterate over the `NameValue` list to find the entry where `Name` equals `"OfferingSku"`. The company is eligible if the `Value` is `"QuickBooks Online Advanced"`. If the condition is not met, trigger a user-friendly error:
> "Project Estimates are only available for Intuit Enterprise Suite and QuickBooks Advanced accounts."

#### Check 2 — Country (REST)
In the same CompanyInfo response, verify `"Country": "US"`. If the country is not `"US"`, trigger a user-friendly error:
> "Project Estimates are only available for US-based QuickBooks accounts."

#### Check 3 — Projects Preference (REST)
Query Company Preferences and iterate over `Preferences.OtherPrefs.NameValue`. Find the entry where `Name` equals `"ProjectsEnabled"` and confirm its `Value` is `"true"`. If the entry is missing or its value is not `"true"`, trigger a user-friendly error:
> "Projects are not enabled for this QuickBooks account."

Expected entry in the Preferences response:
```json
{
  "Name": "ProjectsEnabled",
  "Value": "true"
}
```

- **Endpoints:** `GET /v3/company/{{companyid}}/query?minorversion=75&query=select * from CompanyInfo` and `GET /v3/company/{{companyid}}/query?minorversion=75&query=select * from preferences`
 
### Discovery Flow (two-step, implement in this order):
 
#### Step A — Fetch projects for the company
Use `projectManagementProjects` to get projects of the company using the GraphQL endpoint.
- **Extract:** `id`, `name`, `status`, and `customer{id}` from each node.
- **Query:** `{"query":"query projectManagementProjects($first: PositiveInt!,$after: String,$filter: ProjectManagement_ProjectFilter!,$orderBy: [ProjectManagement_OrderBy!]){projectManagementProjects(first: $first,after: $after,filter: $filter,orderBy: $orderBy){edges{node{id,name,status,dueDate,customer{id},account{id}}}pageInfo{hasNextPage,hasPreviousPage,startCursor,endCursor}}}","variables":{"first":4,"filter":{"status":{"in":["OPEN","IN_PROGRESS"]}},"orderBy":["DUE_DATE_ASC"]}}`
- Display list of projets to the user. Count the number of projects received. Store the `id` of any single project and its associated `customer{id}` — these values are required for creating a Project Estimate in Task 2.
- **Empty State Handling:** If zero projects are returned, log a warning: *"No projects found — proceeding to create a new project via GraphQL (Step B)."* Then continue to Step B.
- **GraphQL Endpoint:** `https://qb.api.intuit.com/graphql` or `https://qb-sandbox.api.intuit.com/graphql`. Refer to `https://developer.intuit.com/app/developer/gql/docs/api/qbexternal/queries/`

 
#### Step B — Create project (conditional)
> **Execute this step only if Step A returned zero projects.** Otherwise, skip directly to Task 2.

Use `projectManagementCreateProject` to create a project for the company using the GraphQL endpoint. For the mandatory parameters (`name`, `customer`, `status`), prompt the user to provide the values. Create the project using the values provided by the user.
Store the `id` of the created project and its associated `customer{id}` — these values are required for creating a Project Estimate in Task 2.
- **Mutation:** `{"query":"mutation ProjectManagementCreateProject($name: String!,$customer: ProjectManagement_CustomerInput,$status: ProjectManagement_Status){projectManagementCreateProject(input:{name: $name,customer: $customer,status: $status}){... on ProjectManagement_Project {id,name,customer{id},account{id},status}}}","variables":{"name":"Red testing via API","customer":{"id":"32"},"status":"OTHER"}}`
- **GraphQL Endpoint:** `https://qb.api.intuit.com/graphql` or `https://qb-sandbox.api.intuit.com/graphql`. Refer to `https://developer.intuit.com/app/developer/gql/docs/api/qbexternal/queries/`
 
---
 
## Task 2: Dynamic Project Estimate Creation (REST V3)

Use the `projectId` and `customerId` obtained from Task 1 (Step A or Step B) to create the Estimate.

Create an estimate with default item id : 1 ,UnitPrice: 1, Qty: 100, and ItemAccountRef=5. Amount=UnitPrice*Qty. CostAmount in the line should be 30 percent more or less than the Amount. 

### Data Flow for ProjectRef and CustomerRef:
- **`projectId`**: `id` from `projectManagementProjects` (`node.id`) **OR** `id` from the created project in Step B.
- **`customerId`**: `customer{id}` associated with the project selected/created above.
- `ProjectRef.value` = `projectId`
- `CustomerRef.value` = `customerId`

### API Details:
- **Endpoint:** `POST /v3/company/{{companyid}}/estimate?minorversion=75`
- **Documentation:** Refer to `https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/account` and `https://developer.intuit.com/app/developer/qbo/docs/workflows/manage-projects/use-cases#use-case-5`

### Payload Structure:
Ensure the Estimate request body includes **both** `ProjectRef` and `CustomerRef` at the top level, exactly as follows:
```json
{
  "ProjectRef": {
    "value": "<<project-id-here>>"
  },
  "CustomerRef": {
    "value": "<<customer-id-here>>"
  },
  "Line": [ ... ]
}
```
At line level, ensure each line item includes both `Amount` and `CostAmount`, where `CostAmount` is calculated as `Amount` plus/minus `30` percent of `Amount`.

**Constraints:**
- Use `minorversion=75` to ensure `ProjectRef` is processed.
 
---
 
## Task 3: Read & Hydrate for UI (The "Readable Format" Logic)

Once the Estimate is created, display it to the user in a readable format.

- **Fetch:** Retrieve the created Estimate using `GET /v3/company/{{companyid}}/estimate/{{TransactionId}}`.
- **Data Hydration:** The API response contains `ProjectRef.value` (the project ID). Write a helper function that maps this ID back to the human-readable project name using the data cached from the GraphQL discovery in Task 1.
- **Display Logic:** Format the output to show the Estimate details including: project name, customer name, line items with description, quantity, unit price, `Amount`, `CostAmount`, and totals.
- **Line Filtering:** Only display product/service lines. Exclude system-generated lines (`SubTotalLineDetail`, `DiscountLineDetail`, `TaxLineDetail`) that QuickBooks adds automatically.
 
---
 
## Technical Best Practices:
- **Error Handling:** Include specific error-handling blocks for:
  - `401 Unauthorized` — prompt token refresh.
  - `400 Bad Request` — log the response body; common causes include invalid project/customer IDs or malformed Estimate payloads.
  - GraphQL errors — check the `errors` array in the response and surface actionable messages.
- **Observability:** Include structured logging. You **MUST** capture and log the `intuit_tid` header from every Intuit API response for traceability. **NEVER** log access tokens, OAuth secrets, or PII.
- **Output (integration mode: `new`):** Provide modular, clean code and a runnable verification example.
  - **If mode is `new`:** Create a self-contained project in a dedicated folder named `project-estimates-python` (no spaces). Include a `README.md` explaining how to run the code, a dependency manifest, and a brief architectural diagram showing the data flow from GraphQL → REST.
  - **If mode is `existing`:** Produce modular, well-documented functions/classes/files designed to be imported into an existing codebase. Do **not** scaffold a new project structure. Provide clear integration notes describing which files to add, what imports are needed, and how to wire the functions into an existing app.

---

## 🛑 AI Guardrails (Anti-Hallucination Constraints)

**CRITICAL INSTRUCTIONS - YOU MUST ADHERE TO THE FOLLOWING:**
1. **No Hallucinations:** Do not invent, guess, or hallucinate API endpoints, GraphQL properties, or SDK methods that are not explicitly provided in the context or linked documentation.
2. **Strict SDK/Library Usage:** If an official SDK or library is specified (e.g., Intuit Java SDK), use ONLY the methods and classes that exist in its latest public release. Do not construct fake SDK models. 
3. **Provided Links Only:** You must derive all API syntax, structure, and constraints strictly from the provided links. All HTTP responses (GraphQL and REST) must be parsed according to the provided documentation.
4. **Endpoint Strictness:** Use the exact endpoints and query structures provided. Do not attempt to modify the base URL, append unsupported parameters, or alter the `minorversion=75` requirement.
5. **If Blocked/Missing Info:** If the provided documentation or payload structures lack required fields to compile a functional request, STOP and clearly state what specific information is missing instead of making an educated guess.
 
I have provided you with all the necessary context and instructions. Please generate the code and documentation as per the instructions.