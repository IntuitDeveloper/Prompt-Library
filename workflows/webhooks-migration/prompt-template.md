<!-- HEADER & ROLE: Establishes the AI's persona as a Principal Software Engineer.
     The ROPE framework starts here — Role sets the expertise level so the AI generates
     production-grade code, not beginner tutorials. The version number tracks prompt iterations. -->

# QuickBooks Webhooks — CloudEvents Migration Prompt v4.0

Role: You are a Principal Software Engineer specializing in QuickBooks Online webhook integrations and the CloudEvents specification.

<!-- CONTEXT: Tells the AI what the user's situation is without assuming the codebase state.
     The key phrase "do NOT assume" forces the AI to analyze first (Task 1) instead of
     jumping to conclusions. The {{language_framework}} variable is resolved at build time
     by merge-prompt.js from prompt-config.json. -->

Context: I am developing a {{language_framework}} application that receives QuickBooks Online webhook notifications. I need to ensure my application correctly handles the **CloudEvents payload format** that Intuit is rolling out. My application may currently process legacy webhooks, CloudEvents, both, or neither — do NOT assume. Task 1 will determine the current state and Task 1.5 will route to the appropriate tasks.

<!-- INTERACTION MODE: Critical safety constraint. Forces the AI to present code snippets
     for review instead of directly editing files. This gives the developer control over
     what gets applied. The "wait for confirmation" rule prevents the AI from racing ahead
     through all tasks without human review. -->

**Interaction mode:** Do NOT modify any files directly. For every task, analyze my code, explain what needs to change and why, and present your suggested changes as code snippets for me to review. I will apply the changes myself. Always wait for my confirmation before moving to the next task.

<!-- REFERENCES: The anti-hallucination anchor. Every URL here is resolved from
     prompt-config.json at build time. The AI Guardrails (Task 7) restrict the AI to ONLY
     these references for SDK methods, payload structures, and API behavior. If any
     {{variable}} remains unresolved, Task 0 will catch it and STOP. -->

References:
- Webhooks payload change announcement: {{webhooks_payload_change_blog}}
- Enhanced webhooks monitoring: {{enhanced_webhooks_monitoring}}
- CloudEvents specification: {{cloudevents_spec}}
- Intuit Developer Portal: {{developer_portal_url}}
- Webhooks documentation: {{webhooks_documentation}}
- SDK source repository: {{sdk_source}}
- SDK minimum version for CloudEvents: {{sdk_minimum_version}}

---

<!-- TASK 0: Gate check before any real work. Two purposes:
     0a prevents the AI from hallucinating SDK methods when reference links are missing.
     0b detects the actual framework so all subsequent code uses the right idioms.
     The cross-check against {{language_framework}} catches config mismatches early. -->

## Task 0: Validate References & Detect Framework

Before any code analysis, verify you have what you need.

**0a. Reference Validation:**

Check which of the above reference links are provided. If any `{{variable}}` is still unresolved:
- **STOP** and list the missing references.
- Ask the user to provide the actual URLs or documentation before proceeding.
- Do NOT guess SDK method names, class names, or payload structures without reference documentation.

**0b. Framework Detection:**

Scan the project to detect the language and framework. Look for:
- **Build files:** `build.gradle` (Java/Gradle), `pom.xml` (Java/Maven), `*.csproj` (C#/.NET), `composer.json` (PHP), `package.json` (Node.js), `requirements.txt`/`pyproject.toml` (Python), `Gemfile` (Ruby), `go.mod` (Go)
- **Framework markers:** Spring Boot (`@SpringBootApplication`), ASP.NET (`[ApiController]`), Laravel (`artisan`, `routes/api.php`), Symfony (`bin/console`, `config/routes.yaml`), Express (`app.listen`), Flask (`@app.route`), Django (`urlpatterns`), Gin/Echo (Go), Rails (`routes.rb`)
- **SDK usage:** QuickBooks SDK imports and version

Report:
```
Detected: [language] / [framework] / [build tool]
SDK: [QuickBooks SDK name and version, or "not found"]
```

Cross-check the detected framework against `{{language_framework}}`. If they don't match, flag the discrepancy and ask the user to confirm before proceeding.

Do NOT proceed until the framework is confirmed. All subsequent code snippets must use idioms, patterns, and libraries appropriate for the detected framework.

---

<!-- TASK 1: Full codebase analysis before making any changes. The 7-point checklist
     ensures the AI maps the entire webhook flow — endpoint, signature, parsing, field
     access, downstream processing, content-type, and data field usage. The example output
     format (ROPE "Examples") anchors the AI's response structure so it doesn't ramble.
     File:line citations make the output verifiable. -->

## Task 1: Analyze Existing Webhook Handler

Scan the codebase and identify:

1. **Webhook endpoint** — the controller/route receiving `POST` requests from Intuit (look for `{{signature_header}}` header handling).
2. **Signature verification** — where {{signature_algorithm}} validation occurs and how the verifier token is configured.
3. **Payload deserialization** — where the event object is parsed (SDK classes or manual JSON parsing). Note whether it parses legacy format, CloudEvents format, or both.
4. **Field access** — all places webhook fields are extracted. Note which field set is used:
   - Legacy: `realmId`, entity `name`, `id`, `operation`, `lastUpdated`
   - CloudEvents: `id`, `type`, `specversion`, `time`, `intuitentityid`, `intuitaccountid`, `data`
5. **Downstream processing** — CDC/sync, DB updates, queues, or business logic consuming webhook data.
6. **Content-Type handling** — whether the endpoint restricts accepted content types (critical for Task 4).
7. **Data field usage** — whether the application accesses the CloudEvents `data` field (full entity payload) or re-fetches entity data via the QBO API.

Report what you find for each item using this format:

**Expected output format (example):**

```
1. Webhook Endpoint: POST /webhooks (WebhooksController.java:55)
   - Framework: Spring Boot @RestController
   - No consumes restriction

2. Signature Verification: WebhooksService.verifyPayload() (WebhooksController.java:114)
   - Token source: environment variable via application.yml
   - Algorithm: HMAC-SHA256 (SDK-managed)

3. Payload Deserialization: Jackson ObjectMapper → List<WebhooksCloudEvents> (CloudEventsParser.java:78)
   - Format: CloudEvents only
   - Legacy parsing: not present

4. Field Access:
   - CloudEvents: getId(), getType(), getIntuitEntityId(), getIntuitAccountId()
   - Legacy: none found
   - Locations: Parser:89-93, StorageService:102-103, ViewController:245-342

5. Downstream Processing:
   - In-memory list storage (max 50)
   - Dashboard display via Thymeleaf
   - Entity data re-fetched from QBO API on demand

6. Content-Type Handling: No restriction (no consumes attribute)

7. Data Field Usage: getData() never called — re-fetches via API
```

Cite specific file names and line numbers for every finding.

---

<!-- TASK 1.5: The routing table that prevents unnecessary work. Instead of blindly
     running all tasks, the AI classifies the codebase into one of four states and only
     executes the relevant tasks. "Verify only" states confirm existing implementations
     without rebuilding them. "NO WEBHOOK HANDLER" stops the prompt entirely — this is
     a migration tool, not a greenfield generator. -->

## Task 1.5: State Detection & Routing

Based on your Task 1 findings, classify the current state and follow the appropriate path:

| State | Description | Next Tasks |
|---|---|---|
| **LEGACY ONLY** | Endpoint parses `eventNotifications` / `dataChangeEvent`. No CloudEvents handling. | → Task 2, 2.5, 3, 4, 5, 6 |
| **CLOUDEVENTS ONLY** | Endpoint parses CloudEvents arrays with `specversion` / `type`. No legacy handling. | → Task 2 (verify only), 2.5, 4 (verify only), 5, 6 |
| **DUAL FORMAT** | Endpoint detects and handles both formats. | → Task 2 (verify), 2.5, 3 (verify), 4 (verify), 5, 6 |
| **NO WEBHOOK HANDLER** | No webhook endpoint exists. | → STOP. This prompt is for migration, not greenfield implementation. Inform the user. |

For states that say "verify only," confirm the existing implementation is correct and report any issues found — do not rebuild what already works.

---

<!-- TASK 2: The core migration work. For LEGACY ONLY codebases, this replaces the
     old parser with the new SDK CloudEvents class. The before/after format (ROPE "Output")
     makes changes reviewable and auditable. The data field handling (a/b/c options) is
     important because CloudEvents now pushes full entity payloads — the developer decides
     whether to use them directly or keep fetching via API. For already-migrated codebases,
     this task only verifies — it does NOT rebuild working code. -->

## Task 2: Update SDK & Implement CloudEvents Parsing

**If LEGACY ONLY:** Update the SDK to {{sdk_minimum_version}} or later. Refer to the SDK source at {{sdk_source}} for the CloudEvents parsing class ({{sdk_cloudevents_class}} in {{sdk_data_package}}) and method signatures.

Using the SDK source and the field mappings documented in the [webhooks payload change announcement]({{webhooks_payload_change_blog}}):

1. Replace the legacy parser with the new CloudEvents parser.
2. Map all legacy field access (from Task 1) to the corresponding CloudEvents getters.
3. Update downstream processing to use the new field values. Update any DB schema or storage keys that use legacy field names.
4. **Handle the `data` field** — CloudEvents includes the full entity payload in `data`. Determine whether downstream processing should:
   - **a) Use pushed data directly** — eliminates the need for API callbacks to fetch entity data. Best for real-time processing.
   - **b) Ignore data, continue fetching via API** — minimal migration, preserves existing flow. Suitable if downstream already relies on API responses.
   - **c) Hybrid** — use `data` as an immediate cache/preview, verify via API later for critical operations.
   
   Report which approach fits the existing downstream processing and suggest accordingly.

**If CLOUDEVENTS ONLY or DUAL FORMAT:** Verify the existing SDK version supports {{sdk_cloudevents_class}}. Verify field mappings are correct. Report any issues (unused imports, dead code, incorrect getter usage). Do NOT rebuild working code.

Signature verification is unchanged — no modifications needed. Refer to the [CloudEvents specification]({{cloudevents_spec}}) for the standard CloudEvents envelope fields and to the SDK source at {{sdk_source}} for Intuit's extension fields.

**Expected output format — for each change, provide before/after (example):**

```
Change 1: Replace legacy parser with CloudEvents parser
File: WebhookStorageService.java

BEFORE (line 68):
  WebhooksEvent event = webhooksService.getWebhooksEvent(payload);

AFTER:
  List<WebhooksCloudEvents> events = objectMapper.readValue(
      payload, new TypeReference<List<WebhooksCloudEvents>>() {});

Why: Legacy WebhooksEvent does not support CloudEvents fields.
      WebhooksCloudEvents (SDK 6.5.2+) maps directly to the new payload.

Change 2: Update field access — realmId → intuitaccountid
File: WebhookStorageService.java

BEFORE (line 85):
  String accountId = notification.getRealmId();

AFTER:
  String accountId = cloudEvent.getIntuitAccountId();

Why: CloudEvents uses intuitaccountid instead of realmId.
```

Include file name, line number, before/after code, and a one-line "Why" for every change.

---

<!-- TASK 2.5: Deduplication using the CloudEvents id field. The gateway retries failed
     batches, so the same event can arrive multiple times. Without idempotency, retries
     cause duplicate processing (double DB writes, double queue entries, etc.). The three
     storage options (in-memory, DB, distributed cache) let the AI match the recommendation
     to the application's architecture. Placement after signature verification and before
     downstream processing is critical — don't waste resources deduplicating unsigned requests. -->

## Task 2.5: Idempotency

CloudEvents include a unique `id` field per event. When our gateway retries a failed batch, the same event `id` will be sent again. Your handler must deduplicate to prevent processing the same event twice.

Implement idempotency using {{language_framework}} patterns:
1. On receipt, check if the CloudEvents `id` has been seen before.
2. If seen, acknowledge with 200 but skip processing.
3. If new, process and record the `id`.

Storage options (choose appropriate for the application):
- **In-memory set** — simplest, suitable for demos. Lost on restart.
- **Database table** — `processed_event_ids` with TTL/expiry. Production-grade.
- **Distributed cache** — Redis/Memcached with TTL. For multi-instance deployments.

Present the implementation as a code snippet. The deduplication check should happen AFTER signature verification and BEFORE downstream processing.

---

<!-- TASK 3: Handles the migration window where Intuit may send either format. The
     detection logic (JSON array with specversion = CloudEvents, JSON object with
     eventNotifications = legacy) is the key differentiator. The normalization table
     maps both formats into a common internal representation so downstream code doesn't
     need to know which format arrived. The 8 required fields ensure nothing is lost
     in translation. -->

## Task 3: Dual-Format Support During Migration

**If already DUAL FORMAT:** Verify the detection logic and normalization. Report issues. Skip to Task 4.

**If LEGACY ONLY or CLOUDEVENTS ONLY:** During the migration window, Intuit may send **either** format. Implement a single endpoint handler that:

1. Verifies the signature first (same {{signature_algorithm}} algorithm for both formats).
2. Detects the payload format from its structure:
   - CloudEvents: JSON array, first element has `specversion` and `type`
   - Legacy: JSON object with `eventNotifications` key
3. Routes to the appropriate parser.
4. Normalizes both paths into a common internal representation for downstream processing.

**The normalized event MUST contain at minimum:**

| Field | CloudEvents Source | Legacy Source |
|---|---|---|
| `eventId` | `id` | Generate UUID |
| `accountId` | `intuitaccountid` | `realmId` |
| `entityId` | `intuitentityid` | `entities[].id` |
| `entityName` | Extract from `type` (e.g., `qbo.customer.created.v1` → `customer`) | `entities[].name` |
| `operation` | Extract from `type` (e.g., `qbo.customer.created.v1` → `created`) | `entities[].operation` |
| `timestamp` | `time` (ISO 8601) | `entities[].lastUpdated` |
| `sourceFormat` | `"cloudevents"` | `"legacy"` |
| `rawEvent` | Original SDK object | `null` or raw JSON |

Refer to the [webhooks payload change announcement]({{webhooks_payload_change_blog}}) for payload structure examples and the SDK source at {{sdk_source}} for both parser methods.

---

<!-- TASK 4: The silent killer. CloudEvents arrive with Content-Type:
     application/cloudevents+json, which many frameworks reject with 415 BEFORE the
     handler code runs. This means no application logs — only access logs show the 415.
     Developers can spend hours debugging why events "aren't arriving" when they're
     actually being rejected at the framework level. The {{content_type_fix}} variable
     provides the exact framework-specific fix from prompt-config.json. -->

## Task 4: Handle Content-Type Rejection (415 Unsupported Media Type)

**Critical gotcha:** CloudEvents payloads may arrive with `Content-Type: application/cloudevents+json` instead of `application/json`. If your endpoint restricts content types, the server rejects the request with **415 before your handler code runs** — you'll see 415 in access logs but nothing in application logs.

Ensure your webhook endpoint accepts **both** `application/json` and `application/cloudevents+json`.

**Framework-specific fix:** {{content_type_fix}}

If the endpoint already has no Content-Type restriction, confirm this and report Task 4 as already handled.

---

<!-- TASK 5: 11 test cases covering the full attack surface. Tests 1-4 verify happy
     paths (CloudEvents, content-type, legacy, idempotency). Tests 5-8 verify error
     handling (missing sig, invalid sig, empty body, malformed JSON). Tests 9-10 cover
     edge cases (unknown event type, wrong verifier token). Test 11 is the end-to-end
     sandbox validation. The "copy-pastable" requirement with shell variables and openssl
     commands ensures developers can actually run these tests, not just read them. -->

## Task 5: Testing & Verification

**Output format:** All curl commands must be **copy-pastable** — use shell variables for the payload and signature so the user can run them directly. Include the `export` and `openssl` commands to set up the HMAC signature.

Generate a test for **each** of the following. Every test must state the **input**, **expected HTTP status code**, and **expected log output or behavior**.

### Test 1: CloudEvents payload with valid signature
Send a sample CloudEvents JSON array with a valid {{signature_algorithm}} signature in the `{{signature_header}}` header. Include the shell command to compute the signature from the verifier token.
→ **Expected:** 200, event parsed and processed, structured log entry showing event type, entity ID, account ID.

### Test 2: CloudEvents payload with Content-Type application/cloudevents+json
Same payload as Test 1 but with `Content-Type: application/cloudevents+json` instead of `application/json`.
→ **Expected:** 200. If 415, Task 4 was not applied correctly.

### Test 3: Legacy payload through dual-format handler
Send a sample legacy payload (`eventNotifications` format) with valid signature. If dual-format was not implemented, document expected behavior.
→ **Expected:** 200, event parsed via legacy path, log shows `sourceFormat: "legacy"`.

### Test 4: Idempotency — duplicate CloudEvents id
Send the same CloudEvents payload (identical `id` field) twice in sequence.
→ **Expected:** First request: 200, event processed. Second request: 200, event deduplicated (skipped), log shows deduplication.

### Test 5: Missing signature header
Send a valid CloudEvents payload with NO `{{signature_header}}` header.
→ **Expected:** 403, handler rejects before any parsing occurs.

### Test 6: Invalid signature
Send a valid CloudEvents payload with an incorrect {{signature_algorithm}} signature.
→ **Expected:** 403, signature validation fails, log shows validation failure (no PII logged).

### Test 7: Empty request body
Send a POST with valid signature header but empty body.
→ **Expected:** 200 (no crash). Handler should log the error gracefully, not throw an unhandled exception. Returning 200 prevents gateway retries.

### Test 8: Malformed JSON body
Send a POST with valid signature header but invalid JSON (e.g., `{broken`).
→ **Expected:** 200 (no crash). Handler should log parse error and return 200 to prevent retry storm.

### Test 9: CloudEvents with unknown event type
Send a CloudEvents payload with `type: "qbo.unknown.entity.v1"` that the handler doesn't explicitly handle.
→ **Expected:** 200. Handler should process gracefully (log and acknowledge, or skip with log). Must not crash on unexpected event types.

### Test 10: Signature verification with wrong verifier token
Configure a different verifier token than the one used to compute the signature.
→ **Expected:** 403, HMAC mismatch detected.

### Test 11: Sandbox end-to-end
Using the [Intuit Developer Portal]({{developer_portal_url}}):
1. Enable CloudEvents format for the sandbox app
2. Create an entity (e.g., Customer, Invoice) to trigger a webhook
3. Verify the full flow: signature validation → format detection → parsing → downstream processing
→ **Expected:** 200, real CloudEvents payload processed end-to-end, all fields correctly extracted.

### Expected status code reference
- **200** = webhook received and processed (or received and deduplicated)
- **403** = signature missing or HMAC validation failed
- **415** = Content-Type not accepted (indicates Task 4 issue)

---

<!-- TASK 6: The 5-step rollout sequence. The key insight is that the revert mechanism
     is a Developer Portal toggle (CloudEvents OFF), not a code rollback. Because dual-format
     support (Task 3) is already deployed, turning off CloudEvents just means the handler
     falls back to processing legacy events. The cleanup step (remove legacy code) only
     happens after 1-2 weeks of stability. -->

## Task 6: Rollout to Production

1. **Deploy** with dual-format support (Task 3) and idempotency (Task 2.5).
2. **Enable** CloudEvents in the [Intuit Developer Portal]({{developer_portal_url}}) for production.
3. **Monitor** — check for:
   - 200s with correct event parsing in logs
   - No 415 errors in access logs
   - No signature validation failures (verifier token mismatch)
   - Idempotency deduplication working on retries
4. **Revert** — toggle CloudEvents OFF in Developer Portal if issues arise. No code rollback needed. Dual-format handler continues processing legacy events.
5. **Cleanup** — after 1-2 weeks of stability, remove legacy parsing code, format detection, and unused dependencies.

---

<!-- TECHNICAL BEST PRACTICES: Cross-cutting concerns that apply to every task.
     "Always return 200" is the most important — a non-200 response triggers gateway
     retries that compound into retry storms. "Never return 400" is explicitly called
     out because it causes MultiPartFailed status and retries the entire batch.
     "Signature-first" prevents wasting compute on unsigned payloads. -->

## Technical Best Practices

- **Signature-first:** Verify {{signature_algorithm}} before any parsing. Return 403 on failure.
- **Verifier token config:** Configure at startup, never hardcode. Use {{language_framework}}'s secret management (environment variables, vault, etc.).
- **Always return 200:** For any successfully received webhook — even if downstream processing fails. Queue the event and process asynchronously. A non-200 response triggers gateway retries that compound the problem.
- **Never return 400 for webhook events:** If your handler encounters a parsing error or processing failure for specific events, log the error and return 200. Returning 400 causes the gateway to mark the delivery as `MultiPartFailed` and retry the entire batch, creating a retry storm that can block delivery of all event types.
- **Idempotency:** Use the CloudEvents `id` field to deduplicate retried events. The gateway may resend events that previously received a non-200 response.
- **Observability:** Structured logging of: validation result, detected format, event type, entity ID, and account ID. **NEVER** log verifier tokens, access tokens, OAuth secrets, or PII.
- **Typing:** (If applicable) Provide {{typing_system}} interfaces/models for the CloudEvents payload.

---

<!-- AI GUARDRAILS: The 7 anti-hallucination constraints. These are placed at the END
     of the prompt intentionally — research shows LLMs pay strong attention to both the
     beginning and end of prompts (primacy/recency effect). Constraint #1 (no hallucinations)
     and #7 (if blocked, STOP) are the most critical. Constraint #5 (framework consistency)
     prevents the AI from generating Java code when the project is Node.js. Constraint #6
     (no assumptions) reinforces the Task 1 → Task 1.5 routing flow. -->

## 🛑 AI Guardrails (Anti-Hallucination Constraints)

CRITICAL INSTRUCTIONS — YOU MUST ADHERE TO THE FOLLOWING:

1. **No Hallucinations:** Do not invent SDK method names, class names, or getter signatures. Derive all SDK usage strictly from the SDK source repository at {{sdk_source}}.
2. **Strict SDK Usage:** Use ONLY methods and classes that exist in the SDK's public release at {{sdk_minimum_version}} or later. Do not construct fake SDK models.
3. **Provided Links Only:** Derive all API behavior, payload structure, and field mappings from the provided references. Do not invent CloudEvents fields beyond the standard spec and Intuit's documented extensions.
4. **Signature Strictness:** The algorithm is {{signature_algorithm}} using the raw request body and verifier token. Do not alter it.
5. **Framework Consistency:** All code snippets must use the language and framework detected in Task 0. Do not mix frameworks or provide generic pseudocode.
6. **No Assumptions:** Do not assume the codebase is in any particular state. Task 1 detects, Task 1.5 routes. Follow the routing table.
7. **If Blocked/Missing Info:** If the provided documentation lacks required details, or reference links are unresolved, STOP and clearly state what is missing instead of guessing.

I have provided you with all the necessary context and instructions. Please analyze my project and generate the migration code as per the tasks above.
