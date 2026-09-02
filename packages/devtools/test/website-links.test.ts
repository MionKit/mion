// Docs-website link contracts. The site became ONE site with three subsites (/rpc,
// /runtypes, /benchmarks) by moving two content trees under prefixes, which turned
// every root-relative link into a candidate 404. The website is containerized, so
// nothing in this repo's CI renders it; this test resolves every in-site link against
// the content tree instead:
//
//   - every root-relative link in content/**/*.md and .navigation.yml lands on a
//     content page, a subsite root, the playground, or a public asset;
//   - no in-site link goes through a domain (runtypes.pages.dev is redirect-only now,
//     and an absolute mion.pages.dev link would silently skip the client router);
//   - every in-site redirect target in public/_redirects resolves the same way, and
//     the legacy runtypes.pages.dev redirects all point at mion.pages.dev.

import {describe, it, expect} from 'vitest';
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join, posix, resolve} from 'node:path';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const WEBSITE = join(REPO_ROOT, 'container/website');
const CONTENT_DIR = join(WEBSITE, 'content');
const PUBLIC_DIR = join(WEBSITE, 'public');

// Nuxt Content drops the numeric prefix from every path segment and maps a dir's
// index.md onto the dir itself.
const routeSegment = (name: string): string => name.replace(/^\d+\./, '').replace(/\.md$/, '');

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
        routes.add(`/${segments.join('/')}`);
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
      '/benchmarks/runtypes/validation',
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

  it('keeps every in-site link relative (no pages.dev domain in the content tree)', () => {
    const offenders: string[] = [];
    const visit = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) visit(full);
        else if (
          name.endsWith('.md') &&
          /https?:\/\/(runtypes|mion)\.pages\.dev(?!\/runtypes\/schema\/)/.test(readFileSync(full, 'utf8'))
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

  it('sends every old mion.pages.dev path to a page that exists', () => {
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

  it('sends every old runtypes.pages.dev path to mion.pages.dev/runtypes or /benchmarks/runtypes', () => {
    const legacy = rules(join(WEBSITE, 'legacy-runtypes/_redirects'));
    expect(legacy.length).toBeGreaterThan(3);
    for (const {from, to, status} of legacy) {
      expect(to, from).toMatch(/^https:\/\/mion\.pages\.dev\/(runtypes|benchmarks\/runtypes)(\/|$)/);
      expect(status, from).toBe('301');
    }
    expect(legacy[legacy.length - 1]!.from, 'the catch-all comes last').toBe('/*');
    expect(existsSync(join(WEBSITE, 'legacy-runtypes/index.html'))).toBe(true);
  });
});
