# Running Custom Playwright Code

`run-code` runs arbitrary Playwright code, for cases no CLI command covers.

## Syntax

```bash
playwright-cli run-code "async page => {
  // Playwright code here; page.context() for browser context operations
}"
playwright-cli run-code --filename=./my-script.js   # load function from file
```

- Code = single function expression. Wrapped in `(...)` and evaluated.
- No import/export/require syntax.
- Iframes, file downloads, clipboard read/write: [frames-downloads-clipboard.md](frames-downloads-clipboard.md).

## Geolocation and Permissions

```bash
playwright-cli run-code "async page => {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 37.7749, longitude: -122.4194 });
}"
playwright-cli run-code "async page => { await page.context().clearPermissions(); }"   # clear override
playwright-cli run-code "async page => {
  await page.context().grantPermissions(['geolocation', 'notifications', 'camera', 'microphone']);
}"
playwright-cli run-code "async page => {
  await page.context().grantPermissions(['clipboard-read'], { origin: 'https://example.com' });
}"
```

## Media Emulation

```bash
playwright-cli run-code "async page => { await page.emulateMedia({ colorScheme: 'dark' }); }"   # or 'light'
playwright-cli run-code "async page => { await page.emulateMedia({ reducedMotion: 'reduce' }); }"
playwright-cli run-code "async page => { await page.emulateMedia({ media: 'print' }); }"
```

## Wait Strategies

```bash
playwright-cli run-code "async page => { await page.locator('.loading').waitFor({ state: 'hidden' }); }"
playwright-cli run-code "async page => { await page.waitForFunction(() => window.appReady === true); }"
playwright-cli run-code "async page => { await page.locator('.result').waitFor({ timeout: 10000 }); }"
```

## Page Information and JavaScript

- Page info: `page.title()`, `page.url()`, `page.content()`, `page.viewportSize()`.

```bash
playwright-cli run-code "async page => { return await page.title(); }"
playwright-cli run-code "async page => {
  return await page.evaluate(() => ({
    userAgent: navigator.userAgent, language: navigator.language, cookiesEnabled: navigator.cookieEnabled }));
}"
playwright-cli run-code "async page => {
  const multiplier = 5;   // pass args to evaluate
  return await page.evaluate(m => document.querySelectorAll('li').length * m, multiplier);
}"
playwright-cli run-code "async page => {
  try { await page.getByRole('button', { name: 'Submit' }).click({ timeout: 1000 }); return 'clicked'; }
  catch (e) { return 'element not found'; }
}"
```

## Complex Workflows

- Login + save state, then scrape several pages:

```bash
playwright-cli run-code "async page => {
  await page.goto('https://example.com/login');
  await page.getByRole('textbox', { name: 'Email' }).fill('user@example.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('secret');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard');
  await page.context().storageState({ path: 'auth.json' });
}"
playwright-cli run-code "async page => {
  const results = [];
  for (let i = 1; i <= 3; i++) {
    await page.goto(\`https://example.com/page/\${i}\`);
    results.push(...await page.locator('.item').allTextContents());
  }
  return results;
}"
```
