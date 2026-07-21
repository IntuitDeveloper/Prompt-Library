# Custom Fields Prompt

Generates AI-ready prompts for integrating with the **QuickBooks Custom Fields APIs** — discovers active custom field definitions via **GraphQL**, attaches custom metadata to QuickBooks transactions and to `Customer`/`Vendor` entities via **REST V3**, and reads them back with human-readable labels.

> ℹ️ **Production only.** The Custom Fields GraphQL API does **not** have a documented sandbox endpoint — the official docs list only the production GraphQL host. Test using free non-expiring partner test accounts (request via the Intuit Partner Program). The REST V3 calls in Tasks 2 & 3 do still support sandbox for the entity payload, but the Task 1 / 4 / 5 GraphQL operations are production-only.
>
> ⚠️ **Silver+ partner tier required.** The Custom Fields API is a premium API restricted to Silver, Gold, and Platinum partners — Builder-tier apps will receive `403 Forbidden`. Upgrade on the [Intuit Developer Portal](https://developer.intuit.com); if access is missing on a paid tier, open a support ticket.

## What This Prompt Produces

When you paste the generated prompt into an AI coding assistant (Claude, Copilot, Cursor, ChatGPT, etc.), it generates a complete integration covering:

1. **Task 1 — Discover Custom Field Definitions (GraphQL)**
   - POSTs the `appFoundationsCustomFieldDefinitions` query to the GraphQL endpoint, with a `filters` input (plural — `AppFoundations_CustomExtensionsDefinitionFilterBy`) using primitive fields (the shipped query sends `active: true` only) — no `{ equals: ... }` wrappers. Narrowing to the target entity is done **client-side** (see the `subType` note below)
   - Extracts `id` (lowercase — schema does NOT expose `Id`), **`legacyIDV2`**, `label`, `dataType`, `required`, `dropDownOptions[]`, and `associations[]` per definition
   - Paginates via `pageInfo.endCursor` / `pageInfo.hasNextPage` until all definitions are collected
   - Builds an in-memory map keyed by **`legacyIDV2`** (the value REST V3 will need) storing `label`, `dataType`, `dropDownOptions`, and `associations`
2. **Task 2 — Entity creation (REST V3)** — creates a transaction (e.g., `salesreceipt`, `invoice`, `bill`) or a `Customer` / `Vendor` / `Project` with a `CustomField` array attached. Sets `DefinitionId = legacyIDV2` from Task 1. Type-aware: chooses `StringValue` / `NumberValue` / `DateValue` based on each definition's `dataType`. **For `STRING_LIST` / `OBJECT_LIST` types, validates the written value against the definition's `dropDownOptions[]` before sending** — REST V3 will accept arbitrary strings, but they won't match QBO's UI dropdown and downstream features will break. **All requests must include `?include=enhancedAllCustomFields` in the query string** — without it, the response will not return the full custom-field metadata.
3. **Task 3 — Read & hydrate** — retrieves the created entity via REST V3 (with `?include=enhancedAllCustomFields`) and displays it with human-readable labels and type-correct value reads (using the cached definition map from Task 1).
4. **Task 4 (optional) — Create a new definition (GraphQL)** — calls `appFoundationsCreateCustomFieldDefinition` to programmatically provision a new custom field. Skip unless your app provisions fields as part of onboarding (e.g. an inventory app that requires a "SKU" field on every Invoice). Requires the write scope `app-foundations.custom-field-definitions` (no `.read` suffix).

Plus: structured error handling (`401`, `400`, `403`, GraphQL errors on HTTP 200), `intuit_tid` observability logging, definition caching, and tier-awareness checks (see capability table below).

## Capability by QBO Tier (Important)

The Custom Fields API enforces hard limits per QBO product tier. Generated code that assumes "Vendor custom fields work everywhere" will break silently on Essentials. The prompt instructs the AI to surface tier-mismatch errors instead of letting empty GraphQL responses look like "no fields configured."

| Tier | Max custom fields | Supported transactions | Supported entities |
|---|---|---|---|
| **Essentials** | 3 | SalesReceipt, Invoice, Estimate, CreditMemo, RefundReceipt | *(none — transactions only)* |
| **Plus** | 4 | SalesReceipt, Invoice, Estimate, CreditMemo, RefundReceipt, PurchaseOrder | *(none — transactions only)* |
| **Advanced / Intuit Enterprise Suite** | 12 | All of Plus + Purchase (Cash/Check/CC), Bill, Credit Card Payment, VendorCredit | Customer, Vendor, Projects |

**Tier detection:** No GraphQL/REST field returns the QBO tier directly. Generated code should either (a) accept the tier as configuration, or (b) treat an empty Task 1 response on a known-configured field as a tier-mismatch hint and surface that to the developer.

## The `legacyIDV2` Bridge (Non-Negotiable)

The GraphQL response returns two ID-like fields per definition:

| Field | Use |
|---|---|
| `id` | GraphQL internal ID (lowercase — the schema does NOT expose `Id`) — for GraphQL operations **only** |
| `legacyIDV2` | The value to pass as `DefinitionId` in **every** REST V3 call |

Using the GraphQL `id` as `DefinitionId` in REST V3 will return **`400 Bad Request`**. The generated code enforces this bridge by keying the definition map on `legacyIDV2` everywhere.

## GraphQL Filter Shape (Easy to Get Wrong)

The `appFoundationsCustomFieldDefinitions` query takes an argument named **`filters`** (plural). The input type is `AppFoundations_CustomExtensionsDefinitionFilterBy` and its fields are **primitives** — there is no `{ equals: ... }` predicate wrapper:

```graphql
appFoundationsCustomFieldDefinitions(
  filters: { active: true }   # ✅ what the shipped query uses — filter by target entity CLIENT-SIDE
  first: 50
) { edges { node { id legacyIDV2 label dataType active } } pageInfo { endCursor hasNextPage } }
```

> **On entity/`subType` filtering:** the generated code filters by `active` server-side and then narrows to the target entity **client-side** via `associations[].associatedEntity` / `subAssociations[]` (see the template Task 1). A server-side `subType` filter argument is **not used by the shipped query** and its behavior is unverified — do not rely on it; filter client-side as the template does.

```graphql
# ❌ Wrong — `filter` (singular) does not exist
appFoundationsCustomFieldDefinitions(filter: { ... })
# ❌ Wrong — there is no `{ equals: }` wrapper on the filter fields
filters: { active: { equals: true }, subType: { equals: "invoice" } }
# ❌ Wrong — `subType` is only an input filter, NOT a node field
node { Id subType label }
```

The full `filters` input fields: `active: Boolean`, `subType: String`, `entityType: String`, `dataType: AppFoundations_CustomExtensionDataType` (enum), `ids: [ID]`.

## Type-Aware Value Mapping

Custom Field definitions have a `dataType` (from GraphQL) that determines which value field to populate on the REST V3 entity. The official `AppFoundations_CustomExtensionDataType` enum has these values:

| GraphQL `dataType` | REST V3 `Type` | Value field to set | Format | Validation |
|---|---|---|---|---|
| `STRING` | `StringType` | `StringValue` | string | none (free text) |
| `NUMBER` | `NumberType` | `NumberValue` | decimal | numeric only |
| `DATE` | `DateType` | `DateValue` | `YYYY-MM-DD` | RFC3339 date |
| `STRING_LIST` | `StringType` | `StringValue` | must match an active `Value` from `dropDownOptions[]` (case-sensitive) | **strict — reject pre-write** |
| `OBJECT_LIST` | `StringType` | `StringValue` | must match an active `Value` from `dropDownOptions[]` | **strict — reject pre-write** |
| `UNKNOWN` | *(skip)* | *(skip)* | Skip with logged warning | always skip |

> The published `AppFoundations_CustomExtensionDataType` enum does not list `BOOLEAN`. Older legacy-REST docs reference a `BooleanType` / `BooleanValue` pairing — confirm against the live schema if you see a boolean type returned. The generated code should treat any `dataType` outside the documented set as `UNKNOWN` and surface a warning.

Every `CustomField` entry must populate **exactly one** value field. Supplying zero or more than one is a schema violation.

The prompt instructs the AI to **read `dataType` from each definition** and choose the correct REST V3 `Type` and value field at write time, and to read the correct value field at hydration time in Task 3. Generated code that hardcodes `StringValue` for every field will not pass the type-aware reading check in Task 3.

## How To Generate The Prompt

From the `discover/` directory:

```bash
# Default (uses prompt-config.json — integration_mode "new" scaffolds a sibling folder)
node merge-prompt.js
# then select choice 3 at the menu

# Language-specific (selects the right sdk-notes/<lang>.md)
node merge-prompt.js --language java
node merge-prompt.js --language python
node merge-prompt.js --language dotnet
```

Output: `discover/generated-prompts/custom-fields-ready-prompt.md`

Copy that file's contents into your AI assistant.

## Authentication & `.env` Setup

The generated code assumes the caller already has a valid **OAuth 2.0 access token** and **realmId**:

```bash
QBO_ACCESS_TOKEN=<production access token>
QBO_REALM_ID=<production company / realm id>
QBO_MINOR_VERSION=75
```

### Endpoints

The Custom Fields GraphQL API is **production-only** — no sandbox is documented.

| Surface | Host |
|---|---|
| GraphQL (Tasks 1, 4, 5) | `https://qb.api.intuit.com/graphql` |
| REST V3 (Tasks 2, 3) | `https://quickbooks.api.intuit.com` *(sandbox `https://sandbox-quickbooks.api.intuit.com` available for the entity payload itself, but the CF definitions still come from prod GraphQL)* |

All REST V3 calls must include `?include=enhancedAllCustomFields` in the query string.

Use the **[Intuit OAuth 2.0 Playground](https://developer.intuit.com/app/developer/playground)** to generate a production access token. For dev/test work, request a free non-expiring partner test account via the Intuit Partner Program rather than sandbox.

## Required OAuth Scopes

The generated code assumes the app is authorized with the scopes it needs. The `.read` and unsuffixed scopes are **different scope strings** — requesting `.read` does NOT grant write access.

| Scope | Used For | Required for |
|---|---|---|
| `app-foundations.custom-field-definitions.read` | **Read** definitions via GraphQL | Task 1, Task 3 (hydration uses cache from Task 1) |
| `app-foundations.custom-field-definitions` | **Read + write** definitions via GraphQL (call `appFoundationsCreateCustomFieldDefinition`) | Task 4 only |
| `com.intuit.quickbooks.accounting` | Creating and reading transactions/entities via REST V3 | Task 2, Task 3 |

A `403 Forbidden` on the GraphQL query usually means `app-foundations.custom-field-definitions.read` is missing, Custom Fields are not enabled at the company level, or the app is not on a Silver/Gold/Platinum partner tier. A `403` on the REST V3 calls usually means `com.intuit.quickbooks.accounting` is missing. A `403` on the create-definition mutation means the unsuffixed `app-foundations.custom-field-definitions` scope is missing (the `.read` scope alone won't work for writes).

## Configuration

All values are sourced from `discover/prompt-config.json` (or `prompt-config-existing.json` for drop-in mode). Custom-fields-specific keys:

| Key | What it controls | Default |
|---|---|---|
| `type_of_transaction` | Transaction type the custom fields attach to (also passed as GraphQL `subType` filter) | `salesreceipt` |
| `custom_field_documentation` | Docs URL injected into the prompt | Custom Fields workflow page |
| `custom_field_scope_read` | OAuth scope for Task 1/3 (read) | `app-foundations.custom-field-definitions.read` |
| `custom_field_scope_readwrite` | OAuth scope for Task 4 (write) | `app-foundations.custom-field-definitions` |
| `custom_field_definitions_query` | GraphQL query for fetching active definitions (includes `dropDownOptions`, `associations`, cursor variable) | `query GetCustomFieldDefinitions($cursor: String) { ... }` |
| `custom_field_create_definition_mutation` | GraphQL mutation for Task 4 | `mutation CreateCustomFieldDefinition($input: ...) { ... }` |
| `custom_field_create_definition_variables_example` | Example variables JSON for Task 4 | A `STRING` definition associated with `"transaction"` |
| `custom_field_payload_structure` | JSON shape of the `CustomField` array in the REST payload (string-typed example) | `[ { "DefinitionId": ..., "Type": "StringType", "StringValue": ... } ]` |
| `custom_field_transaction_creation_instructions` | Free-form instructions for Task 2 | Defaults to creating with item id 1, customer 1, amount 111 |
| `minorversion` | REST V3 minor version | `75` |

Shared keys (also used by Dimensions, Projects, and Sales Tax prompts):

- `language_framework`, `typing_system`, `integration_mode`
- `graphql_endpoint_production`, `graphql_schema` (the Custom Fields GraphQL API has no sandbox; `graphql_endpoint_sandbox` is unused here)
- `rest_baseurl_production`, `rest_baseurl_sandbox` (REST V3 sandbox is fine for Tasks 2/3 entity payloads)
- `transaction_v3_api_endpoint`, `get_transaction_endpoint`, `rest_v3_api_documentation`
- `java_sdk_version`, `java-sdk-documentation`, `oauth2-documentation`, `php-sdk-documentation`
- `custom_field_sample_app_java`, `custom_field_sample_app_python`

## Supported Entities

Custom Fields support varies by entity. Confirmed entities for use with this prompt:

**Transactions:** `Invoice` · `SalesReceipt` · `Estimate` · `CreditMemo` · `RefundReceipt` · `Bill` · `Purchase` · `VendorCredit` · `PurchaseOrder` · `JournalEntry`

**Entities:** `Customer` · `Vendor`

Always confirm support for your specific entity against the [Custom Fields API documentation](https://developer.intuit.com/app/developer/qbo/docs/workflows/create-custom-fields) before generating code.

## Integration Mode (`new` vs. `existing`)

Same as Dimensions, Projects, and Sales Tax — controlled by `integration_mode` in the config:

| Mode | What the AI produces |
|---|---|
| `new` | Self-contained folder `custom-fields-<lang>/` with README, dependency manifest, and architecture diagram showing GraphQL discovery → legacyIDV2 bridge → REST creation → hydration |
| `existing` | Drop-in modules with integration notes — no new folder created |

Use `prompt-config-existing.json` (or set `integration_mode: "existing"` in your config) when pasting the prompt into an existing codebase.

## Anti-Hallucination Guardrails

The prompt enforces these hard rules on the AI:

1. **No invented endpoints, GraphQL field names, or `DefinitionId`s** — derive everything from provided docs and the live query
2. **`legacyIDV2` is the REST bridge** — never use the GraphQL `id` as `DefinitionId`
3. **Production-only GraphQL** — the Custom Fields GraphQL API has no sandbox; don't generate a `QBO_ENV=sandbox` branch for Tasks 1, 4, or 5. REST V3 in Tasks 2/3 still has a sandbox option, but the CF discovery hits production GraphQL either way.
4. **GraphQL filter shape** — argument is `filters` (plural) with primitive fields (no `{ equals: }` wrappers); node fields are lowercase `id` and don't include `subType`
5. **REST URL must include `&include=enhancedAllCustomFields`** on every create/read of an entity with custom fields
6. **Provided links only** — no external API references
7. **GraphQL errors on 200** — always inspect the `errors` array, not just the HTTP status
8. **Strict SDK usage** — SDKs handle REST (Tasks 2 & 3) only; Task 1 GraphQL discovery uses a plain HTTP client because no official SDK supports GraphQL today
9. **Type-aware value mapping** — read `dataType` from GraphQL, write the matching value field in REST V3; the published enum does not include `BOOLEAN`, but the AI should follow the live schema if it differs
10. **Stop if blocked** — state what's missing instead of guessing

These are enforced by the "🛑 AI Guardrails" section at the bottom of the template.

## Per-Language SDK Notes (`sdk-notes/`)

Language-specific SDK guidance injected into the template via the `{{sdk_notes}}` placeholder. Tells the AI exactly which SDK classes/methods to use so it doesn't hallucinate fake method signatures.

**No SDK supports GraphQL today** — every language note directs Task 1 (GraphQL discovery) to a plain HTTP client. SDK-backed languages use the SDK for Tasks 2 & 3 (REST V3 creation and read).

| Language | File | Strategy |
|---|---|---|
| Java | `sdk-notes/java.md` | Task 1: Apache HttpClient. Tasks 2 & 3: `ipp-v3-java-devkit` (`DataService.add()` + `CustomField` model) |
| .NET | `sdk-notes/dotnet.md` | Task 1: `System.Net.Http.HttpClient`. Tasks 2 & 3: `IppDotNetSdkForQuickBooksApiV3` (`DataService.Add<T>()` + `CustomField` model) |
| PHP | `sdk-notes/php.md` | Task 1: `GuzzleHttp\Client`. Tasks 2 & 3: `quickbooks/v3-php-sdk` (`DataService::Add()` + `IPPCustomField` model) |
| Node.js | `sdk-notes/nodejs.md` | Plain HTTP throughout — `axios` or native `fetch` (no official Node SDK) |
| Python | `sdk-notes/python.md` | Plain HTTP throughout — `requests` (no official Python SDK) |
| Ruby | `sdk-notes/ruby.md` | Plain HTTP throughout — `Net::HTTP` or `faraday` (community gem coverage uneven) |

**Fallback:** Any language without a matching file falls back to a generic "use plain HTTP" message generated by `merge-prompt.js:loadSdkNotes()`. Unsupported languages (Rust, Go, Kotlin, etc.) still produce valid prompts.

**To add a new language:**
1. Create `sdk-notes/<language>.md` following the structure of the existing files (Task 1 GraphQL → Task 2 REST create → Task 3 REST read → install)
2. Run `node merge-prompt.js --language <language>` from `discover/`

## File Structure

```
custom-fields/
├── README.md                          # This file
├── prompt-template-custom-fields.md   # The template — {{placeholder}} tokens get substituted at merge time
└── sdk-notes/                         # Per-language SDK guidance injected via {{sdk_notes}}
    ├── java.md
    ├── dotnet.md
    ├── php.md
    ├── nodejs.md
    ├── python.md
    └── ruby.md
```

## Common Errors

| Code | Most Likely Cause |
|---|---|
| `400` on GraphQL with `GRAPHQL_VALIDATION_FAILED` | Selecting fields that don't exist on the schema. Common mistakes: `Id` / `Value` (capital) on `dropDownOptions` — the schema uses lowercase `id` / `value`; or using `filter` (singular) instead of `filters` (plural); or wrapping primitive filter fields in `{ equals: ... }` predicates |
| `400` on REST V3 | Using the GraphQL `id` instead of `legacyIDV2` as `DefinitionId`, populating the wrong value field for the `dataType`, omitting `?include=enhancedAllCustomFields` from the URL, or exceeding the entity's custom-field cap (see tier table) |
| `401` (XML body) | Expired access token — refresh in the [OAuth Playground](https://developer.intuit.com/app/developer/playground). Note: gateway returns XML for auth failures, not JSON. |
| `403` on GraphQL | Missing `app-foundations.custom-field-definitions.read` scope, Custom Fields disabled on the company, or app is on Builder tier (premium API requires Silver+) |
| `403` on REST V3 | Missing `com.intuit.quickbooks.accounting` scope |
| **`200` with `data: null` and `errors[].extensions.errorCode.errorCode = "AUTHORIZATION_DENIED"`** | This is what a missing **write** scope (Task 4) looks like in practice — NOT a clean 403. The `errors[].message` is `"access denied"`, `extensions.service` is `"custom-extensions-service"`. Re-auth the app with the unsuffixed `app-foundations.custom-field-definitions` scope. |
| `200` with other `errors` | GraphQL partial failure — always inspect the response body, even on HTTP 200 |
| Empty definitions response when you expected results | Most likely a **tier mismatch** (your target entity isn't supported on this QBO tier — see capability table). Less common: actually no definitions configured. Empirically, `subType` and `entityType` filters are unreliable for narrowing — the prompt fetches all active definitions and filters client-side. |
| Custom field values come back wrong on read | Generated code is reading `StringValue` for every field. Verify Task 3's type-aware reading branch is actually consulting the cached `dataType` before choosing a value field |
| Custom field metadata missing on REST V3 read | The URL is missing `?include=enhancedAllCustomFields` — add it to every create and read. Without the flag, the API returns only a legacy `DefinitionId: "1"` placeholder (mapped to the legacy 3-string-fields slot) with no `StringValue`. Verified in production. |
| HTTP 200 on create but `CustomField` array empty or missing entries | The `DefinitionId` isn't associated with the target entity type (e.g., a definition created for `Invoice` was sent on a `SalesReceipt`). REST V3 silently drops mismatched entries with no error. Use a `DefinitionId` whose definition's `associations[].associatedEntity` matches the target entity (either the specific path like `/transactions/Invoice` or the generic `/transactions/Transaction`). |

### Empirical quirks (verified against production, May 2026)

| Behavior | Implication |
|---|---|
| `dropDownOptions { Id Value ... }` — wrong case | Schema rejects with `GRAPHQL_VALIDATION_FAILED`. Use lowercase `id` and `value`. The doc's section headers misled prompt authors. |
| `subType: "salesreceipt"` returns 0 results even when matching definitions exist | The server-side `subType` filter is too narrow. Fetch all active definitions (`filters: { active: true }`) and filter client-side on `associations[].associatedEntity`. |
| `entityType: "transaction"` returns 0 results | Schema expects path-style values like `"/transactions/Transaction"` — not the simple `"transaction"` shown in the doc. Same workaround: filter client-side. |
| `associations[].associatedEntity` returns path-style strings | **Verified live (prod):** the PARENT `associatedEntity` is one of `"/transactions/Transaction"`, `"/network/Contact"`, `"/work/Project"`. The specific type lives in `subAssociations[].associatedEntity` as an UPPER_SNAKE code — e.g. `SALE`/`SALE_INVOICE`/`SALE_ESTIMATE` under `/transactions/Transaction`, and `CUSTOMER`/`VENDOR` under `/network/Contact`. There is NO `/Customer`, `/Vendor`, `/transactions/Invoice`, or `/transactions/SalesReceipt` parent value — filter client-side on the parent path AND the sub-association code. |
| `dropDownOptions: []` (empty array) for non-list types | Don't treat as missing data. Only validate against `dropDownOptions` when `dataType` is `STRING_LIST` or `OBJECT_LIST`. |
| Task 4 (create) without write scope returns HTTP 200 with `errors[].extensions.errorCode.errorCode = "AUTHORIZATION_DENIED"` | Not a gateway 403. Match on the `errorCode` and `service: "custom-extensions-service"` to detect this case. |

## Empty State

If no active definitions exist for the configured `type_of_transaction`, the generated code surfaces:

> *"No active Custom Field definitions found for `<type>`. Please configure them in QuickBooks settings."*

…and halts cleanly without attempting the REST create.

## Reference Materials

Official artifacts to crib from when building your integration:

- **Java / Spring Boot sample app:** https://github.com/IntuitDeveloper/SampleApp-CustomFields-Java
- **Python sample app:** https://github.com/IntuitDeveloper/SampleApp-CustomFields-Python
- **Premium APIs Postman workspace:** https://www.postman.com/intuit-developer/intuit-developer-premium-apis/overview
- **GraphQL schema reference:** [appFoundationsCustomFieldDefinitions](https://developer.intuit.com/app/developer/gql/docs/api/qbexternal/queries/appFoundationsCustomFieldDefinitions) · [Create mutation](https://developer.intuit.com/app/developer/gql/docs/api/qbexternal/mutations/appFoundationsCreateCustomFieldDefinition) · [Update mutation](https://developer.intuit.com/app/developer/gql/docs/api/qbexternal/mutations/appFoundationsUpdateCustomFieldDefinition)

The sample apps use `ipp-v3-java-devkit` (Java) and `requests` (Python) for REST V3, and plain HTTP for the GraphQL operations — same split documented in the per-language SDK notes.

## Related

- Parent docs: [`../README.md`](../README.md)
- Template source: [`prompt-template-custom-fields.md`](./prompt-template-custom-fields.md)
- Merge script: [`../merge-prompt.js`](../merge-prompt.js)
- Generated output: [`../generated-prompts/custom-fields-ready-prompt.md`](../generated-prompts/)
