**If generating Java code (language: `{{language_framework}}`):**

Use the **Intuit Java SDK** (`ipp-v3-java-devkit`) **v{{java_sdk_version}}** for Tasks 2 and 3, and **Apache HttpClient + Jackson** for Task 1 (the SDK has no GraphQL support). The SDK supports `enhancedAllCustomFields` via a public method on `Context` — verified live against production with end-to-end round-trip of Invoice, SalesReceipt, and Customer custom-field writes.

> **SDK version:** `6.7.0` is the latest. `6.5.2` / `6.5.3` work identically for custom fields (same `setIncludeParam` API, same typed CustomField setters). Prefer the latest unless your project pins an earlier version.

---

## Task 1 — GraphQL discovery (plain HTTP + Jackson)

The Intuit Java SDK does not support GraphQL. Use `CloseableHttpClient` from Apache HttpClient (a transitive dependency of `ipp-v3-java-devkit`) to POST the `appFoundationsCustomFieldDefinitions` query to `{{graphql_endpoint_production}}` (production only — GraphQL has no sandbox endpoint).

- Build the request body as a `Map<String, Object>` with keys `query` and `variables`. Serialize with `objectMapper.writeValueAsString(body)`.
- Send the argument as **`filters`** (plural — `AppFoundations_CustomExtensionsDefinitionFilterBy` input type) with primitive fields: `{ active: true }`. Do not use `{ equals: ... }` predicate wrappers. Filter by target entity client-side after the response.
- Parse with Jackson (`objectMapper.readTree(body)` then walk via `JsonNode`). Build a `Map<String, DefinitionMeta>` keyed by `legacyIDV2` (NOT the GraphQL `id`). Store `label` and `dataType` per entry. The GraphQL node field is lowercase `id`.
- Handle pagination via `pageInfo.endCursor` / `pageInfo.hasNextPage`.

---

## Task 2 — REST V3 entity creation (SDK)

The SDK's `DataService.add()` handles serialization correctly when the Context has the include parameter set. Hold the `Context` reference yourself so you can call `setIncludeParam` on it directly — `DataService.getContext()` is private in the SDK, so reflection is the only alternative, and it isn't necessary if you keep the reference.

### Setup

```java
import com.intuit.ipp.core.Context;
import com.intuit.ipp.core.ServiceType;
import com.intuit.ipp.security.OAuth2Authorizer;
import com.intuit.ipp.services.DataService;

String raw = token.startsWith("Bearer ") ? token.substring(7) : token;
Context context = new Context(new OAuth2Authorizer(raw), ServiceType.QBO, realmId);
context.setMinorVersion("{{minorversion}}");

// Set BEFORE constructing DataService so every call on this DataService uses it.
context.setIncludeParam(java.util.List.of("enhancedAllCustomFields"));

DataService dataService = new DataService(context);
```

### Build the entity with typed POJOs

```java
import com.intuit.ipp.data.SalesReceipt;   // or Invoice / Estimate / Bill / Customer / Vendor — match {{type_of_transaction}}
import com.intuit.ipp.data.Line;
import com.intuit.ipp.data.LineDetailTypeEnum;
import com.intuit.ipp.data.SalesItemLineDetail;
import com.intuit.ipp.data.ReferenceType;
import com.intuit.ipp.data.CustomField;
import com.intuit.ipp.data.CustomFieldTypeEnum;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

SalesReceipt sr = new SalesReceipt();

ReferenceType custRef = new ReferenceType();
custRef.setValue("1");
sr.setCustomerRef(custRef);

Line line = new Line();
line.setAmount(new BigDecimal("111"));
line.setDetailType(LineDetailTypeEnum.SALES_ITEM_LINE_DETAIL);
SalesItemLineDetail sild = new SalesItemLineDetail();
ReferenceType itemRef = new ReferenceType();
itemRef.setValue("1");
sild.setItemRef(itemRef);
line.setSalesItemLineDetail(sild);
sr.getLine().add(line);

CustomField cf = new CustomField();
cf.setDefinitionId(definition.legacyIDV2());   // legacyIDV2 from Task 1, NOT the GraphQL id
cf.setName(definition.label());                // optional but recommended
cf.setType(CustomFieldTypeEnum.STRING_TYPE);   // STRING_TYPE / NUMBER_TYPE / DATE_TYPE based on Task 1's dataType
cf.setStringValue("Demo value");               // pick exactly ONE typed setter (see below)
// Use a mutable list if downstream code may add fields.
sr.setCustomField(new ArrayList<>(List.of(cf)));

SalesReceipt created = dataService.add(sr);
String createdId = created.getId();
```

### Typed value setters on `CustomField`

Verified against `ipp-v3-java-data:{{java_sdk_version}}`:

- `setStringValue(String)` — for `STRING_TYPE` (used when Task 1's `dataType` is `STRING`, `STRING_LIST`, or `OBJECT_LIST`)
- `setNumberValue(BigDecimal)` — for `NUMBER_TYPE` (used when `dataType` is `NUMBER`)
- `setDateValue(java.util.Date)` — for `DATE_TYPE` (used when `dataType` is `DATE`)
- `setBooleanValue(Boolean)` — for `BooleanType` (rarely surfaced by the GraphQL schema)

Set **exactly one** typed value field per `CustomField`. There is no `setAnyIntuitObject(Object)` method on `CustomField` — do not call one.

For `STRING_LIST` / `OBJECT_LIST`, validate `StringValue` against the definition's active `dropDownOptions[].value` set (from Task 1) before sending. Mismatched values are rejected by the API.

### Silent-drop detection

REST V3 silently drops `CustomField` entries whose `DefinitionId` doesn't match the target entity's sub-association exactly. After `dataService.add(...)` returns, compare `created.getCustomField()` against your sent list and warn on any missing entries. Most common cause: a `SALE_INVOICE`-scoped definition will not attach to a SalesReceipt (`SALE`-scoped) — and vice versa.

### Error handling — `FMSException`

`DataService.add()` throws `com.intuit.ipp.exception.FMSException` on API failures. Important behaviors:

- `e.getErrorList()` — list of `com.intuit.ipp.data.Error` objects with code, message, detail. Code `6240` = duplicate name (most common on Customer creation).
- `e.getIntuit_tid()` — populated on failed calls. Log this for tracing alongside the `intuit_tid` you set on outbound requests.
- **Do NOT call `DataService.getLastRequestId()`** — that method does not exist in SDK 6.7.0. If you need the request id, use the `intuit_tid` you generated and set on the outbound request (the SDK forwards it).

---

## Task 3 — Type-aware hydration (SDK)

Reuse the same `Context` (with `setIncludeParam` already applied) and `DataService` from Task 2. The SDK's `findById` takes an entity "probe" with the Id set:

```java
SalesReceipt probe = new SalesReceipt();
probe.setId(createdId);
SalesReceipt fetched = dataService.findById(probe);

for (CustomField rcf : fetched.getCustomField()) {
    String defId = rcf.getDefinitionId();   // equals legacyIDV2
    DefinitionMeta meta = definitionMap.get(defId);
    Object value = switch (meta.dataType()) {
        case "STRING", "STRING_LIST", "OBJECT_LIST" -> rcf.getStringValue();
        case "NUMBER" -> rcf.getNumberValue();
        case "DATE" -> rcf.getDateValue();
        default -> null;
    };
    // ...render label + value for the UI...
}
```

There is no `getAnyIntuitObject()` method on `CustomField` — use the four typed getters (`getStringValue`, `getNumberValue`, `getDateValue`, `isBooleanValue`).

Filter the response's `Line` list to entries where `getDetailType() == LineDetailTypeEnum.SALES_ITEM_LINE_DETAIL`. Exclude system-generated lines (`SubTotalLineDetail`, `DiscountLineDetail`, `TaxLineDetail`).

---

## Dependencies

```xml
<dependency>
  <groupId>com.intuit.quickbooks-online</groupId>
  <artifactId>ipp-v3-java-devkit</artifactId>
  <version>{{java_sdk_version}}</version>
</dependency>
<!-- ipp-v3-java-data is brought in transitively by devkit; pin it explicitly only if your project locks transitive versions: -->
<!--
<dependency>
  <groupId>com.intuit.quickbooks-online</groupId>
  <artifactId>ipp-v3-java-data</artifactId>
  <version>{{java_sdk_version}}</version>
</dependency>
-->
```

Add `oauth2-platform-api:{{java_sdk_version}}` separately if you need to implement OAuth refresh (this prompt assumes the token in `.env` is already valid).

---

## Required runtime essentials (don't forget these — they break silently)

- **SLF4J + a binding.** `pom.xml` must declare both `org.slf4j:slf4j-api` AND a binding (`slf4j-simple` or `logback-classic`). Without a binding, `log.info` / `log.warn` calls silently no-op at runtime, which breaks the `intuit_tid` observability requirement.
- **`intuit_tid` per request.** Generate a new UUID and either pass it via `RequestElements` on the SDK call, or — when bypassing the SDK for Task 1 — set it as the `intuit_tid` request header. Log the response `intuit_tid` for log correlation with Intuit support.
- **`.env` loading robustness.** Use `io.github.cdimascio:dotenv-java`; configure `Dotenv.configure().directory(<project-root>).ignoreIfMissing().load()`. Don't rely on `Path.of(".env")` — that only resolves when cwd happens to be the project root.

---

## Alternative: no-SDK approach (Map<String, Object> + plain HTTP)

Use this only if you don't want the Intuit SDK dependency on your classpath (e.g. GraalVM native-image targets, projects already invested in `RestTemplate`-style HTTP). It's a valid working path that's been verified live against the same realm, but the SDK path above is simpler and gets you typed entities.

Build the request body as a nested `Map<String, Object>` with PascalCase keys typed in directly, then POST via `CloseableHttpClient` or `java.net.http.HttpClient` with `&include=enhancedAllCustomFields` on the URL. **Do not** use the SDK's data classes plus Jackson with `JaxbAnnotationModule` — that produces camelCase JSON (`stringValue`, `customField`) which QBO REST V3 rejects.

### Build the body

```java
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;

ObjectMapper mapper = new ObjectMapper();
Map<String, Object> body = new HashMap<>();

List<Map<String, Object>> lines = new ArrayList<>();
Map<String, Object> line = new HashMap<>();
line.put("Amount", 111.00);
line.put("DetailType", "SalesItemLineDetail");
Map<String, Object> sild = new HashMap<>();
Map<String, Object> itemRef = new HashMap<>();
itemRef.put("value", "1");
sild.put("ItemRef", itemRef);
line.put("SalesItemLineDetail", sild);
lines.add(line);
body.put("Line", lines);

Map<String, Object> customerRef = new HashMap<>();
customerRef.put("value", "1");
body.put("CustomerRef", customerRef);

List<Map<String, Object>> customFields = new ArrayList<>();
Map<String, Object> cf = new HashMap<>();
cf.put("DefinitionId", definition.legacyIDV2());
cf.put("Name", definition.label());     // optional but recommended
cf.put("Type", "StringType");
cf.put("StringValue", "Demo value");
customFields.add(cf);
body.put("CustomField", customFields);

String requestJson = mapper.writeValueAsString(body);
```

POST to `https://quickbooks.api.intuit.com/v3/company/<realmId>/{{type_of_transaction}}?minorversion={{minorversion}}&include=enhancedAllCustomFields` (sandbox host when `QBO_ENV=sandbox`).

Parse the response: `JsonNode entity = mapper.readTree(body).get("<EntityNameInPascalCase>");` — e.g. `"SalesReceipt"` when `{{type_of_transaction}}` is `salesreceipt`. **QBO wraps the response in this top-level key; the request body must NOT have such a wrapper.**

Hydrate by switching on `dataType` and reading `rcf.get("StringValue").asText()` / `.decimalValue()` / `.asText()` for `STRING` / `NUMBER` / `DATE`.

### Alternative-path dependencies

```xml
<dependency>
  <groupId>com.fasterxml.jackson.core</groupId>
  <artifactId>jackson-databind</artifactId>
  <version>2.17.1</version>
</dependency>
<dependency>
  <groupId>org.apache.httpcomponents</groupId>
  <artifactId>httpclient</artifactId>
  <version>4.5.14</version>
</dependency>
```

Or use `java.net.http.HttpClient` (built into JDK 11+) and skip the Apache dependency.
