// Plugin-driven enrichment sync (Section 2) — the analog of enrich-hmr-e2e, but
// driven THROUGH the bundler plugin's own Vite hooks instead of the CLI.
//
// enrich-hmr-e2e proves the CLI `enrich --update` reconcile converges and never
// loses authored data; the Go CLI≡daemon parity test proves the daemon computes
// byte-identical mirrors. This test proves the last link: the plugin's opt-in
// `enrich` option actually DRIVES that daemon op from dev/watch and writes the
// mirrors to disk, that it suppresses HMR for the write-only output tree, and
// that every family toggles independently while everything defaults OFF.
//
// It runs a real temp project (tsconfig + ambient marker overlay + a marker call
// that demands a named type) against the real binary, instantiates the Vite
// plugin, and calls configResolved → buildStart → handleHotUpdate exactly as Vite
// would. The demanded-type → source-file mapping is the daemon's: with an empty
// TypeName it enriches every EXPORTED type each file declares that a marker call
// actually demanded, so the plugin never needs a decl-file field it cannot get.
import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import runtypesVite from '../src/vite.ts';
import {BIN, hasBinary, RUNTYPES_DTS} from './helpers/inline.ts';

type FieldType = 'string' | 'number' | 'boolean';
interface Field {
  key: string;
  type: FieldType;
}

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'bundler',
    strict: true,
    skipLibCheck: true,
    types: [],
  },
  include: ['src', 'rt-overlay.d.ts'],
});

// A plugin "context" — buildStart / handleHotUpdate call ctx.warn / ctx.error via
// surfaceDiagnostics. warn is a noop; error throws so a genuine build halt surfaces
// as a test failure rather than passing silently.
const ctx = {
  warn(): void {},
  error(message: string): never {
    throw new Error(message);
  },
};

interface Project {
  dir: string;
  models: string;
  main: string;
  genDir: string;
  friendlyMirror: string;
  mockMirror: string;
}

function renderModels(fields: Field[], typeName = 'User'): string {
  const body = fields.map((field) => `  ${field.key}: ${field.type};`).join('\n');
  return `export interface ${typeName} {\n${body}\n}\n`;
}

// The marker call is what makes the named type DEMANDED — without it the daemon's
// demand-scoped sync emits nothing (undemanded types get no mirror).
function renderMain(typeName = 'User'): string {
  return `import {getRunTypeId} from '@ts-runtypes/core';\nimport type {${typeName}} from './models';\nexport const id = getRunTypeId<${typeName}>();\n`;
}

function setupProject(fields: Field[], typeName = 'User'): Project {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-plugin-sync-'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), TSCONFIG);
  fs.writeFileSync(path.join(dir, 'rt-overlay.d.ts'), RUNTYPES_DTS);
  const models = path.join(dir, 'src', 'models.ts');
  const main = path.join(dir, 'src', 'main.ts');
  fs.writeFileSync(models, renderModels(fields, typeName));
  fs.writeFileSync(main, renderMain(typeName));
  const genDir = path.join(dir, 'generated');
  return {
    dir,
    models,
    main,
    genDir,
    friendlyMirror: path.join(genDir, 'enriched', 'friendly', 'src', 'models.ts'),
    mockMirror: path.join(genDir, 'enriched', 'mock', 'src', 'models.ts'),
  };
}

interface PluginOptionsLite {
  enrich?: {
    friendly?: boolean;
    mock?: boolean;
    i18n?: {sourceLocale?: string; locales?: string[]; strict?: boolean};
    suppressHmr?: boolean;
  };
}

// makePlugin instantiates the Vite plugin over the project. unplugin merges the
// `vite:` escape-hatch hooks onto the top-level plugin (Object.assign), so
// configResolved / handleHotUpdate are callable directly alongside buildStart.
function makePlugin(project: Project, options: PluginOptionsLite) {
  const produced = runtypesVite({
    binary: BIN,
    cwd: project.dir,
    tsconfig: 'tsconfig.json',
    genDir: project.genDir,
    ...options,
  });
  const plugin = (
    Array.isArray(produced) ? produced.find((entry: any) => entry?.name === '@ts-runtypes/devtools') : produced
  ) as any;
  if (!plugin) throw new Error('vite plugin not produced');
  return plugin;
}

// driveBuild runs configResolved + buildStart under a given Vite command. 'serve'
// (default) is the write lane (dev/watch); 'build' is the read-only drift gate.
async function driveBuild(plugin: any, project: Project, command: 'serve' | 'build' = 'serve'): Promise<void> {
  await plugin.configResolved.call(ctx, {root: project.dir, command});
  await plugin.buildStart.call(ctx);
}

// driveBuildStart runs the whole-program initial sync under a simulated `vite serve`.
async function driveBuildStart(plugin: any, project: Project): Promise<void> {
  await driveBuild(plugin, project, 'serve');
}

// hotUpdate drives one handleHotUpdate over a changed file, returning whatever the
// hook returns (an array — possibly [] to suppress reloads — or undefined).
async function hotUpdate(plugin: any, file: string): Promise<unknown> {
  return plugin.handleHotUpdate.call(ctx, {
    file,
    read: () => fs.readFileSync(file, 'utf8'),
  });
}

const activeProjects: Project[] = [];
function track(project: Project): Project {
  activeProjects.push(project);
  return project;
}
async function teardown(plugin: any): Promise<void> {
  try {
    await plugin.buildEnd.call(ctx);
  } catch {
    // best-effort — the child may already be gone
  }
}

afterEach(() => {
  while (activeProjects.length > 0) {
    const project = activeProjects.pop()!;
    fs.rmSync(project.dir, {recursive: true, force: true});
  }
});

const describeIfBinary = hasBinary() ? describe : describe.skip;

describeIfBinary('@ts-runtypes/devtools / plugin-driven enrichment sync', () => {
  it('buildStart scaffolds the friendly + mock mirrors for a demanded type', async () => {
    const project = track(
      setupProject([
        {key: 'name', type: 'string'},
        {key: 'age', type: 'number'},
      ])
    );
    const plugin = makePlugin(project, {enrich: {friendly: true, mock: true}});
    try {
      await driveBuildStart(plugin, project);

      expect(fs.existsSync(project.friendlyMirror), 'friendly mirror scaffolded').toBe(true);
      expect(fs.existsSync(project.mockMirror), 'mock mirror scaffolded').toBe(true);
      const friendly = fs.readFileSync(project.friendlyMirror, 'utf8');
      expect(friendly, 'friendly const emitted').toContain('friendlyUser');
      expect(friendly, 'FriendlyText annotation emitted').toContain('FriendlyText<User>');
      expect(friendly, 'scaffolded label blank present').toContain("rt$label: ''");
      expect(fs.readFileSync(project.mockMirror, 'utf8'), 'mock const emitted').toContain('mockUser');
    } finally {
      await teardown(plugin);
    }
  }, 60_000);

  it('keeps mirrors in sync across edits — value-preserving and convergent', async () => {
    const project = track(
      setupProject([
        {key: 'name', type: 'string'},
        {key: 'age', type: 'number'},
      ])
    );
    const plugin = makePlugin(project, {enrich: {friendly: true, mock: true}});
    try {
      await driveBuildStart(plugin, project);

      // Author a value on the friendly root label — it must survive every edit.
      let friendly = fs.readFileSync(project.friendlyMirror, 'utf8');
      fs.writeFileSync(project.friendlyMirror, friendly.replace("rt$label: ''", "rt$label: 'AUTH_ROOT'"));

      // A run of consecutive source edits, each driven through handleHotUpdate.
      const sequence: Field[][] = [
        [
          {key: 'name', type: 'string'},
          {key: 'age', type: 'number'},
          {key: 'email', type: 'string'},
        ],
        [
          {key: 'fullName', type: 'string'},
          {key: 'age', type: 'number'},
          {key: 'email', type: 'string'},
        ],
        [
          {key: 'fullName', type: 'string'},
          {key: 'age', type: 'boolean'},
          {key: 'email', type: 'string'},
        ],
      ];
      for (const fields of sequence) {
        const written = renderModels(fields);
        fs.writeFileSync(project.models, written);
        await hotUpdate(plugin, project.models);
        // One-directional: the reconcile never writes the source.
        expect(fs.readFileSync(project.models, 'utf8'), 'source untouched by sync').toBe(written);
        // No data loss: the authored value is still live in the friendly mirror.
        friendly = fs.readFileSync(project.friendlyMirror, 'utf8');
        expect(friendly, 'authored value preserved').toContain('AUTH_ROOT');
      }
      // The newest field made it into the mirror (mirror tracked the type change).
      expect(friendly, 'new field synced into mirror').toContain('email');

      // Convergence: a further sync with no source change is a byte-identical
      // no-op across BOTH mirrors (write-only-on-change; the files have stabilised).
      const before = fs.readFileSync(project.friendlyMirror, 'utf8') + fs.readFileSync(project.mockMirror, 'utf8');
      await hotUpdate(plugin, project.models);
      const after = fs.readFileSync(project.friendlyMirror, 'utf8') + fs.readFileSync(project.mockMirror, 'utf8');
      expect(after, 'mirrors converge (no churn)').toBe(before);
    } finally {
      await teardown(plugin);
    }
  }, 60_000);

  it('suppresses HMR for changes under enriched/** (auto-suppressed when a family is on)', async () => {
    const project = track(setupProject([{key: 'name', type: 'string'}]));
    const plugin = makePlugin(project, {enrich: {friendly: true, mock: true}});
    try {
      await driveBuildStart(plugin, project);

      // A change under <genDir>/enriched/** is a write-only output — the hook
      // returns [] (no modules), so Vite reloads nothing.
      const suppressed = await hotUpdate(plugin, project.friendlyMirror);
      expect(Array.isArray(suppressed), 'enriched change returns a module list').toBe(true);
      expect(suppressed as unknown[], 'enriched change triggers NO HMR').toEqual([]);
    } finally {
      await teardown(plugin);
    }
  }, 60_000);

  it('suppressHmr:false restores reloads for the enriched tree while auto-gen stays on', async () => {
    const project = track(setupProject([{key: 'name', type: 'string'}]));
    const plugin = makePlugin(project, {enrich: {friendly: true, suppressHmr: false}});
    try {
      await driveBuildStart(plugin, project);
      // With suppression explicitly off, an enriched-tree change is NOT
      // short-circuited: the hook falls through to default HMR (returns undefined).
      const result = await hotUpdate(plugin, project.friendlyMirror);
      expect(result, 'suppression disabled — not short-circuited to []').toBeUndefined();
    } finally {
      await teardown(plugin);
    }
  }, 60_000);

  it('each family toggles independently; everything defaults OFF', async () => {
    // friendly only.
    const friendlyOnly = track(setupProject([{key: 'name', type: 'string'}]));
    const pluginFriendly = makePlugin(friendlyOnly, {enrich: {friendly: true}});
    try {
      await driveBuildStart(pluginFriendly, friendlyOnly);
      expect(fs.existsSync(friendlyOnly.friendlyMirror), 'friendly on → friendly mirror').toBe(true);
      expect(fs.existsSync(friendlyOnly.mockMirror), 'friendly on → NO mock mirror').toBe(false);
    } finally {
      await teardown(pluginFriendly);
    }

    // mock only.
    const mockOnly = track(setupProject([{key: 'name', type: 'string'}]));
    const pluginMock = makePlugin(mockOnly, {enrich: {mock: true}});
    try {
      await driveBuildStart(pluginMock, mockOnly);
      expect(fs.existsSync(mockOnly.mockMirror), 'mock on → mock mirror').toBe(true);
      expect(fs.existsSync(mockOnly.friendlyMirror), 'mock on → NO friendly mirror').toBe(false);
    } finally {
      await teardown(pluginMock);
    }

    // default OFF: no enrich option → NO family mirrors are ever written. (The
    // `enriched/README.md` VCS-hygiene stub `generate` always drops is unrelated
    // to auto-sync; the family subtrees only appear when a family is enabled.)
    const off = track(setupProject([{key: 'name', type: 'string'}]));
    const pluginOff = makePlugin(off, {});
    try {
      await driveBuildStart(pluginOff, off);
      expect(fs.existsSync(off.friendlyMirror), 'no enrich option → no friendly mirror').toBe(false);
      expect(fs.existsSync(off.mockMirror), 'no enrich option → no mock mirror').toBe(false);
      expect(fs.existsSync(path.join(off.genDir, 'enriched', 'friendly')), 'no friendly family subtree').toBe(false);
      expect(fs.existsSync(path.join(off.genDir, 'enriched', 'mock')), 'no mock family subtree').toBe(false);
    } finally {
      await teardown(pluginOff);
    }
  }, 120_000);

  it('an i18n object scaffolds per-locale translation mirrors (scaffold + sync only)', async () => {
    const project = track(
      setupProject([
        {key: 'name', type: 'string'},
        {key: 'age', type: 'number'},
      ])
    );
    const plugin = makePlugin(project, {enrich: {friendly: true, i18n: {sourceLocale: 'en', locales: ['es', 'pl']}}});
    try {
      await driveBuildStart(plugin, project);
      const esMirror = path.join(project.genDir, 'enriched', 'i18n', 'es', 'src', 'models.ts');
      const plMirror = path.join(project.genDir, 'enriched', 'i18n', 'pl', 'src', 'models.ts');
      expect(fs.existsSync(esMirror), 'es translation mirror scaffolded').toBe(true);
      expect(fs.existsSync(plMirror), 'pl translation mirror scaffolded').toBe(true);
      // Locale-prefixed const, and only scaffold blanks (never translated content).
      const es = fs.readFileSync(esMirror, 'utf8');
      expect(es, 'locale-prefixed const').toContain('es_friendlyUser');
      expect(es, 'untranslated leaves stay blank (no LLM)').toContain("rt$label: ''");
    } finally {
      await teardown(plugin);
    }
  }, 60_000);

  it('a production build runs a READ-ONLY drift gate — never writes, fails on stale/missing mirrors', async () => {
    const project = track(
      setupProject([
        {key: 'name', type: 'string'},
        {key: 'age', type: 'number'},
      ])
    );
    const plugin = makePlugin(project, {enrich: {friendly: true, mock: true}});
    try {
      // No committed mirrors on disk yet → every desired mirror is "missing" →
      // the gate fails the build (failOnError defaults true) and writes NOTHING.
      await expect(driveBuild(plugin, project, 'build')).rejects.toThrow(/out of date or missing/);
      expect(fs.existsSync(project.friendlyMirror), 'drift gate must NOT write during a build').toBe(false);
      expect(fs.existsSync(project.mockMirror), 'drift gate must NOT write during a build').toBe(false);
    } finally {
      await teardown(plugin);
    }
  }, 60_000);

  it('a production build with in-sync mirrors passes the drift gate', async () => {
    const project = track(
      setupProject([
        {key: 'name', type: 'string'},
        {key: 'age', type: 'number'},
      ])
    );
    // First, a dev pass writes the mirrors so they are in sync on disk.
    const dev = makePlugin(project, {enrich: {friendly: true, mock: true}});
    try {
      await driveBuildStart(dev, project);
      expect(fs.existsSync(project.friendlyMirror)).toBe(true);
    } finally {
      await teardown(dev);
    }
    // Now a production build finds them in sync → the gate passes (no throw).
    const build = makePlugin(project, {enrich: {friendly: true, mock: true}});
    try {
      await expect(driveBuild(build, project, 'build')).resolves.toBeUndefined();
    } finally {
      await teardown(build);
    }
  }, 60_000);
});
