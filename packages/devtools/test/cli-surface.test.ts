// Guards the built mion-bin/mion args[0] command set: help golden, verb routing + exit codes, compile --no-emit.
// printUsage walks every flag, so the golden holds the whole surface; regenerate: pnpm exec vitest run cli-surface -u

import {describe, it, expect} from 'vitest';
import {fileURLToPath} from 'node:url';
import {resolve, dirname, join} from 'node:path';
import {mkdtempSync, writeFileSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {runCli, type CliResult} from './helpers/cliCrash.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const BIN = resolve(REPO_ROOT, 'mion-bin/mion');
const hasBinary = existsSync(BIN);

type RunResult = CliResult;

function run(args: string[], cwd?: string): RunResult {
  return runCli(args, {cwd, label: `cli-${args[0] ?? 'surface'}`});
}

describe.skipIf(!hasBinary)('CLI surface — help golden', () => {
  it('top-level usage (no args)', () => {
    const {stderr, status} = run([]);
    expect(status).toBe(2);
    expect(stderr).toMatchSnapshot();
  });

  for (const cmd of ['serve', 'compile']) {
    it(`${cmd} --help`, () => {
      // -h / --help print to stderr via fs.Usage; capture both streams.
      const {stdout, stderr} = run([cmd, '-h']);
      expect(stdout + stderr).toMatchSnapshot();
    });
  }
});

describe.skipIf(!hasBinary)('CLI surface — routing + exit codes', () => {
  it('unknown command -> exit 2 + usage', () => {
    const {status, stderr, report} = run(['definitely-not-a-command']);
    expect(status).toBe(2);
    expect(stderr).toContain('unknown command');
  });

  it('-h / --help -> exit 0 usage on stdout', () => {
    for (const flag of ['-h', '--help']) {
      const {status, stdout} = run([flag]);
      expect(status).toBe(0);
      expect(stdout).toContain('mion <command>');
    }
  });

  it('--version -> exit 0', () => {
    const {status, stdout} = run(['--version']);
    expect(status).toBe(0);
    expect(stdout).toContain('mion');
  });
});

describe.skipIf(!hasBinary)('CLI surface — parameter-effect matrix', () => {
  it('compile --no-emit writes no genDir tree', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rt-cli-compile-'));
    try {
      writeFileSync(
        join(dir, 'tsconfig.json'),
        '{"compilerOptions":{"plugins":[{"name":"mion","genDir":"gen"}]},"files":["main.ts"]}'
      );
      writeFileSync(join(dir, 'main.ts'), 'export const answer = 42;\n');
      const {status} = run(['compile', '--no-emit', '--gen-dir', 'gen'], dir);
      expect(status).toBe(0);
      expect(existsSync(join(dir, 'gen', 'types'))).toBe(false);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });
});
