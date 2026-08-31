// CLI surface contract test — the regression guard for the binary's args[0]
// command set. Four groups over the built bin/ts-runtypes:
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
//   - Symlinked project paths: a source reached through a symlink still mirrors to
//     its rootDir-relative sub-path instead of collapsing to its base name.

import {describe, it, expect, beforeAll} from 'vitest';
import {fileURLToPath} from 'node:url';
import {resolve, dirname, join} from 'node:path';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  symlinkSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {runCli, type CliResult} from './helpers/cliCrash.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const BIN = resolve(REPO_ROOT, 'bin/ts-runtypes');
const hasBinary = existsSync(BIN);

type RunResult = CliResult;

function run(args: string[], cwd?: string): RunResult {
  return runCli(args, {cwd, label: `cli-${args[0] ?? 'surface'}`});
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
  writeFileSync(join(dir, 'tsconfig.json'), '{"compilerOptions":{"plugins":[{"name":"mion","genDir":"gen"}]}}');
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
    const {status, stderr, report} = run(['definitely-not-a-command']);
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
      expect(stdout).toContain('mion <command>');
    }
  });

  it('--version -> exit 0', () => {
    const {status, stdout} = run(['--version']);
    expect(status).toBe(0);
    expect(stdout).toContain('mion');
  });

  it('enrich <file> without a Type (no --no-emit) -> disambiguation error, exit 1', () => {
    const dir = makeFixture();
    try {
      const {status, stderr, report} = run(['enrich', 'models.ts'], dir);
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

  it('enrich --no-emit writes NOTHING and TOLERATES fresh @todo; --require-complete gates it', () => {
    const dir = makeFixture();
    try {
      run(['enrich', 'models.ts', 'User', '--gen-dir', 'gen'], dir);
      const before = snapshot(join(dir, 'gen'));

      // Default health check: reports the @todo worklist but EXITS 0 — a freshly
      // scaffolded mirror's blanks are the expected state, not an error. Writes nothing.
      const noEmit = run(['enrich', 'models.ts', 'User', '--no-emit', '--gen-dir', 'gen'], dir);
      expect(snapshot(join(dir, 'gen'))).toEqual(before);
      expect(noEmit.status).toBe(0);

      // Completeness gate: the SAME unfilled @todo now fails (exit 1), still writing nothing.
      const requireComplete = run(['enrich', 'models.ts', 'User', '--require-complete', '--gen-dir', 'gen'], dir);
      expect(snapshot(join(dir, 'gen'))).toEqual(before);
      expect(requireComplete.status).toBe(1);
      expect(requireComplete.stdout + requireComplete.stderr).toMatch(/FT020|MD020/);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

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

// Creating a symlink needs a privilege Windows withholds by default, so probe once
// and let the group skip cleanly rather than fail there.
const symlinksAvailable = ((): boolean => {
  const probe = mkdtempSync(join(tmpdir(), 'rt-symlink-probe-'));
  try {
    mkdirSync(join(probe, 'target'));
    symlinkSync(join(probe, 'target'), join(probe, 'link'), 'dir');
    return true;
  } catch {
    return false;
  } finally {
    rmSync(probe, {recursive: true, force: true});
  }
})();

// makeSymlinkedFixture builds a project with NESTED sources under two directories
// that share a base name, and hands back both spellings of its root: the real
// directory and a symlink pointing at it.
function makeSymlinkedFixture(): {base: string; real: string; linked: string} {
  const base = mkdtempSync(join(tmpdir(), 'rt-symlink-'));
  const real = join(base, 'project');
  mkdirSync(join(real, 'src'), {recursive: true});
  mkdirSync(join(real, 'lib'), {recursive: true});
  writeFileSync(join(real, 'tsconfig.json'), '{"compilerOptions":{"plugins":[{"name":"mion","genDir":"gen"}]}}');
  writeFileSync(join(real, 'src', 'models.ts'), 'export interface User { id: number; name: string }\n');
  writeFileSync(join(real, 'lib', 'models.ts'), 'export interface Account { ref: string }\n');
  const linked = join(base, 'link');
  symlinkSync(real, linked, 'dir');
  return {base, real, linked};
}

// The cwd a process reports is not one fixed spelling: os.Getwd prefers $PWD when
// it is valid, so an interactive shell reports the symlinked path while a spawn
// that passes a cwd option (leaving $PWD stale — what these tests do, and what a
// dev-loop save handler does) reports the kernel-resolved one. Both must agree
// with the absolute file argument, or the mirror's rootDir-relative sub-path
// escapes with ".." and silently collapses to the source's base name.
describe.skipIf(!hasBinary || !symlinksAvailable)('CLI surface — symlinked project paths', () => {
  it('an absolute source spelled through a symlink keeps its rootDir-relative sub-path', () => {
    const {base, real, linked} = makeSymlinkedFixture();
    try {
      const {status, stderr, report} = run(
        ['enrich', join(linked, 'src', 'models.ts'), 'User', '--gen-dir', join(linked, 'gen')],
        join(linked, 'src')
      );
      expect(status, report).toBe(0);
      expect(existsSync(join(real, 'gen/enriched/friendly/src/models.ts')), 'nested sub-path must survive').toBe(true);
      expect(existsSync(join(real, 'gen/enriched/friendly/models.ts')), 'must not collapse to the base name').toBe(false);
    } finally {
      rmSync(base, {recursive: true, force: true});
    }
  }, 60_000);

  it('two sources sharing a base name mirror to their own files, never one shared file', () => {
    const {base, real, linked} = makeSymlinkedFixture();
    try {
      for (const sub of ['src', 'lib']) {
        const typeName = sub === 'src' ? 'User' : 'Account';
        const {status, stderr, report} = run(
          ['enrich', join(linked, sub, 'models.ts'), typeName, '--gen-dir', join(linked, 'gen')],
          join(linked, sub)
        );
        expect(status, report).toBe(0);
      }
      // Collapsing to the base name would have let the second run overwrite the first.
      const friendly = join(real, 'gen/enriched/friendly');
      expect(readFileSync(join(friendly, 'src/models.ts'), 'utf8')).toContain('friendlyUser');
      expect(readFileSync(join(friendly, 'lib/models.ts'), 'utf8')).toContain('friendlyAccount');
    } finally {
      rmSync(base, {recursive: true, force: true});
    }
  }, 60_000);
});

// The pre-publish e2e fixture drives this CLI (container/pre-publish-e2e/build-all.mjs
// scaffolds the shared app's enrichment mirrors before any app builds), but nothing
// on the host runs that script: no vitest project covers container/, so the fixture
// is only exercised inside the release-gate container. When `gen` was merged into
// `enrich`, the rename reached the packages, the docs and the skills — and left the
// fixture calling a verb that no longer existed. The binary answers an unknown verb
// with usage and exit 2, so the matrix died before the builds, the assertions and the
// lint transport: the gate was red on main and nothing said so until release time.
//
// This is the cheap host-side guard for that class: read the argv the fixture ACTUALLY
// passes and check every verb and long flag against the live binary's own help. It
// needs no project, no container and no network — one --help per verb.
describe.skipIf(!hasBinary)('CLI surface — the e2e fixture only uses verbs this binary has', () => {
  const E2E_DIR = resolve(REPO_ROOT, 'container/pre-publish-e2e');

  // Every `cli([...])` call in the fixture scripts, as its list of string literals.
  // Non-literal arguments (variables like `model`) are skipped — a verb and its
  // flags are always spelled out, which is exactly what can go stale.
  function fixtureInvocations(): {file: string; argv: string[]}[] {
    const found: {file: string; argv: string[]}[] = [];
    for (const entry of readdirSync(E2E_DIR)) {
      if (!entry.endsWith('.mjs')) continue;
      const source = readFileSync(join(E2E_DIR, entry), 'utf8');
      for (const match of source.matchAll(/\bcli\(\[([^\]]*)\]\)/g)) {
        const argv = [...match[1].matchAll(/'([^']*)'/g)].map((literal) => literal[1]);
        if (argv.length > 0) found.push({file: entry, argv});
      }
    }
    return found;
  }

  const commandSet = (): Set<string> => {
    const commands = new Set<string>();
    // The "Commands:" block lists `    <verb>   <description>` rows.
    const body = run(['--help']).stdout.split('Commands:')[1] ?? '';
    for (const line of body.split('\n')) {
      const match = /^\s{2,}([a-z][a-z-]*)\s{2,}\S/.exec(line);
      if (match) commands.add(match[1]);
    }
    return commands;
  };

  const flagSet = (verb: string): Set<string> => {
    const help = run([verb, '--help']);
    // Digits count: --i18n would truncate to --i under a letters-only class.
    return new Set([...`${help.stdout}${help.stderr}`.matchAll(/(--[a-z][a-z0-9-]*)/g)].map((match) => match[1]));
  };

  it('finds the fixture invocations at all (the parse must not silently match nothing)', () => {
    const invocations = fixtureInvocations();
    expect(invocations.length).toBeGreaterThan(0);
    expect(invocations.every(({argv}) => argv[0] && !argv[0].startsWith('-'))).toBe(true);
  });

  it('every verb the fixture calls exists', () => {
    const commands = commandSet();
    expect(commands.size).toBeGreaterThan(0);
    for (const {file, argv} of fixtureInvocations()) {
      expect(commands, `${file} calls '${argv[0]}', which this binary does not accept`).toContain(argv[0]);
    }
  });

  it('every long flag the fixture passes exists on that verb', () => {
    const flagsByVerb = new Map<string, Set<string>>();
    for (const {file, argv} of fixtureInvocations()) {
      const [verb, ...rest] = argv;
      if (!flagsByVerb.has(verb)) flagsByVerb.set(verb, flagSet(verb));
      const accepted = flagsByVerb.get(verb)!;
      for (const flag of rest.filter((arg) => arg.startsWith('--'))) {
        expect(accepted, `${file} passes '${flag}' to '${verb}', which does not accept it`).toContain(flag);
      }
    }
  });
});
