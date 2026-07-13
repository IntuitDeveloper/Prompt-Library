**If generating PHP code (language: `{{language_framework}}`):**

Use **`GuzzleHttp\Client`** (or PHP's built-in `curl`) for Task 1 (GraphQL discovery — no SDK supports GraphQL) and the official **`quickbooks/v3-php-sdk`** for Tasks 2 & 3 (REST V3).

- **Task 1 — GraphQL discovery (plain HTTP):**
  - The PHP SDK does **not** support GraphQL. Use `GuzzleHttp\Client` (or `curl`) to POST the `appFoundationsCustomFieldDefinitions` query to `{{graphql_endpoint_production}}` (or `{{graphql_endpoint_sandbox}}` when `QBO_ENV=sandbox`).
  - Send the argument as **`filters`** (plural — `AppFoundations_CustomExtensionsDefinitionFilterBy` input type) with primitive fields: `{ active: true }`. Do not use `{ equals: ... }` predicate wrappers. Filter by target entity client-side after the response.
  - Parse the JSON response and build an associative array keyed by `legacyIDV2` (NOT the GraphQL `id`). Store `label` and `dataType` per entry. The GraphQL node field is lowercase `id`.
  - Handle pagination via `pageInfo.endCursor` / `pageInfo.hasNextPage`.

- **Task 2 — REST V3 entity creation (SDK):**
  - `QuickBooksOnline\API\DataService\DataService::Add()` — create the transaction or `Customer`/`Vendor`
  - Entity class matching `{{type_of_transaction}}` (e.g., `IPPSalesReceipt`, `IPPInvoice`, `IPPCustomer`, `IPPVendor`) — the entity object. All inherit `$CustomField` (typed `IPPCustomField[]`) via `IPPIntuitEntity`.
  - `IPPCustomField` — one instance per custom field. Verified against `intuit/QuickBooks-V3-PHP-SDK` (commit 98223c9, PR #572):
    - `$DefinitionId` — pass the **`legacyIDV2`** from Task 1, **not** the GraphQL `id`
    - `$Name` — the `label` from Task 1 (recommended for readability)
    - `$Type` — map Task 1's `dataType`: `STRING` / `STRING_LIST` / `OBJECT_LIST` → `"StringType"`, `NUMBER` → `"NumberType"`, `DATE` → `"DateType"`. Skip `UNKNOWN` with a logged warning.
    - Set exactly ONE typed value property based on `$Type`: `$StringValue` (string), `$NumberValue` (numeric), `$DateValue` (`YYYY-MM-DD`), or `$BooleanValue` (rarely surfaced). **There is no `AnyIntuitObject` property on `IPPCustomField`** — do not assign one.
  - Attach the `IPPCustomField` array to the entity's `$CustomField` property before calling `->Add()`.
  - **Attach the include parameter via the SDK's public API** — two equivalent options:
    - Service-wide: `$dataService->setIncludeParam([\QuickBooksOnline\API\Core\CoreConstants::INCLUDE_ENHANCED_ALL_CUSTOM_FIELDS]);` once on setup, applies to every subsequent call.
    - Per-call: `$dataService->Add($entity, [\QuickBooksOnline\API\Core\CoreConstants::INCLUDE_ENHANCED_ALL_CUSTOM_FIELDS])`. `Update()`, `FindById($entity, $id, $includeParam)`, and `Retrieve($entity, $includeParam)` all accept the same trailing parameter.
    - Either form appends `?include=enhancedAllCustomFields` (or `&include=...`) to the URL the SDK posts. No plain-Guzzle fallback is required.

- **Task 3 — Type-aware hydration (SDK):**
  - Reuse the same `$dataService` (with `setIncludeParam` already applied) or pass `$includeParam` per-call on `$dataService->FindById($entity, $id, [...])`.
  - Iterate the returned entity's `$CustomField` array. The REST response's `$DefinitionId` equals the `legacyIDV2` you stored in Task 1 — use it to look up `label` and `dataType` from your cached map.
  - Use the cached `dataType` to read the matching typed property: `$rcf->StringValue`, `$rcf->NumberValue`, `$rcf->DateValue`. (No `AnyIntuitObject` accessor.)

- **Composer install:**
  ```bash
  composer require quickbooks/v3-php-sdk
  ```
- **SDK reference:** `{{php-sdk-documentation}}`

> Warning: Use **only** methods and classes that exist in the published SDK. Do not construct fake SDK models or invent method signatures.
