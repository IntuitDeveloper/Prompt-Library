export const meta = {
  name: 'verify-discover-prompts',
  description: 'Statically verify every discover/ prompt package for internal consistency, placeholder integrity, and ground-truth alignment, then adversarially confirm each finding and produce a ranked report.',
  whenToUse: 'Run before shipping or merging changes to the discover prompt library, or when a tester reports a prompt is wrong. Read-only: performs NO live QBO API calls — it flags claims that still need a live write-test rather than making one.',
  phases: [
    { title: 'Discover' },
    { title: 'Verify per prompt' },
    { title: 'Adversarial check' },
    { title: 'Synthesize' },
  ],
}

// ---------------------------------------------------------------------------
// verify-discover-prompts
//
// A read-only, static verification harness for the QBO Developer Prompt Library
// (the discover/ folder). It fans out one agent per prompt package to check the
// things this repo has actually been burned by — internal contradictions
// (e.g. a "do NOT use deleted:true" guardrail vs. a Delete-a-line step that
// needs it), unresolved {{placeholders}}, template<->generated drift, and
// endpoint/host coverage — then has independent skeptics try to refute each
// finding so only real issues survive. It performs NO live API calls; claims
// that can only be settled against the live API are flagged as NEEDS-LIVE-TEST.
// ---------------------------------------------------------------------------

const REPO = '/Users/noneal/Documents/Prompt-Library'
const DISCOVER = `${REPO}/discover`

// The prompt packages to verify. `args` may override with a subset of names.
const ALL_PACKAGES = [
  'change-orders',
  'custom-fields',
  'dimensions',
  'project-budgets',
  'projects',
  'sales-tax',
]

// Normalize args: the Workflow tool may deliver the value as a real array, a
// JSON-encoded string (e.g. '["projects","custom-fields"]'), or a single name.
function normalizeArgs(a) {
  if (Array.isArray(a)) return a
  if (typeof a === 'string') {
    const s = a.trim()
    if (!s) return []
    try {
      const parsed = JSON.parse(s)
      return Array.isArray(parsed) ? parsed : [parsed]
    } catch {
      // comma-separated or single bare name
      return s.split(',').map((x) => x.trim()).filter(Boolean)
    }
  }
  return []
}
const requested = normalizeArgs(args)
// Only honor names that are real packages; ignore unknowns rather than spawn a doomed agent.
const packages = requested.length
  ? requested.filter((p) => ALL_PACKAGES.includes(p))
  : ALL_PACKAGES
if (requested.length && packages.length !== requested.length) {
  const unknown = requested.filter((p) => !ALL_PACKAGES.includes(p))
  log(`Ignoring unknown package name(s): ${unknown.join(', ')}`)
}

const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['package', 'findings'],
  properties: {
    package: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['category', 'severity', 'file', 'summary', 'evidence', 'needs_live_test'],
        properties: {
          category: {
            type: 'string',
            description: 'one of: contradiction, unresolved-placeholder, template-drift, missing-host, missing-error-handling, stale-fact, other',
          },
          severity: { type: 'string', description: 'high | medium | low' },
          file: { type: 'string', description: 'repo-relative path the finding is in' },
          line: { type: 'integer', description: '1-indexed line, or 0 if not line-specific' },
          summary: { type: 'string', description: 'one-sentence statement of the defect' },
          evidence: { type: 'string', description: 'the conflicting quotes/values that prove it, verbatim' },
          needs_live_test: {
            type: 'boolean',
            description: 'true if only a live QBO API call can definitively confirm/deny this',
          },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['refuted', 'reason'],
  properties: {
    refuted: { type: 'boolean', description: 'true if the finding is NOT a real defect' },
    reason: { type: 'string', description: 'why it survives or is refuted, citing the files' },
  },
}

log(`Verifying ${packages.length} discover prompt package(s): ${packages.join(', ')}`)

// --- Phase 1+2: per-package static verification, then adversarially check each finding.
// Pipeline so a package's findings start getting refuted as soon as that package
// finishes, rather than waiting for the slowest package.
phase('Verify per prompt')
const perPackage = await pipeline(
  packages,

  // Stage 1 — one verifier per package (read-only, static).
  (pkg) =>
    agent(
      `You are auditing ONE prompt package in an Intuit QBO "discover" prompt library. Work read-only — do NOT call any external API, and do NOT edit files.

Package: "${pkg}"
Files to read (use the Read/Grep tools):
- Template:  ${DISCOVER}/${pkg}/prompt-template-${pkg}.md
- Generated: ${DISCOVER}/generated-prompts/${pkg}-ready-prompt.md
- Config:    ${DISCOVER}/prompt-config.json  (shared; find the keys this package uses)
- Schema:    ${DISCOVER}/prompt-config.schema.json
- Any ${DISCOVER}/${pkg}/GROUND-TRUTH.md or ${DISCOVER}/${pkg}/**/GROUND-TRUTH.md if present.

Check for these defect classes and report each as a finding:
1. contradiction — the template (or generated prompt) tells the reader to do X in one place and NOT-X in another. The canonical example this library was burned by: a guardrail saying "do NOT emit \`deleted: true\`" while a "Delete a line" step depends on \`deleted: true\`. Also: enum value lists that disagree between two sections; a field called required in one place and optional in another; a "defaults to DRAFT" vs "defaults to LOCKED" style mismatch.
2. unresolved-placeholder — a {{placeholder}} in the GENERATED prompt whose name IS a config key (means the merge failed / typo). Runtime placeholders whose name is NOT a config key (e.g. {{companyid}}, {{realmId}}) are EXPECTED — do not report those.
3. template-drift — the generated ${pkg}-ready-prompt.md does not reflect the current template (a correction present in the template is missing from the generated output, or vice-versa). Compare the two.
4. missing-host — an endpoint/path is given (e.g. "GET /v3/company/...") but no base host is stated anywhere the reader could find it, OR a REST path and a GraphQL host are mixed without saying which host each call uses.
5. missing-error-handling — an error code / failure mode named in one section (e.g. a PNB-* code) but not surfaced in the Error Handling guidance, or vice-versa.
6. stale-fact — a factual claim that contradicts a GROUND-TRUTH.md in the same package, if one exists.

For each finding give the exact file, line (best effort), a one-sentence summary, and the VERBATIM conflicting quotes/values as evidence. Set needs_live_test=true only when the claim genuinely cannot be settled by reading the files (i.e. it asserts live API behavior). Be precise and conservative — a finding you cannot back with a verbatim quote should not be reported. If the package is clean, return an empty findings array.`,
      { label: `verify:${pkg}`, phase: 'Verify per prompt', schema: FINDINGS_SCHEMA }
    ),

  // Stage 2 — adversarially refute each finding from stage 1 (skeptic per finding).
  (result, pkg) => {
    if (!result || !result.findings || !result.findings.length) {
      return { package: pkg, confirmed: [] }
    }
    return parallel(
      result.findings.map((f) => () =>
        agent(
          `You are a SKEPTIC. Another agent claims the following defect in the "${pkg}" prompt package. Your job is to REFUTE it if you can — default to refuted=true unless the evidence clearly holds when you read the actual files yourself (read-only, no API calls).

Claimed defect (${f.category}, severity ${f.severity}):
  File: ${f.file}${f.line ? ` line ${f.line}` : ''}
  Summary: ${f.summary}
  Evidence offered: ${f.evidence}

Open the cited file(s) under ${DISCOVER} and check whether the evidence is real and actually constitutes the claimed defect. Common reasons to REFUTE: the "contradiction" is actually two consistent statements read out of context; the "unresolved placeholder" is a legitimate runtime placeholder (name is not a config key); the "template-drift" quote exists identically in both files; the finding is a matter of style, not correctness. If, after reading, the defect is real, set refuted=false and explain why it survives.`,
          { label: `refute:${pkg}:${f.category}`, phase: 'Adversarial check', schema: VERDICT_SCHEMA }
        ).then((v) => ({ finding: f, verdict: v }))
      )
    ).then((checked) => ({
      package: pkg,
      confirmed: checked
        .filter(Boolean)
        .filter((c) => c.verdict && !c.verdict.refuted)
        .map((c) => ({ ...c.finding, why_survives: c.verdict.reason })),
    }))
  }
)

const byPackage = perPackage.filter(Boolean)
const totalConfirmed = byPackage.reduce((n, p) => n + (p.confirmed ? p.confirmed.length : 0), 0)
log(`Confirmed ${totalConfirmed} finding(s) across ${byPackage.length} package(s) after adversarial check.`)

// --- Phase 3: synthesize a single ranked report.
phase('Synthesize')
const report = await agent(
  `Consolidate these verified prompt-library findings into a single Markdown report for the maintainer.

Input (JSON): findings already survived an adversarial refute pass, so treat them as real.
${JSON.stringify(byPackage, null, 2)}

Produce:
1. A one-line headline: N confirmed issues across M packages (or "All ${packages.length} packages clean").
2. A table ranked most-severe first: package | category | file:line | summary.
3. For each HIGH-severity issue, a short "fix" suggestion (one or two sentences), grounded ONLY in the evidence given — do not invent API facts.
4. A separate short section "Needs a live API test" listing any findings flagged needs_live_test, since this workflow does not call the API.
Keep it tight and skimmable. Do not restate the raw JSON.`,
  { label: 'synthesize-report', phase: 'Synthesize' }
)

return { packagesVerified: packages, totalConfirmed, report }
