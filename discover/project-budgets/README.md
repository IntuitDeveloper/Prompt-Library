# Project Budgets Prompt

Generates AI-ready prompts that produce a runnable integration for the **QuickBooks Project Budget API** (Use Case 6) — verifying a company is eligible for projects, discovering or creating a project, then creating, reading (with pagination), updating, and deleting a project-linked budget via the Business Planning GraphQL API.

> ℹ️ **Available only for Intuit Enterprise Suite (IES) and QuickBooks Online Advanced.** Project Budgets are not supported on QBO Plus or non-US regions. The generated capability check halts early with a user-friendly error if the company isn't eligible.

## Folder Contents

```
project-budgets/
├── README.md                                       # This file
└── prompt-template-project-budgets.md              # The prompt template (do not edit unless updating the workflow)
```

The template lives here; the merge script and config live one level up in `discover/`.

## Authentication & `.env` Setup

The generated code assumes the caller already has a valid **OAuth 2.0 access token** and **realmId** available in a `.env` file. The prompt is intentionally scoped to API integration logic — it does **not** generate an OAuth client.

### Required `.env` variables

```bash
QBO_ACCESS_TOKEN=<access token for the target environment>
QBO_REALM_ID=<company / realm id for the target environment>
QBO_MINOR_VERSION=75
QBO_ENV=production   # or "sandbox"
```

### Environment endpoints

| Env | GraphQL host | REST host |
|---|---|---|
| Production | `https://qb.api.intuit.com/graphql` | `quickbooks.api.intuit.com` |
| Sandbox | `https://qb-sandbox.api.intuit.com/graphql` | `sandbox-quickbooks.api.intuit.com` |

### How to get an access token

Use the **[Intuit OAuth 2.0 Playground](https://developer.intuit.com/app/developer/playground)** to generate an access token (sandbox or production). Paste the token into `.env` and run the generated app.

### Required OAuth Scopes

| Scope | Used For |
|---|---|
| `project-management.project` | Reading/creating projects via the Projects GraphQL API |
| `com.intuit.quickbooks.accounting` | CompanyInfo + Preferences pre-flight checks, and Business Planning GraphQL access |

A missing scope or disabled Projects feature surfaces as `403 Forbidden` — the generated capability check halts early with a user-friendly message pointing the developer at QuickBooks Settings > Account and Settings > Projects.

## What the Generated Code Does

| Task | Layer | Purpose |
|---|---|---|
| 1. Pre-flight + Discover | REST + GraphQL | Verify the company is QBO Advanced/IES + US + ProjectsEnabled. Then list existing projects via `projectManagementProjects`, or create one via `projectManagementCreateProject` if none exist. |
| 2. Create Budget | GraphQL | Call `businessPlanningCreateBudget` with `budgetType="PROJECT"` and `linkedEntityId=<projectId>` plus the configured line items. Capture `budgetId` and the **server-assigned** line `sequenceId`s. (There is **no `syncToken`** on `BusinessPlanning_Budget`.) |
| 3. Read & Hydrate | GraphQL | Read the budget back via `businessPlanningBudget` (with `budgetDetailsPaginated` for long line lists), then map `linkedEntityId` to the human-readable project name for display. |
| 4. Update | GraphQL | `businessPlanningUpdateBudget` — updates **MERGE by `sequenceId`** (send only the lines you change; omitting a line leaves it unchanged, it is NOT deleted). Delete a single line by sending it with its server-assigned `sequenceId` and `deleted: true`. `total` is server-computed. No `syncToken`. |
| 5. Delete | GraphQL | `businessPlanningDeleteBudgets` accepts a list of `budgetIds` and returns a status per ID (hard delete). |

## The "PROJECT-Type Only" Rule (Non-Negotiable)

Only budgets with `budgetType="PROJECT"` can carry `linkedEntityId` pointing to a project. Sending any other type silently creates a non-project budget that **will not** roll up in the QuickBooks Projects dashboard.

| Field | Required Value |
|---|---|
| `budgetType` | `"PROJECT"` |
| `linkedEntityId` | A project ID returned by `projectManagementProjects` or `projectManagementCreateProject` |

## Generating a Prompt

From the `discover/` directory:

```bash
# Default (uses prompt-config.json)
node merge-prompt.js

# Language-specific
node merge-prompt.js --language java
node merge-prompt.js --language python
node merge-prompt.js --language nodejs
```

Choose option **5** at the menu prompt. Output is written to `generated-prompts/project-budgets-ready-prompt.md`. Paste that file into your AI coding assistant (Copilot, Cursor, ChatGPT, Windsurf) to scaffold the integration project.

## Common Errors

| Code | Most Likely Cause |
|---|---|
| `400` w/ "Project not found" | Passed a non-project ID (e.g. a customer ID) as `linkedEntityId` |
| `200` w/ `PNB-INPUT-87` | Project uses the **Basic** cost method — budgets require a non-Basic (Advanced) cost method |
| `200` w/ `PNB-INPUT-72` | Project already has a budget (1:1) — only one budget per project |
| `200` w/ `PNB-INPUT-85` | Attempted `LOCKED → DRAFT` — forbidden; create as `DRAFT` explicitly if needed |
| `400` `GRAPHQL_VALIDATION_FAILED` | Selected a field that doesn't exist (e.g. `syncToken`, `clientMutationId`) — select only fields on `BusinessPlanning_Budget` |
| `401` | Expired access token — refresh in the [OAuth Playground](https://developer.intuit.com/app/developer/playground) |
| `403` | Missing scope, or company isn't IES/Advanced, or Projects feature disabled |
| `200` with `errors` array | GraphQL partial failure — always inspect the response body, even on HTTP 200 |

## Reference

- Project Budget use case (UC6): https://developer.intuit.com/app/developer/qbo/docs/workflows/manage-projects/use-cases#use-case-6
- `businessPlanningCreateBudget`: https://developer.intuit.com/app/developer/gql/docs/api/qbexternal/mutations/businessPlanningCreateBudget
- `businessPlanningUpdateBudget`: https://developer.intuit.com/app/developer/gql/docs/api/qbexternal/mutations/businessPlanningUpdateBudget
- `businessPlanningDeleteBudgets`: https://developer.intuit.com/app/developer/gql/docs/api/qbexternal/mutations/businessPlanningDeleteBudgets
- `businessPlanningBudget` (query): https://developer.intuit.com/app/developer/gql/docs/api/qbexternal/queries/businessPlanningBudget
