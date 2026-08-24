// Build-level proof of the per-entry virtual-module payoff: a real `vite
// build` with two entry points whose marker calls overlap on one shared type.
// Native ESM code splitting must
//
//   1. emit the SHARED type's validate entry exactly once across the output
//      (a shared chunk both entries import), and
//   2. keep each entry-only type's validate entry out of the other entry's
//      chunk graph.
//
// Pre-migration this was impossible: every entry pulled the whole per-family
// cache module, so A's bundle carried B's validators and vice versa.

import {describe, expect, it} from 'vitest';
import {build, type Rollup} from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import runtypes from '../src/vite.ts';
import {BIN, hasBinary} from './helpers/inline.ts';

const PACKAGE_ROOT = path.resolve(__dirname, '../../ts-runtypes');
// Lives under the marker package's test/ tree so tsconfig.test.json puts the
// fixtures in the Go resolver's Program (the plugin scans real program files).
const FIXTURE_DIR = path.join(PACKAGE_ROOT, 'test', 'tmp-build-split');

const FIXTURES: Record<string, string> = {
  'shared-type.ts': `export interface SharedThing {
  sharedProp: boolean;
}
`,
  'entry-a.ts': `import {createValidateFn} from '@ts-runtypes/core';
import type {SharedThing} from './shared-type.ts';
interface AlphaOnly {
  alphaProp: string;
}
export const isAlpha = createValidateFn<AlphaOnly>();
export const isSharedA = createValidateFn<SharedThing>();
`,
  'entry-b.ts': `import {createValidateFn} from '@ts-runtypes/core';
import type {SharedThing} from './shared-type.ts';
interface BetaOnly {
  betaProp: number;
}
export const isBeta = createValidateFn<BetaOnly>();
export const isSharedB = createValidateFn<SharedThing>();
`,
};

describe('vite build / per-entry code splitting', () => {
  const register = hasBinary() ? it : it.skip;

  register(
    'shared entries dedupe into a shared chunk; entry-only entries stay per-entry',
    async () => {
      fs.rmSync(FIXTURE_DIR, {recursive: true, force: true});
      fs.mkdirSync(FIXTURE_DIR, {recursive: true});
      for (const [name, source] of Object.entries(FIXTURES)) {
        fs.writeFileSync(path.join(FIXTURE_DIR, name), source);
      }
      try {
        const result = (await build({
          root: PACKAGE_ROOT,
          logLevel: 'error',
          resolve: {conditions: ['source']},
          plugins: [
            runtypes({
              binary: BIN,
              cwd: PACKAGE_ROOT,
              // tsconfig.test.json sets incremental:false, so the RT disk cache
              // is off (it follows TypeScript's incremental switch) — no
              // node_modules/.cache artifacts from this build.
              tsconfig: 'tsconfig.test.json',
              // Isolated output root: the marker package's own vitest writes to
              // <PACKAGE_ROOT>/__runtypes with a different program, so a shared dir
              // would race-prune these fixtures' modules. Cleaned with FIXTURE_DIR.
              genDir: path.join(FIXTURE_DIR, '__runtypes'),
              // The marker package's test program deliberately contains
              // Error-severity types (alwaysThrow suites) — same opt-out as its
              // own vitest config.
              failOnError: false,
            }) as never,
          ],
          build: {
            write: false,
            minify: false,
            rollupOptions: {
              input: {
                a: path.join(FIXTURE_DIR, 'entry-a.ts'),
                b: path.join(FIXTURE_DIR, 'entry-b.ts'),
              },
            },
          },
        })) as Rollup.RollupOutput;

        const chunks = result.output.filter((o): o is Rollup.OutputChunk => o.type === 'chunk');
        const codeOf = (predicate: (chunk: Rollup.OutputChunk) => boolean) =>
          chunks
            .filter(predicate)
            .map((chunk) => chunk.code)
            .join('\n');
        const allCode = codeOf(() => true);

        // Each validator body is identifiable by its property accessor.
        // The shared type's validate entry must appear EXACTLY once across
        // the whole output — module-level dedupe via the shared chunk.
        expect(countOccurrences(allCode, 'v.sharedProp')).toBe(1);
        expect(countOccurrences(allCode, 'v.alphaProp')).toBe(1);
        expect(countOccurrences(allCode, 'v.betaProp')).toBe(1);

        // Entry-only validators stay out of the other entry's chunk graph.
        const reachableFrom = (entryName: string): Set<string> => {
          const byFileName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
          const entry = chunks.find((chunk) => chunk.isEntry && chunk.name === entryName);
          if (!entry) throw new Error(`no entry chunk named ${entryName}`);
          const seen = new Set<string>();
          const queue = [entry.fileName];
          while (queue.length > 0) {
            const fileName = queue.pop()!;
            if (seen.has(fileName)) continue;
            seen.add(fileName);
            const chunk = byFileName.get(fileName);
            if (!chunk) continue;
            queue.push(...chunk.imports, ...chunk.dynamicImports);
          }
          return seen;
        };
        const aCode = codeOf((chunk) => reachableFrom('a').has(chunk.fileName));
        const bCode = codeOf((chunk) => reachableFrom('b').has(chunk.fileName));

        expect(aCode).toContain('v.alphaProp');
        expect(aCode).toContain('v.sharedProp');
        expect(aCode).not.toContain('v.betaProp');

        expect(bCode).toContain('v.betaProp');
        expect(bCode).toContain('v.sharedProp');
        expect(bCode).not.toContain('v.alphaProp');
      } finally {
        fs.rmSync(FIXTURE_DIR, {recursive: true, force: true});
      }
    },
    120_000
  );
});

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  for (let index = haystack.indexOf(needle); index >= 0; index = haystack.indexOf(needle, index + 1)) {
    count++;
  }
  return count;
}
