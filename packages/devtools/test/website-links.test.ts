// Nothing in CI renders the containerized site, so this resolves every in-site link against the
// content tree: a broken link or '#anchor' fails silently in the browser, and an absolute
// in-site link (mion.io, or the old pages.dev hosts) skips the client router.

import {describe, it, expect} from 'vitest';
import {existsSync, globSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join, posix, resolve} from 'node:path';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const WEBSITE = join(REPO_ROOT, 'container/website');
const CONTENT_DIR = join(WEBSITE, 'content');
const PUBLIC_DIR = join(WEBSITE, 'public');

// Nuxt Content drops the numeric prefix from every path segment and maps a dir's
// index.md onto the dir itself.
const routeSegment = (name: string): string => name.replace(/^\d+\./, '').replace(/\.md$/, '');
// A page's frontmatter `path:` overrides the address its file name gives it (the subsite homes).
const pathOverride = (file: string): string | undefined =>
  /^---\n[\s\S]*?^path: (\S+)$[\s\S]*?\n---/m.exec(readFileSync(file, 'utf8'))?.[1];

/** Every route the content tree produces, plus the app routes outside it. */
function siteRoutes(): Set<string> {
  const routes = new Set<string>(['/', '/runtypes/playground']);
  const visit = (dir: string, prefix: string[]): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        routes.add(`/${[...prefix, routeSegment(name)].join('/')}`);
        visit(full, [...prefix, routeSegment(name)]);
      } else if (name.endsWith('.md')) {
        const segments = name === 'index.md' ? prefix : [...prefix, routeSegment(name)];
        routes.add(pathOverride(full) ?? `/${segments.join('/')}`);
      }
    }
  };
  visit(CONTENT_DIR, []);
  return routes;
}

/** Every file the site serves as-is from public/ (fonts, banners, pictures). */
const publicAsset = (path: string): boolean => existsSync(join(PUBLIC_DIR, path));

// Root-relative links in markdown, MDC props and yaml: `](/x)`, `to="/x"`, `to: /x`,
// `redirect: /x`, `href="/x"`, `{to="/x"`. Anchors and query strings are dropped.
const LINK = /(?:\]\(|to="|to: |redirect: |href=")(\/[^\s)"'#?]*)/g;
// Relative markdown links (`](./x)`, `](../x)`). The browser resolves them against the
// page URL, which has NO trailing slash, so from a landing page (`/rpc`) `./x` lands on
// `/x`: a link that read fine before the move and 404s after it.
const RELATIVE_LINK = /\]\((\.\.?\/[^\s)"'#?]*)/g;

interface Link {
  file: string;
  line: number;
  target: string;
}

/** The route of a content file, the way the browser sees it (no trailing slash). */
function routeOfFile(rel: string): string {
  const override = rel.endsWith('.md') ? pathOverride(join(REPO_ROOT, rel)) : undefined;
  if (override) return override;
  const segments = rel
    .replace(/^container\/website\/content\//, '')
    .split('/')
    .map(routeSegment);
  if (segments[segments.length - 1] === 'index') segments.pop();
  return `/${segments.join('/')}`;
}

function contentLinks(): Link[] {
  const links: Link[] = [];
  const visit = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        visit(full);
        continue;
      }
      if (!name.endsWith('.md') && name !== '.navigation.yml') continue;
      const rel = posix.relative(REPO_ROOT, full.split('\\').join('/'));
      readFileSync(full, 'utf8')
        .split('\n')
        .forEach((text, i) => {
          for (const match of text.matchAll(LINK)) links.push({file: rel, line: i + 1, target: match[1]!});
          for (const match of text.matchAll(RELATIVE_LINK)) {
            const resolved = new URL(match[1]!, `http://site${routeOfFile(rel)}`).pathname;
            links.push({file: rel, line: i + 1, target: resolved});
          }
        });
    }
  };
  visit(CONTENT_DIR);
  return links;
}

const withoutTrailingSlash = (path: string): string => (path.length > 1 ? path.replace(/\/$/, '') : path);

describe('website-internal-links', () => {
  const routes = siteRoutes();
  const links = contentLinks();

  it('finds the routes and links it claims to check', () => {
    for (const route of [
      '/',
      '/rpc',
      '/runtypes',
      '/benchmarks',
      '/rpc/server/routes',
      '/runtypes/guide/validation',
      '/benchmarks/rpc/hello-world',
      '/benchmarks/runtypes/is-valid',
    ]) {
      expect(routes.has(route), route).toBe(true);
    }
    expect(links.length).toBeGreaterThan(100);
  });

  it('resolves every root-relative link to a page or a public asset', () => {
    const broken = links
      .filter(({target}) => !routes.has(withoutTrailingSlash(target)) && !publicAsset(target))
      // The generated benchmark data is git-ignored, so its files cannot be checked here.
      .filter(({target}) => !target.startsWith('/bench-data/'))
      .map(({file, line, target}) => `${file}:${line} -> ${target}`);
    expect(broken).toEqual([]);
  });

  it('keeps every in-site link relative (no site domain in the content tree)', () => {
    const offenders: string[] = [];
    const visit = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) visit(full);
        else if (
          name.endsWith('.md') &&
          /https?:\/\/(runtypes\.pages\.dev|mion\.pages\.dev|mion\.io)(?!\/runtypes\/schema\/)/.test(readFileSync(full, 'utf8'))
        ) {
          offenders.push(posix.relative(REPO_ROOT, full.split('\\').join('/')));
        }
      }
    };
    visit(CONTENT_DIR);
    expect(offenders).toEqual([]);
  });

  it('prefixes every content link with its subsite', () => {
    // A link into the content tree must start with a subsite root: a bare
    // `/guide/...` is the pre-move form and would 404.
    const unprefixed = links
      .filter(
        ({target}) =>
          !/^\/(rpc|runtypes|benchmarks)(\/|$)/.test(target) &&
          target !== '/' &&
          !publicAsset(target) &&
          !target.startsWith('/bench-data/')
      )
      .map(({file, line, target}) => `${file}:${line} -> ${target}`);
    expect(unprefixed).toEqual([]);
  });
});

// Anchor links: `](/page#x)`, `](#x)`, `to="/page#x"`, `href="#x"`. An empty path is the
// page the link sits on. External URLs are left alone, only in-site targets are resolved.
const ANCHOR_LINK = /(?:\]\(|to="|href=")((?!https?:)[^\s)"']*#[^\s)"']+)/g;

// Headings are indexed with a leading-space tolerance: inside an MDC component the
// markdown is indented by its nesting, and those headings still get an id.
const HEADING = /^\s*#{1,6}\s+(.*)$/;

/** The id Nuxt Content gives a heading, slugged from its rendered text. */
function headingSlug(text: string): string {
  return text
    .replace(/`/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\{[^}]*\}/g, '$1')
    .replace(/\*\*|\*|__|_/g, '')
    .replace(/<[^>]*>/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-');
}

/** Every heading id each page of the site publishes, keyed by the page's route. */
function pageHeadings(): Map<string, Set<string>> {
  const headings = new Map<string, Set<string>>();
  const visit = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        visit(full);
        continue;
      }
      if (!name.endsWith('.md')) continue;
      const slugs = new Set<string>();
      let inFence = false;
      for (const line of readFileSync(full, 'utf8').split('\n')) {
        // A '#' inside a fenced block is a comment or a shell prompt, never a heading.
        if (/^\s*```/.test(line)) inFence = !inFence;
        else if (!inFence) {
          const heading = HEADING.exec(line);
          if (heading) slugs.add(headingSlug(heading[1]!));
        }
      }
      headings.set(routeOfFile(posix.relative(REPO_ROOT, full.split('\\').join('/'))), slugs);
    }
  };
  visit(CONTENT_DIR);
  return headings;
}

function anchorLinks(): Link[] {
  const links: Link[] = [];
  const visit = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        visit(full);
        continue;
      }
      if (!name.endsWith('.md') && name !== '.navigation.yml') continue;
      const rel = posix.relative(REPO_ROOT, full.split('\\').join('/'));
      readFileSync(full, 'utf8')
        .split('\n')
        .forEach((text, i) => {
          for (const match of text.matchAll(ANCHOR_LINK)) links.push({file: rel, line: i + 1, target: match[1]!});
        });
    }
  };
  visit(CONTENT_DIR);
  return links;
}

describe('website-anchor-links', () => {
  const headings = pageHeadings();
  const links = anchorLinks();

  it('finds the headings and anchor links it claims to check', () => {
    expect(headings.get('/rpc/server/routes')?.has('request-size')).toBe(true);
    // A heading nested inside an MDC component, its words in an MDC span, still publishes its plain-text id.
    expect(headings.get('/rpc')?.has('rpc-like')).toBe(true);
    expect(links.length).toBeGreaterThan(20);
    expect(links.some(({target}) => target.startsWith('#'))).toBe(true);
  });

  it('lands every anchor link on a heading that exists', () => {
    const broken = links
      .map(({file, line, target}) => {
        const [path, anchor] = target.split('#') as [string, string];
        const route = path === '' ? routeOfFile(file) : withoutTrailingSlash(path);
        const slugs = headings.get(route);
        if (!slugs) return `${file}:${line} -> ${target} (no such page: ${route})`;
        if (!slugs.has(anchor)) return `${file}:${line} -> ${target} (no heading '#${anchor}' on ${route})`;
        return undefined;
      })
      .filter((entry) => entry !== undefined);
    expect(broken).toEqual([]);
  });
});

describe('website-redirects', () => {
  const rules = (file: string): Array<{from: string; to: string; status: string}> =>
    readFileSync(file, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const [from, to, status] = line.split(/\s+/);
        return {from: from!, to: to!, status: status ?? ''};
      });
  const routes = siteRoutes();

  it('sends every old path to a page that exists', () => {
    const broken = rules(join(PUBLIC_DIR, '_redirects'))
      .filter(({to}) => !to.includes(':splat'))
      .filter(({to}) => !routes.has(to))
      .map(({from, to}) => `${from} -> ${to}`);
    expect(broken).toEqual([]);
    // A splat rule must land under a subsite root that exists.
    for (const {to} of rules(join(PUBLIC_DIR, '_redirects')).filter(({to}) => to.includes(':splat'))) {
      const root = to.replace(/\/:splat$/, '');
      expect(routes.has(root), `${to}: '${root}' is not a section of the site`).toBe(true);
    }
  });

  // Pages applies redirects BEFORE static files, so a rule whose source covers a file in
  // public/ hides that file: the old `/platforms/*` page redirect once sent every platform
  // logo to a 404 under /rpc/platforms/.
  it('never redirects a file the site serves from public/', () => {
    const sources = rules(join(PUBLIC_DIR, '_redirects')).map(({from}) => from);
    const covers = (from: string, path: string): boolean =>
      from.endsWith('/*') ? path.startsWith(from.slice(0, -1)) : path === from;
    const assets = globSync('**/*', {cwd: PUBLIC_DIR, withFileTypes: true})
      .filter((entry) => entry.isFile())
      .map(
        (entry) =>
          `/${posix.relative(PUBLIC_DIR.split('\\').join('/'), join(entry.parentPath, entry.name).split('\\').join('/'))}`
      );
    expect(assets.length).toBeGreaterThan(10);
    const hidden = assets.flatMap((path) => sources.filter((from) => covers(from, path)).map((from) => `${path} (by ${from})`));
    expect(hidden).toEqual([]);
  });

  // A chain (old -> moved -> final) costs every visitor and crawler an extra hop: each rule
  // must land on a final page. Pages applies the FIRST matching rule, so a splat whose
  // landing spot was itself redirected needs an explicit rule above it.
  it('lands every old path on its final page in one hop', () => {
    const all = rules(join(PUBLIC_DIR, '_redirects'));
    const isSplat = (from: string): boolean => from.endsWith('/*');
    const sources = new Set(all.filter(({from}) => !isSplat(from)).map(({from}) => from));
    const chained = all.filter(({to}) => sources.has(to)).map(({from, to}) => `${from} -> ${to}`);
    for (const [index, {from, to}] of all.entries()) {
      if (!isSplat(from) || !to.endsWith('/:splat')) continue;
      const [fromRoot, toRoot] = [from.slice(0, -2), to.slice(0, -'/:splat'.length)];
      for (const source of sources) {
        if (!source.startsWith(`${toRoot}/`)) continue;
        const old = fromRoot + source.slice(toRoot.length);
        if (!all.slice(0, index).some((rule) => rule.from === old)) chained.push(`${old} -> ${source} (via ${from})`);
      }
    }
    expect(chained).toEqual([]);
  });
});

// A CSS-only commit skips the website build on a pull request, so a broken relative @import must fail here.
describe('website-css-imports', () => {
  it('resolves every relative @import in the site CSS to a file', () => {
    const cssFiles = globSync(['app/**/*.css', 'sites/**/*.css'], {cwd: WEBSITE}).map((rel) => join(WEBSITE, rel));
    const broken: string[] = [];
    let relativeImports = 0;
    for (const file of cssFiles) {
      for (const [, target] of readFileSync(file, 'utf8').matchAll(/@import\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
        relativeImports++;
        if (!existsSync(resolve(dirname(file), target!))) broken.push(`${file.slice(WEBSITE.length + 1)} -> ${target}`);
      }
    }
    expect(cssFiles.length).toBeGreaterThan(1);
    expect(relativeImports).toBeGreaterThan(0);
    expect(broken).toEqual([]);
  });
});
