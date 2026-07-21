# Workflows

Dynamic multi-agent workflows for maintaining the QBO Developer Prompt Library.
These are run with Claude Code's **Workflow** tool (see
[Dynamic Workflows in Claude Code](https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code)).

A workflow is a JavaScript file that spawns and coordinates subagents. Unlike a
skill (which packages instructions for a single agent), a workflow encodes the
orchestration — what fans out in parallel, what verifies what, what synthesizes.

## How to run

```
# by file path (works from this repo)
Workflow({ scriptPath: ".claude/workflows/verify-discover-prompts.js" })

# verify a single package
Workflow({ scriptPath: ".claude/workflows/verify-discover-prompts.js", args: ["project-budgets"] })
```

Watch live progress with `/workflows`.

## Workflows

### `verify-discover-prompts.js`

**Read-only static verification of the `discover/` prompt packages.** Fans out one
verifier agent per prompt package (`change-orders`, `custom-fields`, `dimensions`,
`project-budgets`, `projects`, `sales-tax`), each checking its slice for the defect
classes this library has actually been burned by:

- **contradiction** — e.g. a guardrail saying "do NOT emit `deleted: true`" while a
  "Delete a line" step depends on it; enum lists that disagree; a "defaults to DRAFT"
  vs "defaults to LOCKED" mismatch.
- **unresolved-placeholder** — a `{{key}}` in the generated prompt whose name is a
  config key (merge failure). Legit runtime placeholders like `{{companyid}}` are ignored.
- **template-drift** — the generated `*-ready-prompt.md` doesn't reflect the template.
- **missing-host** — a path is given with no base host, or REST + GraphQL hosts mixed
  without saying which call uses which.
- **missing-error-handling** — an error code named in one section but absent from the
  Error Handling guidance (or vice-versa).
- **stale-fact** — a claim that contradicts a `GROUND-TRUTH.md` in the same package.

Each finding is then handed to an independent **skeptic** agent that tries to refute it
(default: refuted) so only real issues survive. A final agent synthesizes a ranked
Markdown report.

**It performs NO live QBO API calls.** Claims that can only be settled against the live
API are flagged `needs_live_test` and listed separately — run those by hand with a fresh
token (that is what surfaced the `deleted: true`, `LOCKED`-default, and server-assigned
`sequenceId` corrections in the project-budgets prompt).

**Args:** optional array of package names to verify a subset; omit to verify all.

**Returns:** `{ packagesVerified, totalConfirmed, report }`.
