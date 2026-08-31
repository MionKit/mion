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
import {BIN, hasBinary} from './helpers/inline.ts';
import {runCli} from './helpers/cliCrash.ts';
import {decodeMappings} from './helpers/sourcemap.ts';

const register = hasBinary() ? it : it.skip;

const RUNTYPES_DTS = `declare module '@mionjs/run-types' {
  export type InjectRunTypeId<T> = string & {readonly __rtInjectRunTypeIdBrand?: T};
  export type CompTimeFnArgs<T> = T & {readonly __rtCompTimeFnArgsBrand?: never};
  export type InjectTypeFnArgs<T, F1 extends string, F2 extends string = never, F3 extends string = never, F4 extends string = never, F5 extends string = never, F6 extends string = never, F7 extends string = never, F8 extends string = never, F9 extends string = never, F10 extends string = never, F11 extends string = never, F12 extends string = never> = string & {readonly __rtInjectTypeFnArgsBrand?: T; readonly __rtInjectTypeFnArgsFns?: [F1, F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12]};
  export type ValidateFn = (value: unknown) => boolean;
  export function createValidateFn<T>(val?: T, options?: CompTimeFnArgs<{noLiterals?: boolean}>, id?: InjectTypeFnArgs<T, 'val'>): ValidateFn;
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

      const run = runCli(['compile', '--cwd', dir, '--tsconfig', 'tsconfig.json', '--gen-dir', path.join(dir, '__runtypes')], {
        label: 'compile-cli',
      });
      expect(run.status, run.report).toBe(0);

      // (1) Emitted .js: types stripped, binding import relativized, call rewritten.
      const js = fs.readFileSync(path.join(dir, 'dist', 'user.js'), 'utf8');
      expect(js).not.toContain('rtmod:');
      expect(js).toMatch(/import \{\s*__rt_[A-Za-z0-9_$]+\s*\} from '\.\.\/__runtypes\/types\/[A-Za-z0-9_$]+\.js'/);
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
      const cacheDir = path.join(dir, '__runtypes', 'types');
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
      const genRoot = path.join(dir, '__runtypes');
      expect(fs.readFileSync(path.join(genRoot, 'README.md'), 'utf8')).toContain('genDir');
      expect(fs.readFileSync(path.join(cacheDir, 'README.md'), 'utf8')).toContain('regenerated');
      expect(fs.readFileSync(path.join(cacheDir, '.gitignore'), 'utf8')).toContain('*');
      expect(fs.readFileSync(path.join(genRoot, 'enriched', 'README.md'), 'utf8')).toContain('Committed');
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});
