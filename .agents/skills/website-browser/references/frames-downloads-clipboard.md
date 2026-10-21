# Frames, Downloads, Clipboard

`run-code` recipes. Syntax rules: [running-code.md](running-code.md).

```bash
playwright-cli run-code "async page => {
  await page.locator('iframe#my-iframe').contentFrame().locator('button').click(); }"
playwright-cli run-code "async page => { return page.frames().map(f => f.url()); }"   # all frames
playwright-cli run-code "async page => {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download' }).click();
  const download = await downloadPromise;
  await download.saveAs('./downloaded-file.pdf');
  return download.suggestedFilename();
}"
playwright-cli run-code "async page => {   // read needs permission
  await page.context().grantPermissions(['clipboard-read']);
  return await page.evaluate(() => navigator.clipboard.readText()); }"
playwright-cli run-code "async page => {
  await page.evaluate(text => navigator.clipboard.writeText(text), 'Hello clipboard!'); }"
```
