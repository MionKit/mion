// Each subsite's colour scheme reaches the rendered page, and the header names the
// subsite (the word beside the logo and the subsite menu button). Run against a served site (`pnpm miondevx website dev`; the harness points at
// :3000); the expected values come from each sites/<id>/theme.css. Not a CI gate: the
// shared image carries no Playwright browsers, so this is the manual check the
// website-browser skill drives (every subsite, light and dark).
import {expect, test} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const SITES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'sites');
const SUBSITES = [
  {id: 'rpc', path: '/rpc', word: 'RPC'},
  {id: 'runtypes', path: '/runtypes', word: 'RunTypes'},
  {id: 'benchmarks', path: '/benchmarks', word: 'Benchmarks'},
];

const rgb = (hex: string): string => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

// The value of `name` inside the `selector {` … `}` block of a theme file.
function token(theme: string, name: string, selector: string): string {
  const css = theme.replace(/\/\*[\s\S]*?\*\//g, '');
  const start = css.indexOf(`${selector} {`);
  if (start === -1) return '';
  const body = css.slice(start, css.indexOf('}', start));
  return body.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim() ?? '';
}

for (const {id, path, word} of SUBSITES) {
  test(`${id}: the brand palette, the accent and the header word are live`, async ({page}) => {
    const theme = readFileSync(join(SITES_DIR, id, 'theme.css'), 'utf8');
    const dark = (name: string) => token(theme, name, `[data-site='${id}']`);
    const light = (name: string) => token(theme, name, `[data-site='${id}'].light,\n.light [data-site='${id}']`) || dark(name);
    await page.goto(path);
    expect(await page.getAttribute('html', 'data-site')).toBe(id);
    const read = (name: string) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
    expect(await read('--site-brand-500')).toBe(dark('--site-brand-500'));
    expect(await read('--color-brand-500')).toBe(dark('--site-brand-500'));
    expect(await read('--ui-primary')).not.toBe('');
    // dark is the default; the light block may override the accent
    await page.evaluate(() => document.documentElement.classList.add('light'));
    expect(await read('--site-accent')).toBe(light('--site-accent'));
    await page.evaluate(() => document.documentElement.classList.remove('light'));
    expect(await read('--site-accent')).toBe(dark('--site-accent'));
    // the header: the mion logo plus the subsite word, bold, in the accent colour
    const brandWord = page.locator('.site-brand-word').first();
    await expect(brandWord).toHaveText(word);
    expect(await brandWord.evaluate((el) => getComputedStyle(el).color)).toBe(rgb(dark('--site-accent')));
    expect(await brandWord.evaluate((el) => getComputedStyle(el).fontWeight)).toBe('700');
    // the subsite menu button names the current subsite in the same accent, and its
    // popup lists every subsite with an intro line
    const menuButton = page.locator('.subsite-menu-button').first();
    await expect(menuButton).toContainText(word);
    expect(await menuButton.evaluate((el) => getComputedStyle(el).color)).toBe(rgb(dark('--site-accent')));
    await menuButton.click();
    await expect(page.locator('.subsite-menu-item')).toHaveCount(SUBSITES.length);
    await expect(page.locator('.subsite-menu-item.is-active .subsite-menu-label')).toHaveText(word);
    await page.keyboard.press('Escape');
    // the hero title is painted with the accent
    const hero = page.locator('.slided-title-leading').first();
    if (await hero.count()) expect(await hero.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain(rgb(dark('--site-accent')));
  });
}

test('root: the rpc theme on <html>, each intro block in its own colours', async ({page}) => {
  await page.goto('/');
  expect(await page.getAttribute('html', 'data-site')).toBe('rpc');
  await expect(page.locator('.site-brand-word')).toHaveCount(0);
  await expect(page.locator('.subsite-menu-button').first()).toContainText('Explore');
  for (const {id} of SUBSITES) {
    const theme = readFileSync(join(SITES_DIR, id, 'theme.css'), 'utf8');
    const block = page.locator(`[data-site='${id}'].home-subsite`).first();
    await expect(block).toBeVisible();
    expect(await block.evaluate((el) => getComputedStyle(el).getPropertyValue('--color-brand-500').trim())).toBe(token(theme, '--site-brand-500', `[data-site='${id}']`));
  }
});
