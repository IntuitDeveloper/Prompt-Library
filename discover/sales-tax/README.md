# Sales Tax Prompt

Generates AI-ready prompts that produce a runnable integration for the **QuickBooks Online Sales Tax GraphQL API** — specifically the `indirectTaxCalculateSaleTransactionTax` mutation. The generated code calculates jurisdiction-aware sales tax for transactions your app builds **outside** QuickBooks Online (custom invoicing UI, checkout flow, quote tool, third-party ERP).

> ℹ️ **GraphQL only.** This prompt does **not** generate REST V3 / Automated Sales Tax (AST) integration code. The Sales Tax mutation is stateless — it calculates tax without persisting anything in QBO.

## Folder Contents

```
sales-tax/
├── README.md                              # This file
├── prompt-template-sales-tax.md           # The prompt template (do not edit unless updating the workflow)
├── postman/                               # Reference Postman collection for manual testing
└── sdk-notes/                             # Per-language SDK guidance, injected at merge time
    ├── dotnet.md
    ├── java.md
    ├── nodejs.md
    ├── php.md
    ├── python.md
    └── ruby.md
```

The template lives here; the merge script and config live one level up in `discover/`.

## Use case covered

**Invoicing outside of QuickBooks Online.** Your app builds the transaction (cart, quote, invoice draft, etc.) in your own UI and storage, then calls the QBO Sales Tax mutation to get accurate jurisdiction-aware tax for that transaction. The mutation returns the calculated tax and walks away — nothing is persisted in QBO.

## What the generated code does

| Task | Layer | Purpose |
|---|---|---|
| 1. Calculate | GraphQL | Call `indirectTaxCalculateSaleTransactionTax` with customer + ship-from/ship-to addresses + line items. Receive total tax + per-jurisdiction breakdown + per-line breakdown. |
| 2. Verify | GraphQL response | Confirm `totalTaxAmountExcludingShipping` is present, sum per-rate amounts, detect the "NO TAX SALES" no-nexus edge case, and print a human-readable breakdown. |

## What's covered in the generated code

- The full mutation with all useful response fields: tax totals, per-jurisdiction breakdown, per-line breakdown, customer exemption status, EUC classification codes, tax rate reference IDs.
- Exclusive pricing (`pricePerUnitExcludingTaxes`) — the documented US sales tax path.
- Empty `lineItems: []` accepted (returns zero tax).
- Free-form addresses (`freeFormAddressLine`) — the API parses them server-side.
- Shipping fees calculated as their own line item in the response.
- Tax-exemption status echoed back via `subject.taxExemption` (the customer's exemption is honored automatically server-side).
- Error handling for the documented gateway and service error patterns, plus empirically verified quirks.

## What's NOT covered (out of scope)

- **REST V3 / Automated Sales Tax (AST)** — see Intuit's separate [AST documentation](https://developer.intuit.com/app/developer/qbo/docs/workflows/manage-sales-tax-for-us-locales) if you need to persist transactions directly in QBO and let QBO compute tax.
- **Inclusive pricing** (`pricePerUnitIncludingTaxes`) — schema supports it but the prompt generates the exclusive path. Swap the field in the generated code if you need VAT-style inclusive pricing.
- **Tax-exemption certificate management** — the API honors a customer's existing exemption status, but creating/managing the exemption certificate itself is a separate workflow.
- **Non-US locales** — the GraphQL mutation works internationally, but the prompt's examples and error guidance are US-centric.
- **Multi-realm / multi-tenant routing** — the generated code reads one realm from one env var.

## Authentication & `.env` Setup

The generated code assumes the caller already has a valid **OAuth 2.0 access token** and **realmId** available in a `.env` file. The prompt is intentionally scoped to API integration logic — it does **not** generate an OAuth client.

### Required `.env` variables

```bash
QBO_ACCESS_TOKEN=<access token for the target environment>
QBO_REALM_ID=<company / realm id for the target environment>
QBO_ENV=production   # or "sandbox"
```

### Environment endpoints

| Env | GraphQL host |
|---|---|
| Production | `https://qb.api.intuit.com/graphql` |
| Sandbox | `https://qb-sandbox.api.intuit.com/graphql` |

### How to get an access token

Use the **[Intuit OAuth 2.0 Playground](https://developer.intuit.com/app/developer/playground)** to generate an access token (sandbox or production) with the required scope (see below). Paste the token into `.env` and run the generated app.

### Required OAuth Scope

| Scope | Used For |
|---|---|
| `indirect-tax.tax-calculation.quickbooks` | Calling the Sales Tax calculation mutation |

> ⚠️ `com.intuit.quickbooks.accounting` is **not** sufficient. The Sales Tax mutation requires the dedicated `indirect-tax.tax-calculation.quickbooks` scope. A missing scope surfaces as `403`.

## Important: There Is No Tax Code "Discovery" Step

Unlike most QBO entity flows, the Sales Tax GraphQL API does **not** expose root queries to list tax codes or tax rates. The mutation derives the applicable rates server-side from the addresses you pass in and the company's nexus configuration. **Do not** add code that pre-fetches a tax-code list before calling the mutation — the schema does not support it (`taxCodes`, `salesTaxCodes`, `taxRates`, and similar root fields do not exist and will return `GRAPHQL_VALIDATION_FAILED`).

## Generating a Prompt

From the `discover/` directory:

```bash
# Default (uses prompt-config.json)
node merge-prompt.js

# Language-specific (selects the right sdk-notes/<lang>.md)
node merge-prompt.js --language java
node merge-prompt.js --language python
node merge-prompt.js --language dotnet
```

Choose option **4** at the menu prompt. Output is written to `generated-prompts/sales-tax-ready-prompt.md`. Paste that file into your AI coding assistant (Copilot, Cursor, ChatGPT, Windsurf) to scaffold the integration.

## SDK Notes

The `sdk-notes/` folder contains per-language guidance that is injected into the prompt at merge time via the `{{sdk_notes}}` placeholder. If you run `--language java`, only `sdk-notes/java.md` is included. None of the official QBO SDKs include typed bindings for the Indirect Tax GraphQL mutation — even when an SDK is present, you call this mutation via raw HTTP.

## Common Errors

| HTTP | Response shape | Cause |
|---|---|---|
| `200` | `data.indirectTaxCalculateSaleTransactionTax.taxCalculation` populated, no `errors[]` | Success — check for the `NO TAX SALES` no-nexus case below |
| `200` | `data: null`, `errors[].extensions.classification = "ValidationError"` | Variable input fails schema validation (e.g. bad `transactionDate` RFC3339 format). Surface `errors[0].message`. |
| `200` | `data.indirectTaxCalculateSaleTransactionTax: null`, `errors[].extensions.errorType = "INTERNAL"` | Service exception — e.g. missing `subject`. Server does not return a numeric code; match on the message string. |
| `400` | JSON with `errors[].extensions.code = "GRAPHQL_VALIDATION_FAILED"` | Code bug — you queried a field that doesn't exist on the schema. Do not retry. |
| `401` | **XML** with `<code>AuthenticationFailed</code>` | Token invalid or expired. Refresh in the [OAuth Playground](https://developer.intuit.com/app/developer/playground). |
| `403` | XML or JSON depending on layer | Missing `indirect-tax.tax-calculation.quickbooks` scope, or Sales Tax not entitled on the company |

### Empirical quirks (verified against production, May 2026)

| Behavior | Implication |
|---|---|
| `realmId` header is **silently ignored** if the access token is valid | Do not rely on the API to enforce realm match. If your app must talk to a specific realm, verify it in your own code. |
| Invalid ship-from / ship-to address (e.g. "gibberish nowhere") | Server **does not error** — silently falls back to a default address (observed: Georgia / Atlanta). Validate addresses client-side. |
| Empty `lineItems: []` | Accepted by the schema; returns a zero-tax calculation. |
| Realm with Sales Tax flags on but **no nexus configured** | Returns HTTP 200 with `totalTaxAmountExcludingShipping = 0` and a single rate `taxRate.name = "NO TAX SALES"` (`rate = 0`). **Not** an error — but generated code should detect this and surface a clearer message to the end user. |
| Documented service error codes (`19833`, `19834`, `19835`, `19837`, `37108`, `37109`, `37111`, `37138`) | Listed in Intuit docs but **not consistently returned as machine-readable codes** in the GraphQL response. Prefer matching on `extensions.classification` / `extensions.errorType` over chasing numeric codes. |

## Worked Example

Calling the mutation with a $100 product shipped within Mountain View, CA (94043), against a realm with nexus configured in California:

```
Total tax: $9.75
  California State                        6.25%   $6.25
  California, Santa Clara County          1.00%   $1.00
  California, Santa Clara County District 2.50%   $2.50
```

Same payload against a realm with no nexus configured:

```
Total tax: $0.00
  NO TAX SALES                            0.00%   $0.00
```

Both responses are HTTP 200. Generated code should distinguish these for the end user.
