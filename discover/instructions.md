## Supported `type_of_transaction` Values

| Value |
|-------|
| `Bill` |
| `CreditMemo` |
| `Deposit` |
| `Estimate` |
| `Expense/Purchase` |
| `Invoice` |
| `JournalEntry` |
| `PurchaseOrder` |
| `RefundReceipt` |
| `SalesReceipt` |
| `VendorCredit` |

---

## Supported `language_framework` and `typing_system` Combinations

| Language / Framework | Typing System | Notes |
|----------------------|---------------|-------|
| `Python` | `hints (dataclasses)` | Native Python 3.9+ typing with dataclasses |
| `Python` | `Pydantic models` | Runtime validation + serialization |
| `TypeScript` | `TypeScript interfaces` | Static typing, good for Node.js backends |
| `TypeScript` | `Zod schemas` | Runtime validation + type inference |
| `Java` | `Java classes/records` | Strong typing, enterprise standard |
| `Kotlin` | `Kotlin data classes` | Concise, null-safe, JVM compatible |
| `C#/.NET` | `C# classes/records` | Strong typing, good for enterprise |
| `Go` | `Go structs with tags` | Lightweight, good for microservices |
| `Rust` | `Rust structs with serde` | Memory-safe, high performance |
| `Ruby` | `Sorbet type annotations` | Optional typing for Ruby |
| `PHP` | `PHP 8 typed properties` | Modern PHP with strict types |
| `Swift` | `Swift structs/Codable` | iOS/macOS native development |

---

## Example `transaction_creation_instructions` Values

Copy one of the examples below into the `transaction_creation_instructions` field in `prompt-config.json`.

**Invoice / SalesReceipt:**
```json
"transaction_creation_instructions": "Create {{type_of_transaction}} with default item id: 1 and default customer: 1 and {{type_of_transaction}} amount: 100."
```

**PurchaseOrder:**
```json
"transaction_creation_instructions": "Create {{type_of_transaction}} with default item id: 2 and default vendor: 28 and {{type_of_transaction}} amount: 100 and APAccountRef=20. Pre-check whether {{type_of_transaction}} is enabled for the company by checking the company preferences API, OtherPrefs.NameValue array for {\"Name\": \"VendorAndPurchasesPrefs.PurchaseOrderEnabled\", \"Value\": \"true\"}. If not enabled, throw an error — 'Purchase Order is not enabled for this company.'."
```

**Bill (with Java SDK):**
```json
"transaction_creation_instructions": "Create {{type_of_transaction}} with default item id: 2 and default vendor: 28 and {{type_of_transaction}} amount: 100 and APAccountRef=20. For any REST API calls and OAuth 2.0 authentication, use the Intuit official Java SDK at: https://central.sonatype.com/search?q=g:com.intuit.quickbooks-online&smo=true with Gradle dependency. Use all the latest versions and best practices for SDK integration. Refer to the official documentation at: https://developer.intuit.com/app/developer/qbo/docs/develop/sdks-and-samples-collections/java/install-the-java-sdk#jar-files and https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0. Use appropriate methods from SDKs only; do not hallucinate or make up methods that don't exist in the SDK."
```

**Estimate (with PHP SDK — set both fields):**
```json
"transaction_creation_instructions": "Create {{type_of_transaction}} with default item id: 1 and default customer: 1 and {{type_of_transaction}} amount: 111. For any REST API calls and OAuth 2.0 authentication, use the Intuit official PHP SDK documented at: {{php-sdk-documentation}}. Use all the latest versions and best practices for SDK integration. Refer to the official documentation mentioned in the link and {{oauth2-documentation}}. Use appropriate methods from SDKs only; do not hallucinate or make up methods that don't exist in the SDK.",
"project_estimate_creation_instructions": "Create a {{type_of_transaction}} with default item id: 1 and default customer: 32, UnitPrice: 1, UnitCostPrice: 10, Qty: 100, and ItemAccountRef=5."
```

---

## Metadata

| Author | API | Version | Last tested |
|--------|-----|---------|-------------|
| Intuit Developer | Dimensions API | v1 | 2026-03-30 |
