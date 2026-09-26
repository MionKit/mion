/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Every dialect's next/ test files hold the same tests. A dialect-only test says so in its name:
// `only pg, mysql: ...` in a title or an @ts-expect-error reason, `OnlyPgMysql_` on a pin tuple.

import {describe, it, expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

/** Every dialect with a next/ folder, in the order an only list names them; a new dialect joins the check here. */
const DIALECTS = ['pg', 'mysql', 'sqlite'] as const;
type Dialect = (typeof DIALECTS)[number];

const FILES = [
  'test/next/typeTables.spec.ts',
  'test/next/type-pins.stub.ts',
  'test/next/drizzleTypeSource.integration.spec.ts',
  'test/tableEquality.fuzz.spec.ts',
];

const PACKAGES_DIR = fileURLToPath(new URL('../..', import.meta.url));
const readTestFile = (dialect: Dialect, file: string) =>
  readFileSync(`${PACKAGES_DIR}drizzle-orm-${dialect}-core/${file}`, 'utf8');

const capitalized = (dialect: string) => dialect[0].toUpperCase() + dialect.slice(1);
const DIALECT_WORD = new RegExp(`\\b(${DIALECTS.join('|')})\\b`, 'g');
const ONLY_PREFIX = new RegExp(`(^|: )only ((?:${DIALECTS.join('|')})(?:, (?:${DIALECTS.join('|')}))*): `);
const ONLY_PIN = new RegExp(`^Only((?:${DIALECTS.map(capitalized).join('|')})+)_(\\w+)$`);
const TITLE_CALL = /\b(describe|it|it\.fails|register)\(\s*(['`])((?:\\.|(?!\2).)*)\2/g;

interface Item {
  /** The name every dialect spells the same way. */
  key: string;
  /** The dialects the item must exist in. */
  expected: readonly Dialect[];
}

function onlyList(text: string, where: string, errors: string[]): {rest: string; dialects?: Dialect[]} {
  const match = ONLY_PREFIX.exec(text);
  if (!match) return {rest: text};
  const dialects = match[2].split(', ') as Dialect[];
  const ordered = DIALECTS.filter((dialect) => dialects.includes(dialect));
  if (ordered.join() !== dialects.join()) errors.push(`${where}: list the dialects in order (${ordered.join(', ')})`);
  if (ordered.length === DIALECTS.length) errors.push(`${where}: names every dialect, drop the only prefix`);
  return {rest: text.slice(0, match.index) + match[1] + text.slice(match.index + match[0].length), dialects: ordered};
}

const normalize = (text: string) => text.replace(DIALECT_WORD, '<dialect>').replace(/\$\{[^}]*\}/g, '${}');
/** The text every dialect spells the same, its only list kept verbatim. */
const keyOf = (rest: string, dialects: readonly Dialect[] | undefined) =>
  normalize(rest) + (dialects ? ` [only ${dialects.join(', ')}]` : '');

/** The titles, pin tuples and rejection reasons of one test file. */
function itemsOf(source: string, where: string, errors: string[]): Item[] {
  const items: Item[] = [];
  let group: {key: string; expected: readonly Dialect[]} = {key: '', expected: DIALECTS};
  for (const [, call, , title] of source.matchAll(TITLE_CALL)) {
    const {rest, dialects} = onlyList(title, `${where} "${title}"`, errors);
    if (call === 'describe') {
      group = {key: keyOf(rest, dialects), expected: dialects ?? DIALECTS};
      items.push({key: `describe ${group.key}`, expected: group.expected});
    } else {
      items.push({key: `it ${group.key} > ${keyOf(rest, dialects)}`, expected: dialects ?? group.expected});
    }
  }
  for (const [, name] of source.matchAll(/^export type (\w+Pins)\b/gm)) {
    const match = ONLY_PIN.exec(name);
    if (!match) {
      items.push({key: `pins ${name}`, expected: DIALECTS});
      continue;
    }
    const dialects = DIALECTS.filter((dialect) => match[1].includes(capitalized(dialect)));
    if (dialects.map(capitalized).join('') !== match[1]) errors.push(`${where} ${name}: list the dialects in order`);
    items.push({key: `pins ${name}`, expected: dialects});
  }
  for (const [, reason] of source.matchAll(/\/\/ @ts-expect-error (.+)$/gm)) {
    const {rest, dialects} = onlyList(reason, `${where} @ts-expect-error "${reason}"`, errors);
    items.push({key: `rejects ${keyOf(rest, dialects)}`, expected: dialects ?? DIALECTS});
  }
  return items;
}

export function parityErrors(read: (dialect: Dialect, file: string) => string): string[] {
  const errors: string[] = [];
  for (const file of FILES) {
    const found = new Map<string, {expected: readonly Dialect[]; in: Set<Dialect>}>();
    for (const dialect of DIALECTS) {
      for (const item of itemsOf(read(dialect, file), `${dialect} ${file}`, errors)) {
        const entry = found.get(item.key) ?? {expected: item.expected, in: new Set<Dialect>()};
        if (entry.in.has(dialect)) errors.push(`${dialect} ${file}: "${item.key}" appears twice`);
        entry.in.add(dialect);
        found.set(item.key, entry);
      }
    }
    for (const [key, entry] of found) {
      for (const dialect of DIALECTS) {
        const wanted = entry.expected.includes(dialect);
        if (wanted && !entry.in.has(dialect)) errors.push(`${dialect} ${file}: missing "${key}"`);
        if (!wanted && entry.in.has(dialect))
          errors.push(`${dialect} ${file}: "${key}" is marked only for ${entry.expected.join(', ')}`);
      }
    }
  }
  return errors;
}

describe('next dialect parity', () => {
  it('every dialect holds the same next/ tests, dialect-only ones marked', () => {
    const errors = parityErrors(readTestFile);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  // Negative controls over a small in-memory copy of the three files.
  const sample: Record<Dialect, string> = {
    pg: `describe('next pg columns: views', () => { it('a view materializes', () => {}); it('only pg: a materialized view', () => {}); });`,
    mysql: `describe('next mysql columns: views', () => { it('a view materializes', () => {}); });`,
    sqlite: `describe('next sqlite columns: views', () => { it('a view materializes', () => {}); });`,
  };
  const readSample = (overrides: Partial<Record<Dialect, string>>) => (dialect: Dialect, file: string) =>
    file === FILES[0] ? (overrides[dialect] ?? sample[dialect]) : '';

  it('the sample passes, so the controls below test one change each', () => {
    expect(parityErrors(readSample({}))).toEqual([]);
  });
  it('a title renamed in one dialect fails', () => {
    const renamed = sample.mysql.replace('a view materializes', 'a view builds');
    expect(parityErrors(readSample({mysql: renamed})).length).toBeGreaterThan(0);
  });
  it('an unmarked test added to one dialect fails', () => {
    const added = sample.sqlite.replace('});', "}); it('a view is extra', () => {});");
    expect(parityErrors(readSample({sqlite: added}))).toContainEqual(expect.stringContaining('missing'));
  });
  it('a marked test in a dialect it does not name fails', () => {
    const marked = sample.mysql.replace('});', "}); it('only pg: a materialized view', () => {});");
    expect(parityErrors(readSample({mysql: marked}))).toContainEqual(expect.stringContaining('marked only for pg'));
  });
  it('a pin tuple and a rejection reason follow the same rule', () => {
    const pins = (dialect: Dialect) =>
      `export type ViewPins = [];\n// @ts-expect-error only mysql: varchar needs its length\n${dialect === 'mysql' ? '' : 'export type OnlyPg_RlsPins = [];'}`;
    const errors = parityErrors((dialect, file) => (file === FILES[1] ? pins(dialect) : ''));
    expect(errors).toContainEqual(expect.stringContaining('OnlyPg_RlsPins" is marked only for pg'));
    expect(errors).toContainEqual(expect.stringContaining('[only mysql]" is marked only for mysql'));
  });
});
