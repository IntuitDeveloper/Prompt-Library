**If generating Python code (language: `{{language_framework}}`):**

There is no official Intuit-published Python SDK, but the community-maintained **`python-quickbooks`** library (by `ej2`, v0.9.12+) is the de-facto standard. It has typed entity models, custom-field wiring on Invoice/SalesReceipt, and a public `params={}` hook on `.save()` / `.get()` that propagates to the QBO REST URL — so `params={'include': 'enhancedAllCustomFields'}` does the right thing.

For Task 1 (GraphQL), use `requests` directly — no library supports the Custom Fields GraphQL API in Python.

---

## Task 1 — GraphQL discovery (`requests`)

- POST the `appFoundationsCustomFieldDefinitions` query to `{{graphql_endpoint_production}}` (production only — GraphQL has no sandbox endpoint) with `Content-Type: application/json`, `Authorization: Bearer <token>`, and a unique `intuit_tid` per request for log correlation.
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
    environment='production',   # or 'sandbox' — honors {{type_of_transaction}}-relevant REST V3 envs only
    redirect_uri=...,
)
auth_client.access_token = access_token   # from .env

client = QuickBooks(
    auth_client=auth_client,
    refresh_token=refresh_token,            # optional, only if you'll refresh
    company_id=realm_id,
    minorversion={{minorversion}},
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
    f"https://quickbooks.api.intuit.com/v3/company/{realm_id}/{{type_of_transaction}}",
    params={"minorversion": "{{minorversion}}", "include": "enhancedAllCustomFields"},
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
