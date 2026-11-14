// Docs-website layer contracts. container/website is three Nuxt layers (site-layers/shell, parts,
// playground) plus mion.io's own identity on top, so a site in another repo can extend the layers
// and get every component, style and server route without becoming mion.io. Nothing in this
// repo's CI builds such a second site, so these pin the rules that keep it possible by reading
// the files:
//
//   - A layer never reaches into the consuming site: no `~/`, `@/`, `~~/` path, which Nuxt
//     resolves against the site that extends the layer, not the layer.
//   - A layer carries no site identity: no name, address, prerender route, redirect or routed
//     page besides the docs catch-all. Nuxt merges those into every site that extends it.
//   - The shell goes LAST in `extends`, so Docus stays the lowest layer.
//   - The website scripts take the site from website.config.json and write under that site.

import {afterAll, describe, it, expect} from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {dirname, join, posix, resolve} from 'node:path';
// @ts-expect-error — a plain .mjs repo script, no types.
import {loadSite, outputDir, publicRoot} from '../../../scripts/website/site-config.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const WEBSITE = join(REPO_ROOT, 'container/website');
const LAYERS_DIR = join(WEBSITE, 'site-layers');
const LAYERS = ['shell', 'parts', 'playground'];

// Hand-written source files of a tree, as repo-relative posix paths.
function sources(dir: string): string[] {
  const out: string[] = [];
  const visit = (current: string): void => {
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) {
        // generated: the vendored dist, the staged playground bundle, the Go-emitted catalog
        if (!['.vendor', 'playground-app', 'go-generated', 'node_modules', '.nuxt'].includes(name)) visit(full);
      } else if (/\.(vue|ts|mts|mjs|js|css)$/.test(name)) out.push(posix.relative(REPO_ROOT, full.split('\\').join('/')));
    }
  };
  visit(dir);
  return out;
}

const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), 'utf8');
const layerConfig = (layer: string): string => read(`container/website/site-layers/${layer}/nuxt.config.ts`);

// The website's TypeScript runs under Nuxt's tsconfig, generated only inside the container, so
// Vite cannot transform these files here. Their types are stripped and the plain module is loaded.
const SCRATCH = mkdtempSync(join(tmpdir(), 'mion-website-modules-'));
afterAll(() => rmSync(SCRATCH, {recursive: true, force: true}));
async function load<T>(rel: string): Promise<T> {
  const file = join(SCRATCH, `${rel.replace(/[^\w]/g, '_')}.mjs`);
  writeFileSync(file, stripTypeScriptTypes(read(rel)));
  return (await import(/* @vite-ignore */ pathToFileURL(file).href)) as T;
}

describe('website-layers', () => {
  it('holds exactly the three layers, each named and with an app/ folder', () => {
    expect(
      readdirSync(LAYERS_DIR)
        .filter((name) => statSync(join(LAYERS_DIR, name)).isDirectory())
        .sort()
    ).toEqual([...LAYERS].sort());
    for (const layer of LAYERS) {
      // `#layers/<name>/` is the import path other layers and sites use
      expect(layerConfig(layer), layer).toContain(`$meta: { name: 'mion-${layer}' }`);
      // Nuxt UI scans each layer's app/ for class names: a layer without one ships unstyled
      expect(existsSync(join(LAYERS_DIR, layer, 'app')), `${layer}/app`).toBe(true);
    }
    // Nuxt extends every `<site>/layers/*` by itself, which would load all three for any site
    expect(existsSync(join(WEBSITE, 'layers'))).toBe(false);
  });

  it('never reaches into the consuming site from a layer', () => {
    const files = LAYERS.flatMap((layer) => sources(join(LAYERS_DIR, layer)));
    expect(files.length).toBeGreaterThan(60);
    const offenders: string[] = [];
    for (const rel of files) {
      read(rel)
        .split('\n')
        .forEach((line, i) => {
          if (/(['"`(]|url\()(~~?|@)\//.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 100)}`);
        });
    }
    expect(offenders, 'use a relative path or #layers/mion-<layer>/…').toEqual([]);
  });

  it('imports across layers through the #layers alias of a layer that exists', () => {
    const used = new Set<string>();
    for (const rel of [...LAYERS.flatMap((layer) => sources(join(LAYERS_DIR, layer))), ...sources(join(WEBSITE, 'app'))]) {
      for (const [, name, path] of read(rel).matchAll(/['"]#layers\/([\w-]+)\/([^'"]+)['"]/g)) {
        used.add(name!);
        const layer = name!.replace(/^mion-/, '');
        expect(LAYERS, `${rel}: unknown layer ${name}`).toContain(layer);
        const target = join(LAYERS_DIR, layer, path!);
        const found = ['', '.ts', '.js', '.vue'].some((ext) => existsSync(target + ext));
        expect(found, `${rel}: #layers/${name}/${path} is not a file`).toBe(true);
      }
    }
    expect([...used]).toContain('mion-shell');
  });

  it('keeps site identity out of every layer', () => {
    for (const layer of LAYERS) {
      const config = layerConfig(layer).replace(/\/\/.*$/gm, '');
      expect(config, `${layer}: site name / address`).not.toMatch(/^\s*site:\s*\{/m);
      expect(config, `${layer}: prerender routes`).not.toContain('prerender');
      expect(config, `${layer}: an address`).not.toMatch(/https?:\/\//);
      expect(existsSync(join(LAYERS_DIR, layer, 'content')), `${layer}: content/`).toBe(false);
      expect(existsSync(join(LAYERS_DIR, layer, 'public/_redirects')), `${layer}: _redirects`).toBe(false);
      expect(existsSync(join(LAYERS_DIR, layer, 'public/bench-data')), `${layer}: bench-data`).toBe(false);
    }
    // A page in a layer is a route on every site that extends it. The one page is the docs catch-all.
    const pages = LAYERS.flatMap((layer) => {
      const dir = join(LAYERS_DIR, layer, 'app/pages');
      return existsSync(dir) ? sources(dir) : [];
    });
    expect(pages).toEqual(['container/website/site-layers/shell/app/pages/[[lang]]/[...slug].vue']);
    const shellAppConfig = read('container/website/site-layers/shell/app/app.config.ts');
    for (const key of ['github:', 'seo:', 'socials:', 'mion.io']) expect(shellAppConfig, key).not.toContain(key);
  });

  it('aliases @mionjs/run-types in the playground layer only', () => {
    expect(layerConfig('playground')).toMatch(/alias:\s*\[/);
    for (const rel of [
      'container/website/nuxt.config.ts',
      ...['shell', 'parts'].map((layer) => `container/website/site-layers/${layer}/nuxt.config.ts`),
    ])
      expect(read(rel), rel).not.toContain('alias');
  });

  it('lists the shell last in the mion.io site, with Docus pulled in by the shell alone', () => {
    const site = read('container/website/nuxt.config.ts');
    const list = /extends:\s*\[([^\]]*)\]/.exec(site)?.[1] ?? '';
    const entries = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    // `./` matters: a bare `site-layers/shell` is read as an npm package name
    expect(entries).toEqual(['./site-layers/parts', './site-layers/playground', './site-layers/shell']);
    expect(layerConfig('shell')).toContain("extends: ['docus']");
    expect(layerConfig('shell'), 'the startup guard').toContain('mion-shell must be the LAST entry of');
    for (const layer of ['parts', 'playground']) expect(layerConfig(layer), layer).not.toContain('extends');
  });

  it('reads the content of the consuming site, never the layer', () => {
    const content = read('container/website/site-layers/shell/content.config.ts');
    expect(content).toContain("join(useNuxt().options.rootDir, 'content')");
    expect(existsSync(join(WEBSITE, 'content.config.ts')), 'the site adds no collection of its own').toBe(false);
  });

  it('leaves mion.io only its identity: one page, the content and the public files', () => {
    expect(sources(join(WEBSITE, 'app'))).toEqual([
      'container/website/app/app.config.ts',
      'container/website/app/pages/runtypes/playground.vue',
    ]);
    for (const gone of ['server', 'sites', 'content.config.ts']) expect(existsSync(join(WEBSITE, gone)), gone).toBe(false);
  });
});

interface Subsite {
  id: string;
  path: string;
  external: boolean;
  homeTitle?: string;
}
interface SubsitesModule {
  SUBSITES: {id: string; url: string}[];
  resolveSubsites(origin: string, extra?: object[]): Subsite[];
  subsiteForPath(path: string, subsites: Subsite[]): Subsite | undefined;
  subsiteSidebar(
    navigation: object[] | null | undefined,
    subsite: Subsite | undefined
  ): {title: string; path: string; children?: object[]}[];
}

describe('website-section-links', async () => {
  const {resolveSubsites, subsiteForPath, subsiteSidebar} = await load<SubsitesModule>(
    'container/website/site-layers/shell/app/utils/subsites.ts'
  );
  const byId = (list: Subsite[]): Record<string, Subsite> => Object.fromEntries(list.map((entry) => [entry.id, entry]));

  it('turns the entries under the site address into local links, the rest into full links', () => {
    const mion = byId(resolveSubsites('https://mion.io'));
    expect(mion.rpc).toMatchObject({path: '/rpc', external: false});
    expect(mion.benchmarks).toMatchObject({path: '/benchmarks', external: false});
    expect(mion.pro).toMatchObject({path: 'https://pro.mion.io', external: true});
    const pro = byId(resolveSubsites('https://pro.mion.io/'));
    expect(pro.pro).toMatchObject({path: '/', external: false});
    expect(pro.rpc).toMatchObject({path: 'https://mion.io/rpc', external: true});
  });

  it('never matches a sibling address that only starts the same', () => {
    // https://mion.io must not claim https://mion.io.evil/… nor pro.mion.io
    const entry = {id: 'x', label: 'X', title: 'X', url: 'https://mion.io.example/docs', icon: 'i', description: 'd'};
    expect(byId(resolveSubsites('https://mion.io', [entry])).x).toMatchObject({external: true});
  });

  it('keeps every entry external when the site has no address, and a local path local', () => {
    const local = {id: 'cloud', label: 'Cloud', title: 'Cloud', url: '/cloud', icon: 'i', description: 'd'};
    const list = byId(resolveSubsites('', [local]));
    expect(list.rpc!.external).toBe(true);
    expect(list.cloud).toMatchObject({path: '/cloud', external: false});
  });

  it('picks the longest local section for a route', () => {
    const mion = resolveSubsites('https://mion.io');
    expect(subsiteForPath('/rpc/routes', mion)?.id).toBe('rpc');
    expect(subsiteForPath('/runtypes', mion)?.id).toBe('runtypes');
    expect(subsiteForPath('/rpcx', mion), 'a prefix that is not a path segment').toBeUndefined();
    expect(subsiteForPath('/', mion), 'the root landing belongs to no section').toBeUndefined();
    const local = {id: 'cloud', label: 'Cloud', title: 'Cloud', url: '/cloud', icon: 'i', description: 'd'};
    const pro = resolveSubsites('https://pro.mion.io', [local]);
    expect(subsiteForPath('/anything', pro)?.id).toBe('pro');
    expect(subsiteForPath('/cloud/setup', pro)?.id).toBe('cloud');
  });

  it('builds the sidebar of a section, and hands a root section the whole tree', () => {
    const tree = [
      {
        title: 'RPC',
        path: '/rpc',
        children: [{title: 'Intro', path: '/rpc/intro', children: [{title: 'Start', path: '/rpc/intro/start'}]}],
      },
      {title: 'RunTypes', path: '/runtypes', children: []},
    ];
    const mion = byId(resolveSubsites('https://mion.io'));
    const rpc = subsiteSidebar(tree, mion.rpc);
    expect(rpc.map((item) => item.title)).toEqual(['Intro']);
    expect((rpc[0]!.children as {title: string; path: string}[])[0]).toEqual({title: mion.rpc!.homeTitle, path: '/rpc'});
    expect(subsiteSidebar(tree, mion.runtypes)).toEqual([]);
    expect(subsiteSidebar(tree, undefined)).toEqual([]);
    const pro = byId(resolveSubsites('https://pro.mion.io'));
    expect(subsiteSidebar(tree, pro.pro)).toBe(tree);
  });
});

interface RepoRootModule {
  resolveInRoots(repoRoot: string, roots: string[], relPath: string): string;
  splitByRoot(repoRoot: string, roots: string[], relPath: string): {root: string; inside: string} | undefined;
  resolveImportableDoc(repoRoot: string, docs: Record<string, string>, name: string): string;
  loadExampleTool(siteRoot: string): {repoRoot: string; packages: object[]; exampleDirs: string[]; readRoots: string[]};
}

describe('website-example-paths', async () => {
  const {resolveInRoots, splitByRoot, resolveImportableDoc, loadExampleTool} = await load<RepoRootModule>(
    'container/website/site-layers/shell/server/utils/repo-root.ts'
  );
  const repo = resolve('/repo');

  it('resolves a path inside a listed folder', () => {
    expect(resolveInRoots(repo, ['packages'], 'packages/core/src/a.ts')).toBe(join(repo, 'packages/core/src/a.ts'));
    expect(resolveInRoots(repo, ['docs', 'examples/src'], 'examples/src/a.ts')).toBe(join(repo, 'examples/src/a.ts'));
  });

  it('refuses everything outside the listed folders', () => {
    for (const path of [
      'packages/../.env',
      '../outside/a.ts',
      '/etc/passwd',
      '.env',
      // a sibling folder that only starts with the same letters
      'packages-private/a.ts',
      'examples/a.ts',
    ])
      expect(() => resolveInRoots(repo, ['packages', 'examples/src'], path), path).toThrow(/not allowed/);
    expect(() => resolveInRoots(repo, [], 'packages/a.ts'), 'no folder listed').toThrow(/not allowed/);
  });

  it('splits a path by the listed folder it sits in', () => {
    expect(splitByRoot(repo, ['packages/private-examples/src'], 'packages/private-examples/src/rpc/a.ts')).toEqual({
      root: 'packages/private-examples/src',
      inside: 'rpc/a.ts',
    });
    expect(splitByRoot(repo, ['packages/private-examples/src'], 'packages/core/a.ts')).toBeUndefined();
  });

  it('inlines only a document named in the list', () => {
    expect(resolveImportableDoc(repo, {spec: 'docs/spec.md'}, 'spec')).toBe(join(repo, 'docs/spec.md'));
    expect(() => resolveImportableDoc(repo, {spec: 'docs/spec.md'}, '../.env')).toThrow(/Unknown document/);
  });

  it('gives a site without a config file an empty tool', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mion-site-'));
    try {
      const saved = process.env.MION_REPO_ROOT;
      delete process.env.MION_REPO_ROOT;
      const tool = loadExampleTool(dir);
      if (saved !== undefined) process.env.MION_REPO_ROOT = saved;
      expect(tool).toMatchObject({packages: [], exampleDirs: [], readRoots: []});
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });
});

describe('website-site-config', () => {
  const MION_SITE = realpathSync(WEBSITE);

  it("runs mion.io from this checkout's own config file", () => {
    const site = loadSite({}, REPO_ROOT);
    expect(site.configPath).toBe(join(REPO_ROOT, 'website.config.json'));
    expect(realpathSync(site.siteDir)).toBe(MION_SITE);
    expect(site.isMion).toBe(true);
    expect(site.containerBase).toBe('tsrt-website');
    expect(realpathSync(site.layersDir)).toBe(join(MION_SITE, 'site-layers'));
    expect(site.benchData).toBe('');
    // a working directory with no config file above it falls back to the same site
    expect(loadSite({}, tmpdir()).configPath).toBe(join(REPO_ROOT, 'website.config.json'));
  });

  it('runs another repo site from its config file, with every output under that site', () => {
    const repo = realpathSync(mkdtempSync(join(tmpdir(), 'other-repo-')));
    try {
      mkdirSync(join(repo, 'docs-site/content'), {recursive: true});
      writeFileSync(
        join(repo, 'website.config.json'),
        JSON.stringify({
          site: 'docs-site',
          benchData: 'data/bench',
          examples: {exampleDirs: ['examples'], readRoots: ['examples']},
        })
      );
      const site = loadSite({}, join(repo, 'docs-site/content'));
      expect(site.configPath).toBe(join(repo, 'website.config.json'));
      expect(site.siteDir).toBe(join(repo, 'docs-site'));
      expect(site.repoContext).toBe(repo);
      expect(site.isMion).toBe(false);
      expect(site.containerBase).toMatch(/^other-repo-.*-website$/);
      expect(site.benchData).toBe(join(repo, 'data/bench'));
      expect(site.examples).toEqual({
        packages: [],
        exampleDirs: ['examples'],
        readRoots: ['examples'],
        externalDeps: [],
        importableDocs: {},
      });
      // the layers stay mion's unless the config names another folder
      expect(realpathSync(site.layersDir)).toBe(join(MION_SITE, 'site-layers'));
      expect(outputDir(site)).toBe(join(repo, 'docs-site/.output'));
      expect(publicRoot(site)).toBe(join(repo, 'docs-site/.output/public'));
      // the two overrides that already existed still win
      const overridden = loadSite({MION_WEBSITE_CONTAINER: 'mine', MION_WEBSITE_REPO_CONTEXT: tmpdir()}, repo);
      expect(overridden.containerBase).toBe('mine');
      expect(overridden.repoContext).toBe(resolve(tmpdir()));
    } finally {
      rmSync(repo, {recursive: true, force: true});
    }
  });

  it('keeps the site folder out of the website scripts', () => {
    // One source for the folder: a second literal would build mion.io when asked for another site.
    for (const rel of [
      'scripts/website/site.mjs',
      'scripts/website/build.mjs',
      'scripts/website/serve.mjs',
      'scripts/website/check-static.mjs',
    ]) {
      const code = read(rel).replace(/\/\/.*$/gm, '');
      expect(code, rel).not.toMatch(/['"`]container\/website(\/(?!scripts\/build-playground)[^'"`]*)?['"`]/);
    }
  });
});
