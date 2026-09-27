/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Property fuzz for the slim pg surface, oracle: compare-to-a-trusted-source.
// One randomly generated table SPEC is interpreted over up to THREE surfaces
// that must build the same table: the slim recorders here (one call per column), raw
// drizzle-orm/pg-core (drizzle's own chains), and (for specs the pure-types vocabulary covers) the
// type road's runtime bridge over a synthetic reflected graph — and drizzle's
// own getTableConfig must agree across all of them, for random columns,
// configs, modifiers, references and extraConfig entries. A failing
// iteration prints its seed and the generated spec; re-running with
// MION_FUZZ_SEED replays it byte-for-byte (seeding per the shared harness in
// packages/run-types/test/fuzz/core/). The source→graph half of the type
// road is fuzzed by drizzleTypeSource.integration.spec.ts over the real
// resolver; the spec generator and projection live in test/tableSpecShared.ts.

import {describe, it, expect} from 'vitest';
import * as dzPg from 'drizzle-orm/pg-core';
import {sql as dzSql} from 'drizzle-orm';
import {mixSeed, mulberry32} from '../../run-types/test/fuzz/core/seededRng.ts';
import {sql as slimSql, buildRtTableFromGraph, tableRef} from '@mionjs/drizzle-orm';
import * as slim from '../src/index.ts';
import {pgBuildTable} from '../src/table.ts';
import {toDrizzle} from '../src/drizzle.ts';
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

const slimSurfaceParent = slim.pgTable('fuzz_parents', {id: slim.integer('id', {primaryKey: true})});
const rawSurfaceParent = dzPg.pgTable('fuzz_parents', {id: dzPg.integer('id').primaryKey()});

// The slim builders take each column in one call; a reference names its target with tableRef().
const slimSurface: Surface = {
  ns: slim as never,
  sql: slimSql as never,
  table: (name, columns, extra) => slim.pgTable(name as never, columns as never, extra as never),
  parent: slimSurfaceParent as never,
  parentRef: () => tableRef(slimSurfaceParent, 'id'),
};
const rawSurface: Surface = {
  ns: dzPg as never,
  sql: dzSql as never,
  table: (name, columns, extra) => dzPg.pgTable(name as never, columns as never, extra as never),
  parent: rawSurfaceParent as never,
  drizzle: true,
};

describe('pg slim surface — fuzz: toDrizzle equals raw drizzle for random tables', () => {
  it(`replays ${ITERATIONS} random tables byte-equal (base seed ${BASE_SEED})`, () => {
    let typeRoadRuns = 0;
    for (let iteration = 0; iteration < ITERATIONS; iteration++) {
      const seed = mixSeed(BASE_SEED, 'pg-table-equality', iteration);
      const spec = makeSpec(mulberry32(seed));
      const tableName = `fuzz_${iteration}`;
      const slimTable = buildTable(slimSurface, spec, tableName);
      const rawTable = buildTable(rawSurface, spec, tableName);
      const detail = `iteration ${iteration}, seed ${seed} (set MION_FUZZ_SEED=${BASE_SEED} to replay)\nspec: ${JSON.stringify(spec)}`;
      const rawProjection = project(rawTable);
      expect(project(toDrizzle(slimTable as never)), detail).toEqual(rawProjection);
      // Surface 2: a random manual VIEW over the same generated column kinds,
      // through the same compare-to-a-trusted-source oracle. Not `.existing()`
      // iterations embed the parent table, so reference resolution is
      // exercised too.
      const viewSpec = makeViewSpec(mulberry32(mixSeed(BASE_SEED, 'pg-view-equality', iteration)), spec);
      const viewName = `fuzz_view_${iteration}`;
      const viewDetail = `${detail}\nviewSpec: ${JSON.stringify(viewSpec)}`;
      expect(
        projectView(toDrizzle(buildView(slimSurface, viewSpec, viewName) as never), viewSpec.materialized),
        viewDetail
      ).toEqual(projectView(buildView(rawSurface, viewSpec, viewName), viewSpec.materialized));
      // Surface 3: the covered SUBSET of the spec through the type road's
      // runtime bridge, against a raw build of the same reduced spec.
      const reduced = typeRoadReduce(spec);
      if (reduced !== undefined) {
        typeRoadRuns++;
        const reducedName = `${tableName}_t3`;
        const bridged = buildRtTableFromGraph(syntheticTableGraph(reduced, reducedName), pgBuildTable, {
          tables: {fuzz_parents: slimSurfaceParent as object},
        });
        const rawReduced = buildTable(rawSurface, reduced, reducedName);
        expect(project(toDrizzle(bridged as never)), `type-road surface\n${detail}\nreduced: ${JSON.stringify(reduced)}`).toEqual(
          project(rawReduced)
        );
      }
    }
    // The third surface must actually run — a generator drift that stops
    // covering any spec would silently gut the oracle.
    expect(typeRoadRuns).toBeGreaterThan(0);
  });
});
