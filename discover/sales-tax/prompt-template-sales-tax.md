**Role:** You are a Principal Software Engineer specializing in QuickBooks Online Sales Tax integrations using the QBO Indirect Tax GraphQL API.

**Context:** I am developing a `{{language_framework}}` application using `{{typing_system}}` typing that needs to calculate sales tax for sales transactions created **outside QuickBooks Online** (e.g. a custom invoicing UI, checkout flow, quote/estimate tool, or third-party ERP). The QBO Indirect Tax GraphQL API will provide accurate, jurisdiction-aware sales tax for each transaction. Assume the application already has a valid OAuth 2.0 access token, QBO realmId (Company ID), and environment (production or sandbox) available as environment variables (`QBO_ACCESS_TOKEN`, `QBO_REALM_ID`, `QBO_ENV`). Focus strictly on the API integration logic.

**References:**
- Sales Tax documentation: `{{sales_tax_documentation}}`
- GraphQL schema reference: `{{graphql_schema}}`
- OAuth 2.0 documentation: `{{oauth2-documentation}}`
- Official sample apps: `{{sales_tax_sample_app_java}}` · `{{sales_tax_sample_app_python}}` · `{{sales_tax_sample_app_nodejs}}`

---

## Use case: Invoicing outside of QuickBooks Online

This is the documented use case for the Sales Tax GraphQL API. Your app builds the invoice/quote/order in your own UI and database, but uses QBO to compute correct, jurisdiction-aware sales tax for the transaction. The mutation is **stateless** — it computes the tax and returns it without persisting anything in QBO (the returned `taxCalculation.id` will be `"0"`).

---

## Required OAuth Scope

Ensure your app is authorized with the following scope:
- `{{sales_tax_scope}}` — required to call the Sales Tax calculation mutation

> ⚠️ This scope is **separate** from `com.intuit.quickbooks.accounting`. If you only have the accounting scope, the mutation will fail with a `403`. Re-auth your app with the indirect-tax scope before proceeding.

---

## How the Sales Tax API actually works

The QBO Indirect Tax GraphQL API exposes **one mutation** — there is no separate "discovery" step to fetch tax codes or rates up front. You hand the mutation a transaction (customer + ship-to/ship-from addresses + line items) and it returns the calculated tax broken down by jurisdiction. The applicable rates are derived server-side from the addresses and the company's nexus settings.

- **Endpoint:** `{{graphql_endpoint_production}}` (production) — use `{{graphql_endpoint_sandbox}}` when `QBO_ENV=sandbox`.
- **HTTP method:** `POST` with `Content-Type: application/json`
- **Required headers:** `Authorization: Bearer <token>`, `realmId: <QBO_REALM_ID>`
- **Recommended header:** `intuit_tid: <unique-per-request-id>` — echoed back in the response so you can correlate logs with Intuit support.

---

## Task 1: Calculate sales tax via GraphQL mutation

Call `indirectTaxCalculateSaleTransactionTax` with the transaction inputs. Use the query verbatim below.

### Mutation

```graphql
{{sales_tax_calculate_mutation}}
```

### Variables (example shape — replace with your real transaction inputs)

```json
{{sales_tax_calculate_variables_example}}
```

### Input field reference (from the schema)

`IndirectTax_TaxCalculationInput`:
- `transactionDate` (Date) — date of the transaction (RFC 3339 full-date, e.g. `"2026-05-21"`).
- `subject` (required) — `{ qbCustomerId: "<customer_id>" }`. Drives any tax-exemption logic. The customer record's tax-exempt status is honored server-side; the response echoes back `subject.taxExemption`.
- `shipping` (required) — `shipFromAddress`, `shipToAddress`, and optional `shippingFee`. Each address (`IndirectTax_AddressInput`) accepts either:
  - **Free-form:** `{ freeFormAddressLine: "2700 Coast Ave CA, US 94043" }` — the server parses it.
  - **Structured:** `{ streetAddressLine1, city, region, postalCode }` — use this when your app already has address parts.
- `lineItems` (required) — array of `IndirectTax_TaxCalculationLineInput`. **Empty array `[]` is allowed; `null` is not.** Each line accepts:
  - `numberOfUnits` (Int) — quantity.
  - `pricePerUnitExcludingTaxes: { value }` (Money) — price per unit, tax exclusive. Use **either** this OR `totalPriceExcludingTaxes`.
  - `totalPriceExcludingTaxes: { value }` (Money) — line subtotal, tax exclusive (alternative to per-unit pricing).
  - `productVariantTaxability: { productVariantId }` (optional) — the QBO Item/product ID for tax classification. Accepts the ID as either a quoted string (`"1"`) or an unquoted integer (`1`) — both verified live. If omitted, the server uses a generic taxability classification.

### Response shape (what to read back)

- `taxCalculation.id` — always `"0"` for stateless calculations (nothing was persisted in QBO).
- `taxCalculation.subject.customer.id` — echo of the customer ID you sent.
- `taxCalculation.subject.taxExemption` — exemption status applied (`"NOT_EXEMPT"` is the common case; other values appear when the customer has an exemption certificate on file).
- `taxCalculation.taxTotals.totalTaxAmountExcludingShipping.value` — the headline tax total to display.
- `taxCalculation.taxTotals.aggregatedTaxesExcludingShippingByRate[]` — per-jurisdiction breakdown (`taxRate.name`, `ratePercentageApplied.rate`, `taxAmount.value`, `taxableAmount.value`).
- `taxCalculation.lineItems.nodes[]` — per-line results. **Note:** if you passed a `shippingFee`, the response includes shipping as its own line node with `productVariantTaxability.classificationCode = "SHIPPING"` — iterate carefully.
- Within each line: `taxDetails[]` lists each contributing rate with `taxAmount`, `taxableAmount`, and (when relevant) `taxExemptAmount`.
- `taxRate.taxRate.taxRateReferenceId` — the canonical reference for the rate (useful for audit logs).
- `productVariantTaxability.classificationCode` — the EUC tax classification the server applied (e.g. `"EUC-09020802-V1-00120000"`). Surface this when auditors ask which classification was used.

### Display a summary

```
Customer:         <subject.customer.id> (exemption: <subject.taxExemption>)
Ship-to:          <shipping.shipToAddress.streetAddressLine1>
Transaction date: <transactionDate>

Per-line tax:
  Line 1 (<classificationCode>):  $<totalPriceExcludingTaxes>  tax=$<taxAmount>
  ...

Tax breakdown by jurisdiction:
  <jurisdiction>      <rate>%    $<amount>
  <jurisdiction>      <rate>%    $<amount>
  ...
Total tax (excl. shipping): $<totalTaxAmountExcludingShipping>
Shipping tax:               $<shipping.taxAmount>
```

---

## Task 2: Verify the result

- Check `data.indirectTaxCalculateSaleTransactionTax.taxCalculation.taxTotals.totalTaxAmountExcludingShipping.value` is non-null.
- Sum `aggregatedTaxesExcludingShippingByRate[].taxAmount.value` and assert it matches the total (within $0.01 for rounding).
- **Watch for the misleading "NO TAX SALES" case:** when a realm has Sales Tax flags on but no configured nexus, the API returns HTTP 200 with `totalTaxAmountExcludingShipping = 0` and a single rate entry with `taxRate.name = "NO TAX SALES"` and `rate = 0`. This is **not** an error — but generated code should detect this case and surface a clearer message to the user (e.g. "This QBO company has no tax nexus configured; sales tax will be $0").

---

## Technical Best Practices

- **No discovery caching needed.** Unlike most QBO entity flows, there's nothing to cache up front — the mutation computes everything per-call from the addresses you pass.
- **`realmId` is NOT validated against the access token.** Empirically (verified May 2026): passing a bogus `realmId` header with a valid token returns a successful tax calculation against the token's bound company. Do **not** rely on the API to reject mismatched realm IDs. Validate the `QBO_REALM_ID` env var matches the token holder's company in your own app code if this matters.
- **The gateway returns XML for auth errors, JSON for everything else.** A `401` body looks like `<?xml version="1.0"...><Errors><error><code>AuthenticationFailed</code>...</Errors>`. Don't blindly `JSON.parse(response.body)` — branch on HTTP status first.
- **Inclusive vs. exclusive pricing.** The schema supports both modes (`pricePerUnitExcludingTaxes` and `pricePerUnitIncludingTaxes`). This prompt's generated code uses **exclusive** pricing — the documented and most common path for US sales tax. If your business model needs inclusive pricing (common in VAT regimes), substitute `pricePerUnitIncludingTaxes` on each line item.
- **Error Handling (empirically verified):**
  - **HTTP `401`** (XML body) — token invalid/expired. Surface: "Access token invalid or expired. Please re-authenticate via OAuth 2.0."
  - **HTTP `403`** — missing scope (most likely `{{sales_tax_scope}}`) or the company isn't entitled. Surface: "App is missing the `{{sales_tax_scope}}` scope, or Sales Tax is not enabled for this company."
  - **HTTP `400`** with `extensions.code = "GRAPHQL_VALIDATION_FAILED"` — code bug. You queried a field that doesn't exist or sent a malformed query. Log the full response body, the query, and the variables. Do **not** retry.
  - **HTTP `200`** with `data: null` and `errors[]` having `extensions.classification = "ValidationError"` — bad variable input (e.g. invalid `transactionDate` format). Surface `errors[0].message`.
  - **HTTP `200`** with `data.indirectTaxCalculateSaleTransactionTax: null` and `errors[]` having `extensions.errorType = "INTERNAL"` — service exception (e.g. missing `subject`). The server returns no numeric code here — match on the `errors[0].message` string itself or fall back to a generic "Tax calculation failed" message.
  - **HTTP `200`** with successful `data` but `taxRate.name = "NO TAX SALES"` — see Task 2; surface as "no nexus configured."
  - **HTTP `200`** with successful `data` and real rates — calculation succeeded. Note: invalid ship-from/ship-to addresses do **not** raise — the server may silently fall back to the company's configured address. Validate addresses client-side before calling.
  - **Network timeout** — retry once with exponential backoff; surface error after the second failure.
- **Documented service error codes.** The Intuit docs list these codes, but the server does **not** consistently return them as machine-readable codes in the GraphQL response — they appear only as substrings in `errors[0].message` when they appear at all. Prefer matching on `extensions.classification` and `extensions.errorType` (above) over chasing numeric codes.

  | Code | Description (from docs) |
  |---|---|
  | `37138` | Tax group is invalid or has no active associated rates. |
  | `37108` | Missing or invalid request to tax calculation. |
  | `37111` | Tax API failed; often means no nexus / AST not set up. |
  | `37109` | No mapping account for the company (nexus / AST not set up). |
  | `19833` | Missing or invalid date input. |
  | `19834` | Invalid ship-from address. |
  | `19835` | Invalid ship-to address. |
  | `19837` | Invalid line amounts. |

- **Observability:** Capture and log the `intuit_tid` response header on every call. **NEVER** log access tokens, OAuth secrets, or PII (addresses, customer names).
- **Typing:** Provide `{{typing_system}}` models for `IndirectTax_TaxCalculationInput`, `IndirectTax_TaxCalculationPayload`, `IndirectTax_TaxCalculationLineInput`, and `IndirectTax_ShipmentInput`.
- **Output (integration mode: `{{integration_mode}}`):** Provide modular, clean code and a runnable verification example.
  - **If mode is `new`:** Create a self-contained project in a folder named `qbo-sales-tax-{{language_framework}}` (no spaces, lowercase). Include a `README.md` with setup and environment variable instructions, a dependency manifest, and a runnable main entry point that executes Task 1 against a hardcoded example transaction and prints the breakdown.
  - **If mode is `existing`:** Produce modular, well-documented functions/classes/files designed to be imported into an existing codebase. Do **not** scaffold a new project structure. Before writing code, scan the workspace:
    1. Look for a dependency manifest (`pom.xml`, `build.gradle`, `package.json`, `requirements.txt`, `go.mod`, etc.) to confirm the build system.
    2. Look for existing service classes that make QBO API calls (e.g., files containing `QBO_REALM_ID`, `QBO_ACCESS_TOKEN`, `DataService`, or `OAuth2Authorizer`).
    3. Look for any existing tax-related classes (e.g., `TaxService`, `SalesTaxService`).

    State your finding in one sentence before writing code (e.g., "Found existing Express app with `qboClient.js` — adding `salesTaxCalc.js` as a new module.") and match the project's package names, logging style, and error-handling patterns.

---

## Language-Specific SDK Notes

{{sdk_notes}}

> If no SDK notes appear above, no official entity SDK exists for your language. Use your preferred HTTP client to POST GraphQL requests to `{{graphql_endpoint_production}}` (or `{{graphql_endpoint_sandbox}}`). The official QBO SDKs do **not** include typed bindings for the Indirect Tax GraphQL mutation — even when an SDK is present, you call this mutation via raw HTTP.

---

## 🛑 AI Guardrails (Anti-Hallucination Constraints)

**CRITICAL INSTRUCTIONS — YOU MUST ADHERE TO THE FOLLOWING:**
1. **No Hallucinations:** Do not invent or guess GraphQL fields, types, or arguments not present in the mutation/variables provided above. The schema does **not** expose `taxCodes`, `salesTaxCodes`, `taxRates`, or any other root query field for sales tax discovery — only the `indirectTaxCalculateSaleTransactionTax` mutation.
2. **Exact Mutation:** Use the mutation provided in `{{sales_tax_calculate_mutation}}` verbatim. Do not add, remove, or rename fields. If the caller doesn't need a field in the response, you may omit it — but do not invent new fields.
3. **No REST V3 / AST:** This prompt is **GraphQL-only**. Do **NOT** generate code that calls the REST V3 `/v3/company/{realmId}/{invoice,salesreceipt,...}` endpoints, queries `TaxCode` / `TaxRate` / `TaxAgency` via REST, or applies `TxnTaxDetail.TxnTaxCodeRef` in a transaction payload. That's a different integration path and is out of scope.
4. **Strict SDK Usage:** Do not call any "tax discovery" SDK method that purports to list tax codes or rates via GraphQL — the schema does not support it. If you find such a method in an SDK, it is targeting the REST V3 endpoints, not GraphQL — and we explicitly do not use REST V3 here.
5. **Endpoint Strictness:** Use the exact endpoints provided. Do not modify base URLs or invent path segments.
6. **Realm ID Header:** Always pass `realmId: $QBO_REALM_ID` as an HTTP header on the GraphQL request. Do not attempt to embed the realm ID inside the GraphQL query (the schema has no `company(id:)` wrapper).
7. **Scope Discipline:** Verify the app holds `{{sales_tax_scope}}` before calling. Do not assume `com.intuit.quickbooks.accounting` covers this mutation — it does not.
8. **No Discovery Caching:** Do not generate code that "caches tax codes for 1 hour" or pre-fetches a tax code list — there is nothing to pre-fetch.
9. **Stop if Blocked:** If the provided documentation lacks required fields, STOP and clearly state what is missing instead of guessing.

I have provided you with all the necessary context and instructions. Please generate the code and documentation as per the instructions.
