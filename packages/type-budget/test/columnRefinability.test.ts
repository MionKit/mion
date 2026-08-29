// Which pg columns can carry extra type-format params, and which cannot.
//
// A column is refinable when its data type belongs to a family listed in
// `RefinableParamsByFamily` (packages/ts-runtypes/src/formats/refineFormat.ts).
// Anything else refines to `never`, so BOTH `refineTableType(t, {col: {...}})`
// and the proposed `.format({...})` are a compile error on it. That is the
// intended behaviour for a column with no scalar format (json, boolean, the
// geometry/vector shapes), and it is worth pinning per column: the list is not
// obvious from the outside, and a column silently losing its format would look
// like nothing at all.
//
// The entries flagged FINDING are pinned as they behave today, not as intent.
// See docs/maybe/drizzle-column-format-modifier.md.

import {describe, it, expect} from 'vitest';
import {measurePipeline} from './modelPipelineHarness.ts';

const COLUMNS: {fn: string; config?: string; refinable: boolean; note?: string}[] = [
  // scalar formats, refinable as expected
  {fn: 'bigint', config: "{mode: 'number'}", refinable: true},
  {fn: 'bigserial', config: "{mode: 'number'}", refinable: true},
  {fn: 'bit', config: '{dimensions: 4}', refinable: true},
  {fn: 'char', refinable: true},
  {fn: 'date', refinable: true},
  {fn: 'doublePrecision', refinable: true},
  {fn: 'inet', refinable: true},
  {fn: 'integer', refinable: true},
  {fn: 'real', refinable: true},
  {fn: 'serial', refinable: true},
  {fn: 'smallint', refinable: true},
  {fn: 'smallserial', refinable: true},
  {fn: 'text', refinable: true},
  {fn: 'time', refinable: true},
  {fn: 'timestamp', refinable: true},
  {fn: 'varchar', config: '{length: 10}', refinable: true},

  // no scalar format to refine, intended
  {fn: 'boolean', refinable: false, note: 'booleans carry no params'},
  {fn: 'json', refinable: false, note: 'unknown'},
  {fn: 'jsonb', refinable: false, note: 'unknown'},
  {fn: 'geometry', refinable: false, note: 'object or tuple shape'},
  {fn: 'line', refinable: false, note: 'object or tuple shape'},
  {fn: 'point', refinable: false, note: 'object or tuple shape'},
  {fn: 'halfvec', config: '{dimensions: 3}', refinable: false, note: 'number[]'},
  {fn: 'vector', config: '{dimensions: 3}', refinable: false, note: 'number[]'},

  // findings, pinned as they behave today
  {fn: 'uuid', refinable: false, note: 'FINDING: carries the uuid format, but that family is not in RefinableParamsByFamily'},
  {fn: 'cidr', refinable: false, note: 'FINDING: bare string, while inet maps to IP'},
  {fn: 'macaddr', refinable: false, note: 'FINDING: bare string'},
  {fn: 'macaddr8', refinable: false, note: 'FINDING: bare string'},
  {fn: 'interval', refinable: false, note: 'FINDING: bare string'},
  {fn: 'sparsevec', config: '{dimensions: 3}', refinable: false, note: 'FINDING: bare string'},
  {fn: 'numeric', refinable: false, note: "FINDING: default mode 'string' is a bare string"},
  {fn: 'decimal', refinable: false, note: "FINDING: default mode 'string' is a bare string"},
];

describe('pg column to refinable format family', () => {
  for (const {fn, config, refinable, note} of COLUMNS) {
    it(`${fn} is ${refinable ? '' : 'NOT '}refinable${note ? ` (${note})` : ''}`, () => {
      const result = measurePipeline(`
import {${fn} as col} from '@mionjs/drizzle-orm-pg-core';
export const probe = col('c'${config ? `, ${config}` : ''}).format({});
`);
      const rejected = result.errors.some((error) => error.includes("type 'never'"));
      expect(rejected, `${fn}: expected refinable=${refinable}\n  ${result.errors.join('\n  ')}`).toBe(!refinable);
    });
  }
});
