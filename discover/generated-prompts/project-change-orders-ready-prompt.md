**Role:** You are a Principal Software Engineer specializing in Intuit Enterprise Suite (IES) integrations.

**Context:** I am developing a `python` application. I need to implement a workflow that uses the Projects GraphQL API and the Accounting REST V3 ChangeOrder endpoint to create a **Project Change Order** linked to an existing project estimate. This works for IES or QuickBooks Online Advanced (with the Construction Pack add-on) companies. Assume the application already has a valid OAuth 2.0 access token, realmId (Company ID), and environment (production or sandbox) available in the `.env` file. Focus strictly on the API integration logic.

**Hosts (select by `QBO_ENV`) — this workflow uses TWO hosts:**
- **REST V3 base URL** (CompanyInfo + Preferences pre-flight in Task 1, and the ChangeOrder entity in Tasks 2–5):
  - Production: `https://quickbooks.api.intuit.com`
  - Sandbox: `https://sandbox-quickbooks.api.intuit.com`
- **GraphQL endpoint** (`projectManagement*` discovery in Task 1):
  - Production: `https://qb.api.intuit.com/graphql`
  - Sandbox: `https://qb-sandbox.api.intuit.com/graphql`

REST v3 paths below (e.g. the `POST /v3/company/.../changeorder` endpoint) are relative to the REST base URL; `projectManagement*` operations POST to the GraphQL endpoint. Do not modify either host.

---

## Task 1: Pre-flight & Discovery

**Capability Check:** Before making any Projects or ChangeOrder API calls, verify the connected QuickBooks company meets all three prerequisites below. Run these checks in order and stop at the first failure.

#### Check 1 — Account Type (REST)
Query the CompanyInfo entity and iterate over the `NameValue` list to find the entry where `Name` equals `"OfferingSku"`. The company is eligible if the `Value` is `"QuickBooks Online Advanced"` (with Construction Pack add-on) **or** indicates Intuit Enterprise Suite. If the condition is not met, trigger a user-friendly error:
> "Project Change Orders are only available for Intuit Enterprise Suite or QuickBooks Advanced (Construction Pack) accounts."

#### Check 2 — Country (REST)
In the same CompanyInfo response, verify `"Country": "US"`. If the country is not `"US"`, trigger a user-friendly error:
> "Project Change Orders are only available for US-based QuickBooks accounts."

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

### Discovery Flow (three-step, implement in this order):

#### Step A — Fetch projects for the company
Use `projectManagementProjects` to get projects for the company using the GraphQL endpoint.
- **Extract:** `id`, `name`, `status`, and `customer{id}` from each node.
- **Query:** `{"query":"query projectManagementProjects($first: PositiveInt!,$after: String,$filter: ProjectManagement_ProjectFilter!,$orderBy: [ProjectManagement_OrderBy!]){projectManagementProjects(first: $first,after: $after,filter: $filter,orderBy: $orderBy){edges{node{id,name,status,dueDate,customer{id},account{id}}}pageInfo{hasNextPage,hasPreviousPage,startCursor,endCursor}}}","variables":{"first":4,"filter":{"status":{"in":["OPEN","IN_PROGRESS"]}},"orderBy":["DUE_DATE_ASC"]}}`
- Display the list of projects to the user. Store the `id` of any single project and its associated `customer{id}` — these values are required for Step B and Task 2.
- **Empty State Handling:** If zero projects are returned, log a warning: *"No projects found — proceeding to create a new project via GraphQL (Step B-1)."* Then run a project creation step before continuing to Step B.
- **GraphQL Endpoint:** `https://qb.api.intuit.com/graphql` or `https://qb-sandbox.api.intuit.com/graphql`. Refer to `https://developer.intuit.com/app/developer/gql/docs/api/qbexternal/queries/`.

##### Step A-1 — Create project (conditional)
> **Execute this step only if Step A returned zero projects.** Otherwise, skip to Step B.

Use `projectManagementCreateProject`. For the mandatory parameters (`name`, `customer`, `status`), prompt the user. Store the returned `id` and `customer{id}`.
- **Mutation:** `{"query":"mutation ProjectManagementCreateProject($name: String!,$customer: ProjectManagement_CustomerInput,$status: ProjectManagement_Status){projectManagementCreateProject(input:{name: $name,customer: $customer,status: $status}){... on ProjectManagement_Project {id,name,customer{id},account{id},status}}}","variables":{"name":"Red testing via API","customer":{"id":"32"},"status":"OTHER"}}`

#### Step B — Find or create the parent project estimate
A change order MUST be linked to an existing project estimate (an Estimate entity that already carries a `ProjectRef` value pointing to the selected project). Run this step in order:

1. **Query existing estimates for the project (REST V3):**
   `GET /v3/company/{{companyid}}/query?query=select * from Estimate where ProjectRef = '<projectId>'&minorversion=75`
   - If at least one Estimate is returned, store its `Id` as `parent_estimate_id` and continue to Task 2.
2. **If no project estimate exists, create one (REST V3):**
   Create an estimate with default item id : 1 ,UnitPrice: 1, Qty: 100, and ItemAccountRef=5. Amount=UnitPrice*Qty. CostAmount in the line should be 30 percent more or less than the Amount. 
   - **Endpoint:** `POST /v3/company/{{companyid}}/estimate?minorversion=75`
   - The created Estimate request body MUST include both `ProjectRef.value = <projectId>` and `CustomerRef.value = <customerId>` at the top level so it is recognized as a project estimate.
   - Store the returned `Id` as `parent_estimate_id`.

**Constraint:** The parent estimate MUST itself carry a `ProjectRef`. Referencing a standalone (non-project) estimate from a change order will fail validation.

---

## Task 2: Create the Project Change Order (REST V3)

Use the `projectId`, `customerId`, and `parent_estimate_id` obtained from Task 1 to create the change order.

Create a Change Order linked to the discovered project and parent estimate. Use TxnStatus='Pending', DocNumber='CO-001', and 2 line items: 'Additional electrical work' $500 (item id 1, qty 1, UnitPrice 500) and 'Permit fees' $750 (item id 1, qty 1, UnitPrice 750). Top-level ProjectRef and LinkedTxn are mandatory, AND every line MUST re-include LinkedTxn referencing the parent estimate. Omit TotalAmt (read-only).

### Data Flow for ProjectRef and LinkedTxn:
- **`projectId`**: from Task 1 Step A (or A-1).
- **`customerId`**: `customer{id}` associated with the project.
- **`parent_estimate_id`**: from Task 1 Step B.
- `ProjectRef.value` = `projectId` (top-level — mandatory).
- `CustomerRef.value` = `customerId` (top-level).
- `LinkedTxn`: array containing `{ "TxnId": "<parent_estimate_id>", "TxnType": "Estimate" }` at the top level (**required**), and **recommended** on each line item for clarity. If a line omits it, the server backfills it from the top-level value — see Constraints.

### API Details:
- **Endpoint:** `POST /v3/company/{{companyid}}/changeorder?minorversion=75`
- **Documentation:** Refer to `https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/changeorder` and `https://developer.intuit.com/app/developer/qbo/docs/workflows/manage-projects/use-cases#use-case-7`.

### Payload Structure:
Ensure the ChangeOrder request body includes `ProjectRef`, `CustomerRef`, and `LinkedTxn` at the top level (the top-level `LinkedTxn` is required and authoritative). Including `LinkedTxn` on each line is recommended but not required — omitted lines inherit the top-level value (see Constraints). Skeleton:

```json
{
  "TxnDate": "<<YYYY-MM-DD>>",
  "TxnStatus": "Pending",
  "DocNumber": "CO-001",
  "ProjectRef":  { "value": "<<project-id-here>>" },
  "CustomerRef": { "value": "<<customer-id-here>>" },
  "LinkedTxn":   [{ "TxnId": "<<parent-estimate-id-here>>", "TxnType": "Estimate" }],
  "Line": [
    {
      "LineNum": 1,
      "Description": "<line description>",
      "Amount": 0.00,
      "DetailType": "SalesItemLineDetail",
      "SalesItemLineDetail": {
        "ItemRef": { "value": "<item-id>" },
        "UnitPrice": 0.00,
        "Qty": 0,
        "TaxCodeRef": { "value": "NON" }
      },
      "LinkedTxn": [{ "TxnId": "<<parent-estimate-id-here>>", "TxnType": "Estimate" }]
    }
  ]
}
```

**Constraints (verified live against production):**
- `LinkedTxn` (an Estimate reference) is **required — at minimum at the top level.** If a line omits its own `LinkedTxn`, the server **auto-propagates** the top-level `LinkedTxn` onto that line (confirmed: the stored line comes back *with* it). Including `LinkedTxn` on every line is still recommended for clarity, but a line missing it is **not** rejected while a top-level `LinkedTxn` is present. Only **total absence** (no top-level AND no line `LinkedTxn`) is rejected — with error code **`2020`** ("Required parameter LinkedTxn with an Estimate reference is required for ChangeOrder is missing").
- **A change order references exactly one parent estimate, and the top-level `LinkedTxn` is authoritative:** the server applies its `TxnId` to every line, **silently overriding** any different per-line `TxnId` (e.g. a line sent with `TxnId:"7"` is stored as the top-level `TxnId:"8"`). This is silent normalization, NOT a validation error — so always intend a single parent and set it at the top level.
- `ProjectRef` at the top level is **mandatory**. Without it the change order will not appear in the Projects dashboard.
- `TotalAmt` is **read-only**. Do not include it in the request body — it is computed from the sum of line `Amount` values. The server also auto-appends a `SubTotalLineDetail` line in the response (exclude it from UI display).
- Use `minorversion=75` on create, update, and delete (POST) calls.

---

## Task 3: Read & Hydrate the Change Order for UI

Once the change order is created, display it to the user in a readable format.

- **Fetch:** Retrieve the created ChangeOrder using `GET /v3/company/{{companyid}}/changeorder/{{ChangeOrderId}}?minorversion=75`.
- **Data Hydration:** The API response contains `ProjectRef.value` (project ID) and `LinkedTxn[*].TxnId` (parent estimate ID). Write a helper function that maps these IDs back to human-readable names using the data cached from the GraphQL discovery in Task 1.
- **Display Logic:** Format the output to show: change order DocNumber, status, project name, customer name, parent estimate ID, line items with description / quantity / unit price / Amount, and totals.
- **Line Filtering:** Only display product/service lines. Exclude system-generated lines (`SubTotalLineDetail`, `DiscountLineDetail`, `TaxLineDetail`) that QuickBooks adds automatically.

---

## Task 4: Update the Change Order (sparse update + line full-replace)

QuickBooks Online supports sparse updates at the top level (only changed fields modified) but the `Line` array is **always full-replace**.

**Required fields on every update:**
- `Id` — the change order's ID returned by Task 2.
- `SyncToken` — concurrency token from the most recent read.
- `sparse: true` — enables top-level sparse mode.
- `LinkedTxn` at the top level — always re-include.
- The COMPLETE desired `Line` array, with `LinkedTxn` re-included on every line. Any line omitted will be deleted.

**Recommended pattern:**
1. Re-read the change order (Task 3) to get the latest `SyncToken` and existing lines.
2. Apply changes locally (add/edit/remove lines, update status fields).
3. POST the full revised `Line` array along with the latest `SyncToken`.

### Endpoint:
- `POST /v3/company/{{companyid}}/changeorder?minorversion=75` (same endpoint as create — body shape signals update via `Id` + `SyncToken`).

---

## Task 5: Delete the Change Order

Use `POST /v3/company/{{companyid}}/changeorder?minorversion=75&operation=delete` with `Id` + current `SyncToken` in the body. (The endpoint already carries `?minorversion=…`, so the delete flag is appended with `&`, not a second `?`.)

**Behavior:**
- Deletion is **permanent** and irreversible.
- The parent estimate is **not** modified by the deletion.
- The project's contracted total is recalculated to remove the change order's contribution.
- A successful delete returns a **sparse** `ChangeOrder` object — `{"ChangeOrder": {"domain": "QBO", "status": "Deleted", "Id": "<id>"}}`. It does **not** echo a `SyncToken` in the delete response.

---

## Technical Best Practices:
- **Error Handling:** Include specific error-handling blocks for:
  - `401 Unauthorized` — prompt token refresh.
  - `400 Bad Request` (`Fault.Error[].code`) — verified codes: **`2020`** ("Required param missing") when there is **no `LinkedTxn`/Estimate reference anywhere** on the request (neither top-level nor any line); **`5010`** ("Stale Object Error") when the `SyncToken` sent on update/delete is not current — re-read (Task 3) and retry. Other causes: referencing a non-project parent estimate, missing `ProjectRef`, or sending read-only `TotalAmt`. Note: differing per-line `TxnId`s do **not** error — the server silently normalizes them to the top-level `LinkedTxn.TxnId`.
  - Other project change order error codes — surface code and message per `https://developer.intuit.com/app/developer/qbo/docs/develop/troubleshooting/error-codes#project-change-order-error-codes`.
- **Observability:** Include structured logging. You **MUST** capture and log the `intuit_tid` header from every Intuit API response for traceability. **NEVER** log access tokens, OAuth secrets, or PII.
- **Output (integration mode: `new`):** Provide modular, clean code and a runnable verification example.
  - **If mode is `new`:** Create a self-contained project in a dedicated folder named `project-change-orders-python` (no spaces). Include a `README.md` explaining how to run the code, a dependency manifest, and a brief architectural diagram showing the data flow from Projects GraphQL → Estimate REST → ChangeOrder REST.
  - **If mode is `existing`:** Produce modular, well-documented functions/classes/files designed to be imported into an existing codebase. Do **not** scaffold a new project structure. Provide clear integration notes describing which files to add, what imports are needed, and how to wire the functions into an existing app.

---

## 🛑 AI Guardrails (Anti-Hallucination Constraints)

**CRITICAL INSTRUCTIONS - YOU MUST ADHERE TO THE FOLLOWING:**
1. **No Hallucinations:** Do not invent, guess, or hallucinate API endpoints, GraphQL properties, REST fields, or SDK methods that are not explicitly provided in the context or linked documentation.
2. **Strict SDK/Library Usage:** If an official SDK or library is specified, use ONLY the methods and classes that exist in its latest public release. Do not construct fake SDK models.
3. **Provided Links Only:** You must derive all API syntax, structure, and constraints strictly from the provided links.
4. **Endpoint Strictness:** Use the exact endpoints and query structures provided. Do not modify the base URL or alter the `minorversion=75` requirement.
5. **LinkedTxn (Estimate ref) is required — at minimum at the top level.** Recommended: include it on every line for clarity. The server auto-propagates a top-level `LinkedTxn` onto lines that omit it, and it is authoritative (it overrides differing per-line `TxnId`s by silent normalization). Only *total* absence (no top-level and no line) fails, with error `2020`. Do not claim omitting it on a single line "degrades to a standalone estimate" — that is not the observed behavior.
6. **TotalAmt is Read-Only:** Never include `TotalAmt` in a create or update request body. The server computes it.
7. **No Sparse Line Updates:** The `Line` array does not support true sparse updates. Always read-modify-write the complete line array on update.
8. **One Parent Estimate per Change Order:** All lines must reference the same parent estimate `TxnId`.
9. **If Blocked/Missing Info:** If the provided documentation or payload structures lack required fields to compile a functional request, STOP and clearly state what specific information is missing instead of making an educated guess.

I have provided you with all the necessary context and instructions. Please generate the code and documentation as per the instructions.
