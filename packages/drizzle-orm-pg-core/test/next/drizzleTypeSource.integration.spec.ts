/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The side-by-side columns through the REAL resolver: each random table spec is rendered as source
// twice, as a hand-written next/ table type and as next/ builders, in one fixture. Per spec:
//   1. the builder table and the hand-written table have ONE runtype id for their columns and one for
//      their names map (a builder table's type records no extraConfig entries, as on the shipped road);
//   2. the new select model reflects to the SAME id as the shipped type road's select model;
//   3. the reflected graph, rebuilt by the new reader, materializes the same drizzle table as raw drizzle.
// The Marker rule pair rides along: the value probe's id equals the static probe's id.
// Replay with MION_FUZZ_SEED; widen with MION_FUZZ_ITER.

import path from 'node:path';
import {describe, expect, it} from 'vitest';
import * as dzPg from 'drizzle-orm/pg-core';
import {sql as dzSql} from 'drizzle-orm';
import {mixSeed, mulberry32} from '../../../run-types/test/fuzz/core/seededRng.ts';
import {entrySeed, parseSeed} from '../../../run-types/test/fuzz/core/fuzzPolicy.ts';
// The LIGHT helpers, as the shipped twin of this lane uses: no marker call sites of their own.
import {evalEntryModules, instantiateRunTypes, BIN, hasBinary} from '../../../devtools/test/helpers/inline.ts';
import {ResolverClient} from '../../../devtools/src/core/resolver-client.ts';
import {
  buildTable,
  FUZZ_PARENT_NAME,
  makeSpec,
  project,
  renderNextTableType,
  renderTableBuilders,
  renderTableType,
  typeRoadReduce,
  type Surface,
  type TableSpec,
} from '../tableSpecShared.ts';
import {buildRtTableFromGraph} from '../../../drizzle-orm/next/fromType.ts';
import {pgBuildTable} from '../../src/table.ts';
import {toDrizzle} from '../../src/drizzle.ts';
import {integer, pgTable} from '../../next/index.ts';

const nextParent = pgTable(FUZZ_PARENT_NAME, {id: integer('id').primaryKey()});

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const openClient = () => new ResolverClient(BIN, REPO_ROOT, '', {serverMode: true, emitMode: 'both'});
const register = hasBinary() ? it : it.skip;
const ITERATIONS = parseSeed(process.env.MION_FUZZ_ITER, 4);
const BASE_SEED = process.env.MION_FUZZ_SEED ? Number(process.env.MION_FUZZ_SEED) : entrySeed('drizzletypes');
const TABLES_PER_ITERATION = 2;
// Inside the pg package dir, so the fixture's relative imports resolve as this package's sources do.
const FIXTURE = 'packages/drizzle-orm-pg-core/__drizzleNextTypeFuzz__.ts';

const rawSurface: Surface = {
  ns: dzPg as never,
  sql: dzSql as never,
  table: (name, columns, extra) => dzPg.pgTable(name as never, columns as never, extra as never),
  parent: dzPg.pgTable(FUZZ_PARENT_NAME, {id: dzPg.integer('id').primaryKey()}) as never,
};

const tableProbes = (count: number) => Array.from({length: count}, (_, i) => `getRunTypeId<NFz${i}>();`).join('\n') + '\n';

interface Rendered {
  source: string;
  specs: TableSpec[];
  names: string[];
}

/** Probes per spec, in source order: columns and names of both spellings, then the new and shipped model. */
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
        `export type NFz${i} = ${renderNextTableType(spec, names[i], 'NX', 'DB')};\n` +
        `export type Fz${i} = ${renderTableType(spec, names[i], 'DB')};\n` +
        `export const nbz${i} = ${renderTableBuilders(spec, names[i], 'NXV', 'fzParent')};`
    )
    .join('\n');
  const probes = specs
    .map(
      (_, i) =>
        `getRunTypeId<NFz${i}['columns']>();\ngetRunTypeId<(typeof nbz${i})['columns']>();\n` +
        `getRunTypeId<NFz${i}['names']>();\ngetRunTypeId<(typeof nbz${i})['names']>();\n` +
        `getRunTypeId<NSelect<NFz${i}>>();\ngetRunTypeId<CSelect<Fz${i}>>();`
    )
    .join('\n');
  const source =
    `import {getRunTypeId} from '@mionjs/run-types';\n` +
    `import type * as DB from './src/index.ts';\n` +
    `import * as DBV from './src/index.ts';\n` +
    `import type * as NX from './next/index.ts';\n` +
    `import * as NXM from './next/index.ts';\n` +
    `import type {InferSelectModel as CSelect} from '@mionjs/drizzle-orm';\n` +
    `import type {InferSelectModel as NSelect} from '../drizzle-orm/next/models.ts';\n` +
    // cols(): the owner view the new references() reads.
    `import {cols} from '../drizzle-orm/next/index.ts';\n` +
    // The shipped helpers for the entries, the side-by-side builders over them.
    `const NXV = {...DBV, ...NXM};\n` +
    `const fzParent = NXV.pgTable('${FUZZ_PARENT_NAME}', {id: NXV.integer('id').primaryKey()});\n` +
    `${decls}\ndeclare const fzValueProbe: NFz0['columns'];\n${probes}\ngetRunTypeId(fzValueProbe);\n` +
    // The whole hand-written table, last: the graph the reader rebuilds from.
    tableProbes(specs.length);
  return {source, specs, names};
}

describe('next pg columns fuzz: authored source through the real resolver', () => {
  register(
    `reflects ${ITERATIONS}x${TABLES_PER_ITERATION} random tables, both spellings, to one id and equal drizzle tables`,
    {timeout: 900_000},
    async () => {
      const client = openClient();
      try {
        for (let iteration = 0; iteration < ITERATIONS; iteration++) {
          const seed = mixSeed(BASE_SEED, 'pg-next-type-source', iteration);
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
            const [typeCols, builderCols, typeNames, builderNames, newModel, shippedModel] = sites.slice(
              i * PROBES_PER_SPEC,
              (i + 1) * PROBES_PER_SPEC
            );
            expect(builderCols.id, `builder columns vs hand-written columns, spec ${i}\n${detail}`).toBe(typeCols.id);
            expect(builderNames.id, `builder names vs hand-written names, spec ${i}\n${detail}`).toBe(typeNames.id);
            expect(newModel.id, `new model vs shipped model, spec ${i}\n${detail}`).toBe(shippedModel.id);
            const node = registered[sites[count * PROBES_PER_SPEC + 1 + i].id];
            expect(node, `graph for table ${i}\n${detail}`).toBeTruthy();
            const slim = buildRtTableFromGraph(node as never, pgBuildTable, {tables: {[FUZZ_PARENT_NAME]: nextParent as object}});
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
