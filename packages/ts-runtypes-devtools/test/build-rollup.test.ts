// Cross-bundler proof for the @ts-runtypes/devtools/rollup entry. This drives the
// unplugin-generated Rollup plugin's hooks exactly as Rollup invokes them
// (buildStart, transform) and asserts the files-mode chain: buildStart writes
// the cache modules to real files under <genDir>/types, and the marker call is
// rewritten with an injected RELATIVE import pointing at one of those real
// files (no rtmod: specifier, no resolveId/load hooks). Loading that file
// from disk yields the validator generated from the type. Proof that the
// /rollup entry produces a working Rollup plugin off the shared unplugin
// factory. The /vite entry's full real-build coverage lives in build-split +
// build-sourcemap.
import {describe, expect, it} from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import runtypesRollup from '../src/rollup.ts';
import {BIN, hasBinary} from './helpers/inline.ts';

// Lives under the marker package's test/ tree so tsconfig.test.json puts the
// fixture in the Go resolver's Program (the plugin scans real program files).
const PACKAGE_ROOT = path.resolve(__dirname, '../../ts-runtypes');
const FIXTURE_DIR = path.join(PACKAGE_ROOT, 'test', 'tmp-build-rollup');
const ENTRY = path.join(FIXTURE_DIR, 'entry.ts');
// Isolated output root so this build never shares (and prunes) the marker
// package's own vitest `__runtypes/types` dir — the two programs differ, so a
// shared dir would race-delete this fixture's modules. Cleaned with FIXTURE_DIR.
const OUT_DIR = path.join(FIXTURE_DIR, '__runtypes');

const FIXTURE = `import {createValidateFn} from '@ts-runtypes/core';
interface RollupThing {
  rollupProp: string;
}
export const isThing = createValidateFn<RollupThing>();
`;

// unplugin emits each Rollup hook as either a plain function or a { handler }
// object; invoke either form with a Rollup-like plugin context.
type Hook = ((...args: unknown[]) => unknown) | {handler: (...args: unknown[]) => unknown};
const callHook = (hook: Hook, thisArg: unknown, ...args: unknown[]): unknown =>
  typeof hook === 'function' ? hook.apply(thisArg, args) : hook.handler.apply(thisArg, args);

describe('rollup build / @ts-runtypes/devtools/rollup entry', () => {
  const register = hasBinary() ? it : it.skip;

  register(
    'produces a Rollup plugin whose hooks rewrite markers into real on-disk module imports',
    async () => {
      const plugin = runtypesRollup({
        binary: BIN,
        cwd: PACKAGE_ROOT,
        // tsconfig.test.json is incremental:false → RT disk cache off.
        tsconfig: 'tsconfig.test.json',
        genDir: OUT_DIR,
        // The marker package's test program deliberately contains
        // Error-severity types (alwaysThrow suites) — same opt-out as its own
        // vitest config; see fail-on-error.test.ts for the strict default.
        failOnError: false,
      }) as any;
      expect(plugin.name).toBe('@ts-runtypes/devtools');

      fs.rmSync(FIXTURE_DIR, {recursive: true, force: true});
      fs.mkdirSync(FIXTURE_DIR, {recursive: true});
      fs.writeFileSync(ENTRY, FIXTURE);
      const ctx = {
        error(message: string): never {
          throw new Error(message);
        },
        warn(): void {},
      };
      try {
        // buildStart generates the whole program's cache modules to disk.
        await callHook(plugin.buildStart, ctx);

        // transform: the marker call is rewritten to the entry-binding form and
        // a RELATIVE import to a real on-disk module is injected (the same
        // rewrite /vite performs in files-mode — no rtmod: specifier).
        const transformed = (await callHook(plugin.transform, ctx, FIXTURE, ENTRY)) as {code: string} | null;
        expect(transformed).toBeTruthy();
        const code = transformed!.code;
        expect(code, `files-mode must not inject rtmod: imports:\n${code}`).not.toContain('rtmod:/');
        const match = code.match(/from '(\.\.?\/[^']+\.js)'/);
        expect(match, `expected an injected relative module import in:\n${code}`).toBeTruthy();
        const specifier = match![1];

        // The injected specifier resolves (relative to the entry file's dir) to
        // a real file that buildStart wrote under <genDir>/types.
        const moduleFile = path.resolve(path.dirname(ENTRY), specifier);
        expect(fs.existsSync(moduleFile), `injected import ${specifier} must point at a written module`).toBe(true);

        // The generated validator references the type's property — proof the
        // rollup entry's buildStart wrote the real, type-derived module to disk.
        const typesDir = path.join(OUT_DIR, 'types');
        const generated = fs
          .readdirSync(typesDir)
          .filter((name) => name.endsWith('.js'))
          .map((name) => fs.readFileSync(path.join(typesDir, name), 'utf8'))
          .join('\n');
        expect(generated).toContain('rollupProp');

        // VCS hygiene: every genDir folder self-documents (a README saying
        // what it is), and the regenerated types/ dir is gitignored.
        expect(fs.readFileSync(path.join(OUT_DIR, 'README.md'), 'utf8')).toContain('genDir');
        expect(fs.readFileSync(path.join(typesDir, 'README.md'), 'utf8')).toContain('regenerated');
        expect(fs.readFileSync(path.join(typesDir, '.gitignore'), 'utf8')).toContain('*');
        expect(fs.readFileSync(path.join(OUT_DIR, 'enriched', 'README.md'), 'utf8')).toContain('Committed');
      } finally {
        try {
          await callHook(plugin.buildEnd, ctx);
        } catch {
          // best-effort teardown
        }
        fs.rmSync(FIXTURE_DIR, {recursive: true, force: true});
      }
    },
    120_000
  );
});
