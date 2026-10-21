# Spec-driven testing (plan → generate → heal)

Author + maintain Playwright tests with `playwright-cli`. Each stage works on its own:

- **Planning** (this page): explore app, write a spec file of what to test.
- **Generate**: spec → test files, update spec if vague or stale: [spec-driven-generate.md](spec-driven-generate.md).
- **Heal**: diagnose failing tests, fix code, reconcile spec with reality: [spec-driven-heal.md](spec-driven-heal.md).
- Shared mechanic: `pnpm exec playwright test --debug=cli` in background.
  Then `playwright-cli attach tw-XXXX`, drive the paused page with `-s=tw-XXXX`.
- `--debug=cli` / attach mechanics: [playwright-tests.md](playwright-tests.md).
- How actions become TS: [test-generation.md](test-generation.md).
- Mock requests while exploring/generating: [request-mocking.md](request-mocking.md).
- CLI browser session: [session-management.md](session-management.md).

## 1. Planning

Goal: spec file (e.g. `specs/<feature>.plan.md`) listing scenarios. ALWAYS write the spec to a file.

### 1.1 Prerequisite: workspace

- Check Playwright installed first: `test -f playwright.config.ts || test -f playwright.config.js`.
- Or `pnpm exec playwright --version`. Either confirms a workspace.
- Repo's workspace: `container/website/` ([playwright-tests.md](playwright-tests.md)).

### 1.2 Prerequisite: seed test

- Seed test = minimal test landing page in the start state of every scenario: navigation, login, feature flags.
- Scenarios assume fresh start *after* the seed. `--debug=cli` pauses *inside* it → every session starts there.
- No seed → create one that at least navigates to the app. Minimum: `tests/seed.spec.ts` with `page.goto(...)`.
- Preferred: navigation in a fixture, so scenario tests reuse it:

```ts
// tests/fixtures.ts
import { test as baseTest } from '@playwright/test';
export { expect } from '@playwright/test';
export const test = baseTest.extend({
  page: async ({ page }, use) => { await page.goto('https://example.com/'); await use(page); },
});
// tests/seed.spec.ts: fixture navigates; empty body tells agents where to start
import { test } from './fixtures';
test('seed', async ({ page }) => {});
```

### 1.3 Explore the app

```bash
PLAYWRIGHT_HTML_OPEN=never pnpm exec playwright test tests/seed.spec.ts --debug=cli   # background
# wait for "Debugging Instructions" and the session name tw-XXXX
playwright-cli attach tw-XXXX
playwright-cli -s=tw-XXXX resume                 # seed test runs fully
playwright-cli -s=tw-XXXX snapshot               # inventory of interactive elements
playwright-cli -s=tw-XXXX click e5               # follow a flow
playwright-cli -s=tw-XXXX eval "location.href"   # read URL / state
playwright-cli -s=tw-XXXX show --annotate        # ask user to point at something
```

- Map: interactive surfaces (forms, buttons, lists, filters, modals), primary journeys end-to-end.
- Map: edge cases (empty states, validation errors, very long input, boundary values).
- Map: persistence (reload, local/session storage, URL fragments), navigation (URL changes, back/forward).
- ⚠️ Never just open the app url with playwright-cli. Always go through the test (captures its custom setup).
- Stop the background test when done exploring.

### 1.4 Write the spec file

- Save as `specs/<feature>.plan.md`. Top: `# <Feature> Test Plan`.
- `## Application Overview`: one paragraph, what the feature does + why it matters.
- Then `## Test Scenarios`, one group per `### N. <Group Name>`:

```markdown
### 1. <Group Name>
**Seed:** `tests/seed.spec.ts`
#### 1.1. <kebab-case-scenario-name>
**File:** `tests/<group>/<kebab-case-scenario-name>.spec.ts`
**Steps:**
  1. <Concrete user step>
    - expect: <observable outcome>
```

- Scenarios independent, each starts from seed's fresh state. Never chain scenarios.
- Scenario name kebab-case = test file name (`should-add-single-todo` → `should-add-single-todo.spec.ts`).
- Cover happy path, edge cases, validation, negative flows, persistence.
- Steps at user level ("Type 'Buy milk' into the input"), not API level ("call `fill`").
- Observable outcomes go in `- expect:` bullets. Each becomes an assertion.

