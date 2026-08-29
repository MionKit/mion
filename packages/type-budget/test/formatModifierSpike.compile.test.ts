// SPIKE (docs/maybe/drizzle-column-format-modifier.md): what would a
// `.format({...})` modifier on the column chain cost, compared with the
// `refineTableType(table, {...})` we ship today?
//
// Both express the same thing: extra type-format params merged into a column's
// captured ones. `.format()` merges ONE column inside the builder chain;
// refineTableType rebuilds the WHOLE table through a mapped type, so it also
// pays for every column it does not touch. That is what these cases price.
//
// The prototype under measurement is the `format()` method on the pg kind
// interfaces (packages/drizzle-orm-pg-core/src/columns.ts) plus its runtime
// no-op on RtColumnRecorder. Delete this suite together with the prototype if
// the idea is dropped.

import {describe, it, expect} from 'vitest';
import {measurePipeline} from './modelPipelineHarness.ts';

const TABLE_3_COLS = (formatted: boolean) => `
const users = pgTable('users', {
  name: varchar('name', {length: 100}).notNull()${formatted ? '.format({minLength: 10})' : ''},
  age: integer('age').notNull()${formatted ? '.format({min: 18})' : ''},
  createdAt: timestamp('created_at', {mode: 'date'}).notNull().defaultNow(),
});
`;

const READ = (table: string) => `
declare const row: InferSelectModel<typeof ${table}>;
export const rowName: string = row.name;
export const rowAge: number = row.age;
export const rowWhen: Date = row.createdAt;
`;

const REFINE_LANE =
  TABLE_3_COLS(false) + `const apiUsers = refineTableType(users, {name: {minLength: 10}, age: {min: 18}});` + READ('apiUsers');
const FORMAT_LANE = TABLE_3_COLS(true) + READ('users');

/** Twelve columns, still only two of them constrained: the width term is
 *  refineTableType's alone, `.format()` never sees the other ten. */
const WIDE = (formatted: boolean) => `
const wide = pgTable('wide', {
  c1: varchar('c1', {length: 100}).notNull()${formatted ? '.format({minLength: 10})' : ''},
  c2: integer('c2').notNull()${formatted ? '.format({min: 18})' : ''},
  c3: varchar('c3', {length: 10}).notNull(),
  c4: varchar('c4', {length: 10}).notNull(),
  c5: varchar('c5', {length: 10}).notNull(),
  c6: integer('c6').notNull(),
  c7: integer('c7').notNull(),
  c8: integer('c8').notNull(),
  c9: timestamp('c9', {mode: 'date'}).notNull(),
  c10: timestamp('c10', {mode: 'date'}).notNull(),
  c11: varchar('c11', {length: 10}).notNull(),
  c12: integer('c12').notNull(),
});
`;
const WIDE_READ = (table: string) => `
declare const wideRow: InferSelectModel<typeof ${table}>;
export const wideName: string = wideRow.c1;
export const wideAge: number = wideRow.c2;
export const wideLast: number = wideRow.c12;
`;
const WIDE_REFINE =
  WIDE(false) + `const apiWide = refineTableType(wide, {c1: {minLength: 10}, c2: {min: 18}});` + WIDE_READ('apiWide');
const WIDE_FORMAT = WIDE(true) + WIDE_READ('wide');

function net(snippet: string): number {
  const result = measurePipeline(snippet);
  expect(result.errors, `snippet should type-check cleanly:\n  ${result.errors.join('\n  ')}`).toEqual([]);
  return result.netInstantiations;
}

describe('format() modifier spike, priced against refineTableType', () => {
  it('is cheaper on a three column table', () => {
    const refine = net(REFINE_LANE);
    const format = net(FORMAT_LANE);
    expect(format).toBeLessThan(refine);
  });

  it('does not grow with the columns it leaves alone', () => {
    // Deltas over the SAME table with no constraints on it, so the cost of
    // declaring nine more columns (which both lanes pay) drops out.
    const refineNarrow = net(REFINE_LANE) - net(TABLE_3_COLS(false) + READ('users'));
    const refineWide = net(WIDE_REFINE) - net(WIDE(false) + WIDE_READ('wide'));
    const formatNarrow = net(FORMAT_LANE) - net(TABLE_3_COLS(false) + READ('users'));
    const formatWide = net(WIDE_FORMAT) - net(WIDE(false) + WIDE_READ('wide'));
    // refineTableType maps over every column, so nine extra untouched ones cost
    // it real work; `.format()` touches two columns either way and barely
    // moves. Both lanes stay cheaper than the other, at both widths.
    expect(formatWide - formatNarrow).toBeLessThan(refineWide - refineNarrow);
    expect(formatNarrow).toBeLessThan(refineNarrow);
    expect(formatWide).toBeLessThan(refineWide);
  });

  it('keeps the refineTableType compile-error contract', () => {
    const boolCase = measurePipeline(`
import {boolean} from '@mionjs/drizzle-orm-pg-core';
const flags = pgTable('flags', {on: boolean('on').format({min: 1})});
export const t = flags;
`);
    expect(boolCase.errors.join('\n')).toContain("not assignable to parameter of type 'never'");

    const wrongParam = measurePipeline(`
const t6 = pgTable('t6', {name: varchar('name', {length: 100}).format({min: 3})});
export const t = t6;
`);
    expect(wrongParam.errors.join('\n')).toContain("'min' does not exist in type 'Partial<StringParams>'");
  });
});
