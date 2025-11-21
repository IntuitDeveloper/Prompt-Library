# QuickBooks V3 Java SDK Upgrade Prompts (to 6.5.2)

Use these when upgrading an existing Java integration that uses the QuickBooks Online V3 Java SDK to version **6.5.2** from an older version.

> Note: Adjust details if your current SDK version differs. These prompts assume Java, the V3 API, and a typical `DataService`-based integration.

---


### Quality guardrails:
- Do not invent steps. Follow instructions in order as cited.
- Remind users to confirm all pre-checks .
- Do not modify or delete files outside the SDK scope.
If uncertain, halt and ask for clarification rather than guessing or proceeding.

## 1. Understand what changes in 6.5.2

> I’m using the **QuickBooks Online V3 Java SDK** in this project and want to upgrade whatever version is currently configured to **6.5.2**. First, read my build configuration (pom.xml, build.gradle, or equivalent) to detect the QuickBooks SDK version(s) I’m on today.  
> Use these official sources for release notes and webhook changes:  
> - Webhooks payload structure change: https://blogs.intuit.com/2025/11/12/upcoming-change-to-webhooks-payload-structure/  
> - Java SDK 6.5.2 release notes: https://github.com/intuit/QuickBooks-V3-Java-SDK/releases/tag/v6.5.2  
> Read those pages and incorporate their content into your analysis.  
>   
> Summarize ONLY what matters for upgrading an existing Java integration:  
> - Breaking API changes (Java signatures, removed classes/methods)  
> - Changes to `DataService`, service context, or configuration setup  
> - Changes to authentication and token handling (OAuth1 vs OAuth2, scopes)  
> - Changes to query behavior (e.g., `QueryResult`, pagination, filtering)  
> - Changes to error handling or exception types  
> - New required dependencies or minimum Java / library versions  
>   
> Output in this structure:  
> 1) High‑risk breaking changes for existing code  
> 2) Medium‑risk behavior changes (e.g., queries, dates, taxes, currency)  
> 3) Low‑risk or opt‑in improvements  
> 4) A short upgrade checklist specific to QuickBooks V3 Java SDK 6.5.2.

### 1.2 Compare my current version to 6.5.2

> Read my build configuration (pom.xml, build.gradle, or equivalent) to detect the **current QuickBooks Online V3 Java SDK version(s)** used in this project, then treat that as the "from" version. I want to upgrade those to **6.5.2**.  
> Explain the key differences focusing on:  
> - Any changes in how I initialize `DataService` / `ServiceContext`  
> - Changes in authentication setup (OAuth, tokens, environment URLs, realms)  
> - Changes to entity models (e.g., `Invoice`, `Payment`, `Customer`) that might break serialization or field access  
> - Changes to querying (e.g., `QueryResult`, where clauses, limits, pagination)  
> - Changes to batch or CDC (Change Data Capture) operations  
>   
> Give concise bullet points and a short “watch out for…” list relevant to typical accounting/finance workflows.

## 2. Configuration, dependencies, and build changes

### 2.1 Maven/Gradle dependency & transitive libs (upgrade ipp-v3-java-*)

> I’m upgrading to **QuickBooks V3 Java SDK 6.5.2**.  
> Read my build files (pom.xml and/or build.gradle) to detect my current QuickBooks‑related dependencies, especially **`ipp-v3-java-data`** and **`ipp-v3-java-devkit`**, and their versions.  
> Then:  
> - Update those QuickBooks SDK dependencies to version **6.5.2** in the build files (Maven and/or Gradle)  
> - Align or pin any critical transitive dependencies (e.g., HTTP client, JSON libs, auth libs) if needed  
> - Note any known version compatibility issues with common frameworks (Spring, logging, etc.)  
>   
> Apply the dependency updates directly to the build files, and then output:  
> - The final dependency blocks you set for `ipp-v3-java-data` and `ipp-v3-java-devkit` at 6.5.2  
> - A short checklist of build / dependency issues to watch for.

---

## 3. Concrete migration guidance for common QuickBooks patterns

### 3.1 Automated WebhooksEvent → WebhooksCloudEvent migration (after dependency upgrade)

> After you have upgraded my QuickBooks SDK dependencies to 6.5.2 (see the dependency section above), migrate my webhook-related code to use the new **CloudEvents-based** types in the QuickBooks V3 Java SDK 6.5.2. **Do not perform a naive text replacement.**  
> Instead, follow these steps:  
> 1) Inspect the actual class definitions for `com.intuit.ipp.data.WebhooksEvent` and `com.intuit.ipp.data.WebhooksCloudEvent` (and any closely related payload classes) to understand their fields, nested types, and payload structure. Use the SDK source or decompiled bytecode as needed.  
> 2) Scan my project to find all usages of `WebhooksEvent` (types, constructors, getters, payload mapping code, and any JSON/XML handling). For each usage, rewrite the logic to work correctly with `WebhooksCloudEvent` based on the class structure differences (e.g., different wrappers, metadata fields, lists vs single events).  
> 3) Find the `WebhooksService` class and its `getWebhooksEvent` method, and replace it with an implementation based on `getWebhooksCloudEvent` (or the equivalent API in 6.5.2), updating the return type, internal logic, and all call sites so they consume the new CloudEvents-based structure correctly.  
> 4) Where my code maps webhook payloads into domain objects, update those mappings to use the correct fields and nested objects from `WebhooksCloudEvent`, preserving behavior as much as possible (e.g., which IDs, operation types, and timestamps are used).  
> 5) Apply these edits **directly to the Java source files in my workspace** using your code-edit tools, rather than only showing code in the chat.  
> 6) After applying changes, run a quick scan (or compilation step if possible) to highlight any remaining references to `WebhooksEvent` or `getWebhooksEvent` that need manual attention.  
>   
> Summarize the results as:  
> - A list of files you modified and what changed in each (types, imports, method names, payload-handling logic)  
> - Any compile-time issues or ambiguous cases you could not safely fix automatically, with concrete suggestions for how I should resolve them.

---