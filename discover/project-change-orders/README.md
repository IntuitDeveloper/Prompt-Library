# Project Change Orders Prompt

Generates AI-ready prompts that produce a runnable integration for the **QuickBooks Project Change Order API** (Use Case 7) — verifying eligibility, discovering or creating a project + parent project estimate, then creating, reading, updating, and deleting a project-scoped change order via the Accounting REST V3 `/changeorder` endpoint.

> ℹ️ **Available only for Intuit Enterprise Suite (IES) or QuickBooks Online Advanced with the Construction Pack add-on.** Change orders are not supported on standard QBO Advanced, QBO Plus, or non-US regions. The generated capability check halts early with a user-friendly error if the company isn't eligible.

## Folder Contents

```
project-change-orders/
├── README.md                                              # This file
└── prompt-template-project-change-orders.md               # The prompt template (do not edit unless updating the workflow)
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
| Sandbox | `https://qb-sandbox.api.intuit.com/graphql` | `sandbox-quickbooks.api.intuit.com` (change order sandbox) |

### How to get an access token

Use the **[Intuit OAuth 2.0 Playground](https://developer.intuit.com/app/developer/playground)** to generate an access token (sandbox or production). Paste the token into `.env` and run the generated app.

### Required OAuth Scopes

| Scope | Used For |
|---|---|
| `project-management.project` | Reading/creating projects via the Projects GraphQL API |
| `com.intuit.quickbooks.accounting` | CompanyInfo + Preferences pre-flight, parent-estimate discovery/creation, and ChangeOrder CRUD via REST V3 |

A missing scope or disabled Projects feature surfaces as `403 Forbidden` — the generated capability check halts early with a user-friendly message pointing the developer at QuickBooks Settings > Account and Settings > Projects.

## What the Generated Code Does

| Task | Layer | Purpose |
|---|---|---|
| 1. Pre-flight + Discover | REST + GraphQL | Verify the company is IES or QBO Advanced (Construction Pack) + US + ProjectsEnabled. List/create a project. Then query for an existing project estimate; if none, create one (reusing the markup logic from the Project Estimates prompt). |
| 2. Create Change Order | REST V3 | `POST /v3/company/{realm}/changeorder` with `ProjectRef`, `CustomerRef`, top-level `LinkedTxn` to the parent estimate, AND `LinkedTxn` re-included on every line. |
| 3. Read & Hydrate | REST V3 | `GET /changeorder/{id}` and map `ProjectRef.value` + `LinkedTxn[*].TxnId` back to human-readable names. |
| 4. Update | REST V3 | `sparse: true` at the top level, but the `Line` array is full-replace — always send the complete desired line state with `LinkedTxn` re-included on every line. |
| 5. Delete | REST V3 | `POST /changeorder?operation=delete` with `Id` + current `SyncToken`. The parent estimate is unaffected; the project's contracted total is recalculated. |

## The `LinkedTxn` Rule (verified live)

A change order must carry a `LinkedTxn` (Estimate reference) — **at minimum at the top level.** The **top-level `LinkedTxn` is authoritative**: the server applies its `TxnId` to every line and auto-propagates it onto any line that omits its own. Including it on every line is still recommended for clarity, but a per-line omission is **not** rejected while a top-level `LinkedTxn` is present.

| Field | Required Value |
|---|---|
| Top-level `ProjectRef.value` | Project ID from `projectManagementProjects` |
| Top-level `LinkedTxn[0]` | `{ "TxnId": "<parent estimate id>", "TxnType": "Estimate" }` — **required; authoritative** |
| Each line's `LinkedTxn[0]` | Recommended; if omitted, the server backfills the top-level value |
| `TotalAmt` | **Omit** — read-only, computed by the server from line `Amount` values |

Only **total absence** of `LinkedTxn` (no top-level AND no line) is rejected — with error `2020` ("Required parameter LinkedTxn with an Estimate reference is required"). Differing per-line `TxnId`s do **not** error; the server silently normalizes every line to the top-level `TxnId`, so a change order always references exactly one parent estimate.

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

Choose option **6** at the menu prompt. Output is written to `generated-prompts/project-change-orders-ready-prompt.md`. Paste that file into your AI coding assistant (Copilot, Cursor, ChatGPT, Windsurf) to scaffold the integration project.

## Common Errors

| Code | Most Likely Cause |
|---|---|
| `400` / `2020` (Required param missing) | **Total absence** of `LinkedTxn` — none at the top level AND none on any line. A per-line omission is NOT an error (the server backfills it from the top-level `LinkedTxn`). |
| `400` / `5010` (Stale Object Error) | The `SyncToken` sent on update/delete is not current — re-read the change order, then retry once. |
| `400` w/ "Parent estimate has no ProjectRef" | The parent estimate referenced by `LinkedTxn` is a standalone (non-project) estimate |
| `400` w/ `TotalAmt` | `TotalAmt` is read-only — remove it from the request body |
| `400` after update | The `Line` array does not support sparse updates — always read-modify-write the complete array |
| `401` | Expired access token — refresh in the [OAuth Playground](https://developer.intuit.com/app/developer/playground) |
| `403` | Missing scope, or company isn't IES/QBO Advanced+Construction Pack, or Projects feature disabled |

## Reference

- Project Change Order use case (UC7): https://developer.intuit.com/app/developer/qbo/docs/workflows/manage-projects/use-cases#use-case-7
- Project change order error codes: https://developer.intuit.com/app/developer/qbo/docs/develop/troubleshooting/error-codes#project-change-order-error-codes
- Accounting REST V3 reference: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/account
