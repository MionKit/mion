// Fuzz of the grouped log. The oracle reads a grouped block back into findings: every input finding must come
// back exactly once (name, level, place, rendered message, related lines), nothing extra, and the counts must add up.
// testdata/grouped/random.json pins the Go twin to the same bytes over random input, since CI may have no Go.

import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {formatGrouped, severityLabel} from '../src/core/groupedLog.ts';
import {Severity, type DiagnosticRelated, type GroupedEntry} from '../src/core/protocol.ts';

const RANDOM_CORPUS = path.resolve(
  import.meta.dirname,
  '../../../ts-go-runtypes/internal/diagnostics/testdata/grouped/random.json'
);
const CORPUS_SIZE = 100;
const SEED = Number(process.env.MION_FUZZ_SEED ?? 1);
const ITERATIONS = Number(process.env.MION_FUZZ_ITER ?? 2000);
const CWD = '/work/app';

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const TEMPLATES: {template: string; slots: string[]}[] = [
  {template: 'Type `{type}` can never be validated.', slots: ['type']},
  {template: 'The route `{route}` runs `{middleware}`, set it up.', slots: ['route', 'middleware']},
  {template: 'Make `{property}` optional (`{property}?`).', slots: ['property']},
  {template: '`{a}` at {b} of {c}, see {a}.', slots: ['a', 'b', 'c']},
  {template: 'Nothing to fill here.', slots: []},
];
// TypeScript errors arrive as finished text, chains included.
const FINISHED = [
  "Type 'string' is not assignable to type 'number'.",
  "Argument of type 'X' is not assignable.\n  Types of property 'a' are incompatible.\n    Deeper.",
];
const NAMES = [
  'validate-symbol-root',
  'rpc-client-middleware-not-set-up',
  'data-non-enumerable-required',
  'marker-type-id-collision',
];
// No `{word}` in a value: the oracle re-fills the message, and a value that looks like a slot would read back wrong.
const VALUES = [
  'Socket',
  'FileHandle',
  'A | B',
  '',
  'say "hi"',
  'tab\there',
  'line\nbreak',
  'back\\slash',
  'ünï',
  '{a: 1}',
  '0',
  'x',
];
const PATHS = ['/work/app/src/a.ts', '/work/app/src/b.ts', '/work/app/deep/c.ts', '/work/lib/out.ts', 'src/rel.ts', ''];

function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)];
}

function randomSite(rng: () => number): {filePath: string; startLine: number; startCol: number} {
  const filePath = pick(rng, PATHS);
  return {filePath, startLine: filePath && rng() < 0.9 ? 1 + Math.floor(rng() * 4) : 0, startCol: 1 + Math.floor(rng() * 3)};
}

function randomEntry(rng: () => number): GroupedEntry {
  const site = randomSite(rng);
  const related: DiagnosticRelated[] = [];
  if (rng() < 0.2) related.push({...randomSite(rng), message: pick(rng, ['first here', 'declared here'])});
  if (rng() < 0.2) {
    return {
      severity: pick(rng, [Severity.Error, Severity.Warning, Severity.Info]),
      name: pick(rng, ['TS2322', 'TS2345']),
      template: pick(rng, FINISHED),
      site,
      related,
    };
  }
  const {template, slots} = pick(rng, TEMPLATES);
  // Sometimes short of args: a slot with no arg renders empty.
  const argCount = rng() < 0.15 ? Math.floor(rng() * (slots.length + 1)) : slots.length;
  const args = Array.from({length: argCount}, () => pick(rng, VALUES));
  const downgraded = rng() < 0.15;
  const severity = downgraded ? Severity.Warning : pick(rng, [Severity.Error, Severity.Warning, Severity.Info]);
  return {
    severity,
    name: pick(rng, NAMES),
    template,
    slots,
    args,
    site,
    ...(related.length ? {related} : {}),
    ...(downgraded ? {downgraded} : {}),
  };
}

function randomEntries(seed: number): GroupedEntry[] {
  const rng = mulberry32(seed);
  return Array.from({length: Math.floor(rng() * 11)}, () => randomEntry(rng));
}

// ── the oracle ─────────────────────────────────────────────────────────────

function fill(template: string, slots: readonly string[], args: readonly string[]): string {
  return template.replace(/\{([A-Za-z]\w*)\}/g, (placeholder, name: string) => {
    const index = slots.indexOf(name);
    return index < 0 ? placeholder : (args[index] ?? '');
  });
}

function relative(filePath: string): string {
  if (!filePath.startsWith('/')) return filePath;
  const rel = path.posix.relative(CWD, filePath);
  return rel.startsWith('..') ? filePath : rel;
}

function location(site: {filePath: string; startLine: number; startCol: number}): string {
  const filePath = relative(site.filePath);
  if (filePath === '') return '(no file)';
  return site.startLine <= 0 ? filePath : `${filePath}:${site.startLine}:${site.startCol}`;
}

// One finding as the reader sees it; the multiset of these must survive formatting unchanged.
function expectedKey(entry: GroupedEntry): string {
  const message = entry.slots?.length ? fill(entry.template, entry.slots, entry.args ?? []) : entry.template;
  const related = (entry.related ?? []).map((pointer) => `Related: ${location(pointer)} ${pointer.message}`);
  return JSON.stringify([
    severityLabel(entry.severity),
    entry.name,
    entry.downgraded ?? false,
    location(entry.site),
    message,
    related,
  ]);
}

function unquote(value: string): string {
  if (!value.startsWith('"')) return value;
  return value.slice(1, -1).replace(/\\(.)/g, (_match, char: string) => ({n: '\n', r: '\r', t: '\t'})[char] ?? char);
}

// Site line after its indent: location, then `  name=value` pairs; a quoted value may hold spaces.
function parseSite(rest: string): {loc: string; values: Map<string, string>} {
  const pairs = [...rest.matchAll(/ {2}([A-Za-z]\w*)=("(?:[^"\\]|\\.)*"|\S+)/g)];
  const loc = pairs.length ? rest.slice(0, pairs[0].index) : rest;
  return {loc, values: new Map(pairs.map((pair) => [pair[1], unquote(pair[2])]))};
}

function readBack(text: string): {keys: string[]; problems: string[]} {
  const keys: string[] = [];
  const problems: string[] = [];
  const blocks = text.split('\n\n');
  const countLine = blocks.pop() ?? '';
  // A blank line can sit inside a message only if a template held one; the generator never writes one.
  for (const block of blocks) {
    const lines = block.split('\n');
    const header = /^(error|warning|info) (\S+) \((\d+)\)( \(downgraded\))?$/.exec(lines[0]);
    if (!header) {
      problems.push(`bad header ${JSON.stringify(lines[0])}`);
      continue;
    }
    let message: string[] = [];
    let current: {loc: string; values: Map<string, string>; related: string[]} | undefined;
    let sites = 0;
    const flush = () => {
      if (!current) return;
      const filled = message
        .join('\n')
        .replace(/\{([A-Za-z]\w*)\}/g, (placeholder, name: string) => current!.values.get(name) ?? placeholder);
      keys.push(JSON.stringify([header[1], header[2], Boolean(header[4]), current.loc, filled, current.related]));
      current = undefined;
    };
    for (const line of lines.slice(1)) {
      if (/^ {2}\S/.test(line)) {
        flush();
        message = [line.slice(2)];
      } else if (!current && line.startsWith('      ')) {
        message.push(line.slice(6));
      } else if (/^ {4}\S/.test(line)) {
        flush();
        current = {...parseSite(line.slice(4)), related: []};
        sites += 1;
      } else if (current && line.startsWith('      Related: ')) {
        current.related.push(line.slice(6));
      } else {
        problems.push(`unreadable line ${JSON.stringify(line)}`);
      }
    }
    flush();
    if (sites !== Number(header[3])) problems.push(`header says ${header[3]} sites, block holds ${sites}`);
  }
  if (!/^mion: \d+ (errors?|warnings?|info)/.test(countLine)) problems.push(`bad count line ${JSON.stringify(countLine)}`);
  return {keys, problems};
}

function expectedCountLine(entries: readonly GroupedEntry[]): string {
  const count = (severity: Severity) => entries.filter((entry) => entry.severity === severity).length;
  const parts = [
    [count(Severity.Error), 'error', 'errors'],
    [count(Severity.Warning), 'warning', 'warnings'],
    [count(Severity.Info), 'info', 'info'],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, one, many]) => `${n} ${n === 1 ? one : many}`);
  const files = new Set(entries.map((entry) => relative(entry.site.filePath)).filter((file) => file !== ''));
  return `mion: ${parts.join(', ')}${files.size ? ` in ${files.size} ${files.size === 1 ? 'file' : 'files'}` : ''}`;
}

// Undefined when the output tells the reader exactly the input findings; else what went wrong.
function checkGrouped(entries: readonly GroupedEntry[], text: string): string | undefined {
  if (entries.length === 0) return text === '' ? undefined : 'empty input must print nothing';
  const {keys, problems} = readBack(text);
  if (problems.length) return problems.join('; ');
  const want = entries.map(expectedKey).sort();
  const got = [...keys].sort();
  if (JSON.stringify(want) !== JSON.stringify(got))
    return `findings differ\nwant ${JSON.stringify(want)}\ngot  ${JSON.stringify(got)}`;
  const countLine = text.slice(text.lastIndexOf('\n') + 1);
  if (countLine !== expectedCountLine(entries))
    return `count line ${JSON.stringify(countLine)}, want ${JSON.stringify(expectedCountLine(entries))}`;
  return undefined;
}

interface RandomCase {
  seed: number;
  entries: GroupedEntry[];
  want: string;
}

describe('grouped log fuzz', () => {
  it(`every finding reads back exactly once (seed ${SEED}, ${ITERATIONS} runs)`, () => {
    for (let run = 0; run < ITERATIONS; run++) {
      const entries = randomEntries(SEED * 100_003 + run);
      const failure = checkGrouped(entries, formatGrouped(entries, CWD));
      if (failure) throw new Error(`seed ${SEED * 100_003 + run}: ${failure}`);
    }
  });

  it('the oracle catches a lost site, a changed value and a wrong count (negative controls)', () => {
    const {template, slots} = TEMPLATES[1];
    const entries: GroupedEntry[] = [
      {
        severity: Severity.Error,
        name: NAMES[1],
        template,
        slots,
        args: ['users/get', 'auth'],
        site: {filePath: PATHS[0], startLine: 2, startCol: 1},
      },
      {
        severity: Severity.Error,
        name: NAMES[1],
        template,
        slots,
        args: ['users/get', 'audit'],
        site: {filePath: PATHS[1], startLine: 3, startCol: 1},
      },
    ];
    const text = formatGrouped(entries, CWD);
    const siteLine = text.split('\n').find((line) => /^ {4}\S/.test(line))!;
    expect(checkGrouped(entries, text.replace(`${siteLine}\n`, ''))).toBeDefined();
    expect(checkGrouped(entries, text.replace(/=(\S+)/, '=changed'))).toBeDefined();
    expect(
      checkGrouped(
        entries,
        text.replace(/\((\d+)\)/, (_m, n: string) => `(${Number(n) + 1})`)
      )
    ).toBeDefined();
    expect(
      checkGrouped(
        entries,
        text.replace(/mion: (\d+)/, (_m, n: string) => `mion: ${Number(n) + 1}`)
      )
    ).toBeDefined();
    expect(checkGrouped(entries, text)).toBeUndefined();
  });

  // MION_UPDATE_GOLDEN=1 rewrites the corpus from this side; the Go test then holds Go to the same bytes.
  it('Go printed the same bytes for the random corpus, and its output reads back too', () => {
    const fresh = Array.from({length: CORPUS_SIZE}, (_, index) => {
      const entries = randomEntries(index + 1);
      return {seed: index + 1, entries, want: formatGrouped(entries, CWD)};
    });
    if (process.env.MION_UPDATE_GOLDEN === '1') writeFileSync(RANDOM_CORPUS, `${JSON.stringify({cwd: CWD, cases: fresh})}\n`);
    const corpus = JSON.parse(readFileSync(RANDOM_CORPUS, 'utf8')) as {cwd: string; cases: RandomCase[]};
    expect(corpus.cases.map((testCase) => testCase.entries ?? [])).toEqual(fresh.map((testCase) => testCase.entries));
    for (const testCase of corpus.cases) {
      expect(formatGrouped(testCase.entries ?? [], corpus.cwd), `seed ${testCase.seed}`).toBe(testCase.want);
      expect(checkGrouped(testCase.entries ?? [], testCase.want), `seed ${testCase.seed}`).toBeUndefined();
    }
  });
});
