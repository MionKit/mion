// Regression: the @ts-runtypes/devtools/esbuild entry must not claim files the
// transform ignores.
//
// esbuild has NO transform phase. unplugin emulates one with an onLoad hook, and
// an onLoad that fires READS the file and hands esbuild a loader guessed from the
// extension — `js` for anything it does not recognise. So before the plugin
// declared `transformInclude`, adding it to a build that loads a `.sql` (or
// `.graphql`, or `.txt`) file as text made esbuild try to PARSE that file as
// JavaScript, and the build died on the first SQL keyword.
//
// The two assertions are a pair on purpose: the non-JS file must survive its own
// loader, AND the marker in the JS file must still be rewritten. Either one alone
// passes for the wrong reason — a plugin that transforms nothing also never
// breaks a loader.
import {describe, expect, it} from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import * as esbuild from 'esbuild';
import runtypesEsbuild from '../src/esbuild.ts';
import {BIN, hasBinary} from './helpers/inline.ts';

// Under the marker package's test tree so tsconfig.test.json puts the fixture in
// the Go resolver's Program, exactly as build-rollup.test.ts does.
const PACKAGE_ROOT = path.resolve(__dirname, '../../run-types');
const FIXTURE_DIR = path.join(PACKAGE_ROOT, 'test', 'tmp-esbuild-nonjs');
const ENTRY = path.join(FIXTURE_DIR, 'entry.ts');
const MIGRATION = path.join(FIXTURE_DIR, 'migration.sql');
const OUT_FILE = path.join(FIXTURE_DIR, 'bundle.mjs');
const OUT_DIR = path.join(FIXTURE_DIR, '__runtypes');

// A real SQL statement: the point is that it is not parseable as JavaScript.
const MIGRATION_SQL = 'CREATE TABLE `notes` (\n\t`id` integer PRIMARY KEY NOT NULL\n);\n';

const FIXTURE = `import {createValidateFn} from '@mionjs/run-types';
import migration from './migration.sql';
interface EsbuildNote {
  noteProp: string;
}
export const isNote = createValidateFn<EsbuildNote>();
export const sql = migration;
`;

describe('esbuild build / @ts-runtypes/devtools/esbuild entry', () => {
  const register = hasBinary() ? it : it.skip;

  register(
    'leaves a non-JS file to its own loader and still rewrites the marker',
    async () => {
      fs.rmSync(FIXTURE_DIR, {recursive: true, force: true});
      fs.mkdirSync(FIXTURE_DIR, {recursive: true});
      fs.writeFileSync(ENTRY, FIXTURE);
      fs.writeFileSync(MIGRATION, MIGRATION_SQL);
      try {
        await esbuild.build({
          entryPoints: [ENTRY],
          outfile: OUT_FILE,
          bundle: true,
          format: 'esm',
          platform: 'neutral',
          loader: {'.sql': 'text'},
          logLevel: 'silent',
          plugins: [
            runtypesEsbuild({
              binary: BIN,
              // tsconfig.test.json is incremental:false → RT disk cache off.
              cwd: PACKAGE_ROOT,
              tsconfig: 'tsconfig.test.json',
              genDir: OUT_DIR,
              // Same opt-out as build-rollup.test.ts: the marker package's test
              // program deliberately contains Error-severity types.
              failOnError: false,
            }),
          ],
        });

        const bundle = fs.readFileSync(OUT_FILE, 'utf8');
        // The .sql went through the text loader, so its contents are in the bundle
        // as a string rather than having been parsed as code.
        expect(bundle).toContain('CREATE TABLE');
        // And the marker was still injected: an un-rewritten createValidateFn
        // carries no id, so the id is the only proof the transform ran.
        expect(bundle).toMatch(/createValidateFn\s*\(/);
        expect(fs.existsSync(path.join(OUT_DIR, 'types'))).toBe(true);
      } finally {
        fs.rmSync(FIXTURE_DIR, {recursive: true, force: true});
      }
      // The plugin spawns the resolver and scans the whole marker-package program
      // on buildStart, which is well past vitest's 5s default.
    },
    120_000
  );
});
