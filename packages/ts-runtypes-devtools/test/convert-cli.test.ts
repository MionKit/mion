// End-to-end for the format-conversion CLI (`ts-runtypes convert`): a real
// temp project (the REAL @ts-runtypes/core package on disk, never a stub) is
// converted by spawning the binary. Groups:
//
//   - --check reports without writing, exit 1 while changes are pending;
//   - in-place conversion rewrites .ts and .tsx declarations, leaves marker
//     call sites untouched, and a second run is a byte no-op (exit 0);
//   - the marker pair (`getRunTypeId<T>()` and `getRunTypeId(value)`) compiles
//     to the SAME injected id before and after conversion — the id oracle at
//     the binary level, both call shapes covered;
//   - --out-dir converts a copy (assets carried along, sources untouched);
//   - --portable refuses dialect-needing declarations with CNV006, and the
//     tsconfig `convertDialect` key is its project-level twin (flag wins);
//   - flag validation exits non-zero.
import {describe, expect, it} from 'vitest';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {BIN, hasBinary, writeMarkerPackage} from './helpers/inline.ts';

const register = hasBinary() ? it : it.skip;

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "rootDir": "src", "outDir": "dist", "strict": true
  },
  "include": ["src"]
}
`;

const MODELS_TS = `export type User = {id: number; name?: string};
export type Mode = 'a' | 'b';
`;

const WIDGET_TSX = `export type Widget = {kind: 'w'; size: number};
`;

const API_TS = `import {getRunTypeId} from '@ts-runtypes/core';
import {type User} from './models';
export const userId = getRunTypeId<User>();
const sample: User = {id: 1};
export const sampleId = getRunTypeId(sample);
`;

function makeProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-convert-'));
  writeMarkerPackage(dir);
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), TSCONFIG);
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src', 'models.ts'), MODELS_TS);
  fs.writeFileSync(path.join(dir, 'src', 'widget.tsx'), WIDGET_TSX);
  fs.writeFileSync(path.join(dir, 'src', 'api.ts'), API_TS);
  fs.writeFileSync(path.join(dir, 'src', 'notes.txt'), 'asset\n');
  return dir;
}

// Rewrite the project's tsconfig with a ts-runtypes plugin entry pinning the
// convert dialect. `convertDialect` rides the language-service plugin slot like
// every other RunTypes project key, so tsc ignores it.
function writeDialectTsconfig(dir: string, convertDialect: string): void {
  fs.writeFileSync(
    path.join(dir, 'tsconfig.json'),
    `{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "rootDir": "src", "outDir": "dist", "strict": true,
    "plugins": [{"name": "ts-runtypes", "convertDialect": "${convertDialect}"}]
  },
  "include": ["src"]
}
`
  );
}

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function runConvert(dir: string, args: string[]): RunResult {
  const result = spawnSync(BIN, ['convert', '--tsconfig', path.join(dir, 'tsconfig.json'), ...args], {
    encoding: 'utf8',
    cwd: dir,
    maxBuffer: 32 * 1024 * 1024,
  });
  return {status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? ''};
}

function compileInjectedIds(dir: string): string[] {
  fs.rmSync(path.join(dir, 'dist'), {recursive: true, force: true});
  fs.rmSync(path.join(dir, '__runtypes'), {recursive: true, force: true});
  const result = spawnSync(
    BIN,
    ['compile', '--cwd', dir, '--tsconfig', 'tsconfig.json', '--gen-dir', path.join(dir, '__runtypes')],
    {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024}
  );
  expect(result.status, result.stderr).toBe(0);
  const emitted = fs.readFileSync(path.join(dir, 'dist', 'api.js'), 'utf8');
  return [...new Set(emitted.match(/__rt_[A-Za-z0-9_$]+/g) ?? [])].sort();
}

describe('ts-runtypes convert (CLI e2e)', () => {
  register('--check reports pending rewrites without writing (exit 1)', () => {
    const dir = makeProject();
    try {
      const before = fs.readFileSync(path.join(dir, 'src', 'models.ts'), 'utf8');
      const {status, stdout} = runConvert(dir, ['--to', 'builders', '--check', path.join(dir, 'src')]);
      expect(status).toBe(1);
      expect(stdout).toContain('would rewrite');
      expect(fs.readFileSync(path.join(dir, 'src', 'models.ts'), 'utf8')).toBe(before);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  register('converts .ts and .tsx in place, leaves marker call sites alone, second run is a no-op', () => {
    const dir = makeProject();
    try {
      const apiBefore = fs.readFileSync(path.join(dir, 'src', 'api.ts'), 'utf8');
      const first = runConvert(dir, ['--to', 'builders', path.join(dir, 'src')]);
      expect(first.status, first.stderr).toBe(0);
      const models = fs.readFileSync(path.join(dir, 'src', 'models.ts'), 'utf8');
      expect(models).toContain('RT.object({id: TF.number(), name: RT.optional(TF.string())})');
      expect(models).toContain('export type User = InferType<typeof userRT>;');
      const widget = fs.readFileSync(path.join(dir, 'src', 'widget.tsx'), 'utf8');
      expect(widget).toContain('const widgetRT');
      expect(fs.readFileSync(path.join(dir, 'src', 'api.ts'), 'utf8')).toBe(apiBefore);

      const second = runConvert(dir, ['--to', 'builders', path.join(dir, 'src')]);
      expect(second.status, second.stderr).toBe(0);
      expect(second.stdout).not.toContain('rewrote');
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  register('the getRunTypeId pair compiles to the same injected id before and after conversion', {timeout: 180_000}, () => {
    const dir = makeProject();
    try {
      const idsBefore = compileInjectedIds(dir);
      // Both call shapes (type argument / inferred value) share one id.
      expect(idsBefore).toHaveLength(1);
      const converted = runConvert(dir, ['--to', 'builders', path.join(dir, 'src')]);
      expect(converted.status, converted.stderr).toBe(0);
      const idsAfter = compileInjectedIds(dir);
      expect(idsAfter).toEqual(idsBefore);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  register('--out-dir converts a copy and carries assets, sources untouched', () => {
    const dir = makeProject();
    try {
      const modelsBefore = fs.readFileSync(path.join(dir, 'src', 'models.ts'), 'utf8');
      const outDir = path.join(dir, 'converted');
      const {status, stderr} = runConvert(dir, ['--to', 'builders', path.join(dir, 'src'), '--out-dir', outDir]);
      expect(status, stderr).toBe(0);
      expect(fs.readFileSync(path.join(dir, 'src', 'models.ts'), 'utf8')).toBe(modelsBefore);
      expect(fs.readFileSync(path.join(outDir, 'models.ts'), 'utf8')).toContain('RT.object(');
      expect(fs.readFileSync(path.join(outDir, 'notes.txt'), 'utf8')).toBe('asset\n');
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  register('a Temporal type resolving to any refuses with CNV007 (missing lib guard)', () => {
    const dir = makeProject();
    try {
      // The project tsconfig loads no ESNext.Temporal lib, so Temporal.Instant
      // resolves to `any` — conversion must refuse, never cement `any`.
      const meeting = 'export type Meeting = {at: Temporal.Instant};\n';
      fs.writeFileSync(path.join(dir, 'src', 'meeting.ts'), meeting);
      const {status, stderr} = runConvert(dir, ['--to', 'builders', path.join(dir, 'src')]);
      expect(status).toBe(1);
      expect(stderr).toContain('CNV007');
      expect(fs.readFileSync(path.join(dir, 'src', 'meeting.ts'), 'utf8')).toBe(meeting);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  register('--portable refuses dialect-needing declarations with CNV006', () => {
    const dir = makeProject();
    try {
      fs.writeFileSync(path.join(dir, 'src', 'big.ts'), 'export type Big = bigint;\n');
      const {status, stderr} = runConvert(dir, ['--to', 'json-schema', '--portable', '--check', path.join(dir, 'src')]);
      expect(status).toBe(1);
      expect(stderr).toContain('CNV006');
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  // The project-level twin of --portable. `convertDialect: 'standard'` in the
  // tsconfig plugin entry means every convert run in that project emits strictly
  // standard 2020-12, so a schema committed to a repo cannot quietly grow an
  // extension keyword. The flag still wins per run, in BOTH directions.
  register("convertDialect: 'standard' refuses dialect-needing declarations without any flag", () => {
    const dir = makeProject();
    try {
      writeDialectTsconfig(dir, 'standard');
      fs.writeFileSync(path.join(dir, 'src', 'big.ts'), 'export type Big = bigint;\n');
      const {status, stderr} = runConvert(dir, ['--to', 'json-schema', '--check', path.join(dir, 'src')]);
      expect(status).toBe(1);
      expect(stderr).toContain('CNV006');
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  register("convertDialect: 'extended' is the default and emits the dialect", () => {
    const dir = makeProject();
    try {
      writeDialectTsconfig(dir, 'extended');
      fs.writeFileSync(path.join(dir, 'src', 'big.ts'), 'export type Big = bigint;\n');
      const {status} = runConvert(dir, ['--to', 'json-schema', path.join(dir, 'src')]);
      expect(status).toBe(0);
      expect(fs.readFileSync(path.join(dir, 'src', 'big.ts'), 'utf8')).toContain("jsType: 'bigint'");
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  register('--portable=false overrides a project pinned to standard', () => {
    const dir = makeProject();
    try {
      writeDialectTsconfig(dir, 'standard');
      fs.writeFileSync(path.join(dir, 'src', 'big.ts'), 'export type Big = bigint;\n');
      const {status} = runConvert(dir, ['--to', 'json-schema', '--portable=false', path.join(dir, 'src')]);
      expect(status).toBe(0);
      expect(fs.readFileSync(path.join(dir, 'src', 'big.ts'), 'utf8')).toContain("jsType: 'bigint'");
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  register('an unrecognised convertDialect value is fatal rather than silently extended', () => {
    const dir = makeProject();
    try {
      writeDialectTsconfig(dir, 'strict');
      const {status, stderr} = runConvert(dir, ['--to', 'json-schema', '--check', path.join(dir, 'src')]);
      expect(status).not.toBe(0);
      expect(stderr).toContain('convertDialect');
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  register('an unknown --to target exits non-zero with the expected message', () => {
    const dir = makeProject();
    try {
      const {status, stderr} = runConvert(dir, ['--to', 'nonsense', path.join(dir, 'src')]);
      expect(status).not.toBe(0);
      expect(stderr).toContain('unknown --to target');
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  // Program-roots fix (docs/done/program-roots-lose-ambient-declarations.md):
  // the CLI roots the config's whole file list beside the conversion targets,
  // so an ambient declaration nothing imports resolves like tsc sees it and
  // converts faithfully instead of silently cementing RT.any().
  register('an ambient .d.ts in the include set converts faithfully, never as RT.any()', () => {
    const dir = makeProject();
    try {
      fs.writeFileSync(path.join(dir, 'src', 'ambient.d.ts'), 'declare interface AmbientMeta { a: string; b: number }\n');
      fs.writeFileSync(path.join(dir, 'src', 'holder.ts'), 'export type Holder = {value: AmbientMeta};\n');
      const {status, stderr} = runConvert(dir, ['--to', 'builders', path.join(dir, 'src')]);
      expect(status, stderr).toBe(0);
      const holder = fs.readFileSync(path.join(dir, 'src', 'holder.ts'), 'utf8');
      expect(holder).not.toContain('RT.any()');
      expect(holder).toContain('RT.object');
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  register('a written type name that resolves nowhere refuses with CNV008 (exit 1, source untouched)', () => {
    const dir = makeProject();
    try {
      const brokenPath = path.join(dir, 'src', 'broken.ts');
      fs.writeFileSync(brokenPath, 'export type Broken = {value: MissingThing};\n');
      const before = fs.readFileSync(brokenPath, 'utf8');
      const {status, stderr} = runConvert(dir, ['--to', 'builders', brokenPath]);
      expect(status).toBe(1);
      expect(stderr).toContain('CNV008');
      expect(stderr).toContain('MissingThing');
      expect(fs.readFileSync(brokenPath, 'utf8')).toBe(before);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});
