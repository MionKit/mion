// CLI surface contract test — the regression guard for the binary's args[0]
// command set. Three groups over the built bin/ts-runtypes:
//
//   - Help golden: snapshot the top-level usage + each command's full --help.
//     printUsage renders every flag via fs.VisitAll, so the golden captures the
//     whole verb set + per-command flags automatically. Regenerate after an
//     intentional surface change with:  pnpm exec vitest run cli-surface -u
//   - Routing + exit codes: each verb routes to its handler; unknown / no args[0]
//     -> usage on stderr + exit 2; -h / --help / --version are peeled early.
//   - Parameter-effect matrix: --no-emit writes NOTHING yet reports; --json emits
//     JSON; --friendly / --mock select the family file(s); --gen-dir redirects;
//     --prune --no-emit lists but never deletes.

import {describe, it, expect, beforeAll} from 'vitest';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve, dirname, join} from 'node:path';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const BIN = resolve(REPO_ROOT, 'bin/ts-runtypes');
const hasBinary = existsSync(BIN);

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function run(args: string[], cwd?: string): RunResult {
  const result = spawnSync(BIN, args, {encoding: 'utf8', cwd, maxBuffer: 32 * 1024 * 1024});
  return {status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? ''};
}

// snapshot maps every file under dir to its content (sorted keys), so a test can
// assert a whole output tree is byte-identical before/after a --no-emit run.
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(dir)) return out;
  const walk = (current: string, prefix: string): void => {
    for (const entry of readdirSync(current).sort()) {
      const abs = join(current, entry);
      const rel = prefix ? `${prefix}/${entry}` : entry;
      if (statSync(abs).isDirectory()) walk(abs, rel);
      else out[rel] = readFileSync(abs, 'utf8');
    }
  };
  walk(dir, '');
  return out;
}

// A minimal enrich fixture: a tsconfig with the plugin + a plain-typed source (no
// package imports, so the scaffold resolves without a node_modules install).
function makeFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rt-cli-surface-'));
  writeFileSync(join(dir, 'tsconfig.json'), '{"compilerOptions":{"plugins":[{"name":"ts-runtypes","genDir":"gen"}]}}');
  writeFileSync(join(dir, 'models.ts'), 'export interface User { id: number; name: string }\n');
  return dir;
}

describe.skipIf(!hasBinary)('CLI surface — help golden', () => {
  it('top-level usage (no args)', () => {
    const {stderr, status} = run([]);
    expect(status).toBe(2);
    expect(stderr).toMatchSnapshot();
  });

  for (const cmd of ['serve', 'compile', 'enrich']) {
    it(`${cmd} --help`, () => {
      // -h / --help print to stderr via fs.Usage; capture both streams.
      const {stdout, stderr} = run([cmd, '-h']);
      expect(stdout + stderr).toMatchSnapshot();
    });
  }
});

describe.skipIf(!hasBinary)('CLI surface — routing + exit codes', () => {
  it('unknown command -> exit 2 + usage', () => {
    const {status, stderr} = run(['definitely-not-a-command']);
    expect(status).toBe(2);
    expect(stderr).toContain('unknown command');
  });

  it('the removed gen/check verbs are gone', () => {
    expect(run(['gen']).status).toBe(2);
    expect(run(['check']).status).toBe(2);
    expect(run(['gen']).stderr).toContain('unknown command');
  });

  it('-h / --help -> exit 0 usage on stdout', () => {
    for (const flag of ['-h', '--help']) {
      const {status, stdout} = run([flag]);
      expect(status).toBe(0);
      expect(stdout).toContain('ts-runtypes <command>');
    }
  });

  it('--version -> exit 0', () => {
    const {status, stdout} = run(['--version']);
    expect(status).toBe(0);
    expect(stdout).toContain('ts-runtypes');
  });

  it('enrich <file> without a Type (no --no-emit) -> disambiguation error, exit 1', () => {
    const dir = makeFixture();
    try {
      const {status, stderr} = run(['enrich', 'models.ts'], dir);
      expect(status).toBe(1);
      expect(stderr).toContain('--no-emit');
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });
});

describe.skipIf(!hasBinary)('CLI surface — parameter-effect matrix', () => {
  it('scaffold writes BOTH family mirrors; --friendly / --mock select one', () => {
    const dir = makeFixture();
    try {
      run(['enrich', 'models.ts', 'User', '--gen-dir', 'gen'], dir);
      expect(existsSync(join(dir, 'gen/enriched/friendly/models.ts'))).toBe(true);
      expect(existsSync(join(dir, 'gen/enriched/mock/models.ts'))).toBe(true);

      run(['enrich', 'models.ts', 'User', '--friendly', '--gen-dir', 'gfriendly'], dir);
      expect(existsSync(join(dir, 'gfriendly/enriched/friendly/models.ts'))).toBe(true);
      expect(existsSync(join(dir, 'gfriendly/enriched/mock/models.ts'))).toBe(false);

      run(['enrich', 'models.ts', 'User', '--mock', '--gen-dir', 'gmock'], dir);
      expect(existsSync(join(dir, 'gmock/enriched/mock/models.ts'))).toBe(true);
      expect(existsSync(join(dir, 'gmock/enriched/friendly/models.ts'))).toBe(false);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  it('scaffold emits the freshly-scaffolded @todo worklist (FT020/MD020) in one pass', () => {
    const dir = makeFixture();
    try {
      const {stderr, status} = run(['enrich', 'models.ts', 'User', '--gen-dir', 'gen'], dir);
      // A successful scaffold exits 0 (the @todo placeholders are the expected state).
      expect(status).toBe(0);
      expect(stderr).toContain('FT020');
      expect(stderr).toContain('MD020');
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  it('enrich --no-emit writes NOTHING (tree byte-identical) yet still runs', () => {
    const dir = makeFixture();
    try {
      run(['enrich', 'models.ts', 'User', '--gen-dir', 'gen'], dir);
      const before = snapshot(join(dir, 'gen'));
      const {status} = run(['enrich', 'models.ts', 'User', '--no-emit', '--gen-dir', 'gen'], dir);
      const after = snapshot(join(dir, 'gen'));
      expect(after).toEqual(before);
      // --no-emit over a freshly-scaffolded mirror reports the @todo gate (exit 1).
      expect(status).toBe(1);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  it('compile --no-emit writes no genDir tree', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rt-cli-compile-'));
    try {
      writeFileSync(
        join(dir, 'tsconfig.json'),
        '{"compilerOptions":{"plugins":[{"name":"ts-runtypes","genDir":"gen"}]},"files":["main.ts"]}'
      );
      writeFileSync(join(dir, 'main.ts'), 'export const answer = 42;\n');
      const {status} = run(['compile', '--no-emit', '--gen-dir', 'gen'], dir);
      expect(status).toBe(0);
      expect(existsSync(join(dir, 'gen', 'types'))).toBe(false);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  it('enrich --prune --no-emit lists but never deletes', () => {
    const dir = makeFixture();
    try {
      mkdirSync(join(dir, 'gen/enriched/friendly'), {recursive: true});
      const mirror = join(dir, 'gen/enriched/friendly/models.ts');
      writeFileSync(mirror, "export const friendlyUser = {\n  // @rtOrphan\n  // stale: '',\n};\n");
      const before = readFileSync(mirror, 'utf8');
      run(['enrich', '--prune', '--no-emit', mirror], dir);
      expect(readFileSync(mirror, 'utf8')).toBe(before);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });
});
