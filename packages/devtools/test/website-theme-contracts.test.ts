// Docs-website colour-scheme + two-site contracts. The website is containerized, so
// nothing in this repo's CI renders it; these pin the seams by reading the files:
//
//   - No site colour in the SHARED tree. Both sites once shared one olive green that
//     lived in ~20 components as hex fallbacks, rgba() washes and HSL hue constants,
//     so `ui.colors.primary` alone moved a fraction of a page. Every shared consumer
//     now reads the site's tokens (sites/<site>/theme.css); a literal creeping back
//     in would silently give one site the other's colour.
//   - Each site's theme.css defines the FULL token set the shared components rely on
//     (a missing shade falls through to Tailwind's stock palette, which is exactly
//     the off-brand 950 the old green ramp shipped with).
//   - The two SITES lists (host scripts vs the in-container Nuxt config), the deploy
//     workflow's site choice and the pr-heavy build all name the same sites.
//   - The animated title gradient sits on the section h2 titles, never on the card
//     h3 titles inside them (the inversion this scheme landed with).

import {describe, it, expect} from 'vitest';
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join, posix, resolve} from 'node:path';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const WEBSITE = join(REPO_ROOT, 'container/website');
const SITES_DIR = join(WEBSITE, 'sites');
const MION_CSS = join(WEBSITE, 'app/assets/css/mion.css');

// Every site dir that carries a theme (discovered, so a new site cannot slip the check).
const SITES = readdirSync(SITES_DIR).filter((site) => statSync(join(SITES_DIR, site)).isDirectory());

// Walk a tree, yielding repo-relative posix paths of files matching `keep`.
function walk(dir: string, keep: (name: string) => boolean, skipDirs: string[] = []): string[] {
  const out: string[] = [];
  const visit = (current: string): void => {
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) {
        if (!skipDirs.includes(name)) visit(full);
      } else if (keep(name)) out.push(posix.relative(REPO_ROOT, full.split('\\').join('/')));
    }
  };
  visit(dir);
  return out;
}

const hex = (value: string): boolean => /^#[0-9a-f]{6}$/i.test(value);

describe('website-no-site-colour', () => {
  // The olive green in every form it was ever written, plus the Nuxt green mermaid
  // once hard-coded and the hue constants the rank ramps carried.
  const FORBIDDEN: RegExp[] = [
    /#79af43/i,
    /#8aa85e/i,
    /#bdd09d/i,
    /#a3be7a/i,
    /#22c55e/i,
    /#4ade80/i,
    /#86b94a/i,
    /#4e7d1e/i,
    /#5d8a32/i,
    /#649037/i,
    /#00dc82/i,
    /#6b8e3d/i,
    /#a8c87e/i,
    /rgba\(\s*138\s*,\s*168\s*,\s*94/,
    /--color-green-/,
    /--ui-saturated/,
    /--ui-primary0\b/,
    /hsl\(\s*145\b/,
    /hue = 145/,
    /\* 130deg/,
    /50 \+ rank/,
    /%2322c55e/i,
    /%234ade80/i,
  ];
  const SHARED = [
    ...walk(join(WEBSITE, 'app'), (name) => /\.(vue|css|ts|mjs)$/.test(name), ['.vendor', 'go-generated']),
    ...SITES.map((site) => `container/website/sites/${site}/Logo.vue`).filter((rel) => existsSync(join(REPO_ROOT, rel))),
    ...SITES.flatMap((site) =>
      existsSync(join(SITES_DIR, site, 'content')) ? walk(join(SITES_DIR, site, 'content'), (name) => name.endsWith('.md')) : []
    ),
  ];

  it('scans the shared components, the site logos and the content trees', () => {
    expect(SHARED.length).toBeGreaterThan(20);
    expect(SHARED).toContain('container/website/app/assets/css/mion.css');
    expect(SHARED).toContain('container/website/app/components/content/BenchTable.vue');
  });

  it('leaves no site colour literal in the shared tree', () => {
    const offenders: string[] = [];
    for (const rel of SHARED) {
      const lines = readFileSync(join(REPO_ROOT, rel), 'utf8').split('\n');
      lines.forEach((line, i) => {
        for (const pattern of FORBIDDEN) if (pattern.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 100)}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('animates the section h2 titles, never the card h3 titles', () => {
    // Comments stripped first: a rule's selector match would otherwise start at the
    // comment block above it. Then split into top-level rules, `selector {` … `}`
    // (the file has no nested rules outside @media / @keyframes, which carry no gradient).
    const css = readFileSync(MION_CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = [...css.matchAll(/^([^@{}\n][^{}]*?)\{([^{}]*)\}/gm)];
    const animated = rules.filter(([, , body]) => /animation:\s*gradient-flow/.test(body)).map(([, selector]) => selector.trim());
    expect(animated.some((selector) => selector.startsWith("h2[data-slot='title']"))).toBe(true);
    expect(animated.filter((selector) => /\bh3\b/.test(selector))).toEqual([]);
  });
});

describe('website-theme-tokens', () => {
  const THEMES = SITES.map((site) => ({site, file: join(SITES_DIR, site, 'theme.css')}));
  const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
  const COLOUR_TOKENS = ['--site-accent', '--site-gradient-from', '--site-gradient-to', '--site-gradient-mix'];
  const HUE_TOKENS = ['--site-hue', '--site-hue-good'];
  const value = (css: string, name: string): string | undefined => css.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();

  it('every site carries a theme', () => {
    expect(THEMES.length).toBe(2);
    for (const {file} of THEMES) expect(existsSync(file)).toBe(true);
  });

  it('defines the full brand ramp as static Tailwind theme colours', () => {
    for (const {site, file} of THEMES) {
      const css = readFileSync(file, 'utf8');
      expect(css, site).toContain('@theme static {');
      for (const shade of SHADES) expect(hex(value(css, `--color-brand-${shade}`) ?? ''), `${site} brand-${shade}`).toBe(true);
    }
  });

  it('defines the accent, gradient and hue tokens', () => {
    for (const {site, file} of THEMES) {
      const css = readFileSync(file, 'utf8');
      for (const token of COLOUR_TOKENS) expect(hex(value(css, token) ?? ''), `${site} ${token}`).toBe(true);
      for (const token of HUE_TOKENS) expect(value(css, token), `${site} ${token}`).toMatch(/^\d+$/);
    }
  });

  it('gives the two sites different colours', () => {
    const primaries = THEMES.map(({file}) => value(readFileSync(file, 'utf8'), '--color-brand-500'));
    expect(new Set(primaries).size).toBe(THEMES.length);
  });

  it('points each app.config at the brand palette and nothing else', () => {
    for (const site of SITES) {
      const config = readFileSync(join(SITES_DIR, site, 'app.config.ts'), 'utf8');
      expect(config, site).toMatch(/primary:\s*'brand'/);
      expect(config, site).not.toMatch(/\b(white|black):\s*\{/);
    }
  });

  it('loads the site theme from the one Tailwind root and keeps no palette there', () => {
    const css = readFileSync(MION_CSS, 'utf8');
    expect(css).toContain("@import '#site/theme.css';");
    expect(css).not.toMatch(/^\s*@theme\b/m);
  });
});

describe('website-sites-mirror', () => {
  const sitesIn = (file: string): string[] => {
    const match = readFileSync(join(REPO_ROOT, file), 'utf8').match(/export const SITES = \[([^\]]+)\]/);
    if (!match) throw new Error(`${file}: no SITES array`);
    return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  };

  it('keeps the host-side SITES equal to the in-container one', () => {
    expect(sitesIn('scripts/lib/env.mjs')).toEqual(sitesIn('container/website/site.config.ts'));
    // the sites/ dirs are discovered alphabetically; the lists are hand-ordered
    expect([...sitesIn('scripts/lib/env.mjs')].sort()).toEqual([...SITES].sort());
  });

  it('offers exactly both + every site in the deploy workflow', () => {
    const yml = readFileSync(join(REPO_ROOT, '.github/workflows/website-deploy.yml'), 'utf8');
    const options = yml
      .match(/site:[\s\S]*?options:\s*\[([^\]]+)\]/)?.[1]
      .split(',')
      .map((s) => s.trim());
    expect([...(options ?? [])].sort()).toEqual(['both', ...SITES].sort());
  });

  it('really builds both sites in pr-heavy', () => {
    const yml = readFileSync(join(REPO_ROOT, '.github/workflows/pr-heavy.yml'), 'utf8');
    expect(yml).toMatch(/pnpm rtx website container-build --site both/);
  });

  it('ships a favicon per site, none shared', () => {
    for (const site of SITES) expect(existsSync(join(SITES_DIR, site, 'public/favicon.ico')), site).toBe(true);
    expect(existsSync(join(WEBSITE, 'public/favicon.ico'))).toBe(false);
  });
});
