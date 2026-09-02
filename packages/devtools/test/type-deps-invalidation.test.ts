// End-to-end cover for the stale-rewrite fix, against the REAL resolver binary.
//
// The bug: a marker's compiled fn is injected when the USING module is
// transformed. The type it reflects lives in another file, imported as a type —
// which is erased, so the bundler has no edge from the user to the type file.
// Editing the type invalidates nothing, and the host keeps serving a validator
// for the OLD shape. It does not error; it accepts data the current type
// rejects, which is the failure mode most likely to be blamed on something else.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {UnpluginContextMeta} from 'unplugin';
import {unplugin} from '../src/core/unplugin.ts';
import {BIN, hasBinary} from './helpers/inline.ts';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const MARKER_PKG = path.resolve(REPO_ROOT, 'packages/run-types');

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "strict": true, "skipLibCheck": true, "noEmit": true
  },
  "include": ["src"]
}
`;

// uses.ts reflects a type from models.ts through a TYPE-ONLY import (erased).
// unrelated.ts reflects a type from its own file, so a models.ts edit must not
// touch it — that is what separates this from the coarse "invalidate
// everything" fallback.
function writeProject(root: string): void {
  fs.mkdirSync(path.join(root, 'src'), {recursive: true});
  fs.writeFileSync(path.join(root, 'tsconfig.json'), TSCONFIG);
  fs.writeFileSync(path.join(root, 'src/models.ts'), `export interface Signup { email: string; age: number }\n`);
  fs.writeFileSync(
    path.join(root, 'src/uses.ts'),
    `import {getRunTypeId} from '@mionjs/run-types';
import type {Signup} from './models';
export const staticId = getRunTypeId<Signup>();
`
  );
  fs.writeFileSync(
    path.join(root, 'src/unrelated.ts'),
    `import {getRunTypeId} from '@mionjs/run-types';
interface Local { flag: boolean }
export const staticId = getRunTypeId<Local>();
`
  );
  const scope = path.join(root, 'node_modules/@mionjs');
  fs.mkdirSync(scope, {recursive: true});
  fs.symlinkSync(MARKER_PKG, path.join(scope, 'run-types'), 'dir');
}

interface Plugin {
  buildStart?: (this: unknown) => Promise<void>;
  buildEnd?: (this: unknown) => void;
  transform?: (this: unknown, code: string, id: string) => Promise<{code?: string} | null>;
  rtHotUpdate?: (ctx: unknown, updates: {file: string; content?: string}[]) => Promise<string[]>;
}

/** The injected cache-module binding a rewrite passes into the call site. */
function injectedId(code: string | undefined): string {
  const match = /__rt_(\w+)/.exec(code ?? '');
  if (!match) throw new Error(`no injected binding in:\n${code}`);
  return match[1];
}

describe('@mionjs/devtools / type-dependency invalidation', () => {
  const register = hasBinary() ? it : it.skip;

  register(
    'reports the declaring file, re-injects on a type edit, and leaves unrelated files alone',
    async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-type-deps-'));
      writeProject(root);
      const reported: string[][] = [];

      const raw = unplugin.raw(
        {
          binary: BIN,
          cwd: root,
          tsconfig: 'tsconfig.json',
          genDir: '__runtypes',
          detachResolver: true,
          onSiteFilesChanged: (siteFiles) => reported.push(siteFiles),
        },
        {framework: 'webpack', versions: {}} as UnpluginContextMeta
      );
      const plugin = (Array.isArray(raw) ? raw[0] : raw) as Plugin;

      // The bundler edges the plugin declares, captured through unplugin's
      // universal `addWatchFile` — the one call that serves webpack, rspack,
      // rollup, rolldown, esbuild, bun and vite's build watcher alike.
      const watched: string[] = [];
      const ctx = {
        warn: () => {},
        error: (message: unknown) => {
          throw new Error(String(message));
        },
        addWatchFile: (file: string) => watched.push(file),
      };

      const uses = path.join(root, 'src/uses.ts');
      const unrelated = path.join(root, 'src/unrelated.ts');
      const models = path.join(root, 'src/models.ts');

      try {
        await plugin.buildStart?.call(ctx);

        const firstUses = await plugin.transform?.call(ctx, fs.readFileSync(uses, 'utf8'), uses);
        const firstId = injectedId(firstUses?.code);

        // models.ts is declared as a dependency even though the import that
        // named it was erased — this is the edge no bundler can see.
        expect(watched.map((file) => path.basename(file))).toContain('models.ts');

        watched.length = 0;
        const firstUnrelated = await plugin.transform?.call(ctx, fs.readFileSync(unrelated, 'utf8'), unrelated);
        const firstUnrelatedId = injectedId(firstUnrelated?.code);
        // A type declared in the reflecting file itself: no cross-file edge.
        expect(watched.map((file) => path.basename(file))).not.toContain('models.ts');

        // Add a required property. The fn id is content-addressed on the type's
        // structure, so the demanded module changes — and uses.ts, which nothing
        // links to models.ts, is what must be re-transformed.
        const edited = fs.readFileSync(models, 'utf8').replace('age: number', 'age: number; country: string');
        fs.writeFileSync(models, edited);
        const stale = await plugin.rtHotUpdate?.(ctx, [{file: models, content: edited}]);

        expect(stale?.map((file) => path.basename(file))).toContain('uses.ts');
        expect(stale?.map((file) => path.basename(file))).not.toContain('unrelated.ts');

        // Reported to the host too. A host whose site files are VIRTUAL (mion
        // registers a Vue SFC's <script> as `Comp.vue.ts` while Vite serves
        // `Comp.vue`) can only map them back itself, so the set is reported and
        // not merely acted on.
        expect(reported.length).toBe(1);
        expect(reported[0].map((file) => path.basename(file))).toContain('uses.ts');

        // The acceptance bar: re-transforming without touching uses.ts yields a
        // DIFFERENT id, and its generated module checks the new property.
        const secondUses = await plugin.transform?.call(ctx, fs.readFileSync(uses, 'utf8'), uses);
        const secondId = injectedId(secondUses?.code);
        expect(secondId).not.toBe(firstId);

        const generated = fs
          .readdirSync(path.join(root, '__runtypes/types'))
          .filter((name) => name.endsWith('.js'))
          .map((name) => fs.readFileSync(path.join(root, '__runtypes/types', name), 'utf8'))
          .join('\n');
        expect(generated).toContain('country');

        // An unrelated file's rewrite is untouched by a type edit it does not
        // depend on — precision, not just correctness.
        const secondUnrelated = await plugin.transform?.call(ctx, fs.readFileSync(unrelated, 'utf8'), unrelated);
        expect(injectedId(secondUnrelated?.code)).toBe(firstUnrelatedId);
      } finally {
        plugin.buildEnd?.call(ctx);
        fs.rmSync(root, {recursive: true, force: true});
      }
    },
    120_000
  );

  register(
    'an ambient .d.ts type is declared as a dependency',
    async () => {
      // The case the Next adapter's invariant 7 was proven on: a type with no
      // import edge at ALL, so nothing but the resolver can report it.
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-type-deps-ambient-'));
      fs.mkdirSync(path.join(root, 'src'), {recursive: true});
      fs.writeFileSync(path.join(root, 'tsconfig.json'), TSCONFIG);
      fs.writeFileSync(path.join(root, 'src/ambient.d.ts'), `declare interface Ambient { id: number }\n`);
      fs.writeFileSync(
        path.join(root, 'src/uses.ts'),
        `import {getRunTypeId} from '@mionjs/run-types';
export const staticId = getRunTypeId<Ambient>();
`
      );
      const scope = path.join(root, 'node_modules/@mionjs');
      fs.mkdirSync(scope, {recursive: true});
      fs.symlinkSync(MARKER_PKG, path.join(scope, 'run-types'), 'dir');

      const raw = unplugin.raw({binary: BIN, cwd: root, tsconfig: 'tsconfig.json', genDir: '__runtypes', detachResolver: true}, {
        framework: 'webpack',
        versions: {},
      } as UnpluginContextMeta);
      const plugin = (Array.isArray(raw) ? raw[0] : raw) as Plugin;
      const watched: string[] = [];
      const ctx = {
        warn: () => {},
        error: (message: unknown) => {
          throw new Error(String(message));
        },
        addWatchFile: (file: string) => watched.push(file),
      };

      try {
        await plugin.buildStart?.call(ctx);
        const uses = path.join(root, 'src/uses.ts');
        await plugin.transform?.call(ctx, fs.readFileSync(uses, 'utf8'), uses);
        expect(watched.map((file) => path.basename(file))).toContain('ambient.d.ts');
      } finally {
        plugin.buildEnd?.call(ctx);
        fs.rmSync(root, {recursive: true, force: true});
      }
    },
    120_000
  );

  register(
    'never declares a virtual source as a bundler dependency',
    async () => {
      // A host may register a source that exists NOWHERE on disk — mion hands the
      // resolver a Vue SFC's <script> as `Comp.vue.ts`. A type declared inside that
      // script is reported as a dep on the virtual path, and Vite's dev-mode
      // addWatchFile records whatever it is given as an extra IMPORT of the module
      // being transformed. Declaring one fails the request outright:
      //   Failed to resolve import "/abs/Comp.vue.ts" from "Comp.vue". Does the file exist?
      // Watching a path that cannot change on disk buys nothing, so it is filtered.
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-type-deps-virtual-'));
      fs.mkdirSync(path.join(root, 'src'), {recursive: true});
      fs.writeFileSync(path.join(root, 'tsconfig.json'), TSCONFIG);
      // A real in-program site, so the resolver has something to scan first.
      fs.writeFileSync(
        path.join(root, 'src/seed.ts'),
        `import {getRunTypeId} from '@mionjs/run-types';\nexport const seed = getRunTypeId<{seeded: boolean}>();\n`
      );
      const scope = path.join(root, 'node_modules/@mionjs');
      fs.mkdirSync(scope, {recursive: true});
      fs.symlinkSync(MARKER_PKG, path.join(scope, 'run-types'), 'dir');

      const raw = unplugin.raw({binary: BIN, cwd: root, tsconfig: 'tsconfig.json', genDir: '__runtypes', detachResolver: true}, {
        framework: 'webpack',
        versions: {},
      } as UnpluginContextMeta);
      const plugin = (Array.isArray(raw) ? raw[0] : raw) as Plugin;
      const watched: string[] = [];
      const ctx = {
        warn: () => {},
        error: (message: unknown) => {
          throw new Error(String(message));
        },
        addWatchFile: (file: string) => watched.push(file),
      };

      // The virtual script: registered under a path with no file behind it, and
      // declaring the very type its own marker call reflects.
      const virtualPath = path.join(root, 'src/Comp.vue.ts');
      const script = `import {getRunTypeId} from '@mionjs/run-types';
interface Local { inVirtual: string }
export const staticId = getRunTypeId<Local>();
`;

      try {
        await plugin.buildStart?.call(ctx);
        await plugin.rtHotUpdate?.(ctx, [{file: virtualPath, content: script}]);
        const result = await plugin.transform?.call(ctx, script, virtualPath);
        expect(result?.code).toContain('__rt_');
        // The dep on the virtual path itself must NOT reach the bundler.
        expect(watched).not.toContain(virtualPath);
        for (const file of watched) expect(fs.existsSync(file)).toBe(true);
      } finally {
        plugin.buildEnd?.call(ctx);
        fs.rmSync(root, {recursive: true, force: true});
      }
    },
    120_000
  );
});
