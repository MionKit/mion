// Guards the whole-program invariant of the shared incremental-update leaf
// (`rtHotUpdate` in src/unplugin.ts), which Vite's handleHotUpdate and the Next
// broker's watcher both drive.
//
// The bug this pins: OpSetSources REPLACES the resolver's source overlay and
// rebuilds the Program against exactly what it is handed. Pushing only the
// EDITED files therefore collapses the Program to those files — the following
// generate() emits only their demand and DELETES every other entry's module
// from disk, and any other marker file then fails to transform with "source
// file not in program".
//
// Measured on a real project before the fix: a 62-module program dropped to 2
// after a single two-file edit, and the bundler reported ~180 unresolvable
// module imports for files that had existed moments earlier. A host that
// resolves lazily can re-transform its way out of that; one that resolves the
// whole graph eagerly (Turbopack) just fails the build.
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

// Four marker files over four distinct types, so a collapse is unmistakable in
// the generated-module count rather than a one-or-two-entry judgement call.
function writeProject(root: string): void {
  fs.mkdirSync(path.join(root, 'src'), {recursive: true});
  fs.writeFileSync(path.join(root, 'tsconfig.json'), TSCONFIG);
  fs.writeFileSync(
    path.join(root, 'src/models.ts'),
    `export interface Account { id: number; label: string }
export interface Invoice { id: number; total: number }
export interface Contact { id: number; email: string }
`
  );
  for (const [file, type] of [
    ['account', 'Account'],
    ['invoice', 'Invoice'],
    ['contact', 'Contact'],
  ]) {
    fs.writeFileSync(
      path.join(root, `src/${file}.ts`),
      `import {getRunTypeId} from '@mionjs/run-types';
import type {${type}} from './models';
export const staticId = getRunTypeId<${type}>();
`
    );
  }
  // Resolve the marker package the way a consumer install does.
  const scope = path.join(root, 'node_modules/@mionjs');
  fs.mkdirSync(scope, {recursive: true});
  fs.symlinkSync(MARKER_PKG, path.join(scope, 'run-types'), 'dir');
}

const countModules = (genDir: string): number => {
  try {
    return fs.readdirSync(path.join(genDir, 'types')).filter((name) => name.endsWith('.js')).length;
  } catch {
    return -1;
  }
};

describe('@mionjs/devtools / incremental update keeps the whole program', () => {
  const register = hasBinary() ? it : it.skip;

  register(
    "an edit to one file does not prune the other files' generated modules",
    async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-hot-overlay-'));
      writeProject(root);
      const genDir = path.join(root, '__runtypes');

      const raw = unplugin.raw({binary: BIN, cwd: root, tsconfig: 'tsconfig.json', genDir: '__runtypes', detachResolver: true}, {
        framework: 'webpack',
        versions: {},
      } as UnpluginContextMeta);
      const plugin = (Array.isArray(raw) ? raw[0] : raw) as {
        buildStart?: (this: unknown) => Promise<void>;
        buildEnd?: (this: unknown) => void;
        rtHotUpdate?: (ctx: unknown, updates: {file: string; content?: string}[]) => Promise<void>;
      };
      const ctx = {
        warn: () => {},
        error: (message: unknown) => {
          throw new Error(String(message));
        },
      };

      try {
        await plugin.buildStart?.call(ctx);
        const before = countModules(genDir);
        expect(before).toBeGreaterThan(2);

        // Edit ONE file's type. The other two marker files are untouched, and
        // their generated modules must survive.
        const models = path.join(root, 'src/models.ts');
        const edited = fs.readFileSync(models, 'utf8').replace('label: string', 'label: string; nickname: string');
        fs.writeFileSync(models, edited);
        await plugin.rtHotUpdate?.(ctx, [{file: models, content: edited}]);

        expect(countModules(genDir)).toBeGreaterThanOrEqual(before);
      } finally {
        plugin.buildEnd?.call(ctx);
        fs.rmSync(root, {recursive: true, force: true});
      }
    },
    120_000
  );

  register(
    'every marker file still transforms after an unrelated file is edited',
    async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-hot-overlay-'));
      writeProject(root);

      const raw = unplugin.raw({binary: BIN, cwd: root, tsconfig: 'tsconfig.json', genDir: '__runtypes', detachResolver: true}, {
        framework: 'webpack',
        versions: {},
      } as UnpluginContextMeta);
      const plugin = (Array.isArray(raw) ? raw[0] : raw) as {
        buildStart?: (this: unknown) => Promise<void>;
        buildEnd?: (this: unknown) => void;
        transform?: (this: unknown, code: string, id: string) => Promise<{code?: string} | null>;
        rtHotUpdate?: (ctx: unknown, updates: {file: string; content?: string}[]) => Promise<void>;
      };
      const ctx = {
        warn: () => {},
        error: (message: unknown) => {
          throw new Error(String(message));
        },
      };

      try {
        await plugin.buildStart?.call(ctx);
        const models = path.join(root, 'src/models.ts');
        const edited = fs.readFileSync(models, 'utf8').replace('label: string', 'label: string; nickname: string');
        fs.writeFileSync(models, edited);
        await plugin.rtHotUpdate?.(ctx, [{file: models, content: edited}]);

        // contact.ts was never part of the update; before the fix this threw
        // "source file not in program" because the Program had shrunk to models.ts.
        const contact = path.join(root, 'src/contact.ts');
        const result = await plugin.transform?.call(ctx, fs.readFileSync(contact, 'utf8'), contact);
        // A real rewrite injects the generated cache module and passes its binding
        // into the call site; an un-rewritten file would carry neither.
        expect(result?.code).toContain('__runtypes/types/');
        expect(result?.code).toMatch(/getRunTypeId<Contact>\(undefined, __rt_\w+\)/);
      } finally {
        plugin.buildEnd?.call(ctx);
        fs.rmSync(root, {recursive: true, force: true});
      }
    },
    120_000
  );
});
