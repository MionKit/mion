// Compare slim schemas with their Drizzle materializations.
/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// mysql columns through the REAL resolver, each random spec as a hand-written type and as builders in one fixture.
// Columns and names are compared, not whole tables: a builder table's type records no extraConfig entries.
// The value probe is the Marker rule pair. Replay with MION_FUZZ_SEED; widen with MION_FUZZ_ITER.

import path from 'node:path';
import {describe, expect, it} from 'vitest';
// @mion-expect-error drizzle-mixed-types
import * as dzMy from 'drizzle-orm/mysql-core';
// @mion-expect-error drizzle-mixed-types
import {sql as dzSql} from 'drizzle-orm';
import {mixSeed, mulberry32} from '../../run-types/test/fuzz/core/seededRng.ts';
import {entrySeed, parseSeed} from '../../run-types/test/fuzz/core/fuzzPolicy.ts';
// The LIGHT helpers: no marker call sites of their own.
import {evalEntryModules, instantiateRunTypes, BIN, hasBinary} from '../../devtools/test/helpers/inline.ts';
import {ResolverClient} from '../../devtools/src/core/resolver-client.ts';
// @mion-expect-error drizzle-mixed-types
import {
  buildTable,
  FUZZ_PARENT_NAME,
  makeSpec,
  project,
  renderTableBuilders,
  renderTableType,
  typeRoadReduce,
  type Surface,
  type TableSpec,
} from './tableSpecShared.ts';
import {buildRtTableFromGraph} from '@mionjs/drizzle-orm';
import {mysqlBuildTable} from '../src/table.ts';
// @mion-expect-error drizzle-mixed-types
import {toDrizzle} from '../src/drizzle.ts';
import {int, mysqlTable} from '../src/index.ts';

const slimParent = mysqlTable(FUZZ_PARENT_NAME, {id: int('id', {primaryKey: true})});

const REPO_ROOT = path.resolve(__dirname, '../../..');
const openClient = () => new ResolverClient(BIN, REPO_ROOT, '', {serverMode: true, emitMode: 'both'});
const register = hasBinary() ? it : it.skip;
const ITERATIONS = parseSeed(process.env.MION_FUZZ_ITER, 4);
const BASE_SEED = process.env.MION_FUZZ_SEED ? Number(process.env.MION_FUZZ_SEED) : entrySeed('drizzletypes');
const TABLES_PER_ITERATION = 2;
// Inside the mysql package dir, so the fixture's relative imports resolve as this package's sources do.
const FIXTURE = 'packages/drizzle-orm-mysql-core/__drizzleTypeFuzz__.ts';

const rawSurface: Surface = {
  ns: dzMy as never,
  sql: dzSql as never,
  table: (name, columns, extra) => dzMy.mysqlTable(name as never, columns as never, extra as never),
  parent: dzMy.mysqlTable(FUZZ_PARENT_NAME, {id: dzMy.int('id').primaryKey()}) as never,
  drizzle: true,
};

const tableProbes = (count: number) => Array.from({length: count}, (_, i) => `getRunTypeId<Fz${i}>();`).join('\n') + '\n';

interface Rendered {
  source: string;
  specs: TableSpec[];
  names: string[];
}

/** Probes per spec, in source order: columns and names of both spellings, then the model of each. */
const PROBES_PER_SPEC = 6;

function renderFixture(rng: () => number, iteration: number): Rendered {
  const specs: TableSpec[] = [];
  const names: string[] = [];
  while (specs.length < TABLES_PER_ITERATION) {
    const reduced = typeRoadReduce(makeSpec(rng));
    if (reduced === undefined) continue;
    names.push(`fz_${iteration}_${specs.length}`);
    specs.push(reduced);
  }
  const decls = specs
    .map(
      (spec, i) =>
        `export type Fz${i} = ${renderTableType(spec, names[i], 'DB', 'DB')};\n` +
        `export const bz${i} = ${renderTableBuilders(spec, names[i], 'DBV', 'fzParent')};`
    )
    .join('\n');
  const probes = specs
    .map(
      (_, i) =>
        `getRunTypeId<Fz${i}['columns']>();\ngetRunTypeId<(typeof bz${i})['columns']>();\n` +
        `getRunTypeId<Fz${i}['names']>();\ngetRunTypeId<(typeof bz${i})['names']>();\n` +
        `getRunTypeId<Select<Fz${i}>>();\ngetRunTypeId<Select<typeof bz${i}>>();`
    )
    .join('\n');
  const source =
    `import {getRunTypeId} from '@mionjs/run-types';\n` +
    `import type * as DB from './src/index.ts';\n` +
    `import * as DBV from './src/index.ts';\n` +
    `import type {InferSelectModel as Select} from '@mionjs/drizzle-orm';\n` +
    `import {tableRef} from '@mionjs/drizzle-orm';\n` +
    `const fzParent = DBV.mysqlTable('${FUZZ_PARENT_NAME}', {id: DBV.int('id', {primaryKey: true})});\n` +
    `${decls}\ndeclare const fzValueProbe: Fz0['columns'];\n${probes}\ngetRunTypeId(fzValueProbe);\n` +
    // The whole hand-written table, last: the graph the reader rebuilds from.
    tableProbes(specs.length);
  return {source, specs, names};
}

describe('mysql columns fuzz: authored source through the real resolver', () => {
  register(
    `reflects ${ITERATIONS}x${TABLES_PER_ITERATION} random tables, both spellings, to one id and equal drizzle tables`,
    {timeout: 900_000},
    async () => {
      const client = openClient();
      try {
        for (let iteration = 0; iteration < ITERATIONS; iteration++) {
          const seed = mixSeed(BASE_SEED, 'mysql-type-source', iteration);
          const fixture = renderFixture(mulberry32(seed), iteration);
          const detail = `iteration ${iteration}, seed ${seed} (set MION_FUZZ_SEED=${BASE_SEED} to replay)\nsource:\n${fixture.source}`;
          await client.setSources({[FIXTURE]: fixture.source});
          const resp = await client.scanFiles([FIXTURE], {includeEntryModules: true});
          const errors = (resp.diagnostics ?? []).filter((diag) => diag.severity === 1);
          expect(errors, `resolver errors\n${detail}\n${JSON.stringify(errors, null, 1)}`).toEqual([]);
          const sites = (resp.sites ?? []).filter((site) => !site.fnId).sort((a, b) => a.pos - b.pos);
          const count = fixture.specs.length;
          expect(sites.length, `reflection sites\n${detail}`).toBe(count * PROBES_PER_SPEC + 1 + count);
          const registered = instantiateRunTypes(evalEntryModules(resp.entryModules ?? {}));
          expect(sites[count * PROBES_PER_SPEC].id, `marker pair\n${detail}`).toBe(sites[0].id);
          for (let i = 0; i < count; i++) {
            const [typeCols, builderCols, typeNames, builderNames, typeModel, builderModel] = sites.slice(
              i * PROBES_PER_SPEC,
              (i + 1) * PROBES_PER_SPEC
            );
            expect(builderCols.id, `builder columns vs hand-written columns, spec ${i}\n${detail}`).toBe(typeCols.id);
            expect(builderNames.id, `builder names vs hand-written names, spec ${i}\n${detail}`).toBe(typeNames.id);
            expect(builderModel.id, `builder model vs hand-written model, spec ${i}\n${detail}`).toBe(typeModel.id);
            const node = registered[sites[count * PROBES_PER_SPEC + 1 + i].id];
            expect(node, `graph for table ${i}\n${detail}`).toBeTruthy();
            const slim = buildRtTableFromGraph(node as never, mysqlBuildTable, {
              tables: {[FUZZ_PARENT_NAME]: slimParent as object},
            });
            const raw = buildTable(rawSurface, fixture.specs[i], fixture.names[i]);
            expect(project(toDrizzle(slim as never)), `table ${i}\n${detail}`).toEqual(project(raw));
          }
        }
      } finally {
        client.close();
      }
    }
  );
});
