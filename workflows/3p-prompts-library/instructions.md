Examples of type_of_transaction  values which can be used to configure in prompt-config.json:
Bill
CreditMemo
Deposit
Estimate
Expense/Purchase
Invoice
JournalEntry
PurchaseOrder
RefundReceipt
SalesReceipt
VendorCredit

Examples of {{language_framework}} and {{typing_system}} combinations that can be used to configure in prompt-config.json:
----------------------------
Pythontype              hints (dataclasses)         (Native Python 3.9+ typing with dataclasses)
Python                  Pydantic models             (Runtime validation + serialization)
TypeScript              TypeScript interfaces       (Static typing, good for Node.js backends)
TypeScript              Zod schemas                 (Runtime validation + type inference)
Java                    Java classes/records        (Strong typing, enterprise standard)
Kotlin                  Kotlin data classes         (Concise, null-safe, JVM compatible)
C#/.NET                 C# classes/records          (Strong typing, good for enterprise)
Go                      Go structs with tags        (Lightweight, good for microservices)
Rust                    Rust structs with serde     (Memory-safe, high performance)
Ruby                    Sorbet type annotations     (Optional typing for Ruby)
PHP                     PHP 8 typed properties      (Modern PHP with strict types)
Swift                   Swift structs/Codable       (iOS/macOS native development)

Examples of {{transaction_creation_instructions}} that can be used to configure in prompt-config.json:
----------------------------
"transaction_creation_instructions": {
    "invoice": "Create {{type_of_transaction}} with default item id : 1 and default customer : 1 and {{type_of_transaction}} amount: 100",
    "salesreceipt": "Create {{type_of_transaction}} with default item id : 1 and default customer : 1 and {{type_of_transaction}} amount: 100",
    "purchaseorder": "Create {{type_of_transaction}} with default item id : 2 and default vendor : 28 and {{type_of_transaction}} amount: 100 and APAccountRef=20. PreCheck whether {{type_of_transaction}} is enabled for the company by checking the company preferences API, OtherPrefs.NameValue array for {
                            "Name": "VendorAndPurchasesPrefs.PurchaseOrderEnabled",
                            "Value": "true"
                        }. 
                        If not enabled, throw an error - 'Purchase Order is not enabled for this company.'.",
    "bill": "Create {{type_of_transaction}} with default item id : 2 and default vendor : 28 and {{type_of_transaction}} amount: 100 and APAccountRef=20.
    For any REST API calls and OAuth 2.0 authentication, I want to use Intuit official JAVA SDK at: https://central.sonatype.com/search?q=g:com.intuit.quickbooks-online&smo=true with Graddle dependency. Use all the latest versions and best practices for SDK intetgration. Refer to the official documentation at: https://developer.intuit.com/app/developer/qbo/docs/develop/sdks-and-samples-collections/java/install-the-java-sdk#jar-files and https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0. Use appropriatemethods from SDKs only, do not hallucinate or make up methods that don't exist in the SDK. ",
    "estimate": {
        "project_estimate_creation_instructions": "Create a {{type_of_transaction}} with default item id : 1 and default Customer : 32 and UnitPrice: 1, UnitCostPrice: 10,Qty: 100, and ItemAccountRef=5. ",
        "transaction_creation_instructions": "Create {{type_of_transaction}} with default item id : 1 and default customer : 1 and {{type_of_transaction}} amount: 111. For any REST API calls and OAuth 2.0 authentication, I want to use Intuit official PHP SDK documented at: {{php-sdk-documentation}}. Use all the latest versions and best practices for SDK intetgration. Refer to the official documentation mentioned in the link and {{oauth2-documentation}}. Use appropriate methods from SDKs only, do not hallucinate or make up methods that don't exist in the SDK. "
    }
}


 ### Author, use-case, API version, last-tested date (Template registries)
 Intuit Developer, Dimensions API, v1, 2026-03-30



