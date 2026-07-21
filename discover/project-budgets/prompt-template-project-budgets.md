**Role:** You are a Principal Software Engineer specializing in Intuit Enterprise Suite (IES) integrations.

**Context:** I am developing a `{{language_framework}}` application. I need to implement a workflow that uses the Projects + Business Planning GraphQL APIs to create, read, update, and delete a **Project Budget** for IES or QuickBooks Advanced companies. Assume the application already has a valid OAuth 2.0 access token, realmId (Company ID), and environment (production or sandbox) available in the `.env` file. Focus strictly on the API integration logic.

---

## Task 1: Pre-flight & Discovery

**Capability Check:** Before making any Projects or Budget API calls, verify the connected QuickBooks company meets all three prerequisites below. Run these checks in order and stop at the first failure.

#### Check 1 — Account Type (REST)
Query the CompanyInfo entity and iterate over the `NameValue` list to find the entry where `Name` equals `"OfferingSku"`. The company is eligible if the `Value` is `"QuickBooks Online Advanced"` **or** indicates Intuit Enterprise Suite. If the condition is not met, trigger a user-friendly error:
> "Project Budgets are only available for Intuit Enterprise Suite and QuickBooks Advanced accounts."

#### Check 2 — Country (REST)
In the same CompanyInfo response, verify `"Country": "US"`. If the country is not `"US"`, trigger a user-friendly error:
> "Project Budgets are only available for US-based QuickBooks accounts."

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

- **Endpoints:** `{{company_info_rest_v3_api_endpoint}}` and `{{company_preferences_rest_v3_api_endpoint}}`

> **Two hosts:** the Task 1 pre-flight endpoints above are **REST v3** — prepend the REST host (Production `https://quickbooks.api.intuit.com`, Sandbox `https://sandbox-quickbooks.api.intuit.com`, select by `QBO_ENV`). Every budget operation in Tasks 2–5 is **GraphQL** on `{{graphql_endpoint_production}}` / `{{graphql_endpoint_sandbox}}`. Do not send the pre-flight REST calls to the GraphQL host or vice-versa.

#### Check 4 — Project cost method (per-project prerequisite)
A budget can only be created for a project whose **cost method is NOT `Basic`** (i.e. the project uses the Advanced cost method). Creating a budget for a Basic-cost-method project fails (HTTP 200) with `errorCode: "PNB-INPUT-87"` / `PROJECT_COST_METHOD_IS_BASIC` ("Project budgets are not supported for projects with Basic cost method"). This is a **per-project** check — verify it for the specific project you intend to budget before Task 2.

### Discovery Flow (two-step, implement in this order):

#### Step A — Fetch projects for the company
Use `projectManagementProjects` to get projects for the company using the GraphQL endpoint.
- **Extract:** `id`, `name`, `status`, and `customer{id}` from each node.
- **Query:** `{{projects_discovery_query}}`
- Display the list of projects to the user. Count the number of projects received. Store the `id` of any single project — this value is required for creating a Project Budget in Task 2 (used as `linkedEntityId`).
- **Empty State Handling:** If zero projects are returned, log a warning: *"No projects found — proceeding to create a new project via GraphQL (Step B)."* Then continue to Step B.
- **GraphQL Endpoint:** `{{graphql_endpoint_production}}` or `{{graphql_endpoint_sandbox}}`. Refer to `{{graphql_schema}}`.

#### Step B — Create project (conditional)
> **Execute this step only if Step A returned zero projects.** Otherwise, skip directly to Task 2.

Use `projectManagementCreateProject` to create a project for the company using the GraphQL endpoint. For the mandatory parameters (`name`, `customer`, `status`), prompt the user to provide the values. Create the project using the values provided by the user.
Store the `id` of the created project — this value is required for creating a Project Budget in Task 2 (used as `linkedEntityId`).
- **Mutation:** `{{project_creation_query}}`
- **GraphQL Endpoint:** `{{graphql_endpoint_production}}` or `{{graphql_endpoint_sandbox}}`. Refer to `{{graphql_schema}}`.

---

## Task 2: Create the Project Budget (GraphQL)

Use the `projectId` obtained from Task 1 (Step A or Step B) as `linkedEntityId` to create the budget.

{{project_budget_creation_instructions}}

### Data Flow for the Budget Mutation:
- **`linkedEntityId`**: `id` from `projectManagementProjects` (`node.id`) **OR** `id` from the created project in Step B.
- **`budgetType`**: MUST be `"PROJECT"`. Any other value will be rejected by the validator and will not link to a project.
- **`startDate` / `endDate`**: ISO-8601 date strings (`YYYY-MM-DD`).
- **`total`**: **Server-computed** as the sum of `budgetDetails[*].amount`. Any `total` you send in the input is **ignored** — read the computed value back from the response; never treat a caller-supplied `total` as authoritative.
- **`budgetDetails[*]`**: Each line carries `sequenceId`, `order`, `type` (`ITEM`), `itemId`, `unitCost`, `quantity`, `amount`, `description`, `date`, `accountId`, and optionally `klassId` / `locationId`. **The server ASSIGNS each line's `sequenceId` on create and ignores whatever you send** — to update or delete a specific line later you must reuse the *server-assigned* `sequenceId` from a Task 3 read (or the create response), not your input value.
- **`state`** (optional): `"DRAFT"` or `"LOCKED"`. If omitted, the server defaults to **`LOCKED`** (not `DRAFT`), and `LOCKED → DRAFT` is a forbidden one-way transition (see Task 4). Send `state: "DRAFT"` explicitly at create time if you need a draft.

### API Details:
- **Mutation:** `businessPlanningCreateBudget`
- **GraphQL Endpoint:** `{{graphql_endpoint_production}}` or `{{graphql_endpoint_sandbox}}`. Refer to `{{graphql_schema}}`.
- **Documentation:** Refer to `{{project_budget_documentation}}`.

### Mutation Skeleton:
```graphql
mutation businessPlanningCreateBudget($budgetInput: BusinessPlanning_BudgetInput!) {
  businessPlanningCreateBudget(budgetInput: $budgetInput) {
    budget {
      budgetId
      budgetName
      budgetType
      startDate
      endDate
      linkedEntityId
      total
      state
      budgetMetaData { createdBy createdAt }
      budgetDetails {
        sequenceId order type itemId unitCost quantity amount
        description date accountId klassId locationId
      }
    }
  }
}
```

### Variables Payload (best-effort sample — verify against the live schema):

> ⚠️ **Schema verification note:** The field names below match the documented response fields, but the `BusinessPlanning_BudgetInput` SDL is not publicly published. If the server returns an `INPUT_VALIDATION` or `GRAPHQL_VALIDATION_FAILED` error, inspect `errors[0].message` for the canonical field name and adjust. Do **NOT** silently swap field names without surfacing the underlying error.

```json
{{project_budget_create_variables_example}}
```

**Constraints:**
- `budgetType` MUST be `"PROJECT"` — any other value silently creates a non-project budget that won't roll up into the Projects dashboard.
- `linkedEntityId` MUST reference the `projectManagementProject.id` returned by the Project API. Never pass a customer ID or the project's underlying REST sub-customer/Job id here.
- `budgetType` should be a private constant inside the budget-service module, NOT a public method parameter — callers must not be able to override it.
- **One budget per project (1:1).** Creating a second budget for a project that already has one fails with `errorCode: "PNB-INPUT-72"` / `BUDGET_EXIST_WITH_SAME_LINKED_ENTITY_ID`.
- Store the returned `budgetId` **and the server-assigned line `sequenceId`s** — you need them for Tasks 4 and 5. There is **no list query** for budgets, so `budgetId` cannot be rediscovered later; persist it now. The `BusinessPlanning_Budget` type has **no `syncToken`** — do not expect, store, or send one.

---

## Task 3: Read & Hydrate the Budget for UI

Once the budget is created, read it back and display it to the user in a readable format.

### Step A — Read the budget summary
- **Query:** `businessPlanningBudget(budgetId: $budgetId)`
- **Fetch:** `budgetId`, `budgetName`, `budgetType`, `startDate`, `endDate`, `linkedEntityId`, `total`, `state`, `budgetMetaData`, and a first page of `budgetDetails` (including each line's server-assigned `sequenceId`). **Do NOT select `syncToken`** — it does not exist on `BusinessPlanning_Budget` and selecting it fails with `GRAPHQL_VALIDATION_FAILED`. `businessPlanningBudget` requires `budgetId` (`ID!`).

### Step B — Paginated read for long line-item lists
If `budgetDetails` is large, switch to the paginated field `budgetDetailsPaginated` using cursor-based traversal. Use the templated query below verbatim:

```graphql
{{project_budget_details_paginated_query}}
```

Traversal rules:
- Start with `after: null` and a reasonable page size (e.g. `first: 50`).
- After each page, set `after = pageInfo.endCursor` and re-issue.
- Stop when `pageInfo.hasNextPage` is `false`.
- Concatenate all `edges[*].node` into the consolidated line list shown to the user.

### Display Logic:
- Map `linkedEntityId` back to the project's human-readable `name` using the data cached from the GraphQL discovery in Task 1.
- Format the output to show: project name, budget name, start/end date, state, total, and line items with description, unit cost, quantity, amount, and account.
- Show pagination cursors only in verbose/debug mode — end-users should see a flat consolidated list.

---

## Task 4: Update the Project Budget

Use `businessPlanningUpdateBudget` to modify an existing budget — edit a line, add a line, or delete a line.

**Required fields on every update:**
- `budgetId` — the budget's ID returned by Task 2.
- `budgetName` — required (`String!`); the update fails validation if it is omitted.
- There is **no `syncToken`** on this type — do NOT send one (it fails `GRAPHQL_VALIDATION_FAILED`). Do not port SyncToken/optimistic-concurrency patterns from the REST V3 entities to this GraphQL API.

**Line-item semantics (verified live — this is NOT REST V3 full-replace):**
- `budgetDetails` updates **MERGE by `sequenceId`**; they do **not** replace the whole array. A line you leave out is left **unchanged**, NOT deleted. You only need to send the line(s) you are changing/deleting.
- **Edit a line:** re-send it with its **server-assigned** `sequenceId` (from a Task 3 read) and the new values. A `sequenceId` that doesn't match a stored line silently creates a NEW line (duplicate).
- **Add a line:** send a new line with a new, unused `sequenceId`; the server assigns the authoritative id — read it back afterward.
- **Delete a line:** re-send that line with its server-assigned `sequenceId` and **`deleted: true`**. This is the verified single-line-delete mechanism; the server removes the line and recomputes `total`.
- **`total`** is server-computed from the remaining line amounts — do not send it to change the amount; change the line amounts instead.
- **`state`:** `LOCKED → DRAFT` is forbidden — fails with `errorCode: "PNB-INPUT-85"` / `INVALID_LOCKED_STATE`. Because create defaults to `LOCKED`, a budget not explicitly created as `DRAFT` cannot be moved to `DRAFT`.

### Mutation Skeleton:
```graphql
mutation businessPlanningUpdateBudget($budgetInput: BusinessPlanning_BudgetInput!) {
  businessPlanningUpdateBudget(budgetInput: $budgetInput) {
    budget {
      budgetId budgetName total state
      budgetMetaData { lastUpdatedBy updatedAt }
      budgetDetails {
        sequenceId order type itemId unitCost quantity amount
        description date accountId klassId locationId
      }
    }
  }
}
```
> Do NOT select `syncToken` on the budget or `clientMutationId` on the payload — `BusinessPlanning_BudgetPayload` exposes only `budget`, and neither field exists (both fail `GRAPHQL_VALIDATION_FAILED`).

### Variables Payload (best-effort sample — verify against the live schema):

```json
{{project_budget_update_variables_example}}
```

---

## Task 5: Delete the Project Budget

Use `businessPlanningDeleteBudgets` to remove one or more budgets. The mutation accepts a list, so a single deletion still passes an array.

### Mutation Skeleton:
```graphql
mutation businessPlanningDeleteBudgets($budgetIdsInput: BusinessPlanning_BudgetIdsInput!) {
  businessPlanningDeleteBudgets(budgetIdsInput: $budgetIdsInput) {
    budgetResponseList { budgetId status description }
  }
}
```
> Do NOT select `clientMutationId` — `BusinessPlanning_BudgetResponsePayload` exposes only `budgetResponseList`.

### Variables Payload (best-effort sample — verify against the live schema):

```json
{{project_budget_delete_variables_example}}
```

Inspect each `budgetResponseList[*].status` (boolean, `true` on success); `description` is the verified live text `"Delete budget successful."`. Delete is a **hard delete** — any subsequent operation on that `budgetId` (including a read) fails with `errorCode: "PNB-INPUT-024"` / `BUDGET_DELETED`.

---

## Non-Goals (do NOT include in the generated code)

To keep the generated integration focused and avoid scope creep, the following are **out of scope** for this prompt:

- **No OAuth client / token-refresh flow** — the integration assumes a valid access token is already present in `.env`.
- **No UI / web framework** — do not scaffold Spring Boot, Express, Flask, or any HTTP server. The deliverable is a CLI/library, not a web app.
- **No persistent database** — do not introduce JPA, Hibernate, SQLAlchemy, Mongoose, etc. Hold state in memory for the duration of the run.
- **No Intuit official SDK for the GraphQL `businessPlanning*` operations** — those SDKs do not expose typed bindings for these mutations. Use raw HTTP (e.g. Java `HttpClient`, Python `httpx`, Node `fetch`) for all GraphQL calls in this prompt.
- **Required artifacts only**: source files, a `README.md`, a dependency manifest (`build.gradle` / `requirements.txt` / `package.json` / etc.), a runnable entry point that exercises Tasks 1–5 end-to-end, and a `.env.example`.

## Technical Best Practices:
- **Error Handling:** Include specific error-handling blocks for:
  - `401 Unauthorized` — prompt token refresh.
  - `GRAPHQL_VALIDATION_FAILED` (HTTP 400) — a selected field doesn't exist (e.g. `syncToken`, `clientMutationId`) or a required arg is missing (e.g. `businessPlanningBudget` without `budgetId`). Select only fields that exist on `BusinessPlanning_Budget`.
  - **GraphQL errors on HTTP 200** — business/validation errors return 200 with `data: null` and an `errors[]` array carrying `extensions.errorCode`. Common `budgeting-service` codes: `PNB-INPUT-72` (`BUDGET_EXIST_WITH_SAME_LINKED_ENTITY_ID` — project already has a budget), `PNB-INPUT-75` (`INVALID_BUDGET_PROJECT_ID` — bad/unknown `linkedEntityId`), `PNB-INPUT-85` (`INVALID_LOCKED_STATE` — `LOCKED → DRAFT`), `PNB-INPUT-87` (`PROJECT_COST_METHOD_IS_BASIC` — project uses Basic cost method), `PNB-INPUT-024` (`BUDGET_DELETED` — operating on a deleted budget). Also `PNB-PCBM-008` / `REALM_SKU_DOES_NOT_MATCH` — company not Advanced+Construction Pack / IES (Task 1 pre-flight should catch this first).
- **Observability:** Include structured logging. You **MUST** capture and log the `intuit_tid` header from every Intuit API response for traceability. **NEVER** log access tokens, OAuth secrets, or PII.
- **Output (integration mode: `{{integration_mode}}`):** Provide modular, clean code and a runnable verification example.
  - **If mode is `new`:** Create a self-contained project in a dedicated folder named `project-budgets-{{language_framework}}` (no spaces). Include a `README.md` explaining how to run the code, a dependency manifest, and a brief architectural diagram showing the data flow from Projects GraphQL → Business Planning GraphQL.
  - **If mode is `existing`:** Produce modular, well-documented functions/classes/files designed to be imported into an existing codebase. Do **not** scaffold a new project structure. Provide clear integration notes describing which files to add, what imports are needed, and how to wire the functions into an existing app.

---

## 🛑 AI Guardrails (Anti-Hallucination Constraints)

**CRITICAL INSTRUCTIONS - YOU MUST ADHERE TO THE FOLLOWING:**
1. **No Hallucinations:** Do not invent, guess, or hallucinate API endpoints, GraphQL properties, or SDK methods not explicitly provided here or in the linked documentation. The operations are exactly `businessPlanningCreateBudget`, `businessPlanningBudget`, `businessPlanningUpdateBudget`, and `businessPlanningDeleteBudgets`.
2. **Strict SDK/Library Usage:** If an official SDK or library is specified, use ONLY methods/classes that exist in its latest public release. There is no typed SDK binding for these `businessPlanning*` GraphQL mutations — build the request as a plain object and POST via a plain HTTP client.
3. **Provided Links Only:** Derive all API syntax, structure, and constraints strictly from the provided links and this template.
4. **Endpoint Strictness:** Budget CRUD is GraphQL (`{{graphql_endpoint_production}}` / `{{graphql_endpoint_sandbox}}`); the Task 1 pre-flight is REST v3 (`https://quickbooks.api.intuit.com` / `https://sandbox-quickbooks.api.intuit.com`). Do not send one to the other's host, and do not generate a REST budget endpoint — there is no REST budget entity.
5. **No `syncToken`:** `BusinessPlanning_Budget` has no `syncToken`. Do not select it in a query or send it in an update — it fails `GRAPHQL_VALIDATION_FAILED`. Do NOT port optimistic-concurrency patterns from REST V3.
6. **No `clientMutationId`:** create/update payloads expose only `budget`; delete exposes only `budgetResponseList`. Do not select `clientMutationId`.
7. **`sequenceId` is server-assigned:** the server assigns line `sequenceId`s and ignores yours on create. On update/delete, always send the exact server-assigned `sequenceId` from a read — a mismatch silently creates a new line.
8. **Line updates MERGE, they do not full-replace:** omitting a line leaves it unchanged (NOT deleted). To delete a line, send it with its `sequenceId` and `deleted: true`. Never assume omission deletes.
9. **`total` is server-computed:** it is the sum of `budgetDetails[*].amount`; the input `total` is ignored. To change the total, change the line amounts.
10. **`state` rules:** create defaults to `LOCKED` (not `DRAFT`); `LOCKED → DRAFT` is forbidden (`PNB-INPUT-85`). Only emit `DRAFT` or `LOCKED`.
11. **`budgetType` MUST be `"PROJECT"`** and `linkedEntityId` MUST be the `projectManagementProject.id` (not a customer/Job id). One budget per project (1:1).
12. **GraphQL errors on 200:** never treat HTTP 200 as unconditional success — inspect `errors[]` (business/validation errors return 200 with `data: null`) and surface `extensions.errorCode`.
13. **If Blocked/Missing Info:** if required fields to compile a functional request are missing, STOP and state what's missing instead of guessing.

I have provided you with all the necessary context and instructions. Please generate the code and documentation as per the instructions.
