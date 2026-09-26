/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// One random table spec over the slim recorders, the next/ builders, raw drizzle-orm/sqlite-core and (for the subset it
// covers) the type road's bridge: getTableConfig must agree. A failure prints its seed; MION_FUZZ_SEED replays it.
// The source-to-graph half runs over the real resolver in drizzleTypeSource.integration.spec.ts.

import {describe, it, expect} from 'vitest';
import * as dzLite from 'drizzle-orm/sqlite-core';
import {sql as dzSql} from 'drizzle-orm';
import {mixSeed, mulberry32} from '../../run-types/test/fuzz/core/seededRng.ts';
import {sql as slimSql, buildRtTableFromGraph} from '@mionjs/drizzle-orm';
import * as slim from '../src/index.ts';
import {sqliteBuildTable} from '../src/table.ts';
import {toDrizzle} from '../src/drizzle.ts';
import * as next from '../next/index.ts';
import {buildRtTableFromGraph as buildNextTableFromGraph} from '../../drizzle-orm/next/fromType.ts';
import {tableRef} from '../../drizzle-orm/next/table.ts';
import {
  buildTable,
  buildView,
  makeSpec,
  makeViewSpec,
  project,
  projectView,
  syntheticNextTableGraph,
  syntheticTableGraph,
  typeRoadReduce,
  type Surface,
} from './tableSpecShared.ts';

const ITERATIONS = process.env.MION_FUZZ_ITER ? Number(process.env.MION_FUZZ_ITER) : 120;
const BASE_SEED = process.env.MION_FUZZ_SEED ? Number(process.env.MION_FUZZ_SEED) : 0x5eed_d12e;

const slimSurfaceParent = slim.sqliteTable('fuzz_parents', {id: slim.int('id').primaryKey()});
const rawSurfaceParent = dzLite.sqliteTable('fuzz_parents', {id: dzLite.int('id').primaryKey()});

const slimSurface: Surface = {
  ns: slim as never,
  sql: slimSql as never,
  table: (name, columns, extra) => slim.sqliteTable(name as never, columns as never, extra as never),
  parent: slimSurfaceParent as never,
};
// The side-by-side builders take each column in one call; the shipped helpers fill in the entries.
const nextSurfaceParent = next.sqliteTable('fuzz_parents', {id: next.int('id', {primaryKey: true})});
const nextSurface: Surface = {
  ns: {...slim, ...next} as never,
  sql: slimSql as never,
  table: (name, columns, extra) => next.sqliteTable(name as never, columns as never, extra as never),
  parent: nextSurfaceParent as never,
  singleCall: true,
  parentRef: () => tableRef(nextSurfaceParent, 'id'),
};

const rawSurface: Surface = {
  ns: dzLite as never,
  sql: dzSql as never,
  table: (name, columns, extra) => dzLite.sqliteTable(name as never, columns as never, extra as never),
  parent: rawSurfaceParent as never,
};

describe('sqlite slim surface — fuzz: toDrizzle equals raw drizzle for random tables', () => {
  it(`replays ${ITERATIONS} random tables byte-equal (base seed ${BASE_SEED})`, () => {
    let typeRoadRuns = 0;
    for (let iteration = 0; iteration < ITERATIONS; iteration++) {
      const seed = mixSeed(BASE_SEED, 'sqlite-table-equality', iteration);
      const spec = makeSpec(mulberry32(seed));
      const tableName = `fuzz_${iteration}`;
      const slimTable = buildTable(slimSurface, spec, tableName);
      const rawTable = buildTable(rawSurface, spec, tableName);
      const detail = `iteration ${iteration}, seed ${seed} (set MION_FUZZ_SEED=${BASE_SEED} to replay)\nspec: ${JSON.stringify(spec)}`;
      const rawProjection = project(rawTable);
      expect(project(toDrizzle(slimTable as never)), detail).toEqual(rawProjection);
      expect(project(toDrizzle(buildTable(nextSurface, spec, tableName) as never)), `next builders\n${detail}`).toEqual(
        rawProjection
      );
      // A view that is not `.existing()` embeds the parent table, so reference resolution is exercised too.
      const viewSpec = makeViewSpec(mulberry32(mixSeed(BASE_SEED, 'sqlite-view-equality', iteration)), spec);
      const viewName = `fuzz_view_${iteration}`;
      const viewDetail = `${detail}\nviewSpec: ${JSON.stringify(viewSpec)}`;
      expect(projectView(toDrizzle(buildView(slimSurface, viewSpec, viewName) as never)), viewDetail).toEqual(
        projectView(buildView(rawSurface, viewSpec, viewName))
      );
      const reduced = typeRoadReduce(spec);
      if (reduced !== undefined) {
        typeRoadRuns++;
        const reducedName = `${tableName}_t3`;
        const bridged = buildRtTableFromGraph(syntheticTableGraph(reduced, reducedName), sqliteBuildTable, {
          tables: {fuzz_parents: slimSurfaceParent as object},
        });
        const rawReduced = buildTable(rawSurface, reduced, reducedName);
        expect(project(toDrizzle(bridged as never)), `type-road surface\n${detail}\nreduced: ${JSON.stringify(reduced)}`).toEqual(
          project(rawReduced)
        );
        const nextBridged = buildNextTableFromGraph(syntheticNextTableGraph(reduced, reducedName), sqliteBuildTable, {
          tables: {fuzz_parents: nextSurfaceParent as object},
        });
        expect(
          project(toDrizzle(nextBridged as never)),
          `next type-road surface\n${detail}\nreduced: ${JSON.stringify(reduced)}`
        ).toEqual(project(rawReduced));
      }
    }
    // Generator drift that stops the type road covering any spec would silently gut the oracle.
    expect(typeRoadRuns).toBeGreaterThan(0);
  });
});
