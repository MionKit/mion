# Running Playwright Tests

- Repo's Playwright project: `container/website/` (`playwright.config.ts`, `tests/`).
- Run with `pnpm exec playwright test` or the package `test` script. pnpm only, never `npx` / `npm`.
- `PLAYWRIGHT_HTML_OPEN=never` → no interactive html report.
- Website image ships no Playwright browsers (see `container/website/tests/theme.spec.ts` header).

```bash
PLAYWRIGHT_HTML_OPEN=never pnpm exec playwright test
PLAYWRIGHT_HTML_OPEN=never pnpm run test   # container/website `test` script = pnpm exec playwright test
```

# Debugging Playwright Tests

- Failing test → run with `--debug=cli`. Pauses test at start, prints debugging instructions.
- ⚠️ Run it in background. Poll output until "Debugging Instructions" prints. Stop it when finished.
- Instructions name a session → `playwright-cli attach` to it, explore the page.

```bash
PLAYWRIGHT_HTML_OPEN=never pnpm exec playwright test --debug=cli   # prints instructions for session "tw-abcdef"
playwright-cli attach tw-abcdef
playwright-cli -s=tw-abcdef snapshot   # attach names the session: pass -s on every later command
```

- Keep test running in background while you explore + look for a fix.
- Paused at start → step over or pause where problem most likely is.
- Copy each action's printed Playwright TS into the test: [test-generation.md](test-generation.md).
- Usually a locator or expectation needs updating. Could be an app bug. Use judgement.
- After fix: stop background run. Rerun, check test passes.
