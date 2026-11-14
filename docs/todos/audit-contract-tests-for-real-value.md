---
type: chore
spec: guidelines
status: ready
created: 2026-11-14
---

# Audit the contract tests: keep invariants, drop text copies

## Intent

`packages/devtools/test/*-contracts.test.ts` is 12 files, about 6,300 lines and 520 `toContain` / `toMatch`
assertions. They read workflow YAML, scripts and source as text and assert on it. Some guard real invariants
that nothing else checks before CI runs for real (a dry run never deploys, only one job can write releases, a
lane list in a script matches the workflow matrix). Many only restate the file under test: they copy an exact
command line, comment or step body.

A copy test costs without paying back:

- it breaks on a harmless reword or reformat, so people learn to update it blindly;
- it passes while the logic is wrong, because it never runs the code it quotes;
- it doubles every change: edit the workflow, then paste the same edit into the test.

Goal: each remaining assertion pins a rule someone could break by accident and would regret, and fails only
when that rule breaks.

## Direction

Files in scope (all under `packages/devtools/test/`): `repo-contracts`, `website-deploy-contracts`,
`ci-lane-contracts`, `bench-lane-contracts`, `fuzz-lane-contracts`, `ci-skip-defaults-contracts`,
`ci-token-hash-contracts`, `drizzle-e2e-lane-contracts`, `pr-heavy-lane-contracts`,
`release-binaries-contracts`, `test-batch-contracts`, `website-theme-contracts`. Also grep for other tests
that `readFileSync` a workflow, script or source file and assert on its text.

Sort every assertion into one bucket:

1. **Invariant across files** (a list in a script must match a workflow matrix, a ruleset name, a registry):
   keep. Prefer deriving both sides over hard-coding either.
2. **Safety gate** (dry-run gating, permissions, never `--clobber`, ref guards, secrets only on some refs):
   keep, but assert on parsed YAML structure (job, step `if`, `permissions`) rather than exact strings, and
   phrase it as a rule over all steps where possible ("every step that runs `pages deploy` is gated"), so a
   new ungated step fails too.
3. **Shell or script logic pinned as text** (a test quoting a `run:` block): move the logic into a script
   under `scripts/` that the workflow calls, test that script by running it (stubbed `gh`, temp dirs, local
   git), and keep only a structural check that the workflow calls it.
4. **Pure copy** (the assertion restates a line, a comment, a version string, or a command the step already
   shows, with no rule behind it): delete.

Constraints:

- Read [.agents/docs/testing.md](../../.agents/docs/testing.md) first: some contract placements and checks
  are rules there (tests live in `test/`, project lists match). Keep whatever a rule requires; change the rule
  in the same PR only if the audit shows it is itself a copy test.
- A YAML parser is a devDependency change: check [packages/AGENTS.md](../../packages/AGENTS.md) and the
  existing deps first (one may already be installed).
- No coverage loss on real rules: for each deleted assertion, say in the PR which bucket it was and, for
  buckets 1-3, where the rule is still enforced.
- Large: split into one PR per file group if the diff gets hard to review. The implementer plans the
  grouping.

The implementer plans the details: per-file classification, the YAML helper shape, which shell blocks
become scripts.

## Docs

Possibly `.agents/docs/testing.md`: add a short rule for future contract tests (assert invariants and
gates on structure, test logic by running it, never copy a line). No website page.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- Every assertion in the contract files is an invariant, a structural gate, or a call-site check for a script
  that has its own behavior tests. No assertion restates a line with no rule behind it.
- Shell logic previously pinned as text runs in tests.
- The PR lists, per file, what was deleted, kept, or moved, and why.
- `pnpm test` (devtools-core) and `pnpm run lint` clean.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source
  file, each committed on its own.
