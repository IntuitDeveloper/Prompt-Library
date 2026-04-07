# Webhooks CloudEvents Migration — Prompt Instructions

<!-- OVERVIEW: Sets the stage for anyone reading this file. Explains what the prompt does
     and the four codebase states it handles. This is the first thing someone reads to
     understand whether this prompt applies to their situation. -->

## What This Prompt Does

This prompt guides an AI coding assistant through migrating a QuickBooks Online webhook handler from the **legacy payload format** to the **CloudEvents payload format**. It handles all four possible starting states:

| Your Code State | What the Prompt Does |
|---|---|
| **Legacy only** | Full migration: SDK update, parsing, dual-format, Content-Type, testing, rollout |
| **CloudEvents only** | Verification: confirms your implementation is correct, flags issues |
| **Dual format** | Verification: checks detection logic, normalization, Content-Type |
| **No handler** | Stops — this prompt is for migration, not greenfield |

The prompt **detects** your state automatically — you don't need to know which one you're in.

---

<!-- DIRECTORY STRUCTURE: Shows what each file in the project does so you know which
     file to edit for what purpose. The key rule: edit prompt-config.json for values,
     edit prompt-template.md for task logic, never edit ready-prompt.md (it's generated). -->

## Directory Structure

```
webhooks-cloudevents/
├── prompt-template.md          # The prompt with {{variables}} — DO NOT edit for per-run changes
├── prompt-config.json          # Universal config — shared values + language maps
├── merge-prompt.js             # Build script — picks language, resolves {{vars}}, generates ready-prompt.md
├── instructions.md             # This file
├── ready-prompt.md             # Generated output (gitignored) — paste this into the AI
└── test-results/               # Agent test results — one file per prompt+config combo
    └── cloudevents-java-results.md
```

---

<!-- WORKFLOW: The 5-step process for using the prompt. This is the "how to run it"
     section. Steps 1-2 are build/copy, steps 3-4 are paste/execute, step 5 is verify.
     Someone new to this project starts here. -->

## Step-by-Step Workflow

### 1. Generate the prompt

```bash
cd webhooks-cloudevents

# Uses the "language" key in prompt-config.json (default: java)
node merge-prompt.js

# Override language via command line
node merge-prompt.js dotnet
node merge-prompt.js php
node merge-prompt.js nodejs
node merge-prompt.js python
```

You should see:
```
✅ Generated: ready-prompt.md
   Desktop:   ~/Desktop/ready-prompt-webhooks-cloudevents.md
   Language:  java
   Resolved:  14 variables (34 replacements)
   Unresolved: 0 — all config variables resolved.
```

The prompt is also copied to your Desktop as `ready-prompt-webhooks-cloudevents.md` for easy access.

If you see unresolved variables, add them to your config file before proceeding.

### 2. Copy the output

```bash
# macOS
cat ready-prompt.md | pbcopy

# Linux
cat ready-prompt.md | xclip -selection clipboard

# Or just open the file and copy manually
```

### 3. Paste into your AI assistant

Open your AI coding assistant with your webhook project loaded:
- **Windsurf Cascade** — paste into the chat panel
- **Cursor** — paste into Composer or Chat
- **GitHub Copilot Chat** — paste into the chat panel
- **ChatGPT / Claude** — paste into the conversation (attach your code files)

### 4. Follow the tasks

The AI will execute Tasks 0 through 6 sequentially. After each task, it will wait for your confirmation before proceeding. Review the output, apply any suggested changes, then say "proceed" or "next task."

### 5. Verify with the checklist

Use the testing checklist below to verify each task produced correct output.

---

<!-- CONFIG KEY REFERENCE: Documents every variable in prompt-config.json so you know
     what each key controls and what value it injects into the prompt. Split into two
     categories: shared values (same across all languages) and language maps (different
     per language — the merge script picks the right one based on the language key).
     This is the reference you check when adding/updating config values. -->

## Config Key Reference

All variables live in a single `prompt-config.json`. Values are either **strings** (shared across all languages) or **objects** (language maps — the merge script picks the right value based on the `language` key).

### Shared values (strings — same for all languages)

| Key | Description | Example |
|---|---|---|
| `webhooks_payload_change_blog` | Intuit blog post about CloudEvents migration | `https://blogs.intuit.com/2025/11/12/...` |
| `enhanced_webhooks_monitoring` | Medium article about enhanced webhooks | `https://medium.com/intuitdev/...` |
| `cloudevents_spec` | CloudEvents specification | `https://cloudevents.io/` |
| `developer_portal_url` | Intuit Developer Portal | `https://developer.intuit.com` |
| `webhooks_documentation` | Webhooks docs page | `https://developer.intuit.com/.../webhooks` |
| `signature_header` | HTTP header name for HMAC signature | `intuit-signature` |
| `signature_algorithm` | Signature algorithm | `HMAC-SHA256` |
| `verifier_token_config_key` | Config key for verifier token | `quickbooks.webhooks-verifier-token` |

### Language maps (objects — merge script picks by `language` key)

Languages with **official V3 SDKs** (full SDK with CloudEvents parsing classes):

| Key | Java | .NET (`dotnet`) | PHP |
|---|---|---|---|
| `language_framework` | `Java 21 / Spring Boot` | `C# / .NET 8 / ASP.NET Core` | `PHP` |
| `build_tool` | `Gradle` | `dotnet CLI / NuGet` | `Composer` |
| `sdk_source` | `.../QuickBooks-V3-Java-SDK` | `.../QuickBooks-V3-DotNET-SDK` | `.../QuickBooks-V3-PHP-SDK` |
| `sdk_minimum_version` | `6.5.2` | `6.0.0` | `6.0.0` |
| `sdk_cloudevents_class` | `WebhooksCloudEvents (com.intuit.ipp.data.*)` | `WebhooksCloudEvents (Intuit.Ipp.Data.*)` | `WebhooksCloudEvents (QuickBooksOnline\API\Webhooks\*)` |
| `sdk_data_package` | `com.intuit.ipp.data` | `Intuit.Ipp.Data` | `QuickBooksOnline\API\Data` |
| `sdk_service_package` | `com.intuit.ipp.services` | `Intuit.Ipp.DataService` | `QuickBooksOnline\API\DataService` |
| `typing_system` | `Java classes/records` | `C# records/classes` | `PHP classes` |
| `content_type_fix` | `Remove consumes from @PostMapping...` | `Update [Consumes] attribute...` | `Check $_SERVER['CONTENT_TYPE']...` |

Languages with **OAuth clients only** (no V3 SDK — parse CloudEvents JSON directly):

| Key | Node.js (`nodejs`) | Python |
|---|---|---|
| `language_framework` | `Node.js / Express` | `Python / Flask` |
| `build_tool` | `npm` | `pip` |
| `sdk_source` | `.../oauth-jsclient` | `.../oauth-pythonclient` |
| `sdk_minimum_version` | `N/A — parse CloudEvents JSON directly` | `N/A — parse CloudEvents JSON directly` |
| `sdk_cloudevents_class` | `N/A — parse raw JSON` | `N/A — parse raw JSON` |
| `sdk_data_package` | `N/A — define your own interfaces` | `N/A — define your own dataclasses` |
| `sdk_service_package` | `N/A — use fetch/axios` | `N/A — use requests` |
| `typing_system` | `TypeScript interfaces` | `Python dataclasses/TypedDict` |
| `content_type_fix` | `Remove express.json() strict checking...` | `Update Flask route to accept both...` |

---

<!-- TESTING CHECKLIST: The 40-point scorecard used to evaluate AI output quality.
     After the AI finishes all tasks, go through this checklist to verify each task
     produced correct output. Each item maps directly to a requirement in the prompt
     template. This is also what the test-results matrix files are based on. -->

## Testing Checklist

After running the prompt against a codebase, verify each task:

### Task 0 — References & Framework
- [ ] All reference URLs resolved (no `{{variables}}` in output)
- [ ] Framework correctly detected from build files (not assumed)
- [ ] SDK version identified and cross-checked against config
- [ ] Framework detection matches `language_framework` in config

### Task 1 — Analysis
- [ ] All 7 analysis items reported with **file:line citations**
- [ ] Signature verification method identified with token source
- [ ] Content-Type handling checked (consumes attribute or equivalent)
- [ ] Data field usage assessed (getData() called or not)
- [ ] Output follows the example format from the prompt

### Task 1.5 — State Detection
- [ ] Correct state classified (LEGACY ONLY / CLOUDEVENTS ONLY / DUAL FORMAT / NO HANDLER)
- [ ] Routing table followed — irrelevant tasks skipped
- [ ] No tasks were run that the routing table excluded

### Task 2 — SDK & Parsing
- [ ] SDK version verified or upgrade suggested
- [ ] **Before/after code snippets** provided for each change (with file:line and "Why")
- [ ] getData() handling recommendation given (a: use directly / b: ignore / c: hybrid)
- [ ] If verify-only: issues reported without rebuilding working code

### Task 2.5 — Idempotency
- [ ] Deduplication implementation provided using CloudEvents `id` field
- [ ] Placement: after signature verification, before downstream processing
- [ ] Storage approach matches the application (in-memory for demo, DB/Redis for production)

### Task 3 — Dual-Format (if applicable)
- [ ] Format detection logic: JSON array with `specversion` = CloudEvents, JSON object with `eventNotifications` = legacy
- [ ] Normalization model contains all 8 required fields from the mapping table
- [ ] Both parsers route correctly through a single endpoint

### Task 4 — Content-Type (415)
- [ ] Endpoint checked for content type restriction
- [ ] Fix provided if needed, or explicitly confirmed as already handled
- [ ] Fix uses the framework-specific pattern from the config

### Task 5 — Testing (11 test cases)
- [ ] All curl commands are **copy-pastable** with shell variables
- [ ] HMAC signature generation via `openssl dgst` command included
- [ ] Each test states **input**, **expected HTTP status code**, and **expected log output**
- [ ] Test 1: CloudEvents payload with valid signature → 200
- [ ] Test 2: CloudEvents with Content-Type `application/cloudevents+json` → 200
- [ ] Test 3: Legacy payload through dual-format handler → 200
- [ ] Test 4: Duplicate CloudEvents `id` (idempotency) → 200+process, then 200+skip
- [ ] Test 5: Missing `intuit-signature` header → 403
- [ ] Test 6: Invalid HMAC signature → 403
- [ ] Test 7: Empty request body → 200 (no crash)
- [ ] Test 8: Malformed JSON body → 200 (no crash)
- [ ] Test 9: Unknown event type → 200 (graceful handling)
- [ ] Test 10: Wrong verifier token → 403
- [ ] Test 11: Sandbox end-to-end → enable CloudEvents, create entity, verify full flow

### Task 6 — Rollout
- [ ] 5-step plan: Deploy → Enable → Monitor → Revert → Cleanup
- [ ] Revert mechanism is one-click (Developer Portal toggle, no code rollback)

---

<!-- ADDING A NEW LANGUAGE: Step-by-step guide for extending the prompt to support
     a new programming language. You add values to the 9 language map keys in the
     config, regenerate, and verify. The prompt template itself never needs to change
     — that's the benefit of the config+template separation. -->

## Adding a New Language

1. Open `prompt-config.json` and add a new key to every **language map** object:
   ```json
   "language_framework": {
     "java": "Java 21 / Spring Boot",
     "dotnet": "C# / .NET 8 / ASP.NET Core",
     "php": "PHP",
     "nodejs": "Node.js / Express",
     "python": "Python / Flask",
     "go": "Go 1.22 / net/http"     ← add this
   }
   ```

2. Repeat for all language map keys: `build_tool`, `sdk_source`, `sdk_minimum_version`, `sdk_cloudevents_class`, `sdk_data_package`, `sdk_service_package`, `typing_system`, `content_type_fix`.

3. Generate and verify:
   ```bash
   node merge-prompt.js go
   ```
   Confirm output shows `Unresolved: 0`.

4. Test the generated `ready-prompt.md` against a real codebase in that language.

---

<!-- TROUBLESHOOTING: Common errors and their fixes. These are the issues people
     actually hit — wrong directory, missing config keys, AI stopping unexpectedly.
     If someone reports a problem, check this table first. -->

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| `Config file not found` | Wrong filename or path | Check spelling, run from the `webhooks-cloudevents/` directory |
| `Template file not found` | `prompt-template.md` missing | Ensure you're in the correct directory |
| Unresolved variables in output | Config missing a key | Add the missing key to your config JSON |
| AI says "STOP — missing references" | `ready-prompt.md` has `{{vars}}` | Re-run `merge-prompt.js`, check for unresolved count |
| AI skips tasks you expected | State detection routed differently | Check Task 1.5 output — your code may already be migrated |
| AI generates code for wrong framework | Config `language_framework` doesn't match project | Update config to match your actual framework |

---

<!-- PROMPT DESIGN METHODOLOGY: Documents the prompt engineering techniques used
     so future editors understand WHY the prompt is structured this way. ROPE framework
     gives the AI a role and output format. State detection prevents unnecessary work.
     Guardrails prevent hallucination. Build-time resolution eliminates ambiguity. -->

## Prompt Design Methodology

This prompt was built using the following techniques:

- **ROPE Framework** — Role, Output format, Process, Examples
  - Role: Principal Software Engineer persona
  - Output: Example formats for Task 1 (analysis) and Task 2 (before/after changes)
  - Process: Sequential tasks with routing table
  - Examples: Anchored output in Task 1 and Task 2

- **State Detection & Routing** — The prompt detects what state the codebase is in before suggesting changes, avoiding unnecessary work on already-migrated code.

- **Anti-Hallucination Guardrails** — 7 explicit constraints preventing the AI from inventing SDK methods, API endpoints, or payload fields.

- **Build-Time Variable Resolution** — Config-driven templating ensures the AI receives a fully resolved prompt with no ambiguity.

---

<!-- CHANGELOG: Version history tracking what changed in each release. Useful for
     understanding how the prompt evolved and for debugging regressions. If you make
     changes to the prompt or config, add a new row here. -->

## Changelog

| Version | Date | Changes |
|---|---|---|
| v3.1 | 2026-03-13 | Initial prompt — single file, all `{{vars}}` unresolved |
| v3.2 | 2026-03-13 | Added: Task 0 (refs/framework), Task 1.5 (state routing), Task 2.5 (idempotency), ROPE output examples, hardcoded URLs, error response guidance |
| v4.0 | 2026-03-13 | 3-file architecture (template + config + merge script), all values configurable, cross-language support, enhanced instructions |
| v5.0 | 2026-03-20 | Universal config — single prompt-config.json with language maps, merge script auto-selects by language key, multi-pass variable resolution |
| v5.1 | 2026-03-25 | Added all 5 official Intuit SDKs (Java, .NET, PHP with V3 SDKs; Node.js, Python with OAuth clients). Fixed fake SDK URLs. Desktop copy output. PHP/Laravel/Symfony framework detection in template. |
