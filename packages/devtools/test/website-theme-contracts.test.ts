// Docs-website colour-scheme + subsite contracts. The website is containerized, so
// nothing in this repo's CI renders it; these pin the seams by reading the files:
//
//   - No site colour in the SHARED tree. The two sites once shared one olive green that
//     lived in ~20 components as hex fallbacks, rgba() washes and HSL hue constants,
//     so `ui.colors.primary` alone moved a fraction of a page. Every shared consumer
//     now reads the subsite's tokens (sites/<id>/theme.css); a literal creeping back
//     in would silently give one subsite another's colour.
//   - ONE `brand` palette, filled per subsite: mion.css declares the @theme block as
//     pure references and each theme.css fills the shades + tokens under its
//     `[data-site='<id>']` selector (a missing shade falls through to Tailwind's stock
//     palette, which is exactly the off-brand 950 the old green ramp shipped with).
//   - The subsite list (app/utils/subsites.ts) matches the content tree, the theme
//     files and the landing pages.
//   - The animated title gradient sits on the section h2 titles, never on the card
//     h3 titles inside them (the inversion this scheme landed with).
//   - No raw colour in app/ outside the token layer: custom properties declared in
//     mion.css's :root, :root.dark and :root.light blocks. Everything else reads a token,
//     so one file shows (and changes) every colour the shared tree paints.

import {describe, it, expect} from 'vitest';
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join, posix, resolve} from 'node:path';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const WEBSITE = join(REPO_ROOT, 'container/website');
const SITES_DIR = join(WEBSITE, 'sites');
const CONTENT_DIR = join(WEBSITE, 'content');
const MION_CSS = join(WEBSITE, 'app/assets/css/mion.css');

// Every subsite dir that carries a theme (discovered, so a new one cannot slip the check).
const SITES = readdirSync(SITES_DIR).filter((site) => statSync(join(SITES_DIR, site)).isDirectory());

// The subsite ids app/utils/subsites.ts declares, in order.
const SUBSITE_IDS = [...readFileSync(join(WEBSITE, 'app/utils/subsites.ts'), 'utf8').matchAll(/^\s*id: '([a-z]+)',$/gm)].map(
  (m) => m[1]
);

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

// Raw colour scan: a colour value in app/ lives only in mion.css's root token blocks.
const NAMED_COLOURS = `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown
  burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray
  darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue
  darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite
  forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory
  khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen
  lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime
  limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue
  mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive
  olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peru pink plum powderblue
  purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue
  slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow
  yellowgreen`.split(/\s+/);
const HEX_COLOUR = /(?<![&\w])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/gi;
const COLOUR_FN = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/gi;
const NAMED_COLOUR = new RegExp(`(?<![\\w.#@$-])(?:${NAMED_COLOURS.join('|')})(?![\\w-])`, 'gi');
// `prop: value` up to `;` or `}`: a selector's `a:hover {` ends at `{` and never matches.
const DECLARATION = /(?<=[{;]\s*)-{0,2}[a-z][\w-]*\s*:(?!:)([^;{}]*)(?=[;}])/gi;
const TOKEN_BLOCK = /^:root(?:\.dark|\.light)? \{[^{}]*\}/gm;
const VAR_FALLBACK = /var\(\s*--[\w-]+\s*,/g;

// Same length, newlines kept, so offsets and line numbers survive.
const blank = (text: string): string => text.replace(/[^\n]/g, ' ');

const stripComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/(^|[^:\w'"`])(\/\/.*)$/gm, (_, lead: string, comment: string) => lead + blank(comment));

// The text inside the parens opening at `open`, up to the matching one or the end of the line.
function callArgs(text: string, open: number): string {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '\n') return text.slice(open + 1, i);
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return text.slice(open + 1, i);
  }
  return text.slice(open + 1);
}

// Hex colours and colour functions none of whose channels reads a var(): hsl(var(--site-hue) 50% 50%) is a token hue.
const literalOffsets = (text: string): number[] => [
  ...[...text.matchAll(HEX_COLOUR)].map((m) => m.index),
  ...[...text.matchAll(COLOUR_FN)].filter((m) => !callArgs(text, m.index + m[0].length - 1).includes('var(')).map((m) => m.index),
];

// Named colours in a CSS value; one inside a string (a data: URI mask, `content`) is not a colour value.
const namedOffsets = (value: string): number[] =>
  [...value.replace(/(['"])[\s\S]*?\1/g, blank).matchAll(NAMED_COLOUR)].map((m) => m.index);

// 1-based lines of `source` holding a raw colour outside the token layer, or a var() fallback to one anywhere.
function rawColourLines(source: string, kind: 'css' | 'vue' | 'ts', tokenLayer = false): number[] {
  const code = stripComments(source);
  let css = kind === 'css' ? code : blank(code);
  if (kind === 'vue')
    for (const m of code.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
      const start = m.index + m[0].length - '</style>'.length - m[1].length;
      css = css.slice(0, start) + m[1] + css.slice(start + m[1].length);
    }
  const tokenBlocks = tokenLayer ? [...code.matchAll(TOKEN_BLOCK)].map((m) => [m.index, m.index + m[0].length]) : [];
  const lineOf = (offset: number): number => code.slice(0, offset).split('\n').length;
  const lineText = (offset: number): string => code.slice(code.lastIndexOf('\n', offset) + 1).split('\n')[0];
  const isToken = (offset: number): boolean =>
    tokenBlocks.some(([start, end]) => offset > start && offset < end) && /^\s*--[\w-]+\s*:/.test(lineText(offset));
  const raw = literalOffsets(code);
  for (const m of css.matchAll(DECLARATION)) {
    const valueStart = m.index + m[0].length - m[1].length;
    raw.push(...namedOffsets(m[1]).map((offset) => valueStart + offset));
  }
  const fallbacks = [...code.matchAll(VAR_FALLBACK)]
    .filter((m) => {
      const fallback = callArgs(code, m.index + 3).replace(/^[^,]*,/, '');
      return literalOffsets(fallback).length + namedOffsets(fallback).length > 0;
    })
    .map((m) => m.index);
  const lines = [...raw.filter((offset) => !isToken(offset)), ...fallbacks].map(lineOf);
  return [...new Set(lines)].sort((a, b) => a - b);
}

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
    ...walk(CONTENT_DIR, (name) => name.endsWith('.md')),
  ];

  it('paints the logo mark with its own token, never the subsite accent', () => {
    const logo = readFileSync(join(WEBSITE, 'app/components/content/MionLogo.vue'), 'utf8');
    expect(logo).toContain('var(--mion-logo-accent)');
    expect(logo).not.toContain('--site-accent');
    expect(readFileSync(MION_CSS, 'utf8')).toMatch(/^\s*--mion-logo-accent: #79af43;$/m);
  });

  it('scans the shared components, the logo and the content tree', () => {
    expect(SHARED.length).toBeGreaterThan(20);
    expect(SHARED).toContain('container/website/app/assets/css/mion.css');
    expect(SHARED).toContain('container/website/app/components/content/BenchTable.vue');
    expect(SHARED).toContain('container/website/app/components/content/RuntypesBenchBars.vue');
    expect(SHARED).toContain('container/website/app/components/content/MionLogo.vue');
  });

  it('leaves no site colour literal in the shared tree', () => {
    const offenders: string[] = [];
    for (const rel of SHARED) {
      const lines = readFileSync(join(REPO_ROOT, rel), 'utf8').split('\n');
      lines.forEach((line, i) => {
        // The one literal allowed: the mion logo mark's own colour, declared once in
        // mion.css. It is the brand, the same on every subsite, so it is not a site colour.
        if (/^\s*--mion-logo-accent:\s*#79af43;\s*$/.test(line)) return;
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

describe('website-colour-tokens', () => {
  const MION_CSS_REL = 'container/website/app/assets/css/mion.css';
  const FILES = walk(join(WEBSITE, 'app'), (name) => /\.(css|vue|ts)$/.test(name), ['data', 'go-generated', '.vendor']);
  // `pnpm miondevx card export` writes these, stamped on their first line
  const generated = (rel: string): boolean =>
    /never edit by hand/.test(readFileSync(join(REPO_ROOT, rel), 'utf8').split('\n')[0]!);
  const SCANNED = FILES.filter((rel) => !generated(rel));
  const flagged = (source: string, kind: 'css' | 'vue' | 'ts' = 'css', tokenLayer = false): boolean =>
    rawColourLines(source, kind, tokenLayer).length > 0;

  it('scans every hand-written app file, skipping only the generated card exports', () => {
    expect(FILES.filter(generated).sort()).toEqual([
      'container/website/app/assets/css/code-card.css',
      'container/website/app/utils/codeCardPlayer.ts',
    ]);
    for (const rel of [
      MION_CSS_REL,
      'container/website/app/components/content/BenchTable.vue',
      'container/website/app/components/global/mermaid.vue',
      'container/website/app/components/playground/PlaygroundStage.client.vue',
      'container/website/app/playground/engine.ts',
    ])
      expect(SCANNED).toContain(rel);
  });

  it('keeps every raw colour in the mion.css token layer', () => {
    const offenders = SCANNED.flatMap((rel) => {
      const source = readFileSync(join(REPO_ROOT, rel), 'utf8');
      const lines = source.split('\n');
      const kind = rel.endsWith('.css') ? 'css' : rel.endsWith('.vue') ? 'vue' : 'ts';
      return rawColourLines(source, kind, rel === MION_CSS_REL).map((n) => `${rel}:${n}: ${lines[n - 1]!.trim().slice(0, 100)}`);
    });
    expect(offenders, "declare the colour as a token in mion.css's :root / :root.dark / :root.light, read it with var()").toEqual(
      []
    );
  });

  it('flags raw colours and literal fallbacks, never token reads', () => {
    for (const source of [
      'a { color: #fff; }',
      'a { box-shadow: 0 0 2px rgba(0, 0, 0, 0.5); }',
      'a { color: hsl(0deg 70% 45%); }',
      'a {\n  color: white;\n}',
      'a { background: linear-gradient(red, var(--x)); }',
      'a { color: var(--ui-text, #fff); }',
    ])
      expect(flagged(source), source).toBe(true);
    expect(flagged("const bg = '#1e1e1e';", 'ts')).toBe(true);
    expect(flagged('<template><path fill="#007acc" /></template>', 'vue')).toBe(true);
    expect(flagged('<style>\na { color: black; }\n</style>', 'vue')).toBe(true);
    // the token layer: a custom property in a root block, never a plain property, another selector or a fallback
    expect(flagged(':root.dark {\n  --x: #fff;\n}', 'css', true)).toBe(false);
    expect(flagged(':root.dark {\n  --x: #fff;\n}')).toBe(true);
    expect(flagged(':root.dark {\n  color: #fff;\n}', 'css', true)).toBe(true);
    expect(flagged(':root.dark header {\n  --x: #fff;\n}', 'css', true)).toBe(true);
    expect(flagged(':root {\n  --x: var(--y, #fff);\n}', 'css', true)).toBe(true);
    for (const source of [
      'a { color: var(--ui-primary); }',
      'a { background: color-mix(in srgb, var(--color-brand-500) 12%, transparent); }',
      'a { color: hsl(var(--site-hue) var(--mion-pastel-s) var(--mion-pastel-l)); }',
      'a { color: hsl(198 var(--mion-pastel-s) var(--mion-pastel-l)); }',
      'a { white-space: nowrap; color: var(--color-red-500); }',
      '/* #fff on white */ a { color: currentColor; }',
      `a { mask-image: url("data:image/svg+xml,<svg stroke='black'/>"); }`,
    ])
      expect(flagged(source), source).toBe(false);
    expect(flagged('<template><p>green = fastest</p></template>', 'vue')).toBe(false);
    expect(flagged("const html = '&#8594;'; // was #fff", 'ts')).toBe(false);
  });
});

describe('website-theme-tokens', () => {
  const THEMES = SITES.map((site) => ({site, file: join(SITES_DIR, site, 'theme.css')}));
  const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
  const COLOUR_TOKENS = ['--site-accent', '--site-gradient-from', '--site-gradient-to', '--site-gradient-mix'];
  const HUE_TOKENS = ['--site-hue', '--site-hue-good'];
  const value = (css: string, name: string): string | undefined => css.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();
  // The body of the first `selector {` … `}` block, comments stripped.
  const block = (css: string, selector: string): string => {
    const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const start = clean.indexOf(`${selector} {`);
    if (start === -1) return '';
    return clean.slice(start, clean.indexOf('}', start));
  };

  it('every subsite carries a theme, and only a theme', () => {
    expect(THEMES.length).toBe(3);
    for (const {site, file} of THEMES) {
      expect(existsSync(file), site).toBe(true);
      expect(readdirSync(join(SITES_DIR, site)), `${site}: sites/<id>/ holds the theme and nothing else`).toEqual(['theme.css']);
    }
  });

  it('fills the full brand ramp and the tokens under its data-site selector', () => {
    for (const {site, file} of THEMES) {
      const css = readFileSync(file, 'utf8');
      const main = block(css, `[data-site='${site}']`);
      expect(main, `${site}: no [data-site='${site}'] block`).not.toBe('');
      for (const shade of SHADES) expect(hex(value(main, `--site-brand-${shade}`) ?? ''), `${site} brand-${shade}`).toBe(true);
      for (const token of COLOUR_TOKENS) expect(hex(value(main, token) ?? ''), `${site} ${token}`).toBe(true);
      for (const token of HUE_TOKENS) expect(value(main, token), `${site} ${token}`).toMatch(/^\d+$/);
      // A theme never declares the Tailwind names itself: the @theme block in mion.css
      // owns them, so a stray --color-brand-N here would shadow it for one subsite only.
      expect(css, `${site}: declares --color-brand-*`).not.toMatch(/--color-brand-\d+:/);
      expect(css, `${site}: has a :root or @theme block`).not.toMatch(/^\s*(:root|@theme)\b/m);
    }
  });

  it('gives the subsites different colours', () => {
    const primaries = THEMES.map(({file}) => value(readFileSync(file, 'utf8'), '--site-brand-500'));
    expect(new Set(primaries).size).toBe(THEMES.length);
  });

  it('declares the one brand palette as references in the Tailwind root, and imports every theme', () => {
    const css = readFileSync(MION_CSS, 'utf8');
    const themeBlocks = [...css.matchAll(/^@theme static \{([^}]*)\}/gm)];
    expect(themeBlocks.length, 'exactly one @theme block').toBe(1);
    const body = themeBlocks[0]![1]!;
    for (const shade of SHADES)
      expect(value(body, `--color-brand-${shade}`), `brand-${shade}`).toBe(`var(--site-brand-${shade})`);
    expect(body, 'no hex in the @theme block').not.toMatch(/#[0-9a-f]{3,8}/i);
    for (const site of SITES) expect(css).toContain(`@import '../../../sites/${site}/theme.css';`);
    expect(css).not.toContain('#site/');
  });

  it('bridges the brand and Nuxt UI variables onto any element carrying data-site', () => {
    const css = readFileSync(MION_CSS, 'utf8');
    const bridge = block(css, '[data-site]');
    expect(bridge, 'no [data-site] bridge block').not.toBe('');
    for (const shade of SHADES) {
      expect(value(bridge, `--color-brand-${shade}`), `bridge brand-${shade}`).toBe(`var(--site-brand-${shade})`);
      expect(value(bridge, `--ui-color-primary-${shade}`), `bridge ui-color-primary-${shade}`).toBe(
        `var(--color-brand-${shade})`
      );
    }
    expect(value(bridge, '--ui-primary')).toBe('var(--ui-color-primary-500)');
    expect(bridge).toContain('--site-title-gradient:');
    expect(css).toMatch(/\.dark \[data-site\],\s*\[data-site\]\.dark \{\s*--ui-primary: var\(--ui-color-primary-400\);/);
  });

  it('points the app config at the brand palette and turns the per-subsite sidebar on', () => {
    const config = readFileSync(join(WEBSITE, 'app/app.config.ts'), 'utf8');
    expect(config).toMatch(/primary:\s*'brand'/);
    expect(config).not.toMatch(/\b(white|black):\s*\{/);
    expect(config, "navigation.sub is what scopes Docus' sidebar to the current subsite").toMatch(
      /navigation:\s*\{\s*sub:\s*'aside'/
    );
  });
});

// The `home` path each subsite declares (app/utils/subsites.ts).
const SUBSITES_SOURCE = readFileSync(join(WEBSITE, 'app/utils/subsites.ts'), 'utf8');
const homeOf = (id: string): string => new RegExp(`id: '${id}',[\\s\\S]*?home: '([^']+)'`).exec(SUBSITES_SOURCE)?.[1] ?? '';
// Every route the content tree produces (Nuxt Content strips the numeric prefixes).
const contentRoutes = new Set(
  walk(CONTENT_DIR, (name) => name.endsWith('.md')).map(
    (rel) =>
      '/' +
      rel
        .replace('container/website/content/', '')
        .split('/')
        .map((segment) => segment.replace(/^\d+\./, '').replace(/\.md$/, ''))
        .filter((segment) => segment !== 'index')
        .join('/')
  )
);

describe('website-subsites', () => {
  it('names the same subsites in the subsite list, the theme dirs, the content tree and the landing pages', () => {
    expect(SUBSITE_IDS).toEqual(['rpc', 'runtypes', 'benchmarks']);
    expect([...SITES].sort()).toEqual([...SUBSITE_IDS].sort());
    const contentDirs = readdirSync(CONTENT_DIR).filter((name) => /^\d\d\./.test(name));
    expect(contentDirs.map((name) => name.replace(/^\d\d\./, ''))).toEqual(SUBSITE_IDS);
    for (const [i, id] of SUBSITE_IDS.entries()) {
      const dir = join(CONTENT_DIR, `0${i + 1}.${id}`);
      // the subsite home is a docs page inside the sidebar (its about page), the root
      // redirects to it, and no landing index.md is left to shadow that redirect
      expect(contentRoutes.has(homeOf(id)), `${id}: home ${homeOf(id)} is a content page`).toBe(true);
      expect(existsSync(join(dir, 'index.md')), `${id}: a landing index.md would shadow the redirect`).toBe(false);
      expect(existsSync(join(dir, '.navigation.yml')), `${id}: navigation title`).toBe(true);
      expect(existsSync(join(WEBSITE, 'app/pages', id, 'index.vue')), `${id}: root route`).toBe(true);
      expect(readFileSync(join(WEBSITE, 'app/pages', id, 'index.vue'), 'utf8'), `${id}: root redirects to its home`).toContain(
        `redirect: '${homeOf(id)}'`
      );
      expect(readFileSync(join(WEBSITE, 'public/_redirects'), 'utf8'), `${id}: static redirect`).toMatch(
        new RegExp(`^/${id}\\s+${homeOf(id)}\\s+301$`, 'm')
      );
    }
    expect(existsSync(join(CONTENT_DIR, 'index.md')), 'the root landing page').toBe(true);
  });

  it('gives every subsite an icon and a one-line intro, and the header switches subsite through that menu', () => {
    // SubsiteMenu is the one subsite switch: a button naming the current subsite in
    // its accent, opening the list. Each entry carries its own data-site so the
    // [data-site] bridge paints it in that subsite's colours; the tabs are gone.
    const subsites = readFileSync(join(WEBSITE, 'app/utils/subsites.ts'), 'utf8');
    for (const id of SUBSITE_IDS) {
      // the trailing comma skips the union in the Subsite interface
      const entry = subsites.slice(subsites.indexOf(`id: '${id}',`));
      const block = entry.slice(0, entry.indexOf('}'));
      expect(block, `${id}: icon`).toMatch(/icon: '[^']+'/);
      expect(block, `${id}: description`).toMatch(/description: '[^']{20,}'/);
    }
    const menu = readFileSync(join(WEBSITE, 'app/components/SubsiteMenu.vue'), 'utf8');
    expect(menu).toContain('<UPopover');
    expect(menu).toContain(':data-site="entry.id"');
    expect(menu).toContain('color: var(--site-accent)');
    const center = readFileSync(join(WEBSITE, 'app/components/app/AppHeaderCenter.vue'), 'utf8');
    expect(center).toContain('<SubsiteMenu />');
    expect(center).not.toContain('UNavigationMenu');
    // beside the logo: nothing; the menu button is the one place that names the subsite
    const logo = readFileSync(join(WEBSITE, 'app/components/content/AppHeaderLogo.vue'), 'utf8');
    expect(logo).not.toContain('site-brand-word');
    expect(logo).not.toContain('useSubsite');
  });

  it('renders the root landing as one block per subsite, no hero, with the live benchmark summary', () => {
    const home = readFileSync(join(CONTENT_DIR, 'index.md'), 'utf8');
    expect(home).not.toContain('u-page-hero');
    for (const id of SUBSITE_IDS) expect(home).toContain(`::div{data-site="${id}" class="home-subsite"}`);
    // One block per subsite, plus the testing block (2026-09), which borrows the
    // runtypes palette because every number on it is a runtypes number today.
    expect(home.match(/class: home-features home-subsite-block/g)?.length).toBe(SUBSITE_IDS.length + 1);
    expect(home, 'the testing block').toContain('to the highest standard');
    expect(home, 'its tiles').toContain(':home-test-tiles');
    // the summary names both datasets, which is what check-static gates for it
    expect(home).toMatch(/:home-bench-table\{servers="[^"]+" validation="[^"]+"\}/);
    const gate = readFileSync(join(REPO_ROOT, 'scripts/website/check-static.mjs'), 'utf8');
    expect(gate).toContain(':home-bench-table');
    expect(gate).toContain("metric: 'validate'");
    // the parallax is CSS alone and respects reduced motion
    const css = readFileSync(MION_CSS, 'utf8');
    expect(css).toMatch(/@supports \(animation-timeline: view\(\)\) \{\s*@media \(prefers-reduced-motion: no-preference\)/);
  });

  it('links every subsite entry to its home page, never to the redirecting root', () => {
    const subsites = readFileSync(join(WEBSITE, 'app/utils/subsites.ts'), 'utf8');
    for (const id of SUBSITE_IDS) expect(homeOf(id), `${id}: home path`).toMatch(new RegExp(`^/${id}/introduction/`));
    expect(readFileSync(join(WEBSITE, 'app/components/SubsiteMenu.vue'), 'utf8')).toContain(':to="entry.home"');
    expect(readFileSync(join(WEBSITE, 'app/components/app/AppHeaderBody.vue'), 'utf8')).toContain('to: entry.home,');
    expect(existsSync(join(WEBSITE, 'app/components/SiteLanding.vue')), 'the landing renderer went with the landing pages').toBe(
      false
    );
  });

  it('ships one logo and one favicon for the whole site', () => {
    expect(existsSync(join(WEBSITE, 'app/components/content/MionLogo.vue'))).toBe(true);
    expect(existsSync(join(WEBSITE, 'public/favicon.ico'))).toBe(true);
    for (const site of SITES) {
      expect(existsSync(join(SITES_DIR, site, 'Logo.vue')), site).toBe(false);
      expect(existsSync(join(SITES_DIR, site, 'public')), site).toBe(false);
    }
  });

  it('pins the docs page override to the installed docus version', () => {
    const page = readFileSync(join(WEBSITE, 'app/pages/[[lang]]/[...slug].vue'), 'utf8');
    const copied = page.match(/copied from docus (\d+\.\d+\.\d+)/)?.[1];
    const deps = JSON.parse(readFileSync(join(WEBSITE, '_deps/package.json'), 'utf8')) as {dependencies: Record<string, string>};
    expect(copied, 'the override names the docus version it was copied from').toBeDefined();
    expect(copied, 'docus was bumped: re-diff app/pages/[[lang]]/[...slug].vue against the new upstream file').toBe(
      deps.dependencies.docus
    );
    // The deliberate changes (listed at the top of the file).
    expect(page).toContain('useHead({ titleTemplate: `%s - ${subsite.value.title}` })');
    expect(page, 'the docs page carries its subsite in its own markup').toContain(':data-site="subsite.id"');
    expect(page, 'a subsite home renders without the page header').toContain('v-if="!isSubsiteHome"');
    expect(page, 'no edit-this-page / report-an-issue footer').not.toContain('docs.edit');
    expect(page, 'no prev/next cards').not.toContain('UContentSurround');
    expect(page, 'no surround query either').not.toContain('queryCollectionItemSurroundings');
  });
});
