// End-to-end for the tsc-style compile CLI (`mion compile`): a real
// temp project is compiled by spawning the binary, and we assert (1) the emitted
// .js has the rewrite applied with the binding import relativized to the cache
// dir, (2) the composed source map points at the ORIGINAL .ts line (not the
// import-shifted rewritten line), and (3) the generated cache module actually
// materializes a WORKING validator at runtime.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {BIN, hasBinary, writeMarkerPackage} from './helpers/inline.ts';
import {runCli} from './helpers/cliCrash.ts';
import {decodeMappings} from './helpers/sourcemap.ts';

const register = hasBinary() ? it : it.skip;

const RUNTYPES_DTS = `declare module '@mionjs/run-types' {
  export type InjectRunTypeId<T> = string & {readonly __rtInjectRunTypeIdBrand?: T};
  export type CompTimeFnArgs<T> = T & {readonly __rtCompTimeFnArgsBrand?: never};
  export type InjectTypeFnArgs<T, F1 extends string, F2 extends string = never, F3 extends string = never, F4 extends string = never, F5 extends string = never, F6 extends string = never, F7 extends string = never, F8 extends string = never, F9 extends string = never, F10 extends string = never, F11 extends string = never, F12 extends string = never> = string & {readonly __rtInjectTypeFnArgsBrand?: T; readonly __rtInjectTypeFnArgsFns?: [F1, F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12]};
  export type ValidateFn = (value: unknown) => boolean;
  export function createValidateFn<T>(val?: T, options?: CompTimeFnArgs<{numberMode?: 'isFinite' | 'typeof' | 'notNaN'}>, id?: InjectTypeFnArgs<T, 'validate'>): ValidateFn;
}
`;

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "rootDir": "src", "outDir": "dist", "sourceMap": true, "strict": true
  },
  "include": ["src"]
}
`;

// The createValidateFn call sits on original line 5 (0-based).
const USER_TS = `import {createValidateFn} from '@mionjs/run-types';
interface User {
  id: number;
  name: string;
}
export const isUser = createValidateFn<User>();
`;

describe('mion compile (tsc-like CLI)', () => {
  register('emits .js with a composed map back to the original source and a working cache', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-compile-'));
    try {
      fs.writeFileSync(path.join(dir, 'tsconfig.json'), TSCONFIG);
      fs.mkdirSync(path.join(dir, 'src'));
      fs.writeFileSync(path.join(dir, 'src', 'runtypes.d.ts'), RUNTYPES_DTS);
      fs.writeFileSync(path.join(dir, 'src', 'user.ts'), USER_TS);

      const run = runCli(['compile', '--cwd', dir, '--tsconfig', 'tsconfig.json', '--gen-dir', path.join(dir, '.mion')], {
        label: 'compile-cli',
      });
      expect(run.status, run.report).toBe(0);

      // (1) Emitted .js: types stripped, binding import relativized, call rewritten.
      const js = fs.readFileSync(path.join(dir, 'dist', 'user.js'), 'utf8');
      expect(js).not.toContain('rtmod:');
      expect(js).toMatch(/import \{\s*__rt_[A-Za-z0-9_$]+\s*\} from '\.\.\/.mion\/types\/[A-Za-z0-9_$]+\.js'/);
      expect(js).toMatch(/createValidateFn\(undefined, undefined, __rt_[A-Za-z0-9_$]+\)/);

      // (2) Composed map: the call's generated line maps back to ORIGINAL line 5,
      // and NO segment references a line beyond the original file (5) — a leaked
      // rewritten (import-shifted) line would exceed it.
      const map = JSON.parse(fs.readFileSync(path.join(dir, 'dist', 'user.js.map'), 'utf8'));
      expect(map.sources).toHaveLength(1);
      expect(map.sources[0]).toMatch(/user\.ts$/);
      const originalLines = decodeMappings(map.mappings)
        .flat()
        .map((s) => s.originalLine);
      expect(Math.max(...originalLines)).toBeLessThanOrEqual(5);
      expect(originalLines).toContain(5);

      // (3) The generated cache module materializes a WORKING validator.
      const cacheDir = path.join(dir, '.mion', 'types');
      const cacheFile = fs.readdirSync(cacheDir).find((f) => f.endsWith('.js'))!;
      const cacheSource = fs.readFileSync(path.join(cacheDir, cacheFile), 'utf8');
      // The entry tuple's code slot is the validator body: `function X(v){…}return X`.
      const body = cacheSource.match(/'(function [A-Za-z0-9_$]+\(v\)\{.*return [A-Za-z0-9_$]+)'/s)?.[1];
      expect(body, `no validator body found in ${cacheSource}`).toBeDefined();
      const unescaped = body!.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
      const validate = new Function('utl', unescaped)({}) as (v: unknown) => boolean;
      expect(validate({id: 1, name: 'mario'})).toBe(true);
      expect(validate({id: 'not-a-number', name: 'mario'})).toBe(false);
      expect(validate({id: 1})).toBe(false);

      // (4) VCS hygiene rides the CLI lane too (written Go-side inside
      // generate): every output folder self-documents, types/ is gitignored.
      const genRoot = path.join(dir, '.mion');
      expect(fs.readFileSync(path.join(genRoot, 'README.md'), 'utf8')).toContain('genDir');
      expect(fs.readFileSync(path.join(cacheDir, 'README.md'), 'utf8')).toContain('regenerated');
      expect(fs.readFileSync(path.join(cacheDir, '.gitignore'), 'utf8')).toContain('*');
      expect(fs.readFileSync(path.join(genRoot, 'enriched', 'README.md'), 'utf8')).toContain('Committed');
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  // validate-method-dropped (a skipped method) is Info: hidden by default, printed with tsconfig `levels: "all"`, never a failure.
  // Both getRunTypeId shapes ride along (marker coverage rule) and must compile clean.
  const METHOD_TS = `import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
export class Pet {
  name = 'rex';
  speak(): string { return this.name; }
}
export const isPet = createValidateFn<Pet>();
export const petId = getRunTypeId<Pet>();
export const sampleId = getRunTypeId(new Pet());
`;
  const compileWithLevels = (levels: string | undefined, plugin: Record<string, string> = {}, flags: string[] = []) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-compile-levels-'));
    const tsconfig = JSON.parse(TSCONFIG);
    if (levels || Object.keys(plugin).length > 0)
      tsconfig.compilerOptions.plugins = [{name: 'mion', ...(levels ? {levels} : {}), ...plugin}];
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify(tsconfig));
    fs.mkdirSync(path.join(dir, 'src'));
    writeMarkerPackage(dir);
    fs.writeFileSync(path.join(dir, 'src', 'pet.ts'), METHOD_TS);
    try {
      return runCli(['compile', '--cwd', dir, '--tsconfig', 'tsconfig.json', '--no-emit', ...flags], {
        label: 'compile-cli-levels',
      });
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  };

  register('hides an Info finding unless the tsconfig sets levels: "all"', () => {
    const quiet = compileWithLevels(undefined);
    expect(quiet.status, quiet.report).toBe(0);
    expect(quiet.stderr).not.toContain('validate-method-dropped');
    expect(quiet.stderr).not.toMatch(/: (error|warning) /);
    expect(quiet.stderr).toContain('checked 1 file(s), wrote nothing');

    const shown = compileWithLevels('all');
    expect(shown.status, shown.report).toBe(0);
    // Grouped by default: the name, the message with its one value filled in, then the site.
    expect(shown.stderr).toMatch(/^info validate-method-dropped \(1\)\n {2}Method `speak` .*\n {4}src\/pet\.ts:\d+:\d+$/m);
    expect(shown.stderr).toMatch(/^mion: 1 info in 1 file$/m);
    expect(shown.stderr).not.toMatch(/validate-method-dropped\(/);
  });

  register('prints one line per finding with --log-style lines, as with the tsconfig logStyle: "lines"', () => {
    for (const shown of [compileWithLevels('all', {}, ['--log-style', 'lines']), compileWithLevels('all', {logStyle: 'lines'})]) {
      expect(shown.status, shown.report).toBe(0);
      // The same line the bundler plugin prints: the code, then the rendered headline, never the raw args.
      expect(shown.stderr).toMatch(/\(\d+,\d+\): info validate-method-dropped: \S.*`speak`/);
      expect(shown.stderr).not.toMatch(/validate-method-dropped \(/);
    }
  });

  register('the --log-style flag wins over the tsconfig logStyle', () => {
    const shown = compileWithLevels('all', {logStyle: 'lines'}, ['--log-style', 'grouped']);
    expect(shown.status, shown.report).toBe(0);
    expect(shown.stderr).toMatch(/^info validate-method-dropped \(1\)$/m);
  });

  register('refuses an unknown logStyle', () => {
    const fromFlag = compileWithLevels(undefined, {}, ['--log-style', 'line']);
    expect(fromFlag.status).toBe(1);
    expect(fromFlag.stderr).toContain('logStyle: unknown value "line"');
    const fromTsconfig = compileWithLevels(undefined, {logStyle: 'line'});
    expect(fromTsconfig.status).toBe(1);
    expect(fromTsconfig.stderr).toContain('logStyle: unknown value "line"');
  });
});
