# Test Generation

Every `playwright-cli` action prints matching Playwright TypeScript. Copy it straight into test files.

## Example Workflow

```bash
playwright-cli open https://example.com/login
playwright-cli snapshot     # explore first: e1 [textbox "Email"], e2 [textbox "Password"], e3 [button "Sign In"]
playwright-cli fill e1 "user@example.com"
# Ran Playwright code:
# await page.getByRole('textbox', { name: 'Email' }).fill('user@example.com');
playwright-cli click e3
# Ran Playwright code:
# await page.getByRole('button', { name: 'Sign In' }).click();
```

- Collect the code into a test: `import { test, expect } from '@playwright/test'`, `page.goto(...)`, actions.
- Then add assertions, e.g. `await expect(page).toHaveURL(/.*dashboard/);`.
- Generated code uses role-based locators where possible: resilient (`getByRole('button', { name: 'Submit' })`).
- Avoid fragile CSS selectors (`page.locator('#submit-btn')`).

## Add Assertions Manually

Generated code captures actions, never assertions. Add expectations with a recommended matcher:

- `toBeVisible()`: element rendered + visible.
- `toHaveText(text)`: text content matches.
- `toHaveValue(value) / toBeEmpty()`: input/select value matches.
- `toBeChecked() / toBeUnchecked()`: checkbox state matches.
- `toMatchAriaSnapshot(snapshot)`: page (or locator) matches a partial accessibility snapshot.
- `playwright-cli generate-locator <target>` → locator for the assertion. Snapshot/eval → expected value.
- Asserting text: locator must not contain the element's own text. `getByTestId()` / `getByLabel()` work well.
- Text-based locator → prefer `toBeVisible()`.
- Aria snapshot: only what the assertion needs, not everything. Regex for unstable values.

```bash
playwright-cli --raw generate-locator e5            # getByRole('button', { name: 'Submit' })
playwright-cli --raw eval "el => el.textContent" e5  # expected text for toHaveText
playwright-cli --raw eval "el => el.value" e5        # expected value for toHaveValue/toBeEmpty
playwright-cli --raw snapshot                        # aria snapshot for toMatchAriaSnapshot/toBeChecked
playwright-cli --raw snapshot e5                     # same, scoped to a region
```

```typescript
await expect(page.getByRole('alert', { name: 'Success' })).toBeVisible();
await expect(page.getByTestId('main-header')).toHaveText('Welcome, user');
await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue('user@example.com');
await expect(page.getByRole('checkbox', { name: 'Enable notifications' })).toBeChecked();
// whole page: finds a matching region. Scope with a locator: expect(page.getByRole('navigation'))
await expect(page).toMatchAriaSnapshot(`
  - heading "Welcome, user"
  - link /\\d+ new messages?/
  - button "Sign out"
`);
```
