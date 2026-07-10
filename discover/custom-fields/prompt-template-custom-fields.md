**Role:** You are a Principal Software Engineer specializing in QuickBooks Online integrations.

**Context:** I am developing a `{{language_framework}}` application using `{{typing_system}}` typing. I need to implement a workflow that uses the QuickBooks Custom Fields APIs to attach custom metadata to `{{type_of_transaction}}` transactions (and/or to `Customer` / `Vendor` / `Project` entities, depending on QBO tier). Assume the application already has a valid OAuth 2.0 access token, realmId (Company ID), and environment (production or sandbox) available in the `.env` file. Note: the Custom Fields GraphQL API is production-only — Tasks 1, 4, and 5 always target production regardless of `QBO_ENV`. Tasks 2 and 3 (REST V3) honor `QBO_ENV`. Focus strictly on the API integration logic.

**References:**
- Custom Fields documentation: `{{custom_field_documentation}}`
- GraphQL schema reference: `{{graphql_schema}}`
- OAuth 2.0 documentation: `{{oauth2-documentation}}`
- Official sample apps: `{{custom_field_sample_app_java}}` · `{{custom_field_sample_app_python}}`

---

## Task 1: Discover Custom Field Definitions (GraphQL)

**Capability Check:** Custom Fields availability and limits vary by QBO tier (Essentials, Plus, Advanced/IES) and by target entity. Entity-level custom fields on `Customer`/`Vendor`/`Project` require Advanced or IES. If any call returns 403 with "Feature Not Enabled" or a tier-insufficient error, surface a user-friendly message: *"Custom Fields are not available for this account's tier or entity. Configure them in QuickBooks settings, or upgrade the account."*

Fetch all active definitions, then filter client-side by `associations[].associatedEntity` to find the ones relevant to your target entity.

- **Endpoint:** `{{graphql_endpoint_production}}` (production-only — no sandbox).
- **Headers:** `Authorization: Bearer <token>`, `Content-Type: application/json`, `realmId: <QBO_REALM_ID>`, and a unique `intuit_tid` per request for log correlation.
- **Query:** `{{custom_field_definitions_query}}`
- **Variables:** `{ "cursor": null }` on the first call; pass `{ "cursor": "<endCursor>" }` while `pageInfo.hasNextPage` is `true`.

### Extract per definition node

- `id` — the GraphQL mutation handle (returns as `udcf_<legacyIDV2>`). Required by the Task 5 update mutation.
- `legacyIDV2` — the value to pass as `DefinitionId` in every REST V3 call. **Critical bridge from GraphQL → REST.** Also required (alongside `id` and `label`) by Task 5.
- `legacyID` — deprecated opaque form. Skip; use `legacyIDV2` everywhere.
- `label`, `dataType`, `required`, `active`, `colorCode`, `entityVersion`, `createdSource` — definition metadata.
- `dropDownOptions[]` — populated for `STRING_LIST` / `OBJECT_LIST` types (empty array `[]` otherwise). Each option: `{ id, value, active, order }`. Validate list-type writes against this set.
- `associations[]` — which entities the definition is scoped to:
  - `associatedEntity` — parent path, one of `"/transactions/Transaction"`, `"/network/Contact"`, `"/work/Project"`.
  - `associationCondition` — `INCLUDED` or `EXCLUDED`. Treat missing as `INCLUDED`.
  - `allowedOperations` — subset of `SEARCH`, `PRINT`, `REPORTS`. Empty list means the field doesn't surface in those UI contexts.
  - `subAssociations[]` — narrows to specific sub-types. **Field is `associatedEntity` (same name as parent, not `associatedSubEntity`)**, with `UPPER_SNAKE_CASE` values. Known valid codes under `/transactions/Transaction`: `SALE` (SalesReceipt), `SALE_INVOICE` (Invoice), `SALE_ESTIMATE` (Estimate), `SALE_CREDIT` (CreditMemo), `SALE_REFUND` (RefundReceipt). Known valid codes under `/network/Contact`: `CUSTOMER`, `VENDOR`. Known valid code under `/work/Project`: `PROJECT`. **Matching is exact** — a sub-association of `SALE` matches SalesReceipt only; it does NOT match Invoices. Use `SALE_INVOICE` for Invoices.

Build an in-memory map keyed by `legacyIDV2` storing `label`, `dataType`, `dropDownOptions`, and `associations`. Handle pagination until `pageInfo.hasNextPage` is `false`.

**Empty State:** If no definitions match the target entity after client-side filtering, surface: *"No active Custom Field definitions found for `{{type_of_transaction}}`. Configure them in QuickBooks settings, or run Task 4 (create)."*

---

## Task 2: Attach Custom Field Values to a Transaction or Entity (REST V3)

{{custom_field_transaction_creation_instructions}}

### Data flow for the CustomField array

- `DefinitionId` = `legacyIDV2` from Task 1 (NOT the GraphQL `id`).
- `Name` = `label` from Task 1 (optional, recommended).
- `Type` and value field derived from Task 1's `dataType`:

| `dataType` | `Type` | Value field | Format |
|---|---|---|---|
| `STRING` | `StringType` | `StringValue` | string |
| `NUMBER` | `NumberType` | `NumberValue` | decimal |
| `DATE` | `DateType` | `DateValue` | `YYYY-MM-DD` |
| `STRING_LIST` / `OBJECT_LIST` | `StringType` | `StringValue` | must match a `value` from `dropDownOptions[]` where `active: true` — validate before sending |
| `UNKNOWN` | (skip) | (skip) | log warning, do not write |

Set exactly one value field per `CustomField` entry.

### API Details

- **Endpoint:** `{{transaction_v3_api_endpoint}}`
- **Required query parameter:** Append `include=enhancedAllCustomFields` to every create/read URL — without it, the response will not include custom-field metadata.
- **Documentation:** `{{rest_v3_api_documentation}}` and `{{custom_field_documentation}}`

### Payload structure

```json
{{custom_field_payload_structure}}
```

**Constraints:**
- Use `minorversion={{minorversion}}` on all REST V3 calls.
- `DefinitionId` must be a `legacyIDV2` from Task 1 — do not invent or hardcode IDs.
- REST V3 **silently drops** `CustomField` entries whose `DefinitionId` doesn't match the target entity's sub-association exactly (e.g. a definition scoped to `SALE` won't attach to an Invoice — only `SALE_INVOICE` will). HTTP 200 returns with the dropped entries omitted and no error. **Compare the response's `CustomField` array against the request and warn on any drops.**

---

## Task 3: Read & Hydrate for UI

Retrieve the entity and display custom field values with human-readable labels.

- **Fetch:** Use `{{get_transaction_endpoint}}` and append `include=enhancedAllCustomFields`.
- **Hydration:** For each `CustomField` in the response, look up `DefinitionId` (= `legacyIDV2`) in the Task 1 map to get `label` and `dataType`.
- **Type-aware reading:** Use the cached `dataType` to read the matching value field (`StringValue` / `NumberValue` / `DateValue`). Parse `DateValue` as `YYYY-MM-DD`.
- **Display:** Show the entity ID, date, total amount, and a labelled list of custom fields and their values.
- **Line Filtering:** Only hydrate `SalesItemLineDetail` lines. Exclude system-generated lines (`SubTotalLineDetail`, `DiscountLineDetail`, `TaxLineDetail`).

---

## Task 4 (optional): Create a New Custom Field Definition (GraphQL)

Use only when your app provisions custom fields as part of onboarding. Requires the `{{custom_field_scope_readwrite}}` scope.

- **Mutation:** `{{custom_field_create_definition_mutation}}`
- **Variables:**
```json
{{custom_field_create_definition_variables_example}}
```

### Input field reference (`AppFoundations_CustomFieldDefinitionCreateInput`)

- `label` (String, required) — display name, **max 30 characters**. Exceeding returns `LABEL_LENGTH_EXCEEDED`.
- `dataType` (enum, required) — `STRING`, `NUMBER`, `DATE`, `STRING_LIST`, `OBJECT_LIST`, or `UNKNOWN`. No `_TYPE` suffix and no `BOOLEAN_TYPE`.
- `active` (Boolean) — `true` on create. Use Task 5 with `active: false` to disable later.
- `required` (Boolean) — when `true`, REST V3 rejects writes that omit the field.
- `associations[]` (required) — list of `{ active, associatedEntity, associationCondition, allowedOperations, subAssociations }`. `associatedEntity` is **path-style on writes** (`"/transactions/Transaction"`, `"/network/Contact"`, `"/work/Project"`). `subAssociations[].associatedEntity` uses UPPER_SNAKE values (`SALE_INVOICE`, `CUSTOMER`, etc.).
- `dropDownOptions[]` — required when `dataType` is `STRING_LIST` or `OBJECT_LIST`. Each: `{ value, order }`.

A single definition can attach to multiple parents (e.g. `/transactions/Transaction` + `/network/Contact`), but combining all three parent paths in one definition returns `MUTUAL_EXCLUSIVITY_IN_SUB_ASSOCIATIONS_VIOLATED` — split into separate definitions.

---

## Task 5 (optional): Update or Disable a Definition (GraphQL)

The schema exposes **one mutation** for both — there's no separate disable mutation. Disable by calling update with `active: false`.

- **Mutation:** `{{custom_field_update_definition_mutation}}`
- **Variables (rename):**
```json
{{custom_field_update_definition_variables_example}}
```
- **Variables (disable):**
```json
{{custom_field_disable_variables_example}}
```

### Required input fields (service layer enforces all three even though the schema marks two optional)

- `id` — the `udcf_*` value from Task 1.
- `legacyIDV2` — the bare numeric value from Task 1. Omitting returns `FIELD_MISSING: "You have to provide a value for legacyIDV2"`.
- `label` — the current label from Task 1. Omitting (even on a disable call) returns `"You must specify a value for label."`.

Optional: `dataType` (risky to change on populated fields), `active`, `associations[]` (full replace, not partial merge), `dropDownOptions[]` (full replace).

Invalidate the Task 1 cache after a successful update.

---

## Technical Best Practices

- **Caching:** Cache the Task 1 definition map for 1 hour. Invalidate after Task 4 or Task 5.
- **Error Handling:** Include blocks for:
  - `401 Unauthorized` (XML body from the gateway, not JSON) — refresh the access token via OAuth.
  - `403 Forbidden` — missing scope, Custom Fields disabled on the company, or app tier below Silver.
  - `400 Bad Request` — log the response body. Common causes: using the GraphQL `id` as `DefinitionId` in REST V3, wrong value field for the `Type`, omitting `include=enhancedAllCustomFields`.
  - **HTTP 200 with `errors[]`** — always inspect; a 200 doesn't mean success. Watch for `extensions.errorCode.errorCode` values like `AUTHORIZATION_DENIED` (missing write scope), `LABEL_LENGTH_EXCEEDED`, `MUTUAL_EXCLUSIVITY_IN_SUB_ASSOCIATIONS_VIOLATED`, `FIELD_MISSING`.
  - **Silent drops** — after every REST V3 create, compare the request's `CustomField` array against the response. Warn on missing entries.
- **Observability:** Capture and log the `intuit_tid` header on every response. NEVER log access tokens, OAuth secrets, or PII.
- **Typing:** Provide `{{typing_system}}` models for `CustomFieldDefinition`, `CustomField`, and (if using Task 4) `CustomFieldDefinitionCreateInput`.
- **Output (integration mode: `{{integration_mode}}`):** Provide modular, clean code and a runnable verification example.
  - **If mode is `new`:** Create a self-contained project in a dedicated folder named `custom-fields-{{language_framework}}` (no spaces). Include a `README.md` explaining how to run the code, a dependency manifest, and a brief architectural diagram showing the data flow from GraphQL to REST.
  - **If mode is `existing`:** Produce modular, well-documented functions/classes/files designed to be imported into an existing codebase. Do **not** scaffold a new project structure. Provide clear integration notes describing which files to add, what imports are needed, and how to wire the functions into an existing app.

---

## Language-Specific SDK Notes

{{sdk_notes}}

---

## 🛑 AI Guardrails (Anti-Hallucination Constraints)

**CRITICAL INSTRUCTIONS - YOU MUST ADHERE TO THE FOLLOWING:**
1. **No Hallucinations:** Do not invent, guess, or hallucinate API endpoints, GraphQL properties, or SDK methods that are not explicitly provided in the context or linked documentation.
2. **Strict SDK/Library Usage:** If an official SDK or library is specified (e.g., Intuit Java SDK), use ONLY the methods and classes that exist in its latest public release. Do not construct fake SDK models. For Custom Fields specifically: GraphQL (Tasks 1, 4, 5) has no SDK — use a plain HTTP client. For REST V3 (Tasks 2 & 3), use the SDK's create/read methods (`DataService.add()` / `findById()` in Java, `dataService.Add<T>()` in .NET, `entity.save(qb=client, params=...)` in Python). Each SDK has a language-specific way to attach the `enhancedAllCustomFields` include parameter; see the language-specific SDK notes for the exact mechanism. (Note: the Node.js SDK has no public hook for this parameter — for Node, build the request body as a plain object with PascalCase keys and POST via plain HTTP with `&include=enhancedAllCustomFields` on the URL.)
3. **Provided Links Only:** You must derive all API syntax, structure, and constraints strictly from the provided links. All HTTP responses (GraphQL and REST) must be parsed according to the provided documentation.
4. **Endpoint Strictness:** Use the exact endpoints and query structures provided. Do not attempt to modify the base URL, append unsupported parameters, or alter the `minorversion={{minorversion}}` requirement.
5. **If Blocked/Missing Info:** If the provided documentation or payload structures lack required fields to compile a functional request, STOP and clearly state what specific information is missing instead of making an educated guess.

I have provided you with all the necessary context and instructions. Please generate the code and documentation as per the instructions.
