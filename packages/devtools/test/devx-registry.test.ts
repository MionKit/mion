// The miondevx command registry (scripts/lib/devx-registry.mjs) is ONE table
// behind three things: the help text, the per-area usage lines, and the build
// gate the entry point runs before a command. These pin the table's shape, the
// gate's answers for the commands whose posture matters, and the help layout
// (one line per command, one indented line per flag, nothing past 100 columns).
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
// Plain ESM dev script, no types: one directive per import line, so the formatter
// can never wrap the import away from the line the error lands on.
// @ts-expect-error untyped .mjs
import {AREAS, CLI, HELP_WIDTH, TOP, commandNames, needsEngine} from '../../../scripts/lib/devx-registry.mjs';
// @ts-expect-error untyped .mjs
import {drizzleE2ePacksItself, e2ePacksItself, renderHelp, usage} from '../../../scripts/lib/devx-registry.mjs';

const REPO_ROOT = join(__dirname, '../../..');

type Row = {
  name: string;
  args?: string;
  summary: string;
  flags?: [string, string][];
  build?: false | ((args: string[]) => boolean);
  commands?: Row[];
};
type Area = {summary: string; flags?: [string, string][]; build?: false; commands: Row[]};

const areas = AREAS as Record<string, Area>;
const top = TOP as Row[];
const allRows = (rows: Row[]): Row[] => rows.flatMap((row) => [row, ...allRows(row.commands ?? [])]);

describe('devx registry — table shape', () => {
  it('every area and every command carries a plain summary', () => {
    for (const [name, area] of Object.entries(areas)) {
      expect(area.summary, name).toMatch(/\S/);
      for (const row of allRows(area.commands)) expect(row.summary, `${name} ${row.name}`).toMatch(/\S/);
    }
    for (const row of top) expect(row.summary, row.name).toMatch(/\S/);
  });

  it('every flag spec starts with -- and its help is non-empty', () => {
    const flags: [string, string][] = [];
    for (const area of Object.values(areas)) {
      flags.push(...(area.flags ?? []));
      for (const row of allRows(area.commands)) flags.push(...(row.flags ?? []));
    }
    for (const row of top) flags.push(...(row.flags ?? []));
    expect(flags.length).toBeGreaterThan(20);
    for (const [spec, help] of flags) {
      expect(spec).toMatch(/^--[a-z][a-z-]*( <[^>]+>)?$/);
      expect(help).toMatch(/\S/);
    }
  });

  it('command names are unique within an area', () => {
    for (const [name, area] of Object.entries(areas)) {
      const names = commandNames(name) as string[];
      expect(new Set(names).size, name).toBe(names.length);
    }
  });

  it('the usage line lists every command of the area, from the table', () => {
    for (const name of Object.keys(areas)) {
      const line = usage(name) as string;
      expect(line.startsWith(`usage: ${CLI} ${name} <`)).toBe(true);
      for (const command of commandNames(name) as string[]) expect(line).toContain(command);
    }
  });
});

describe('devx registry — the build gate', () => {
  const cases: [string | undefined, string[], boolean][] = [
    // core: the build command and the read-only / go-run commands never build
    ['core', ['build'], false],
    ['core', ['build', 'go'], false],
    ['core', ['build', '--trust-stamp'], false],
    ['core', ['fuzz-lanes'], false],
    ['core', ['drizzle-suites', '--check'], false],
    ['core', ['drizzle-manifest', '--check'], false],
    ['core', ['ensure-tsgolint'], false],
    ['core', ['bump-tsgolint'], false],
    ['core', ['test-batches', '--check'], false],
    ['core', ['test-batches', '--list'], false],
    ['core', ['test-batches'], true],
    ['core', ['fuzz', 'value', '--quick'], true],
    ['core', ['smoke'], true],
    ['core', ['codegen', 'all', '--check'], true],
    // website: everything builds except the static check and the debug shell
    ['website', ['dev'], true],
    ['website', ['container-build'], true],
    ['website', ['check', '--docs'], true],
    ['website', ['check', '--static'], false],
    ['website', ['shell'], false],
    // bench: the bare run and the verbs build; image plumbing does not
    ['bench', [], true],
    ['bench', ['--quick'], true],
    ['bench', ['typecheck'], true],
    ['bench', ['clean'], false],
    ['bench', ['servers', 'sweep'], true],
    ['bench', ['servers', 'pull'], false],
    ['bench', ['servers', 'aggregate'], false],
    // release: the pnpm-free publish job and the npm-side steps never build
    ['release', [], false],
    ['release', ['tarballs'], false],
    ['release', ['stage-approve', '--dry-run'], false],
    ['release', ['verify-live'], false],
    ['release', ['bump', '1.2.3'], false],
    ['release', ['binaries'], false],
    ['release', ['pack'], false],
    // preflight and the chain open with a hard clean, then build themselves
    ['release', ['preflight'], false],
    ['release', ['all', '--dry-run'], false],
    // areas that never touch the engine
    ['container', ['pull'], false],
    ['container', [], false],
    ['env', [], false],
    ['env', ['--create-env'], false],
    // top-level verbs
    ['verify', [], true],
    ['fmt', ['--check'], false],
    ['clean', ['--dry-run'], false],
    // help never builds; neither does an unknown word: the dispatchers refuse
    // anything not in the table, so a typo only ever reaches the usage error
    [undefined, [], false],
    ['--help', [], false],
    ['core', ['--help'], false],
    ['core', ['fuzz', '--help'], false],
    ['release', ['e2e', '--help'], false],
    ['core', ['bogus'], false],
    ['release', ['pacK'], false],
    ['bench', ['servers', 'bogus'], false],
    ['bogus', [], false],
  ];
  for (const [verb, rest, expected] of cases) {
    it(`${[verb ?? '(bare)', ...rest].join(' ')} -> ${expected}`, () => {
      expect(needsEngine(verb, rest)).toBe(expected);
    });
  }

  it('bare `release` never builds: its default only prints help', () => {
    expect(needsEngine('release', [])).toBe(false);
  });

  // The e2e lanes run in CI on a checkout with no Go submodule, consuming the
  // tarballs the build job packed: they may only demand the engine when they
  // are about to pack themselves.
  it('e2e builds only when it will pack: no tarballs, or --pack, never on --backend npm', () => {
    expect(e2ePacksItself([], {tarballs: true})).toBe(false);
    expect(e2ePacksItself(['--backend', 'container'], {tarballs: true})).toBe(false);
    expect(e2ePacksItself(['--backend', 'container'], {tarballs: false})).toBe(true);
    expect(e2ePacksItself([], {tarballs: false})).toBe(true);
    expect(e2ePacksItself(['--pack'], {tarballs: true})).toBe(true);
    expect(e2ePacksItself(['--backend', 'npm'], {tarballs: false})).toBe(false);
    expect(e2ePacksItself(['--backend=npm', '--no-matrix'], {tarballs: false})).toBe(false);
  });

  it('drizzle-e2e builds only when nothing is packed yet', () => {
    expect(drizzleE2ePacksItself(['--dialect', 'pg'], {tarballs: true})).toBe(false);
    expect(drizzleE2ePacksItself(['--dialect', 'pg'], {tarballs: false})).toBe(true);
  });

  it('the e2e rows route the gate through those helpers', () => {
    const release = areas.release.commands;
    const e2e = release.find((row) => row.name === 'e2e')!;
    const drizzle = release.find((row) => row.name === 'drizzle-e2e')!;
    expect(typeof e2e.build).toBe('function');
    expect(typeof drizzle.build).toBe('function');
    expect((e2e.build as (args: string[]) => boolean)(['--backend', 'npm'])).toBe(false);
  });
});

describe('devx registry — help layout', () => {
  const full = renderHelp() as string;
  const lines = full.split('\n');

  it('the full help names every area and every command, one line each, no flags', () => {
    expect(lines[0]).toContain(CLI);
    for (const [name, area] of Object.entries(areas)) {
      expect(full).toContain(`${name.padEnd(9)} `);
      for (const row of area.commands)
        expect(
          lines.some((line) => line.startsWith(`  ${row.name}`)),
          `${name} ${row.name}`
        ).toBe(true);
    }
    for (const row of top) expect(lines.some((line) => line.startsWith(row.name))).toBe(true);
    expect(lines.some((line) => /^\s+--/.test(line))).toBe(false);
  });

  it('an area help lists every flag on its own line, indented deeper than its command', () => {
    for (const [name, area] of Object.entries(areas)) {
      const text = renderHelp(name) as string;
      const areaLines = text.split('\n');
      expect(areaLines[0].startsWith(`${name.padEnd(9)} `)).toBe(true);
      for (const [spec] of area.flags ?? [])
        expect(
          areaLines.some((line) => line.startsWith(`      ${spec}`)),
          `${name} ${spec}`
        ).toBe(true);
      for (const row of area.commands) {
        const at = areaLines.findIndex((line) => line.startsWith(`  ${row.name}`));
        expect(at, `${name} ${row.name}`).toBeGreaterThanOrEqual(0);
        for (const [spec] of row.flags ?? []) {
          const flagAt = areaLines.findIndex((line, i) => i > at && line.startsWith(`      ${spec}`));
          expect(flagAt, `${name} ${row.name} ${spec}`).toBeGreaterThan(at);
        }
      }
    }
  });

  it('every command name in an area help also appears in the full help (one source)', () => {
    for (const name of Object.keys(areas)) {
      for (const command of commandNames(name) as string[]) expect(full).toContain(`  ${command}`);
    }
  });

  it(`no rendered line exceeds ${HELP_WIDTH} columns`, () => {
    const everything = [full, ...Object.keys(areas).map((name) => renderHelp(name) as string)].join('\n');
    for (const line of everything.split('\n')) expect(line.length, line).toBeLessThanOrEqual(HELP_WIDTH);
  });

  it('rejects an unknown area', () => {
    expect(() => renderHelp('nope')).toThrow(/unknown area/);
  });
});

describe('devx registry — the entry file dispatches exactly the registered commands', () => {
  const entry = readFileSync(join(REPO_ROOT, 'scripts/miondevx.mjs'), 'utf8');

  it('every `sub === ...` literal in an area dispatcher is a registered command', () => {
    const registered = new Set(Object.keys(areas).flatMap((name) => commandNames(name) as string[]));
    for (const match of entry.matchAll(/sub === '([a-z-]+)'/g)) expect(registered.has(match[1]), match[1]).toBe(true);
  });

  it('every registered core / website / release command is reachable from its dispatcher', () => {
    for (const command of commandNames('core') as string[]) expect(entry, `core ${command}`).toContain(`sub === '${command}'`);
    for (const command of commandNames('website') as string[])
      expect(entry, `website ${command}`).toContain(`sub === '${command}'`);
    for (const command of commandNames('release') as string[]) {
      const reachable =
        entry.includes(`${command}: ['`) || entry.includes(`'${command}': ['`) || entry.includes(`sub === '${command}'`);
      expect(reachable, `release ${command}`).toBe(true);
    }
  });
});
