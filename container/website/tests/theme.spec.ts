// The site's colour scheme reaches the rendered page. Run against a served site
// (`pnpm miondevx website dev --site <site>`; the harness points at :3000) with MION_SITE
// naming the site under test; the expected values come from that site's theme.css.
// Not a CI gate: the shared image carries no Playwright browsers, so this is the
// manual check the website-browser skill drives (both sites, light and dark).
import {expect, test} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const site = process.env.MION_SITE || 'runtypes';
const theme = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'sites', site, 'theme.css'), 'utf8');
const token = (name: string, block = ':root {'): string => {
  const start = theme.indexOf(block);
  const body = theme.slice(start, theme.indexOf('}', start));
  return body.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim() ?? '';
};
const rgb = (hex: string): string => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

test(`${site}: the brand palette and the accent are live on :root`, async ({page}) => {
  await page.goto('/');
  const read = (name: string) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
  expect(await read('--color-brand-500')).toBe(token('--color-brand-500', '@theme static {'));
  expect(await read('--ui-primary')).not.toBe('');
  // dark is the default; the light block may override the accent
  await page.evaluate(() => document.documentElement.classList.add('light'));
  expect(await read('--site-accent')).toBe(token('--site-accent', ':root.light {') || token('--site-accent'));
  await page.evaluate(() => document.documentElement.classList.remove('light'));
  expect(await read('--site-accent')).toBe(token('--site-accent'));
  // the hero title is painted with the accent
  const hero = page.locator('.typed-title-leading').first();
  if (await hero.count()) expect(await hero.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain(rgb(token('--site-accent')));
});
