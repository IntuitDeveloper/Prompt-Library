**If generating Node.js code (language: `{{language_framework}}`):**

There is no Intuit-published entity SDK for Node.js. The official Intuit Custom Fields Node sample ([`IntuitDeveloper/Sampleapp-Customfields-Nodejs`](https://github.com/IntuitDeveloper/Sampleapp-Customfields-Nodejs)) uses **`graphql-request`** for GraphQL calls (Tasks 1, 4, 5) and **plain HTTP** (`axios` or native `fetch`) for everything else. There is also a community library `node-quickbooks` (by mcohen01) — **do not use it for this prompt** — its `module.request` honors only two hardcoded entity pseudo-fields (`allowDuplicateDocNum`, `requestId`) and exposes no public hook for adding query parameters like `include=enhancedAllCustomFields`. To send `include=enhancedAllCustomFields` via `node-quickbooks`, you'd need to fork or monkey-patch it.

> **Note about the official Intuit Node sample:** that sample only implements Tasks 1, 4, and 5 (GraphQL definition CRUD). It does NOT implement Tasks 2 or 3 (creating an Invoice / SalesReceipt with attached custom-field values via REST V3). That's why no entity SDK appears in its `package.json` — those tasks need plain HTTP.

## HTTP clients

- **`graphql-request`** (recommended for Task 1 / 4 / 5) — `npm install graphql-request graphql`. Concise, handles the `query`/`variables` envelope automatically.
- **`axios`** (recommended for Tasks 2 / 3) — `npm install axios`. Used by the official Intuit sample.
- **native `fetch`** (Node 18+) — viable alternative to axios; no extra dep needed.
- **`intuit-oauth`** (optional) — `npm install intuit-oauth`. OAuth token flow only (login / exchange / refresh). NOT an entity SDK. Use only if you need to implement OAuth refresh; this prompt assumes the token in `.env` is already valid.

---

## Task 1 — GraphQL discovery (`graphql-request`)

```js
import { GraphQLClient, gql } from 'graphql-request';

const GRAPHQL_URL = 'https://qb.api.intuit.com/graphql';  // production-only

const client = new GraphQLClient(GRAPHQL_URL, {
  headers: {
    Authorization: `Bearer ${process.env.QBO_ACCESS_TOKEN}`,
    'intuit_tid': crypto.randomUUID(),                    // unique per request
    // QBO uses lowercase `realmId` for GraphQL; the official Intuit Node sample
    // also tries `intuit-realm-id` — pass `realmId` to be safe.
    realmId: process.env.QBO_REALM_ID,
  },
});

const QUERY = gql`
  query ListDefinitions($filters: AppFoundations_CustomExtensionsDefinitionFilterBy!, $first: Int!, $after: String) {
    appFoundationsCustomFieldDefinitions(filters: $filters, first: $first, after: $after) {
      edges { node { id legacyIDV2 label dataType active dropDownOptions { id value active order }
        associations { associatedEntity associationCondition allowedOperations
          subAssociations { associatedEntity active allowedOperations } } } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const data = await client.request(QUERY, { filters: { active: true }, first: 50, after: null });
```

- Send the argument as **`filters`** (plural) with primitive fields: `{ active: true }`. Do not use `{ equals: ... }` predicate wrappers. Filter by target entity client-side after the response — see the main prompt's Task 1 for the `associations[].associatedEntity` + `subAssociations[].associatedEntity` filtering logic.
- Build a `Map` (or plain object) keyed by `legacyIDV2` (NOT the GraphQL `id`). Store `label`, `dataType`, and `dropDownOptions` per entry. The GraphQL node field is lowercase `id`.
- Handle pagination via `pageInfo.endCursor` / `pageInfo.hasNextPage` — loop until `hasNextPage` is `false`.

---

## Task 2 — REST V3 entity creation (`axios` + plain JSON)

QBO REST V3 expects PascalCase keys on the request body. Build a plain JS object with PascalCase keys and POST via axios. **No SDK is involved.**

```js
import axios from 'axios';

const BASE_REST = process.env.QBO_ENV === 'sandbox'
  ? 'https://sandbox-quickbooks.api.intuit.com'
  : 'https://quickbooks.api.intuit.com';

const body = {
  Line: [{
    Amount: 111,
    DetailType: 'SalesItemLineDetail',
    SalesItemLineDetail: { ItemRef: { value: '1' } },
  }],
  CustomerRef: { value: '1' },
  CustomField: [{
    DefinitionId: definition.legacyIDV2,   // NOT the GraphQL `id`
    Name: definition.label,                // optional but recommended
    Type: 'StringType',                    // see "Typed value fields" below
    StringValue: 'Demo value',
  }],
};

const resp = await axios.post(
  `${BASE_REST}/v3/company/${process.env.QBO_REALM_ID}/salesreceipt`,
  body,
  {
    params: {
      minorversion: '{{minorversion}}',
      include: 'enhancedAllCustomFields',   // critical — without this, the response strips CustomField metadata
    },
    headers: {
      Authorization: `Bearer ${process.env.QBO_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      intuit_tid: crypto.randomUUID(),
    },
    timeout: 30_000,
  }
);

const created = resp.data.SalesReceipt;   // QBO wraps the response in the entity name
console.log('Created SalesReceipt id', created.Id);
```

### Typed value fields

Pick exactly **one** value field per `CustomField` based on Task 1's `dataType`:

| dataType | `Type` | Value field | Format |
|---|---|---|---|
| `STRING` / `STRING_LIST` / `OBJECT_LIST` | `"StringType"` | `StringValue` | string |
| `NUMBER` | `"NumberType"` | `NumberValue` | number |
| `DATE` | `"DateType"` | `DateValue` | `"YYYY-MM-DD"` |

The published enum does not list `BOOLEAN`; if the live schema returns one, follow the schema. Skip `UNKNOWN` with a logged warning. Do not hardcode `StringValue` for every entry.

For `STRING_LIST` / `OBJECT_LIST`, validate `StringValue` against the definition's active `dropDownOptions[].value` set (from Task 1) before sending.

### Silent-drop detection

REST V3 silently drops `CustomField` entries whose `DefinitionId` doesn't match the target entity's sub-association. After the POST returns, compare `created.CustomField` against the array you sent and warn on any missing entries. Most common cause: a `SALE_INVOICE`-scoped definition will not attach to a SalesReceipt (`SALE`-scoped) — and vice versa.

---

## Task 3 — Type-aware hydration (`axios` + JSON)

```js
const resp = await axios.get(
  `${BASE_REST}/v3/company/${process.env.QBO_REALM_ID}/salesreceipt/${createdId}`,
  {
    params: { minorversion: '{{minorversion}}', include: 'enhancedAllCustomFields' },
    headers: {
      Authorization: `Bearer ${process.env.QBO_ACCESS_TOKEN}`,
      Accept: 'application/json',
      intuit_tid: crypto.randomUUID(),
    },
  }
);
const fetched = resp.data.SalesReceipt;

for (const rcf of fetched.CustomField ?? []) {
  const meta = defMap.get(rcf.DefinitionId);   // DefinitionId equals legacyIDV2
  const value =
    meta.dataType === 'NUMBER' ? rcf.NumberValue :
    meta.dataType === 'DATE'   ? rcf.DateValue :
                                 rcf.StringValue;
  // ...render label + value for the UI...
}
```

Filter `fetched.Line` to entries where `line.DetailType === 'SalesItemLineDetail'`. Exclude `SubTotalLineDetail`, `DiscountLineDetail`, `TaxLineDetail`.

---

## Required runtime essentials

- **`dotenv`** — `npm install dotenv`. Call `dotenv.config()` once at startup to load `.env`. Works regardless of cwd as long as `.env` is at the project root.
- **`intuit_tid` per request.** Generate via `crypto.randomUUID()` (Node 18+) and set on every outbound request header. Capture the response `intuit_tid` (`resp.headers['intuit_tid']`) and log it for support correlation.
- **Logging.** Use Node's built-in `console` or a library like `pino` / `winston`. No binding-required setup needed (unlike Java's SLF4J trap).

---

## TypeScript typing (optional)

If using TypeScript, declare:

```ts
interface DefinitionMeta {
  legacyIDV2: string;
  label: string;
  dataType: 'STRING' | 'STRING_LIST' | 'OBJECT_LIST' | 'NUMBER' | 'DATE' | 'UNKNOWN';
  dropDownOptions?: { id: string; value: string; active: boolean; order: number }[];
}

interface CustomField {
  DefinitionId: string;
  Name?: string;
  Type: 'StringType' | 'NumberType' | 'DateType';
  StringValue?: string;
  NumberValue?: number;
  DateValue?: string;   // YYYY-MM-DD
}
```
