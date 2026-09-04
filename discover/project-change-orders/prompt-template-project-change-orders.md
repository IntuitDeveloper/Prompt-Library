**Role:** You are a Principal Software Engineer specializing in Intuit Enterprise Suite (IES) integrations.

**Context:** I am developing a `{{language_framework}}` application. I need to implement a workflow that uses the Projects GraphQL API and the Accounting REST V3 ChangeOrder endpoint to create a **Project Change Order** linked to an existing project estimate. This works for IES or QuickBooks Online Advanced (with the Construction Pack add-on) companies. Assume the application already has a valid OAuth 2.0 access token, realmId (Company ID), and environment (production or sandbox) available in the `.env` file. Focus strictly on the API integration logic.

**Hosts (select by `QBO_ENV`) — this workflow uses TWO hosts:**
- **REST V3 base URL** (CompanyInfo + Preferences pre-flight in Task 1, and the ChangeOrder entity in Tasks 2–5):
  - Production: `https://{{rest_baseurl_production}}`
  - Sandbox: `https://{{rest_baseurl_sandbox}}`
- **GraphQL endpoint** (`projectManagement*` discovery in Task 1):
  - Production: `{{graphql_endpoint_production}}`
  - Sandbox: `{{graphql_endpoint_sandbox}}`

REST v3 paths below (e.g. the `POST /v3/company/.../changeorder` endpoint) are relative to the REST base URL; `projectManagement*` operations POST to the GraphQL endpoint. Do not modify either host.

---

## Task 1: Pre-flight & Discovery

**Capability Check:** Before making any Projects or ChangeOrder API calls, verify the connected QuickBooks company meets all three prerequisites below. Run these checks in order and stop at the first failure.

**IMPORTANT — Both REST queries below return their entity wrapped in a one-element ARRAY under `QueryResponse`, never as a bare object.** Take the first element of that array before reading any nested field (e.g. `QueryResponse.CompanyInfo[0]`, `QueryResponse.Preferences[0]`) — do NOT path directly from `QueryResponse.CompanyInfo` or `QueryResponse.Preferences` into a nested field, since that skips the array and silently returns nothing (a bug that manifests as an incorrect "not enabled" failure even when the company IS correctly configured).

#### Check 1 — Account Type (REST)
Query the CompanyInfo entity. Take the first element of `QueryResponse.CompanyInfo[0]`, then iterate over its `NameValue` list to find the entry where `Name` equals `"OfferingSku"`. The company is eligible if the `Value` is `"QuickBooks Online Advanced"` (with Construction Pack add-on) **or** indicates Intuit Enterprise Suite. If the condition is not met, trigger a user-friendly error:
> "Project Change Orders are only available for Intuit Enterprise Suite or QuickBooks Advanced (Construction Pack) accounts."

#### Check 2 — Country (REST)
In the same `QueryResponse.CompanyInfo[0]` object, verify `"Country": "US"`. If the country is not `"US"`, trigger a user-friendly error:
> "Project Change Orders are only available for US-based QuickBooks accounts."

#### Check 3 — Projects Preference (REST)
Query Company Preferences. Take the first element `QueryResponse.Preferences[0]`, then read `.OtherPrefs.NameValue` from that element (NOT from `QueryResponse.Preferences` directly). Find the entry where `Name` equals `"ProjectsEnabled"` and confirm its `Value` is `"true"`. If the entry is missing or its value is not `"true"`, trigger a user-friendly error:
> "Projects are not enabled for this QuickBooks account."

Full response shape (both endpoints follow this array-wrapped pattern):
```json
{
  "QueryResponse": {
    "Preferences": [
      {
        "OtherPrefs": {
          "NameValue": [
            { "Name": "ProjectsEnabled", "Value": "true" }
          ]
        }
      }
    ]
  }
}
```

- **Endpoints:** `{{company_info_rest_v3_api_endpoint}}` and `{{company_preferences_rest_v3_api_endpoint}}`

### Discovery Flow (three-step, implement in this order):

#### Step A — Fetch projects for the company
Use `projectManagementProjects` to get projects for the company using the GraphQL endpoint.
- **Extract:** `id`, `name`, `status`, and `customer{id}` from each node.
- **Query:** `{{projects_discovery_query}}`
- Display the list of projects to the user. Store the `id` of any single project and its associated `customer{id}` — these values are required for Step B and Task 2.
- **Empty State Handling:** If zero projects are returned, log a warning: *"No projects found — proceeding to create a new project via GraphQL (Step B-1)."* Then run a project creation step before continuing to Step B.
- **GraphQL Endpoint:** `{{graphql_endpoint_production}}` or `{{graphql_endpoint_sandbox}}`. Refer to `{{graphql_schema}}`.
- **Note — GraphQL `customer.id` can differ from what REST later stores as `CustomerRef` — verified live.** For a project whose job is a sub-customer under a parent, GraphQL's `projectManagementProjects.customer.id` may return the *parent* customer's ID, while creating an Estimate/ChangeOrder against that project via REST resolves and stores the *job* (sub-customer) ID instead. This is expected QBO parent/sub-customer behavior, not an error — send the `customer{id}` value from GraphQL as instructed (Task 2 still works correctly), but when displaying customer info after create/read, show what the ChangeOrder/Estimate record itself reports (`CustomerRef.value`/`name`) rather than assuming it will match the value shown during project selection.

##### Step A-1 — Create project (conditional)
> **Execute this step only if Step A returned zero projects.** Otherwise, skip to Step B.

Use `projectManagementCreateProject`. For the mandatory parameters (`name`, `customer`, `status`), prompt the user. Store the returned `id` and `customer{id}`.
- **Mutation:** `{{project_creation_query}}`

#### Step B — Find or create the parent project estimate
A change order MUST be linked to an existing project estimate (an Estimate entity that already carries a `ProjectRef` value pointing to the selected project). Run this step in order:

1. **Query existing estimates for the project (REST V3):**
   `GET /v3/company/{{companyid}}/query?query=select * from Estimate where ProjectRef = '<projectId>'&minorversion={{minorversion}}`
   - If at least one Estimate is returned, store its `Id` as `parent_estimate_id` and continue to Task 2.
2. **If no project estimate exists, create one (REST V3):**
   {{project_estimate_creation_instructions}}
   - **Endpoint:** `{{transaction_v3_estimate_api_endpoint}}`
   - The created Estimate request body MUST include both `ProjectRef.value = <projectId>` and `CustomerRef.value = <customerId>` at the top level so it is recognized as a project estimate.
   - Store the returned `Id` as `parent_estimate_id`.

**Constraint:** The parent estimate MUST itself carry a `ProjectRef`. Referencing a standalone (non-project) estimate from a change order will fail validation.

---

## Task 2: Create the Project Change Order (REST V3)

Use the `projectId`, `customerId`, and `parent_estimate_id` obtained from Task 1 to create the change order.

{{project_change_order_creation_instructions}}

### Data Flow for ProjectRef and LinkedTxn:
- **`projectId`**: from Task 1 Step A (or A-1).
- **`customerId`**: `customer{id}` associated with the project.
- **`parent_estimate_id`**: from Task 1 Step B.
- `ProjectRef.value` = `projectId` (top-level — mandatory).
- `CustomerRef.value` = `customerId` (top-level).
- `LinkedTxn`: array containing `{ "TxnId": "<parent_estimate_id>", "TxnType": "Estimate" }` at the top level (**required**), and **recommended** on each line item for clarity. If a line omits it, the server backfills it from the top-level value — see Constraints.

### API Details:
- **Endpoint:** `{{project_change_order_v3_endpoint}}`
- **Documentation:** Refer to `{{changeorder_rest_v3_api_documentation}}` and `{{project_change_order_documentation}}`.

### Payload Structure:
Ensure the ChangeOrder request body includes `ProjectRef`, `CustomerRef`, and `LinkedTxn` at the top level (the top-level `LinkedTxn` is required and authoritative). Including `LinkedTxn` on each line is recommended but not required — omitted lines inherit the top-level value (see Constraints). Skeleton:

```json
{
  "TxnDate": "<<YYYY-MM-DD>>",
  "TxnStatus": "Pending",
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
- **`DocNumber` MUST be unique per company, and must NOT be hardcoded to a fixed literal (e.g. `"CO-001"`) in the request body.** A fixed literal collides on any second run against the same company (or any company that already has that number from a prior run), causing a 400 (error code `6140`, "Duplicate Document Number Error") even when everything else in the request is correct. Omit the `DocNumber` field entirely — do not generate one client-side (e.g. via timestamp/UUID) unless the developer explicitly asks for a specific numbering scheme.
- **Auto-assignment is NOT guaranteed even when `DocNumber` is omitted — verified live.** Some created ChangeOrders receive a server-assigned `DocNumber` (e.g. `CO-91934`), others come back with no `DocNumber` at all (`null`), inconsistently, in the same company. Do not assume the response will always contain a `DocNumber`. In the display/read layer (Task 3), handle a `null`/missing `DocNumber` gracefully — fall back to showing the ChangeOrder's `Id` instead of a blank or placeholder value.
- Use `minorversion={{minorversion}}` on create, update, and delete (POST) calls.

---

## Task 3: Read & Hydrate the Change Order for UI

Once the change order is created, display it to the user in a readable format.

- **Fetch:** Retrieve the created ChangeOrder using `{{project_change_order_get_endpoint}}`.
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
- **`ProjectRef` and `CustomerRef` at the top level — verified live, MUST be re-sent on every update, even though `sparse: true` is set.** Sparse mode only exempts *unchanged* fields from being reset to blank — it does not exempt these two from being required on the request at all. Omitting either one, even when neither is actually changing, fails with error code **`9349`** ("ProjectRef is required for Change Order"). Re-read the change order first (Task 3) and carry its existing `ProjectRef.value`/`CustomerRef.value` forward on the update body.
- `LinkedTxn` at the top level — always re-include.
- The COMPLETE desired `Line` array, with `LinkedTxn` re-included on every line. Any line omitted will be deleted.

**Recommended pattern:**
1. Re-read the change order (Task 3) to get the latest `SyncToken`, existing `ProjectRef`/`CustomerRef`, and existing lines.
2. Apply changes locally (add/edit/remove lines, update status fields).
3. POST the full revised `Line` array along with the latest `SyncToken`, re-including `ProjectRef` and `CustomerRef` even if unchanged.

### Endpoint:
- `{{project_change_order_v3_endpoint}}` (same endpoint as create — body shape signals update via `Id` + `SyncToken`).

---

## Task 5: Delete the Change Order

Use `{{project_change_order_v3_endpoint}}&operation=delete` with `Id` + current `SyncToken` in the body. (The endpoint already carries `?minorversion=…`, so the delete flag is appended with `&`, not a second `?`.)

**Behavior:**
- Deletion is **permanent** and irreversible.
- The parent estimate is **not** modified by the deletion.
- The project's contracted total is recalculated to remove the change order's contribution.
- A successful delete returns a **sparse** `ChangeOrder` object — `{"ChangeOrder": {"domain": "QBO", "status": "Deleted", "Id": "<id>"}}`. It does **not** echo a `SyncToken` in the delete response.

---

## Technical Best Practices:
- **Error Handling:** Include specific error-handling blocks for:
  - `401 Unauthorized` — prompt token refresh.
  - `400 Bad Request` (`Fault.Error[].code`) — verified codes: **`2020`** ("Required param missing") when there is **no `LinkedTxn`/Estimate reference anywhere** on the request (neither top-level nor any line); **`5010`** ("Stale Object Error") when the `SyncToken` sent on update/delete is not current — re-read (Task 3) and retry; **`9349`** ("ProjectRef is required for Change Order") when a Task 4 sparse update omits `ProjectRef` — verified live that this is required on every update request regardless of `sparse: true`, not just on create. Other causes: referencing a non-project parent estimate, or sending read-only `TotalAmt`. Note: differing per-line `TxnId`s do **not** error — the server silently normalizes them to the top-level `LinkedTxn.TxnId`.
  - Other project change order error codes — surface code and message per `{{project_change_order_error_codes_documentation}}`.
- **Observability:** Include structured logging. You **MUST** capture and log the `intuit_tid` header from every Intuit API response for traceability. **NEVER** log access tokens, OAuth secrets, or PII.
- **Output (integration mode: `{{integration_mode}}`):** Provide modular, clean code and a runnable verification example.
  - **If mode is `new`:** Create a self-contained project in a dedicated folder named `project-change-orders-{{language_framework}}` (no spaces). Include a `README.md` explaining how to run the code, a dependency manifest, and a brief architectural diagram showing the data flow from Projects GraphQL → Estimate REST → ChangeOrder REST.
  - **If mode is `existing`:** Produce modular, well-documented functions/classes/files designed to be imported into an existing codebase. Do **not** scaffold a new project structure. Provide clear integration notes describing which files to add, what imports are needed, and how to wire the functions into an existing app.
- **UI (REQUIRED — not optional):** In addition to the backend integration logic, build a minimal local web UI so a developer can exercise this workflow without a REST client: a single page served locally with a form to select/display the discovered project (Task 1 Step A) and enter the change order's line item description/quantity/unit price, a "Create Change Order" button that calls Task 2's create logic, and a results panel that renders the created ChangeOrder (DocNumber, status, project/customer names, line items, total) using Task 3's read/hydrate logic. Keep the UI plain HTML/CSS/vanilla JS (or the target language/framework's minimal built-in server) — no frontend build step, no external UI framework dependency. The UI calls the same backend functions used by Task 2/3; do not duplicate API logic in the frontend. This UI must be built in every case — it is not conditional and there is no "skip the UI" option. **The UI is the program's only entry point.** Running the program (e.g. `gradle run`, `node index.js`, `python main.py`) with no arguments must start the local web server directly. Do NOT gate the UI behind a `--ui` flag, an environment variable, or any other opt-in condition, and do NOT also build a separate CLI/console workflow as an alternative or default mode — the UI *is* the runnable verification example this workflow produces.

---

## 🛑 AI Guardrails (Anti-Hallucination Constraints)

**CRITICAL INSTRUCTIONS - YOU MUST ADHERE TO THE FOLLOWING:**
1. **No Hallucinations:** Do not invent, guess, or hallucinate API endpoints, GraphQL properties, REST fields, or SDK methods that are not explicitly provided in the context or linked documentation.
2. **Strict SDK/Library Usage:** If an official SDK or library is specified, use ONLY the methods and classes that exist in its latest public release. Do not construct fake SDK models.
3. **Provided Links Only:** You must derive all API syntax, structure, and constraints strictly from the provided links.
4. **Endpoint Strictness:** Use the exact endpoints and query structures provided. Do not modify the base URL or alter the `minorversion={{minorversion}}` requirement.
5. **LinkedTxn (Estimate ref) is required — at minimum at the top level.** Recommended: include it on every line for clarity. The server auto-propagates a top-level `LinkedTxn` onto lines that omit it, and it is authoritative (it overrides differing per-line `TxnId`s by silent normalization). Only *total* absence (no top-level and no line) fails, with error `2020`. Do not claim omitting it on a single line "degrades to a standalone estimate" — that is not the observed behavior.
6. **TotalAmt is Read-Only:** Never include `TotalAmt` in a create or update request body. The server computes it.
7. **No Sparse Line Updates:** The `Line` array does not support true sparse updates. Always read-modify-write the complete line array on update.
8. **One Parent Estimate per Change Order:** All lines must reference the same parent estimate `TxnId`.
9. **If Blocked/Missing Info:** If the provided documentation or payload structures lack required fields to compile a functional request, STOP and clearly state what specific information is missing instead of making an educated guess.
10. **CompanyInfo/Preferences REST Queries Return Arrays:** `QueryResponse.CompanyInfo` and `QueryResponse.Preferences` are always one-element arrays, even for a single result. Always index the first element (`[0]`) before reading a nested field. Pathing directly into a nested field without indexing the array (e.g. `Preferences.OtherPrefs` instead of `Preferences[0].OtherPrefs`) silently returns nothing and causes Check 3 to incorrectly fail with "Projects are not enabled" even on a correctly configured company — verified live.
11. **Never Hardcode DocNumber:** Do not set `DocNumber` to a fixed literal (e.g. `"CO-001"`) anywhere in the ChangeOrder create request — it must be unique per company, and a hardcoded value collides on the second run against the same company with a 400 (error code `6140`, "Duplicate Document Number Error"). Omit the field. Do NOT claim QuickBooks "always auto-assigns" a replacement — verified live that some created ChangeOrders come back with `DocNumber: null` even when the field was omitted on create. Display code must handle a null `DocNumber` (e.g. fall back to `Id`) rather than assuming one is always present.
12. **ProjectRef/CustomerRef Required on Update, Not Just Create:** `sparse: true` on a Task 4 update does NOT exempt `ProjectRef` and `CustomerRef` from being sent — verified live that omitting either on an otherwise-valid sparse update fails with error `9349` ("ProjectRef is required for Change Order"), even when neither value is actually changing. Always carry both forward from the pre-update read (Task 3) onto every update request body.

I have provided you with all the necessary context and instructions. Please generate the code and documentation as per the instructions.
