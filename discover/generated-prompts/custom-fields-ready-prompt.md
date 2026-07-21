**Role:** You are a Principal Software Engineer specializing in QuickBooks Online integrations.

**Context:** I am developing a `python` application using `hints (dataclasses)` typing. I need to implement a workflow that uses the QuickBooks Custom Fields APIs to attach custom metadata to `salesreceipt` transactions (and/or to `Customer` / `Vendor` / `Project` entities, depending on QBO tier). Assume the application already has a valid OAuth 2.0 access token, realmId (Company ID), and environment (production or sandbox) available in the `.env` file. Note: the Custom Fields GraphQL API is production-only — Tasks 1, 4, and 5 always target production regardless of `QBO_ENV`. Tasks 2 and 3 (REST V3) honor `QBO_ENV`. Focus strictly on the API integration logic.

**References:**
- Custom Fields documentation: `https://developer.intuit.com/app/developer/qbo/docs/workflows/create-custom-fields`
- GraphQL schema reference: `https://developer.intuit.com/app/developer/gql/docs/api/qbexternal/queries/`
- OAuth 2.0 documentation: `https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0`
- Official sample apps: `https://github.com/IntuitDeveloper/SampleApp-CustomFields-Java` · `https://github.com/IntuitDeveloper/SampleApp-CustomFields-Python`

**Hosts:**
- **GraphQL endpoint** (Tasks 1, 4, 5 — Custom Field *definitions*). This API is **production-only**, so always use the production host regardless of `QBO_ENV`:
  - Production: `https://qb.api.intuit.com/graphql`
- **REST V3 base URL** (Tasks 2, 3 — attaching/reading custom field *values* on a transaction). These honor `QBO_ENV`:
  - Production: `https://quickbooks.api.intuit.com`
  - Sandbox: `https://sandbox-quickbooks.api.intuit.com`

REST V3 paths below (e.g. `POST /v3/company/{{companyid}}/...`) are relative to the REST base URL. Do not modify either host.

---

## Task 1: Discover Custom Field Definitions (GraphQL)

**Capability Check:** Custom Fields availability and limits vary by QBO tier (Essentials, Plus, Advanced/IES) and by target entity. Entity-level custom fields on `Customer`/`Vendor`/`Project` require Advanced or IES. If any call returns 403 with "Feature Not Enabled" or a tier-insufficient error, surface a user-friendly message: *"Custom Fields are not available for this account's tier or entity. Configure them in QuickBooks settings, or upgrade the account."*

Fetch all active definitions, then filter client-side by `associations[].associatedEntity` to find the ones relevant to your target entity.

- **Endpoint:** `https://qb.api.intuit.com/graphql` (production-only — no sandbox).
- **Headers:** `Authorization: Bearer <token>`, `Content-Type: application/json`, `realmId: <QBO_REALM_ID>`, and a unique `intuit_tid` per request for log correlation.
- **Query:** `query GetCustomFieldDefinitions($cursor: String) {
  appFoundationsCustomFieldDefinitions(
    filters: { active: true }
    first: 50
    after: $cursor
  ) {
    edges {
      node {
        id
        legacyID
        legacyIDV2
        label
        dataType
        required
        active
        colorCode
        entityVersion
        createdSource
        dropDownOptions { id value active order }
        associations {
          associatedEntity
          associationCondition
          active
          allowedOperations
          subAssociations { associatedEntity active allowedOperations }
        }
      }
    }
    pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
  }
}`
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

**Empty State:** If no definitions match the target entity after client-side filtering, surface: *"No active Custom Field definitions found for `salesreceipt`. Configure them in QuickBooks settings, or run Task 4 (create)."*

---

## Task 2: Attach Custom Field Values to a Transaction or Entity (REST V3)

Create one salesreceipt with default item id: 1, default customer: 1, and amount: 111. Attach at least one custom field value using a DefinitionId discovered in Task 1.

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

- **Endpoint:** `POST /v3/company/{{companyid}}/salesreceipt?minorversion=75`
- **Required query parameter:** Append `include=enhancedAllCustomFields` to every create/read URL — without it, the response will not include custom-field metadata.
- **Documentation:** `https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/salesreceipt` and `https://developer.intuit.com/app/developer/qbo/docs/workflows/create-custom-fields`

### Payload structure

```json
[
  {
    "DefinitionId": "{{DefinitionId}}",
    "Name": "{{FieldName}}",
    "Type": "StringType",
    "StringValue": "{{FieldValue}}"
  }
]
```

**Constraints:**
- Use `minorversion=75` on all REST V3 calls.
- `DefinitionId` must be a `legacyIDV2` from Task 1 — do not invent or hardcode IDs.
- REST V3 **silently drops** `CustomField` entries whose `DefinitionId` doesn't match the target entity's sub-association exactly (e.g. a definition scoped to `SALE` won't attach to an Invoice — only `SALE_INVOICE` will). HTTP 200 returns with the dropped entries omitted and no error. **Compare the response's `CustomField` array against the request and warn on any drops.**

---

## Task 3: Read & Hydrate for UI

Retrieve the entity and display custom field values with human-readable labels.

- **Fetch:** Use `GET /v3/company/{{companyid}}/salesreceipt/{{TransactionId}}?minorversion=75` and append `include=enhancedAllCustomFields`.
- **Hydration:** For each `CustomField` in the response, look up `DefinitionId` (= `legacyIDV2`) in the Task 1 map to get `label` and `dataType`.
- **Type-aware reading:** Use the cached `dataType` to read the matching value field (`StringValue` / `NumberValue` / `DateValue`). Parse `DateValue` as `YYYY-MM-DD`.
- **Display:** Show the entity ID, date, total amount, and a labelled list of custom fields and their values.
- **Line Filtering:** Only hydrate `SalesItemLineDetail` lines. Exclude system-generated lines (`SubTotalLineDetail`, `DiscountLineDetail`, `TaxLineDetail`).

---

## Task 4 (optional): Create a New Custom Field Definition (GraphQL)

Use only when your app provisions custom fields as part of onboarding. Requires the `app-foundations.custom-field-definitions` scope.

- **Mutation:** `mutation CreateCustomFieldDefinition($input: AppFoundations_CustomFieldDefinitionCreateInput!) {
  appFoundationsCreateCustomFieldDefinition(input: $input) {
    id
    legacyIDV2
    label
    dataType
    required
    active
    dropDownOptions { id value active order }
    associations {
      associatedEntity
      associationCondition
      active
      allowedOperations
      subAssociations { associatedEntity active allowedOperations }
    }
  }
}`
- **Variables:**
```json
{
  "input": {
    "active": true,
    "label": "Project Code",
    "dataType": "STRING",
    "associations": [
      {
        "active": true,
        "associatedEntity": "/transactions/Transaction",
        "associationCondition": "INCLUDED",
        "allowedOperations": [],
        "subAssociations": [
          { "active": true, "associatedEntity": "SALE", "allowedOperations": [] }
        ]
      }
    ]
  }
}
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

- **Mutation:** `mutation UpdateCustomFieldDefinition($input: AppFoundations_CustomFieldDefinitionUpdateInput!) {
  appFoundationsUpdateCustomFieldDefinition(input: $input) {
    id
    legacyIDV2
    label
    dataType
    active
    required
    associations {
      associatedEntity
      associationCondition
      active
      allowedOperations
    }
  }
}`
- **Variables (rename):**
```json
{
  "input": {
    "id": "<udcf_short_id_from_task_1>",
    "legacyIDV2": "<bare_numeric_legacyIDV2_from_task_1>",
    "label": "Project Code (renamed)"
  }
}
```
- **Variables (disable):**
```json
{
  "input": {
    "id": "<udcf_short_id_from_task_1>",
    "legacyIDV2": "<bare_numeric_legacyIDV2_from_task_1>",
    "label": "<current_label_from_task_1>",
    "active": false
  }
}
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
- **Typing:** Provide `hints (dataclasses)` models for `CustomFieldDefinition`, `CustomField`, and (if using Task 4) `CustomFieldDefinitionCreateInput`.
- **Output (integration mode: `new`):** Provide modular, clean code and a runnable verification example.
  - **If mode is `new`:** Create a self-contained project in a dedicated folder named `custom-fields-python` (no spaces). Include a `README.md` explaining how to run the code, a dependency manifest, and a brief architectural diagram showing the data flow from GraphQL to REST.
  - **If mode is `existing`:** Produce modular, well-documented functions/classes/files designed to be imported into an existing codebase. Do **not** scaffold a new project structure. Provide clear integration notes describing which files to add, what imports are needed, and how to wire the functions into an existing app.

---

## Language-Specific SDK Notes

**If generating Python code (language: `python`):**

There is no official Intuit-published Python SDK, but the community-maintained **`python-quickbooks`** library (by `ej2`, v0.9.12+) is the de-facto standard. It has typed entity models, custom-field wiring on Invoice/SalesReceipt, and a public `params={}` hook on `.save()` / `.get()` that propagates to the QBO REST URL — so `params={'include': 'enhancedAllCustomFields'}` does the right thing.

For Task 1 (GraphQL), use `requests` directly — no library supports the Custom Fields GraphQL API in Python.

---

## Task 1 — GraphQL discovery (`requests`)

- POST the `appFoundationsCustomFieldDefinitions` query to `https://qb.api.intuit.com/graphql` (production only — GraphQL has no sandbox endpoint) with `Content-Type: application/json`, `Authorization: Bearer <token>`, and a unique `intuit_tid` per request for log correlation.
- Send the argument as **`filters`** (plural — `AppFoundations_CustomExtensionsDefinitionFilterBy` input type) with primitive fields: `{ active: true }`. Do not use `{ equals: ... }` predicate wrappers. Filter by target entity client-side after the response.
- Parse the JSON response and build a `dict` keyed by `legacyIDV2` (NOT the GraphQL `id`). Store `label` and `dataType` per entry. The GraphQL node field is lowercase `id`.
- Handle pagination via `pageInfo.endCursor` / `pageInfo.hasNextPage`.

---

## Task 2 — REST V3 entity creation (`python-quickbooks`)

### Setup

```python
from intuitlib.client import AuthClient
from quickbooks import QuickBooks
from quickbooks.objects.invoice import Invoice
from quickbooks.objects.salesreceipt import SalesReceipt
from quickbooks.objects.base import CustomField, Ref
from quickbooks.objects.detailline import SalesItemLineDetail, SalesItemLine

auth_client = AuthClient(
    client_id=...,
    client_secret=...,
    environment='production',   # or 'sandbox' — honors salesreceipt-relevant REST V3 envs only
    redirect_uri=...,
)
auth_client.access_token = access_token   # from .env

client = QuickBooks(
    auth_client=auth_client,
    refresh_token=refresh_token,            # optional, only if you'll refresh
    company_id=realm_id,
    minorversion=75,
)
```

### Build the entity

```python
sr = SalesReceipt()
sr.CustomerRef = Ref()
sr.CustomerRef.value = "1"

line = SalesItemLine()
line.Amount = 111
line.SalesItemLineDetail = SalesItemLineDetail()
line.SalesItemLineDetail.ItemRef = Ref()
line.SalesItemLineDetail.ItemRef.value = "1"
sr.Line.append(line)

cf = CustomField()
cf.DefinitionId = definition["legacyIDV2"]   # NOT the GraphQL `id`
cf.Name = definition["label"]                # optional but recommended
cf.Type = "StringType"                       # pick from StringType / NumberType / DateType
cf.StringValue = "Demo value"                # see "Typed value fields" below
sr.CustomField.append(cf)

# Attach the include parameter via `params=` on .save().
# This is the key call — without it, the response strips CustomField metadata.
sr.save(qb=client, params={'include': 'enhancedAllCustomFields'})

print("Created SalesReceipt id =", sr.Id)
```

### Typed value fields — important Python-only gap

The `quickbooks.objects.base.CustomField` class in `python-quickbooks` 0.9.12 only declares **`StringValue`** as a typed attribute. **`NumberValue` and `DateValue` are NOT typed on the class** — to set them, assign them as regular attributes and they'll serialize correctly via `to_json()`:

```python
# STRING / STRING_LIST / OBJECT_LIST — uses the typed StringValue field
cf.Type = "StringType"
cf.StringValue = "Demo value"

# NUMBER — set NumberValue as a raw attribute (not part of the typed POJO)
cf.Type = "NumberType"
cf.NumberValue = 42.0

# DATE — set DateValue as a raw attribute, format YYYY-MM-DD
cf.Type = "DateType"
cf.DateValue = "2026-05-23"
```

Set **exactly one** value field per `CustomField`. For `STRING_LIST` / `OBJECT_LIST`, validate `StringValue` against the definition's active `dropDownOptions[].value` set (from Task 1) before sending.

### Customer entity — Python-only gap

`python-quickbooks` 0.9.12's `Customer` class does **NOT** declare a `CustomField` attribute, even though the QBO REST API supports custom fields on Customer. If you need Customer custom fields, you have three options:
1. Monkey-patch: `Customer.CustomField = []` and add it to `Customer.list_dict` before serialization.
2. Use the SDK-free path below for Customer specifically.
3. Submit a PR upstream.

### Silent-drop detection

REST V3 silently drops `CustomField` entries whose `DefinitionId` doesn't match the target entity's sub-association. After `.save()` returns (the SDK populates `self.CustomField` from the response), compare the returned `CustomField` list against the list you sent. Warn on any missing entries — most common cause: a `SALE_INVOICE`-scoped definition will not attach to a SalesReceipt (`SALE`-scoped) — and vice versa.

---

## Task 3 — Type-aware hydration (`python-quickbooks`)

```python
fetched = SalesReceipt.get(sr.Id, qb=client, params={'include': 'enhancedAllCustomFields'})

for rcf in fetched.CustomField:
    def_id = rcf.DefinitionId                 # equals legacyIDV2
    meta = definition_map[def_id]
    data_type = meta['dataType']
    if data_type in ('STRING', 'STRING_LIST', 'OBJECT_LIST'):
        value = rcf.StringValue
    elif data_type == 'NUMBER':
        value = getattr(rcf, 'NumberValue', None)
    elif data_type == 'DATE':
        value = getattr(rcf, 'DateValue', None)
    # ...render label + value for the UI...
```

Filter `fetched.Line` to entries where `line.DetailType == "SalesItemLineDetail"`. Exclude system-generated lines (`SubTotalLineDetail`, `DiscountLineDetail`, `TaxLineDetail`).

---

## Dependencies

```
pip install python-quickbooks intuit-oauth
```

`intuit-oauth` provides `AuthClient` (the OAuth flow). Use it only if you need refresh; this prompt assumes the token in `.env` is already valid.

---

## Alternative: no-SDK approach (`requests` + dicts)

Use this when you don't want to add `python-quickbooks` to the project, or when you need Customer custom fields (which the SDK doesn't wire — see above). The pattern matches what the Node.js notes do: build the request body as a `dict` with PascalCase keys, POST via `requests.post(...)` with `params={'include': 'enhancedAllCustomFields'}`.

```python
import requests, uuid

body = {
    "Line": [{
        "Amount": 111,
        "DetailType": "SalesItemLineDetail",
        "SalesItemLineDetail": {"ItemRef": {"value": "1"}},
    }],
    "CustomerRef": {"value": "1"},
    "CustomField": [{
        "DefinitionId": definition["legacyIDV2"],
        "Name": definition["label"],
        "Type": "StringType",
        "StringValue": "Demo value",
    }],
}

resp = requests.post(
    f"https://quickbooks.api.intuit.com/v3/company/{realm_id}/salesreceipt",
    params={"minorversion": "75", "include": "enhancedAllCustomFields"},
    headers={
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "intuit_tid": str(uuid.uuid4()),
    },
    json=body,
    timeout=30,
)
resp.raise_for_status()
created = resp.json()["SalesReceipt"]   # QBO wraps the response in the entity name
```

PascalCase keys, top-level entity for request, response wrapped under PascalCase entity name. Same shape on the wire as the SDK path.

---

## 🛑 AI Guardrails (Anti-Hallucination Constraints)

**CRITICAL INSTRUCTIONS - YOU MUST ADHERE TO THE FOLLOWING:**
1. **No Hallucinations:** Do not invent, guess, or hallucinate API endpoints, GraphQL properties, or SDK methods that are not explicitly provided in the context or linked documentation.
2. **Strict SDK/Library Usage:** If an official SDK or library is specified (e.g., Intuit Java SDK), use ONLY the methods and classes that exist in its latest public release. Do not construct fake SDK models. For Custom Fields specifically: GraphQL (Tasks 1, 4, 5) has no SDK — use a plain HTTP client. For REST V3 (Tasks 2 & 3), use the SDK's create/read methods (`DataService.add()` / `findById()` in Java, `dataService.Add<T>()` in .NET, `entity.save(qb=client, params=...)` in Python). Each SDK has a language-specific way to attach the `enhancedAllCustomFields` include parameter; see the language-specific SDK notes for the exact mechanism. (Note: the Node.js SDK has no public hook for this parameter — for Node, build the request body as a plain object with PascalCase keys and POST via plain HTTP with `&include=enhancedAllCustomFields` on the URL.)
3. **Provided Links Only:** You must derive all API syntax, structure, and constraints strictly from the provided links. All HTTP responses (GraphQL and REST) must be parsed according to the provided documentation.
4. **Endpoint Strictness:** Use the exact endpoints and query structures provided. Do not attempt to modify the base URL, append unsupported parameters, or alter the `minorversion=75` requirement.
5. **If Blocked/Missing Info:** If the provided documentation or payload structures lack required fields to compile a functional request, STOP and clearly state what specific information is missing instead of making an educated guess.

I have provided you with all the necessary context and instructions. Please generate the code and documentation as per the instructions.
