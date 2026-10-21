# Spec-driven testing: Heal

Goal: fix failing tests. Update spec if app's intended behaviour changed.

- Spec format: [spec-driven-testing.md](spec-driven-testing.md).
- Find: `PLAYWRIGHT_HTML_OPEN=never pnpm exec playwright test`. Record failing `<file>:<line>` entries.
- Fix one failure at a time, rerun after each. No parallel fixes (shared state + single CLI session = fragile).
- Debug one, in background:
  `PLAYWRIGHT_HTML_OPEN=never pnpm exec playwright test tests/<group>/<scenario>.spec.ts:<line> --debug=cli`.
  Attach `tw-XXXX`, then `-s=tw-XXXX` on every command ([playwright-tests.md](playwright-tests.md)).
- Paused at start → step / run until just before failing action or assertion. Then:
  `snapshot` (element changed/moved/renamed?), `console` (app errors?), `requests` (failed? wrong payload?).
  `show --annotate`: ask user to point somewhere.
- Common causes: selector drift, new wrapper element, label/ARIA rename, timing (transition, async load).
  Also: assertion text updated in app, test data leaking between runs.
- Rehearse fix with `playwright-cli`. Paste its generated code back into the test.
- Fix: update locator, assertion, step order or inputs. Stop background run. Rerun single test → green.
- Never skip hooks or add sleeps as a fix. Never use `networkidle`.
- Reconcile: open spec from test's `// spec:` header, find matching scenario.
  - Purely technical fix (locator drift, better assertion) + spec still matches → leave spec alone.
  - Fix changed user-visible steps, inputs, order or outcomes → update spec. Keep scenario id + file path.
  - ⚠️ Unclear if app change intended (stale spec) or regression (app wrong) → STOP, ask user.
    Give scenario id (e.g. `2.3`), spec lines that no longer match, observed behaviour (snapshot excerpt).
  - After answer: update spec (intended) or file/flag test as covering a bug (regression).
- Confident test is right, app wrong, user confirmed bug → `test.fixme(...)` + comment to decision or issue link.
- Never silently skip.
