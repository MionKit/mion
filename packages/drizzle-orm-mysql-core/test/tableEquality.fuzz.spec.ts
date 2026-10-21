// Compare slim schemas with their Drizzle materializations.
/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Property fuzz, oracle compare-to-a-trusted-source: each random spec builds on the slim recorders, raw drizzle and
// (when covered) the type road's bridge, and getTableConfig must agree. MION_FUZZ_SEED replays a failure; the
// source-to-graph half is drizzleTypeSource.integration.spec.ts, the generator test/tableSpecShared.ts.

import {describe, it, expect} from 'vitest';
// @mion-expect-error drizzle-mixed-types
import * as dzMy from 'drizzle-orm/mysql-core';
// @mion-expect-error drizzle-mixed-types
import {sql as dzSql} from 'drizzle-orm';
import {mixSeed, mulberry32} from '../../run-types/test/fuzz/core/seededRng.ts';
import {sql as slimSql, buildRtTableFromGraph, tableRef} from '@mionjs/drizzle-orm';
import * as slim from '../src/index.ts';
import {mysqlBuildTable} from '../src/table.ts';
// @mion-expect-error drizzle-mixed-types
import {toDrizzle} from '../src/drizzle.ts';
// @mion-expect-error drizzle-mixed-types
import {
  buildTable,
  buildView,
  makeSpec,
  makeViewSpec,
  project,
  projectView,
  syntheticTableGraph,
  typeRoadReduce,
  type Surface,
} from './tableSpecShared.ts';

const ITERATIONS = process.env.MION_FUZZ_ITER ? Number(process.env.MION_FUZZ_ITER) : 120;
const BASE_SEED = process.env.MION_FUZZ_SEED ? Number(process.env.MION_FUZZ_SEED) : 0x5eed_d12e;

const slimSurfaceParent = slim.mysqlTable('fuzz_parents', {id: slim.int('id', {primaryKey: true})});
const rawSurfaceParent = dzMy.mysqlTable('fuzz_parents', {id: dzMy.int('id').primaryKey()});

// The slim builders take each column in one call; a reference names its target with tableRef().
const slimSurface: Surface = {
  ns: slim as never,
  sql: slimSql as never,
  table: (name, columns, extra) => slim.mysqlTable(name as never, columns as never, extra as never),
  parent: slimSurfaceParent as never,
  parentRef: () => tableRef(slimSurfaceParent, 'id'),
};
const rawSurface: Surface = {
  ns: dzMy as never,
  sql: dzSql as never,
  table: (name, columns, extra) => dzMy.mysqlTable(name as never, columns as never, extra as never),
  parent: rawSurfaceParent as never,
  drizzle: true,
};

describe('mysql slim surface — fuzz: toDrizzle equals raw drizzle for random tables', () => {
  it(`replays ${ITERATIONS} random tables byte-equal (base seed ${BASE_SEED})`, () => {
    let typeRoadRuns = 0;
    for (let iteration = 0; iteration < ITERATIONS; iteration++) {
      const seed = mixSeed(BASE_SEED, 'mysql-table-equality', iteration);
      const spec = makeSpec(mulberry32(seed));
      const tableName = `fuzz_${iteration}`;
      const slimTable = buildTable(slimSurface, spec, tableName);
      const rawTable = buildTable(rawSurface, spec, tableName);
      const detail = `iteration ${iteration}, seed ${seed} (set MION_FUZZ_SEED=${BASE_SEED} to replay)\nspec: ${JSON.stringify(spec)}`;
      const rawProjection = project(rawTable);
      expect(project(toDrizzle(slimTable as never)), detail).toEqual(rawProjection);
      // Surface 2: a random manual VIEW; non-`.existing()` ones embed the parent table, exercising reference resolution.
      const viewSpec = makeViewSpec(mulberry32(mixSeed(BASE_SEED, 'mysql-view-equality', iteration)), spec);
      const viewName = `fuzz_view_${iteration}`;
      const viewDetail = `${detail}\nviewSpec: ${JSON.stringify(viewSpec)}`;
      expect(projectView(toDrizzle(buildView(slimSurface, viewSpec, viewName) as never)), viewDetail).toEqual(
        projectView(buildView(rawSurface, viewSpec, viewName))
      );
      // Surface 3: the covered SUBSET through the type road's bridge, against a raw build of the same reduced spec.
      const reduced = typeRoadReduce(spec);
      if (reduced !== undefined) {
        typeRoadRuns++;
        const reducedName = `${tableName}_t3`;
        const bridged = buildRtTableFromGraph(syntheticTableGraph(reduced, reducedName), mysqlBuildTable, {
          tables: {fuzz_parents: slimSurfaceParent as object},
        });
        const rawReduced = buildTable(rawSurface, reduced, reducedName);
        expect(project(toDrizzle(bridged as never)), `type-road surface\n${detail}\nreduced: ${JSON.stringify(reduced)}`).toEqual(
          project(rawReduced)
        );
      }
    }
    // A generator drift that stops covering any spec would silently gut the oracle.
    expect(typeRoadRuns).toBeGreaterThan(0);
  });
});
