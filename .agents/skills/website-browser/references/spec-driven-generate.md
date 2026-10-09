# Spec-driven testing: Generate

Goal: spec file → Playwright test files. Update spec if it drifted.

- Spec format + seed: [spec-driven-testing.md](spec-driven-testing.md).
- Inputs: spec file (e.g. `specs/basic-operations.plan.md`); target: one scenario (`1.2`), a group (`1`) or all.
- Seed file: from the `**Seed:**` line of the scenario's group.

## Generate one scenario

- Per scenario: `PLAYWRIGHT_HTML_OPEN=never pnpm exec playwright test <seed-file> --debug=cli` (background).
  Then `playwright-cli attach tw-XXXX`, `playwright-cli -s=tw-XXXX resume`.
- Never just open the app url with playwright-cli. Always go through the test.
- Walk `Steps:` one by one. Spec = plan, live app = source of truth.
- Step vague, element gone, or contradicts app → update spec to match the app, keep going. Expected mid-generation.
- Copy each action's printed Playwright TS ([test-generation.md](test-generation.md)).
- Each `- expect:` bullet → explicit assertion ([test-generation.md](test-generation.md)).
- Write the collected code to the spec's file path. Header: `// spec: specs/basic-operations.plan.md`, `// seed: ...`.
- ONE test per file. File path, describe name, test name verbatim from spec (describe minus `1.` ordinal).
- Each numbered step: `// N. <step text>` comment before its actions.
- Import `{ test, expect }` from `./fixtures` if project has one, else `@playwright/test`.
- Close CLI session + stop background test before next scenario.

## Generate multiple scenarios

- Loop "Generate one scenario", restart seed per scenario → clean page per test.
- Parallel ok: each `--debug=cli` run gets its own random `tw-XXXX` session. Stop every test run.

## Run generated tests

- Run once: `PLAYWRIGHT_HTML_OPEN=never pnpm exec playwright test tests/<group>/<scenario>.spec.ts`.
- Failure → [spec-driven-heal.md](spec-driven-heal.md).
