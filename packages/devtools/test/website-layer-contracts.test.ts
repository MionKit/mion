// Docs-website layer contracts. container/website is one shared Nuxt layer (site-layers/shared) plus mion.io's
// own layer on top, so a site in another repo can extend the shared one without becoming mion.io. No CI here
// builds such a second site, so these read the files to pin the rules that keep it possible: a layer
// never reaches into the consuming site (Nuxt resolves `~/`, `@/`, `~~/` against the site, not the
// layer) and carries no site identity (Nuxt merges it into every site), the shared layer goes LAST in
// `extends`, and the website scripts take the site from website.config.json and write under it.

import {afterAll, describe, it, expect, vi} from 'vitest';
import {spawnSync} from 'node:child_process';
import {
  cpSync,
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
// @ts-expect-error — a plain .mjs repo script, no types.
import {contextDirs, envArgs, homeTwoslashPaths, mountArgs} from '../../../scripts/website/site.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const WEBSITE = join(REPO_ROOT, 'container/website');
const LAYERS_DIR = join(WEBSITE, 'site-layers');
// The layers any site may extend.
const LAYERS = ['shared'];
// mion.io's own files: only mion.io extends it.
const SITE_LAYER = 'mion-io';
const SITE_LAYER_DIR = join(LAYERS_DIR, SITE_LAYER);

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

// The website's TypeScript needs Nuxt's tsconfig, generated only inside the container, so Vite cannot transform it here.
const SCRATCH = mkdtempSync(join(tmpdir(), 'mion-website-modules-'));
afterAll(() => rmSync(SCRATCH, {recursive: true, force: true}));
async function load<T>(rel: string): Promise<T> {
  const file = join(SCRATCH, `${rel.replace(/[^\w]/g, '_')}.mjs`);
  writeFileSync(file, stripTypeScriptTypes(read(rel)));
  return (await import(/* @vite-ignore */ pathToFileURL(file).href)) as T;
}

describe('website-layers', () => {
  it('holds exactly the shared layer and mion.io own one, each named and with an app/ folder', () => {
    expect(
      readdirSync(LAYERS_DIR)
        .filter((name) => statSync(join(LAYERS_DIR, name)).isDirectory())
        .sort()
    ).toEqual([...LAYERS, SITE_LAYER].sort());
    expect(layerConfig(SITE_LAYER)).toContain(`$meta: { name: '${SITE_LAYER}' }`);
    for (const layer of LAYERS) {
      // `#layers/<name>/` is the import path other layers and sites use
      expect(layerConfig(layer), layer).toContain(`$meta: { name: 'mion-${layer}' }`);
      // Nuxt UI scans each layer's app/ for class names: a layer without one ships unstyled
      expect(existsSync(join(LAYERS_DIR, layer, 'app')), `${layer}/app`).toBe(true);
    }
    // Nuxt extends every `<site>/layers/*` by itself, which would load both for any site
    expect(existsSync(join(WEBSITE, 'layers'))).toBe(false);
  });

  it('never reaches into the consuming site from a layer', () => {
    const files = LAYERS.flatMap((layer) => sources(join(LAYERS_DIR, layer)));
    expect(files.length).toBeGreaterThan(60);
    // mion.io's own layer follows the same rule: it is a layer too
    files.push(...sources(SITE_LAYER_DIR));
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
    for (const rel of [...LAYERS.flatMap((layer) => sources(join(LAYERS_DIR, layer))), ...sources(SITE_LAYER_DIR)]) {
      for (const [, name, path] of read(rel).matchAll(/['"]#layers\/([\w-]+)\/([^'"]+)['"]/g)) {
        const layer = name === SITE_LAYER ? SITE_LAYER : name!.replace(/^mion-/, '');
        expect([...LAYERS, SITE_LAYER], `${rel}: unknown layer ${name}`).toContain(layer);
        const target = join(LAYERS_DIR, layer, path!);
        const found = ['', '.ts', '.js', '.vue'].some((ext) => existsSync(target + ext));
        expect(found, `${rel}: #layers/${name}/${path} is not a file`).toBe(true);
      }
    }
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
    expect(pages).toEqual(['container/website/site-layers/shared/app/pages/[[lang]]/[...slug].vue']);
    const sharedAppConfig = read('container/website/site-layers/shared/app/app.config.ts');
    for (const key of ['github:', 'seo:', 'socials:', 'mion.io']) expect(sharedAppConfig, key).not.toContain(key);
  });

  it('aliases @mionjs/run-types in mion.io own layer only', () => {
    // the alias swaps the package for the WHOLE build of any site that loads the layer
    expect(layerConfig(SITE_LAYER)).toMatch(/alias:\s*\[/);
    for (const rel of ['container/website/nuxt.config.ts', 'container/website/site-layers/shared/nuxt.config.ts'])
      expect(read(rel), rel).not.toContain('alias');
  });

  it('lists the shared layer last in the mion.io site, with Docus pulled in by it alone', () => {
    const site = read('container/website/nuxt.config.ts');
    const list = /extends:\s*\[([^\]]*)\]/.exec(site)?.[1] ?? '';
    const entries = [...list.matchAll(/'([^']+)'/g)].map((match) => match[1]);
    // `./` matters: a bare `site-layers/shared` is read as an npm package name
    expect(entries).toEqual(['./site-layers/mion-io', './site-layers/shared']);
    expect(layerConfig('shared')).toContain("extends: ['docus']");
    expect(layerConfig('shared'), 'the startup guard').toContain('if (orderProblem) throw new Error(orderProblem)');
    expect(layerConfig(SITE_LAYER)).not.toContain('extends:');
  });

  it('refuses a layer order where Docus is not the lowest layer', async () => {
    const {layerOrderProblem} = await load<{layerOrderProblem(dirs: string[]): string | undefined}>(
      'container/website/site-layers/shared/layer-order.ts'
    );
    const docus = '/app/node_modules/.pnpm/docus@5.9.0/node_modules/docus';
    expect(layerOrderProblem(['/app', '/app/site-layers/mion-io', '/app/site-layers/shared', docus])).toBeUndefined();
    expect(layerOrderProblem(['/app', '/app/site-layers/shared', `${docus}/`])).toBeUndefined();
    expect(layerOrderProblem(['/app', '/app/site-layers/shared', docus, '/app/site-layers/mion-io'])).toMatch(
      /must be the LAST entry/
    );
    expect(layerOrderProblem(['/app', '/app/site-layers/shared'])).toMatch(/found no Docus layer/);
  });

  it('reads the content of the consuming site, never the layer', () => {
    const content = read('container/website/site-layers/shared/content.config.ts');
    expect(content).toContain("join(useNuxt().options.rootDir, 'content')");
    expect(existsSync(join(WEBSITE, 'content.config.ts')), 'the site adds no collection of its own').toBe(false);
  });

  it('leaves mion.io only its identity: its own layer, the content and the public files', () => {
    expect(existsSync(join(SITE_LAYER_DIR, 'app/app.config.ts'))).toBe(true);
    expect(sources(join(SITE_LAYER_DIR, 'app/pages'))).toEqual([
      'container/website/site-layers/mion-io/app/pages/runtypes/playground.vue',
    ]);
    // one app folder per layer and none beside them: every source file sits under site-layers/
    for (const shared of ['app', 'server', 'sites', 'scripts', 'public'])
      expect(existsSync(join(WEBSITE, shared)), shared).toBe(false);
    // no shared layer may pull mion.io's own layer in
    for (const layer of LAYERS) expect(layerConfig(layer), layer).not.toContain(SITE_LAYER);
  });
});

interface Subsite {
  id: string;
  path: string;
  external: boolean;
  homeTitle?: string;
  theme?: string;
}
interface SectionEntry {
  id: string;
  label: string;
  title: string;
  url: string;
  icon: string;
  description: string;
  homeTitle?: string;
  theme?: string;
}
interface SubsitesModule {
  menuColumns(
    subsites: Subsite[],
    columns?: {label: string; ids: string[]}[]
  ): {columns: {label?: string; entries: Subsite[]}[]; unknown: string[]};
  resolveSubsites(origin: string, entries: SectionEntry[]): Subsite[];
  subsiteForPath(path: string, subsites: Subsite[]): Subsite | undefined;
  pageWidthClass(path: string, subsites: Subsite[], wide: RegExp[], flush: RegExp[]): string;
  subsiteSidebar(
    navigation: object[] | null | undefined,
    subsite: Subsite | undefined
  ): {title: string; path: string; children?: object[]}[];
}

describe('website-section-links', async () => {
  const {menuColumns, resolveSubsites, subsiteForPath, subsiteSidebar, pageWidthClass} = await load<SubsitesModule>(
    'container/website/site-layers/shared/app/utils/subsites.ts'
  );
  vi.stubGlobal('defineAppConfig', (config: object) => config);
  const mionConfig = (
    await load<{default: {shared: {sections: SectionEntry[]; widePages: string[]; flushPages: string[]}}}>(
      'container/website/site-layers/mion-io/app/app.config.ts'
    )
  ).default.shared;
  vi.unstubAllGlobals();
  const entry = (id: string, url: string, extra: Partial<SectionEntry> = {}): SectionEntry => ({
    id,
    label: id,
    title: id,
    url,
    icon: 'i',
    description: 'd',
    ...extra,
  });
  // Another site lists its whole menu itself: one link to mion.io instead of mion.io's sections.
  const PRO_SECTIONS = [
    entry('pro', 'https://pro.mion.io'),
    entry('mion', 'https://mion.io', {theme: 'rpc'}),
    entry('cloud', '/cloud'),
  ];
  const mionList = (): Subsite[] => resolveSubsites('https://mion.io', mionConfig.sections);
  const byId = (list: Subsite[]): Record<string, Subsite> => Object.fromEntries(list.map((item) => [item.id, item]));

  it("shows mion.io's own entries only, as local links, and no link to the unpublished pro site", () => {
    expect(mionList().map((item) => item.id)).toEqual(['rpc', 'runtypes', 'benchmarks']);
    for (const item of mionList()) expect(item, item.id).toMatchObject({path: `/${item.id}`, external: false});
    expect(JSON.stringify(mionConfig)).not.toContain('pro.mion.io');
  });

  it('builds a site menu from its own list alone, the entries under its address local', () => {
    const pro = resolveSubsites('https://pro.mion.io/', PRO_SECTIONS);
    expect(pro.map((item) => item.id)).toEqual(['pro', 'mion', 'cloud']);
    expect(byId(pro).pro).toMatchObject({path: '/', external: false});
    expect(byId(pro).mion).toMatchObject({path: 'https://mion.io', external: true, theme: 'rpc'});
    expect(byId(pro).cloud).toMatchObject({path: '/cloud', external: false});
    // an external entry never becomes the current section, even one at mion.io's root
    expect(subsiteForPath('/', pro)).toMatchObject({id: 'pro'});
    expect(existsSync(join(REPO_ROOT, 'container/website/site-layers/shared/sites/rpc/theme.css'))).toBe(true);
  });

  it('splits the section menu into the columns a site asks for, in order, and names the ids that match none', () => {
    const all = resolveSubsites('https://pro.mion.io', PRO_SECTIONS);
    expect(menuColumns(all)).toEqual({columns: [{entries: all}], unknown: []});
    const ids = (columns: {entries: Subsite[]}[]) => columns.map((column) => column.entries.map((item) => item.id));
    const split = menuColumns(all, [
      {label: 'mion', ids: ['mion']},
      {label: 'mion pro', ids: ['pro', 'cloud']},
    ]);
    expect(split.columns.map((column) => column.label)).toEqual(['mion', 'mion pro']);
    expect(ids(split.columns)).toEqual([['mion'], ['pro', 'cloud']]);
    expect(split.unknown).toEqual([]);
    const typo = menuColumns(all, [{label: 'a', ids: ['cloud', 'pro', 'enrichmnt']}]);
    expect(ids(typo.columns)).toEqual([['cloud', 'pro']]);
    expect(typo.unknown).toEqual(['enrichmnt']);
  });

  it('never matches a sibling address that only starts the same', () => {
    // https://mion.io must not claim https://mion.io.example/… nor pro.mion.io
    const list = byId(
      resolveSubsites('https://mion.io', [entry('x', 'https://mion.io.example/docs'), entry('pro', 'https://pro.mion.io')])
    );
    expect(list.x).toMatchObject({external: true});
    expect(list.pro).toMatchObject({external: true});
  });

  it('keeps every entry external when the site has no address, and a local path local', () => {
    const list = byId(resolveSubsites('', [entry('rpc', 'https://mion.io/rpc'), entry('cloud', '/cloud')]));
    expect(list.rpc!.external).toBe(true);
    expect(list.cloud).toMatchObject({path: '/cloud', external: false});
  });

  it('reads an entry with a trailing slash as the same section', () => {
    for (const url of ['/cloud/', 'https://pro.mion.io/cloud/']) {
      const pro = resolveSubsites('https://pro.mion.io', [entry('pro', 'https://pro.mion.io'), entry('cloud', url)]);
      expect(subsiteForPath('/cloud/setup', pro), url).toMatchObject({id: 'cloud', path: '/cloud'});
    }
  });

  it('gives mion.io the same page widths as before the layers', () => {
    const width = (path: string): string =>
      pageWidthClass(
        path,
        mionList(),
        mionConfig.widePages.map((source) => new RegExp(source)),
        mionConfig.flushPages.map((source) => new RegExp(source))
      );
    for (const path of ['/rpc', '/runtypes', '/benchmarks', '/runtypes/introduction/quick-start', '/runtypes/guide'])
      expect(width(path), path).toBe('rt-wide-page');
    expect(width('/benchmarks/rpc-server')).toBe('rt-flush-page');
    for (const path of ['/', '/rpc/routes', '/runtypes/playground', '/runtypes/guidelines']) expect(width(path), path).toBe('');
    // another site: its root section's home is wide, a section it links to elsewhere is not
    const pro = resolveSubsites('https://pro.mion.io', [...PRO_SECTIONS, entry('rpc', 'https://mion.io/rpc')]);
    expect(pageWidthClass('/', pro, [], [])).toBe('rt-wide-page');
    expect(pageWidthClass('/rpc', pro, [], [])).toBe('');
  });

  it('picks the longest local section for a route', () => {
    const mion = mionList();
    expect(subsiteForPath('/rpc/routes', mion)?.id).toBe('rpc');
    expect(subsiteForPath('/runtypes', mion)?.id).toBe('runtypes');
    expect(subsiteForPath('/rpcx', mion), 'a prefix that is not a path segment').toBeUndefined();
    expect(subsiteForPath('/', mion), 'the root landing belongs to no section').toBeUndefined();
    const pro = resolveSubsites('https://pro.mion.io', PRO_SECTIONS);
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
    const mion = byId(mionList());
    const rpc = subsiteSidebar(tree, mion.rpc);
    expect(rpc.map((item) => item.title)).toEqual(['Intro']);
    expect((rpc[0]!.children as {title: string; path: string}[])[0]).toEqual({title: mion.rpc!.homeTitle, path: '/rpc'});
    expect(subsiteSidebar(tree, mion.runtypes)).toEqual([]);
    expect(subsiteSidebar(tree, undefined)).toEqual([]);
    const pro = byId(resolveSubsites('https://pro.mion.io', PRO_SECTIONS));
    expect(subsiteSidebar(tree, pro.pro)).toBe(tree);
    // a section with no home title keeps its sections as they are
    const {homeTitle: _dropped, ...plainRpc} = mion.rpc!;
    expect(subsiteSidebar(tree, plainRpc)).toBe(tree[0]!.children);
  });
});

interface RepoRootModule {
  resolveInRoots(repoRoot: string, roots: string[], relPath: string): string;
  pathInsideRoot(repoRoot: string, roots: string[], relPath: string): string | undefined;
  resolveImportableDoc(repoRoot: string, docs: Record<string, string>, name: string): string;
  loadExampleTool(siteRoot: string): {repoRoot: string; packages: object[]; exampleDirs: string[]; readRoots: string[]};
}

describe('website-example-paths', async () => {
  const {resolveInRoots, pathInsideRoot, resolveImportableDoc, loadExampleTool} = await load<RepoRootModule>(
    'container/website/site-layers/shared/server/utils/repo-root.ts'
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
    expect(pathInsideRoot(repo, ['packages/private-examples/src'], 'packages/private-examples/src/rpc/a.ts')).toBe('rpc/a.ts');
    expect(pathInsideRoot(repo, ['packages/private-examples/src'], 'packages/core/a.ts')).toBeUndefined();
  });

  it('inlines only a document named in the list', () => {
    expect(resolveImportableDoc(repo, {spec: 'docs/spec.md'}, 'spec')).toBe(join(repo, 'docs/spec.md'));
    expect(() => resolveImportableDoc(repo, {spec: 'docs/spec.md'}, '../.env')).toThrow(/Unknown document/);
  });

  it('gives a site without a config file an empty tool', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mion-site-'));
    try {
      vi.stubEnv('MION_REPO_ROOT', undefined);
      expect(loadExampleTool(dir)).toMatchObject({repoRoot: dir, packages: [], exampleDirs: [], readRoots: []});
      // the config file the scripts mount at the site root, and the repo mount they name
      writeFileSync(
        join(dir, 'website.config.json'),
        JSON.stringify({examples: {exampleDirs: ['examples'], readRoots: ['src']}})
      );
      expect(loadExampleTool(dir)).toMatchObject({repoRoot: dir, exampleDirs: ['examples'], readRoots: ['src'], packages: []});
      vi.stubEnv('MION_REPO_ROOT', '/repo-context');
      expect(loadExampleTool(dir).repoRoot).toBe(resolve('/repo-context'));
    } finally {
      vi.unstubAllEnvs();
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
      // the layers are always the ones of the checkout the scripts live in
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

  it('refuses a config file it cannot read as written', () => {
    const repo = mkdtempSync(join(tmpdir(), 'other-repo-'));
    try {
      const config = join(repo, 'website.config.json');
      writeFileSync(config, '{"site": ');
      expect(() => loadSite({}, repo)).toThrow(/website\.config\.json: not valid JSON/);
      writeFileSync(config, JSON.stringify({examples: {exampleDirs: 'examples'}}));
      expect(() => loadSite({}, repo)).toThrow(/examples\.exampleDirs must be a list/);
    } finally {
      rmSync(repo, {recursive: true, force: true});
    }
  });

  it('mounts only the folders the config names, outermost only', () => {
    const examples = {
      readRoots: ['packages', 'packages-x'],
      exampleDirs: ['packages/examples/src'],
      packages: [{dir: 'packages/core', name: 'core'}],
      importableDocs: {spec: 'docs/specs/spec.md', readme: 'README.md'},
    };
    // a folder inside a listed one rides its mount, a sibling that only starts the same does not
    expect(contextDirs(examples)).toEqual(['packages', 'packages-x', 'docs/specs']);
  });

  it('gives mion.io both of its layers, writable, in one mount', () => {
    const site = loadSite({}, REPO_ROOT);
    const cfg = {
      site,
      repoContext: REPO_ROOT,
      mountOpts: '',
      docdataDir: join(REPO_ROOT, '.docdata'),
      volNuxt: 'n',
      volData: 'd',
      volCache: 'c',
    };
    expect(site.siteLayers).toEqual([]);
    const layerMounts = (mountArgs(cfg) as string[]).filter((arg) => arg.includes(':/app/site-layers'));
    expect(layerMounts).toEqual([`${site.layersDir}:/app/site-layers`]);
    expect(envArgs(cfg)).toContain('MION_WEBSITE_LAYERS=/app/site-layers');
  });

  it("refuses another repo site layer named like one of mion's", () => {
    for (const name of ['shared', 'mion-io']) {
      const repo = realpathSync(mkdtempSync(join(tmpdir(), 'other-repo-')));
      try {
        mkdirSync(join(repo, 'docs-site/site-layers', name), {recursive: true});
        writeFileSync(join(repo, 'website.config.json'), JSON.stringify({site: 'docs-site'}));
        expect(() => loadSite({}, repo)).toThrow(
          `site layer '${join(repo, 'docs-site/site-layers', name)}' uses the name of a mion layer`
        );
      } finally {
        rmSync(repo, {recursive: true, force: true});
      }
    }
  });

  it("gives another repo site its own layers beside mion's shared one (read-only), its own folders and no mion folder", () => {
    const repo = realpathSync(mkdtempSync(join(tmpdir(), 'other-repo-')));
    try {
      for (const dir of [
        'docs-site/content',
        'docs-site/site-layers/pro',
        'docs-site/site-layers/extra',
        'examples',
        'docs',
        'data/bench',
      ]) {
        mkdirSync(join(repo, dir), {recursive: true});
      }
      // a loose file under site-layers/ is not a layer
      writeFileSync(join(repo, 'docs-site/site-layers/README.md'), '# layers');
      writeFileSync(join(repo, 'docs/spec.md'), '# spec');
      writeFileSync(join(repo, 'docs-site/content/index.md'), '  path: examples/a.ts\n  path: elsewhere/b.ts\n');
      const config = {site: 'docs-site', examples: {exampleDirs: ['examples'], importableDocs: {spec: 'docs/spec.md'}}};
      writeFileSync(join(repo, 'website.config.json'), JSON.stringify(config));
      const site = loadSite({}, repo);
      const cfg = {
        site,
        repoContext: repo,
        mountOpts: '',
        docdataDir: join(repo, '.docdata'),
        volNuxt: 'n',
        volData: 'd',
        volCache: 'c',
      };
      const mounts = (mountArgs(cfg) as string[]).filter((arg) => arg !== '-v');
      expect(mounts).toEqual([
        `${join(repo, 'docs-site/content')}:/app/content`,
        `${join(repo, 'website.config.json')}:/app/website.config.json:ro`,
        `${join(site.layersDir, 'shared')}:/app/site-layers/shared:ro`,
        `${join(repo, 'docs-site/site-layers/extra')}:/app/site-layers/extra`,
        `${join(repo, 'docs-site/site-layers/pro')}:/app/site-layers/pro`,
        `${join(repo, 'examples')}:/repo-context/examples:ro`,
        `${join(repo, 'docs')}:/repo-context/docs:ro`,
        'n:/app/.nuxt',
        'd:/app/.data',
        'c:/app/node_modules/.cache',
      ]);
      expect(existsSync(join(repo, '.docdata')), 'no stray folder in the other repo').toBe(false);
      // the path a site's nuxt.config.ts can extend mion's shared layer through
      expect(envArgs(cfg)).toContain('MION_WEBSITE_LAYERS=/app/site-layers');
      expect((envArgs(cfg) as string[]).join(' ')).not.toContain('MION_WEBSITE_BENCH_DATA');
      // bench data is opt-in
      writeFileSync(join(repo, 'website.config.json'), JSON.stringify({...config, benchData: 'data/bench'}));
      const withBench = {...cfg, site: loadSite({}, repo)};
      expect(mountArgs(withBench)).toContain(`${join(repo, 'data/bench')}:/bench-data:ro`);
      expect(envArgs(withBench)).toContain('MION_WEBSITE_BENCH_DATA=/bench-data');
      // the docs check renders only the examples from the site's own example folders
      expect(homeTwoslashPaths(site)).toEqual(['examples/a.ts']);
    } finally {
      rmSync(repo, {recursive: true, force: true});
    }
  });

  it("loads the website commands from another repo's mion submodule, which has no node_modules", () => {
    // Another repo runs these through third_party/mion with no install: a third-party import at load time breaks it.
    const repo = realpathSync(mkdtempSync(join(tmpdir(), 'other-repo-')));
    try {
      cpSync(join(REPO_ROOT, 'scripts'), join(repo, 'third_party/mion/scripts'), {recursive: true});
      writeFileSync(join(repo, 'website.config.json'), JSON.stringify({site: 'site'}));
      const modules = ['site.mjs', 'build.mjs', 'check-static.mjs', 'serve.mjs'];
      const code = modules.map((m) => `await import('./third_party/mion/scripts/website/${m}');`).join('\n');
      const res = spawnSync(process.execPath, ['--input-type=module', '-e', code], {cwd: repo, encoding: 'utf8'});
      expect(res.stderr).toBe('');
      expect(res.status).toBe(0);
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
      expect(code, rel).not.toMatch(
        /['"`]container\/website(\/(?!site-layers\/mion-io\/scripts\/build-playground)[^'"`]*)?['"`]/
      );
      // mion.io's public files live in its layer, the site folder has no public/.
      expect(code, rel).not.toMatch(/siteDir,\s*['"`]public/);
    }
  });
});
