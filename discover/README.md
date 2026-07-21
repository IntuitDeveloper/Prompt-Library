# Intuit Developer Prompt Library

A dynamic prompt generation toolkit that helps developers build Intuit Enterprise Suite (IES) and QuickBooks integrations faster. Configure your target language, transaction type, and custom instructions — then generate AI-ready prompts that produce working integration code with proper API usage, error handling, and documentation.

## Prerequisites

- [Node.js](https://nodejs.org/) (v14 or later)
- A valid Intuit Developer account and application with OAuth 2.0 credentials
- Access to an IES or QuickBooks Advanced sandbox/production company

## Quick Start

```bash
# 1. Clone the repository
git clone <repo-url>
cd Prompt-Library/discover

# 2. Configure your settings as per your requirements
#    Edit prompt-config.json (see Configuration section below)

# 3. Generate prompts
node merge-prompt.js

# Or specify a language directly (overrides language_framework in config)
node merge-prompt.js --language java
node merge-prompt.js --language python
node merge-prompt.js --language dotnet

# Or use a custom config profile
node merge-prompt.js --config config-java-bill.json

# Drop-in mode — for pasting the prompt into an existing codebase (no new folder scaffolded)
node merge-prompt.js --config prompt-config-existing.json

# Combine both
node merge-prompt.js --config config-typescript-invoice.json --language typescript
```

This produces ready-to-use prompt files:

| Generated File | Use Case |
|---|---|
| `generated-prompts/dimensions-ready-prompt.md` | Dimensions API — tag transactions with custom dimensions |
| `generated-prompts/projects-ready-prompt.md` | Projects API — create projects and project estimates |
| `generated-prompts/custom-fields-ready-prompt.md` | Custom Fields API — attach custom metadata to transactions |
| `generated-prompts/sales-tax-ready-prompt.md` | Sales Tax GraphQL API — calculate jurisdiction-aware tax for transactions built outside QBO |
| `generated-prompts/project-budgets-ready-prompt.md` | Project Budgets API — CRUD PROJECT-type budgets via Business Planning GraphQL (IES / QBO Advanced) |
| `generated-prompts/project-change-orders-ready-prompt.md` | Project Change Orders API — CRUD project-scoped change orders via REST V3 (IES / QBO Advanced + Construction Pack) |
| `generated-prompts/oauth-setup-ready-prompt.md` | OAuth 2.0 setup — authorization-code flow, token exchange, refresh-token rotation, and secure storage (the prerequisite for every other prompt) |

Copy the contents of a generated prompt into your preferred AI coding assistant (e.g., Copilot, Cursor, ChatGPT, Windsurf) to generate a complete, runnable integration project.

## Project Structure

```
discover/
├── prompt-config.json              # Configuration — defaults to integration_mode "new"
├── prompt-config-existing.json     # Drop-in config — integration_mode "existing" for brownfield repos
├── prompt-config.schema.json       # JSON Schema — validates config before merge
├── merge-prompt.js                 # Prompt generator script
├── instructions.md                 # Reference — supported values & examples
├── dimensions/
│   └── prompt-template-dimensions.md       # Template — Dimensions API workflow
├── projects/
│   └── prompt-template-projects.md     # Template — Projects & Estimates workflow
├── custom-fields/
│   ├── prompt-template-custom-fields.md # Template — Custom Fields API workflow
│   ├── postman/                         # Reference Postman collection + env for manual testing
│   └── sdk-notes/                       # Per-language SDK guidance (injected at merge time)
│       ├── java.md
│       ├── dotnet.md
│       ├── php.md
│       ├── nodejs.md
│       ├── python.md
│       └── ruby.md
├── sales-tax/
│   ├── prompt-template-sales-tax.md    # Template — Sales Tax GraphQL workflow
│   ├── postman/                        # Reference Postman collection
│   └── sdk-notes/                      # Per-language SDK guidance (injected at merge time)
├── project-budgets/
│   ├── README.md                       # Project Budgets prompt overview & .env setup
│   └── prompt-template-project-budgets.md   # Template — Project Budgets (Business Planning GraphQL)
├── project-change-orders/
│   ├── README.md                       # Project Change Orders prompt overview & .env setup
│   └── prompt-template-project-change-orders.md # Template — Project Change Orders (REST V3)
├── oauth-setup/
│   └── prompt-template-oauth-setup.md  # Template — OAuth 2.0 authorization-code flow
├── generated-prompts/
│   ├── dimensions-ready-prompt.md          # Generated — Dimensions API prompt
│   ├── projects-ready-prompt.md            # Generated — Projects API prompt
│   ├── custom-fields-ready-prompt.md       # Generated — Custom Fields API prompt
│   ├── sales-tax-ready-prompt.md           # Generated — Sales Tax API prompt
│   ├── project-budgets-ready-prompt.md     # Generated — Project Budgets API prompt
│   ├── project-change-orders-ready-prompt.md # Generated — Project Change Orders API prompt
│   └── oauth-setup-ready-prompt.md        # Generated — OAuth 2.0 setup prompt
└── README.md                       # This file
```

## Configuration

All settings live in `prompt-config.json`. The **first few keys** are the ones you configure; the rest are static API endpoints, queries, and documentation links that should not be changed.

### Configurable Fields

| # | Key | Description | Example |
|---|-----|-------------|---------|
| 1 | `integration_mode` | `"new"` (scaffold full project) or `"existing"` (importable modules only) | `"new"` |
| 2 | `language_framework` | Target language/framework for generated code | `"Python3"`, `"TypeScript"`, `"Java"` |
| 3 | `type_of_transaction` | QuickBooks transaction type | `"Estimate"`, `"Invoice"`, `"Bill"` |
| 4 | `typing_system` | Type system style for the chosen language | `"hints (dataclasses)"`, `"Pydantic models"` |
| 5 | `transaction_creation_instructions` | Instructions for creating a Dimensions-tagged transaction | See [examples](#transaction-instructions) |
| 6 | `markup_percentages` | Markup % used for Project Estimate cost calculations | `"20"` |
| 7 | `project_estimate_creation_instructions` | Instructions for creating a Project Estimate | See [examples](#transaction-instructions) |

### Static Fields (do not modify)

These include GraphQL/REST endpoints, API documentation URLs, query templates, and payload structures. They are maintained to stay in sync with the latest Intuit API surface.

## Example Languages & Type Systems

| Language | Typing System | Notes |
|----------|--------------|-------|
| Python | `hints (dataclasses)` | Native Python 3.9+ typing |
| Python | `Pydantic models` | Runtime validation + serialization |
| TypeScript | `TypeScript interfaces` | Static typing for Node.js |
| TypeScript | `Zod schemas` | Runtime validation + type inference |
| Java | `Java classes/records` | Enterprise standard |
| Kotlin | `Kotlin data classes` | Concise, null-safe, JVM |
| C# / .NET | `C# classes/records` | Enterprise, strong typing |
| Go | `Go structs with tags` | Lightweight, microservices |
| Rust | `Rust structs with serde` | Memory-safe, high performance |
| Ruby | `Sorbet type annotations` | Optional typing for Ruby |
| PHP | `PHP 8 typed properties` | Modern PHP with strict types |
| Swift | `Swift structs/Codable` | iOS/macOS native |

## Supported Transaction Types (with Dimension Values)

`Bill` · `CreditMemo` · `Deposit` · `Estimate` · `Expense/Purchase` · `Invoice` · `JournalEntry` · `PurchaseOrder` · `RefundReceipt` · `SalesReceipt` · `VendorCredit`

## Transaction Instructions

The `transaction_creation_instructions` and `project_estimate_creation_instructions` fields accept free-form text describing how the transaction should be created. You can specify default entity IDs, amounts, SDK preferences, or custom instructions.

**Example — simple Estimate:**
```json
"transaction_creation_instructions": "Create Estimate with default item id: 1 and default customer: 1 and Estimate amount: 111."
```

**Example — Bill with Java SDK:**
```json
"transaction_creation_instructions": "Create Bill with default item id: 2 and default vendor: 28 and Bill amount: 100 and APAccountRef=20. For REST API calls, use the Intuit official Java SDK at {{java-sdk-official}} with Gradle dependency. Use all the latest versions and best practices for SDK integration. Refer to the official documentation at: {{java-sdk-documentation}} and {{oauth2-documentation}}. Use appropriatemethods from SDKs only, do not hallucinate or make up methods that don't exist in the SDK. "
```

**Example — Project Estimate with markup:**
```json
"project_estimate_creation_instructions": "Create an Estimate with default item id: 1, UnitPrice: 1, Qty: 100, and ItemAccountRef=5. Amount=UnitPrice*Qty. CostAmount should be {{markup_percentages}} of Amount."
```
`markup_percentages` can have positive or negative values, indicating project profit or loss respectively.

Refer to `instructions.md` for more detailed examples, including Purchase Order pre-checks and SDK-specific instructions.

## How It Works

```
┌─────────────────────┐     ┌──────────────────────┐
│  prompt-config.json │────▶│   merge-prompt.js    │
│  (your settings)    │     │  (template engine)   │
└─────────────────────┘     └──────┬───────┬───────┘
                                   │       │
              ┌────────────────────┘       └────────────────────┐
              ▼                                                 ▼
┌─────────────────────────────────────┐       ┌─────────────────────────────────┐
│ dimensions/prompt-template-         │       │ projects/prompt-template-       │
│ dimensions.md (Dimensions template) │       │ projects.md (Projects template) │
└────────────┬────────────────────────┘       └────────────┬────────────────────┘
             ▼                                           ▼
┌──────────────────────────────────┐       ┌──────────────────────────────────┐
│ generated-prompts/        │       │ generated-prompts/        │
│ dimensions-ready-prompt.md       │       │ projects-ready-prompt.md         │
│ (generated, AI-ready)            │       │ (generated, AI-ready)            │
└──────────────────────────────────┘       └──────────────────────────────────┘
```

`merge-prompt.js` reads each template, replaces every `{{placeholder}}` with the corresponding value from `prompt-config.json`, and writes the result as a ready-to-use prompt file.

### Safeguards

- **Schema validation** — Before merging, the config is validated against `prompt-config.schema.json`. Missing required fields, wrong types, or invalid enum values cause an immediate error with a clear message.
- **Unresolved placeholder check** — After merging, the script scans the output for any remaining `{{...}}` tokens and prints a warning listing them. This catches typos and missing config keys before you use the prompt.

### Multi-Profile Configs

You can maintain multiple config files for different language/transaction combinations:

```bash
# Default (uses prompt-config.json)
node merge-prompt.js

# Custom profile
node merge-prompt.js --config config-java-bill.json
node merge-prompt.js --config config-typescript-invoice.json
```

Create a new profile by copying `prompt-config.json` and changing the configurable fields.

### Integration Mode (`integration_mode`)

Controls whether the AI output targets a **new** (greenfield) project or an **existing** (brownfield) codebase.

| Mode | `integration_mode` | What the AI produces |
|------|-------------------|----------------------|
| **New project** | `"new"` | A self-contained folder (`project-estimates-<lang>/` or `ies-dimensions-<lang>/`) with all source files, a `README.md`, dependency manifest, and architecture diagram. Ready to run standalone. |
| **Existing project** | `"existing"` | Modular functions/classes/files with integration notes — which files to add, what imports are needed, and how to wire into your existing codebase. No scaffolding or folder structure imposed. |

**Tip for existing projects:** After generating, review the integration notes in the output. The generated code uses the same API logic and pre-flight checks regardless of mode — the difference is packaging only.

**Shortcut for drop-in mode:** Use the bundled `prompt-config-existing.json` instead of editing the default config:

```bash
node merge-prompt.js --config prompt-config-existing.json
```

This is identical to `prompt-config.json` but with `integration_mode` set to `"existing"`, so the generated prompt tells the AI to produce drop-in modules rather than scaffolding a sibling folder like `custom-fields-<lang>/`. Use this whenever you plan to paste the generated prompt into an existing codebase.

## What the Generated Prompts Produce

When you feed a generated prompt to an AI assistant, the output will include:

- **Modular integration code** in your chosen language/framework
- **Pre-flight checks** — validates account type, country, and feature enablement
- **GraphQL discovery** — fetches dimensions or projects from the Intuit API
- **REST transaction creation** — creates tagged transactions with proper payload structure
- **Read & hydrate logic** — retrieves and displays transactions with human-readable names
- **Error handling** — 401 token refresh, 400 validation errors, GraphQL error parsing
- **Observability** — structured logging with `intuit_tid` tracing
- **README + architecture diagram** — included in `new` mode only

## Prompt Templates

### Dimensions (`dimensions/prompt-template-dimensions.md`)
Generates code to discover IES Dimensions (custom categorization) via GraphQL, tag transactions with `CustomExtensions`, and display the results.

### Projects & Estimates (`projects/prompt-template-projects.md`)
Generates code to verify project eligibility, discover or create projects via GraphQL, create Project Estimates via REST, and display the results with markup calculations.

### Custom Fields (`custom-fields/prompt-template-custom-fields.md`)
Generates code to discover active custom field definitions via GraphQL (using `legacyIDV2` as the REST bridge), create transactions with custom field values via REST V3, and hydrate the response with human-readable labels. SDK notes are injected per language via the `--language` flag.

### Sales Tax (`sales-tax/prompt-template-sales-tax.md`)
Generates code that calls the `indirectTaxCalculateSaleTransactionTax` GraphQL mutation to compute jurisdiction-aware sales tax for transactions built outside QuickBooks (custom invoicing UIs, checkout flows, third-party ERPs). Stateless — no transaction is persisted in QBO. SDK notes injected per language via `--language`.

### Project Budgets (`project-budgets/prompt-template-project-budgets.md`)
Generates code that verifies IES / QBO Advanced eligibility, discovers or creates a project via the Projects GraphQL API, then performs full CRUD on a `PROJECT`-type budget through the Business Planning GraphQL API. The hard `budgetType = "PROJECT"` rule is enforced in the prompt's anti-hallucination guardrails.

### Project Change Orders (`project-change-orders/prompt-template-project-change-orders.md`)
Generates code that verifies IES / QBO Advanced + Construction Pack eligibility, discovers or creates a project + parent project estimate, then performs full CRUD on a change order via the REST V3 `/changeorder` endpoint. The hard "LinkedTxn on every line" rule is enforced in the prompt's anti-hallucination guardrails.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Unresolved `{{placeholder}}` in output | The script warns automatically; ensure the key exists in your config file with exact spelling and casing |
| `node merge-prompt.js` fails | Verify Node.js is installed and you are running from the project root |
| Generated code gets 401 errors | Refresh your OAuth 2.0 access token |
| Generated code gets 403 on GraphQL | Your QuickBooks company may not support the feature (IES/Advanced required) |

## Feedback

Used this prompt? We'd love your input to shape the next iteration — what worked, what didn't, and what's missing.

👉 **[Share feedback on the Intuit Developer Prompt Library](https://docs.google.com/forms/d/e/1FAIpQLScPhA0gk09aOmB-S1uBfZOEwshjGTwXoSRRCj2yD2bTseSQmg/viewform)**

The survey takes ~1 minute and covers: which prompt you used, how useful it was (1–5), whether it simplified development, and what would make it better.

## License

Intuit Developer Relations.

## License

MIT — see [LICENSE](../LICENSE) at the repo root.
