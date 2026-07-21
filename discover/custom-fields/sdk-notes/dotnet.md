**If generating .NET / C# code (language: `{{language_framework}}`):**

Use **`System.Net.Http.HttpClient`** for Task 1 (GraphQL discovery — no SDK supports GraphQL) and the official **`IppDotNetSdkForQuickBooksApiV3`** for Tasks 2 & 3 (REST V3).

- **Task 1 — GraphQL discovery (plain HTTP):**
  - The Intuit .NET SDK does **not** support GraphQL. Use `System.Net.Http.HttpClient` (part of the .NET standard library — no extra package needed) to POST the `appFoundationsCustomFieldDefinitions` query to `{{graphql_endpoint_production}}` (or `{{graphql_endpoint_sandbox}}` when `QBO_ENV=sandbox`).
  - Send the argument as **`filters`** (plural — `AppFoundations_CustomExtensionsDefinitionFilterBy` input type) with primitive fields: `{ active: true }`. Do not use `{ equals: ... }` predicate wrappers. Filter by target entity client-side after the response — see the main prompt's Task 1 for the `associations[].associatedEntity` + `subAssociations[].associatedEntity` filtering logic.
  - Parse the JSON response and build a `Dictionary<string, DefinitionMeta>` keyed by `legacyIDV2` (NOT the GraphQL `id`). Store `label` and `dataType` per entry. The GraphQL node field is lowercase `id`.
  - Handle pagination via `pageInfo.endCursor` / `pageInfo.hasNextPage`.

- **Task 2 — REST V3 entity creation (SDK):**

  ### Setup — build ServiceContext, add include param, construct DataService

  ```csharp
  using Intuit.Ipp.Core;
  using Intuit.Ipp.Security;
  using Intuit.Ipp.DataService;
  using Intuit.Ipp.Data;

  string raw = token.StartsWith("Bearer ") ? token.Substring(7) : token;
  var validator = new OAuth2RequestValidator(raw);
  var serviceContext = new ServiceContext(realmId, IntuitServicesType.QBO, validator);
  serviceContext.IppConfiguration.MinorVersion.Qbo = "{{minorversion}}";

  // Add the include parameter BEFORE constructing DataService so every call uses it.
  // Public, supported API on ServiceContext.Include — verified in the SDK's IncludeParamTest.cs.
  serviceContext.Include.Add("enhancedAllCustomFields");

  var dataService = new DataService(serviceContext);
  ```

  ### Build the entity with typed POJOs

  - The entity class matching `{{type_of_transaction}}` from the `Intuit.Ipp.Data` namespace (e.g., `Invoice`, `SalesReceipt`, `Estimate`, `Bill`, `Customer`, `Vendor`) — the entity object
  - `Intuit.Ipp.Data.CustomField` — one instance per custom field
    - `DefinitionId` — pass the **`legacyIDV2`** from Task 1, **not** the GraphQL `id`
    - `Name` — the `label` from Task 1 (recommended for readability)
    - `Type` — map Task 1's `dataType`: `STRING` / `STRING_LIST` / `OBJECT_LIST` → `CustomFieldTypeEnum.StringType`, `NUMBER` → `CustomFieldTypeEnum.NumberType`, `DATE` → `CustomFieldTypeEnum.DateType`. The published enum does not list `BOOLEAN`; if the live schema returns one, follow the schema. Skip `UNKNOWN` with a logged warning.
    - `AnyIntuitObject` (typed as `object`) — the value to attach. Verified against the .NET SDK's compiled `Intuit.Ipp.Data.dll`: `CustomField` exposes exactly four properties (`DefinitionId`, `Name`, `Type`, `AnyIntuitObject`). There are **no** typed `StringValue` / `NumberValue` / `DateValue` properties — the XML-choice serialization picks the right element name based on the runtime type you assign:
       - `string` → serializes as `<StringValue>` (for `STRING` / `STRING_LIST` / `OBJECT_LIST`)
       - `decimal` → serializes as `<NumberValue>` (for `NUMBER`)
       - `DateTime` → serializes as `<DateValue>` (for `DATE`, value is `YYYY-MM-DD`)
       - `bool` → serializes as `<BooleanValue>` (rarely surfaced)

       Set exactly one runtime type per `CustomField` (the XSD declares this as `xs:choice` with `minOccurs="1"`). Example:
       ```csharp
       var cf = new CustomField {
           DefinitionId = definition.LegacyIDV2,  // legacyIDV2, NOT GraphQL id
           Name = definition.Label,
           Type = CustomFieldTypeEnum.StringType,
           AnyIntuitObject = "Demo value"          // string → StringValue element
       };
       ```
  - Attach the `CustomField[]` array to the entity's `CustomField` property, then call `dataService.Add<T>(entity)`. Because `Include.Add("enhancedAllCustomFields")` was set on the ServiceContext at setup time, the response will carry the full CustomField metadata for round-trip verification.

  ### Silent-drop detection

  REST V3 silently drops `CustomField` entries whose `DefinitionId` doesn't match the target entity's sub-association exactly. After `dataService.Add<T>(...)` returns, compare the response's `CustomField` array against your sent list and warn on any missing entries. Most common cause: a `SALE_INVOICE`-scoped definition will not attach to a SalesReceipt (`SALE`-scoped) — and vice versa.

  ### Error handling

  `DataService.Add<T>()` throws on API failures (the SDK's exception hierarchy lives under `Intuit.Ipp.Exception`). Inspect `e.Message` and any inner exception. For `intuit_tid` correlation, enable the SDK's request/response logger on `serviceContext.IppConfiguration.Logger.RequestLog` (writes to disk or stream) — the SDK does not expose `intuit_tid` as a direct exception-getter property.

- **Task 3 — Type-aware hydration (SDK):**
  - Reuse the same `serviceContext` (with `Include.Add("enhancedAllCustomFields")` already applied) and `DataService` from Task 2. Build a probe with the Id set:
    ```csharp
    var probe = new SalesReceipt { Id = createdId };
    var fetched = dataService.FindById(probe);
    ```
  - The REST response's `DefinitionId` equals the `legacyIDV2` you stored in Task 1 — use it to look up `label` and `dataType` from your cached map.
  - Use the cached `dataType` to cast `AnyIntuitObject` to the right runtime type. **Reminder:** there are no typed getters like `cf.StringValue` on the SDK class — read `cf.AnyIntuitObject` and cast:
    ```csharp
    object value = rcf.AnyIntuitObject;
    object typed = meta.DataType switch {
        "STRING" or "STRING_LIST" or "OBJECT_LIST" => (string)value,
        "NUMBER" => (decimal)value,
        "DATE" => (DateTime)value,
        _ => null
    };
    ```
  - Filter the entity's `Line` array to entries where `DetailType == LineDetailTypeEnum.SalesItemLineDetail`. Exclude `SubTotalLineDetail`, `DiscountLineDetail`, `TaxLineDetail`.

- **NuGet install:**
  ```
  Install-Package IppDotNetSdkForQuickBooksApiV3
  ```
- **SDK reference:** `{{dotnet-sdk-documentation}}`

> Warning: Use **only** methods and classes that exist in the published SDK. Do not construct fake SDK models or invent method signatures.
