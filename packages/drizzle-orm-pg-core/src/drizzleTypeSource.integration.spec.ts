/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The source→graph half of the type-road oracle, over the REAL resolver: a
// random table spec is rendered as pure-type SOURCE (DB.PgTable<'t', {...}>),
// scanned by the actual ts-runtypes binary, its entry modules evaluated into
// the live reflected graph, and tableFromType over that graph must produce
// the same drizzle table as a raw drizzle build of the same spec. The wide
// in-process fuzz (tableEquality.fuzz.spec.ts) covers the graph→table half on
// every run; this lane proves authored type text reflects into that graph.
//
// The SAME fixture also renders each spec as BUILDER calls, so every iteration
// pins the property the whole two-road design rests on: a table written as a
// type and the same table written with the builders must resolve to ONE runtype
// id. If that ever drifts, the compiled validators and the serialized client
// functions disagree with the schema they were derived from, silently. The
// hand-written twin tables in typeTables.spec.ts pin it on two examples; this
// pins it across the generated vocabulary.
//
// Replay with RT_FUZZ_SEED; widen with RT_FUZZ_ITER (`pnpm rtx core fuzz
// drizzletypes`). Every iteration also pins the Marker rule pair: the value
// probe's id equals the static probe's id.

import path from 'node:path';
import {describe, expect, it} from 'vitest';
import * as dzPg from 'drizzle-orm/pg-core';
import {sql as dzSql} from 'drizzle-orm';
import {mixSeed, mulberry32} from '../../ts-runtypes/test/fuzz/core/seededRng.ts';
import {entrySeed, parseSeed} from '../../ts-runtypes/test/fuzz/core/fuzzPolicy.ts';
// Deliberately the LIGHT helpers (not typeFuzzHarness): the harness imports
// the core runtime sources, which would drag them into THIS project's plugin
// scan; inline.ts + ResolverClient carry no marker call sites.
import {evalEntryModules, instantiateRunTypes, BIN, hasBinary} from '../../ts-runtypes-devtools/test/helpers/inline.ts';
import {ResolverClient} from '../../ts-runtypes-devtools/src/resolver-client.ts';
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
} from '../test/tableSpecShared.ts';
import {buildRtTableFromGraph} from '@mionjs/drizzle-orm';
import {pgBuildTable} from './table.ts';
import {integer, pgTable} from './index.ts';
import {toDrizzle} from './drizzle.ts';

// The referenced parent every surface shares (References resolves through
// tableFromType deps; the raw surface builds its own).
const slimParent = pgTable(FUZZ_PARENT_NAME, {id: integer('id').primaryKey()});

const REPO_ROOT = path.resolve(__dirname, '../../..');
const openClient = () => new ResolverClient(BIN, REPO_ROOT, '', {serverMode: true, emitMode: 'both'});
const register = hasBinary() ? it : it.skip;
const ITERATIONS = parseSeed(process.env.RT_FUZZ_ITER, 4);
const BASE_SEED = process.env.RT_FUZZ_SEED ? Number(process.env.RT_FUZZ_SEED) : entrySeed('drizzletypes');
const TABLES_PER_ITERATION = 2;
// Keyed inside the pg package dir so the fixture's relative ./src import and
// its bare @mionjs/@ts-runtypes imports resolve exactly as this package's own
// sources do (workspace node_modules + the source export condition).
const FIXTURE = 'packages/drizzle-orm-pg-core/__drizzleTypeFuzz__.ts';

const rawSurface: Surface = {
  ns: dzPg as never,
  sql: dzSql as never,
  table: (name, columns, extra) => dzPg.pgTable(name as never, columns as never, extra as never),
  parent: dzPg.pgTable(FUZZ_PARENT_NAME, {id: dzPg.integer('id').primaryKey()}) as never,
};

interface Rendered {
  source: string;
  specs: TableSpec[];
  names: string[];
}

function renderFixture(rng: () => number, iteration: number): Rendered {
  const specs: TableSpec[] = [];
  const names: string[] = [];
  while (specs.length < TABLES_PER_ITERATION) {
    const reduced = typeRoadReduce(makeSpec(rng));
    if (reduced === undefined) continue;
    names.push(`fz_${iteration}_${specs.length}`);
    specs.push(reduced);
  }
  // Both roads, in one file: the type alias the reflection oracle reads, and
  // the builder const whose model must land on the SAME runtype id.
  const typeDecls = specs.map((spec, i) => `export type Fz${i} = ${renderTableType(spec, names[i], 'DB')};`).join('\n');
  const builderDecls = specs
    .map((spec, i) => `export const bz${i} = ${renderTableBuilders(spec, names[i], 'DBV', 'fzParent')};`)
    .join('\n');
  const tableProbes = specs.map((_, i) => `getRunTypeId<Fz${i}>();`).join('\n');
  // The model pairs, type road then builder road per spec, so the assertion can
  // read them two at a time.
  const modelProbes = specs
    .map((_, i) => `getRunTypeId<InferSelectModel<Fz${i}>>();\ngetRunTypeId<InferSelectModel<typeof bz${i}>>();`)
    .join('\n');
  const source =
    `import {getRunTypeId} from '@mionjs/run-types';\n` +
    `import type * as DB from './src/index.ts';\n` +
    `import * as DBV from './src/index.ts';\n` +
    `import type {InferSelectModel} from '@mionjs/drizzle-orm';\n` +
    // cols(): a slim table's TYPE is its metadata, so a cross-table reference
    // reaches the columns through the accessor rather than a property.
    `import {cols} from '@mionjs/drizzle-orm';\n` +
    `const fzParent = DBV.pgTable('${FUZZ_PARENT_NAME}', {id: DBV.integer('id').primaryKey()});\n` +
    `${typeDecls}\n${builderDecls}\ndeclare const fzValueProbe: Fz0;\n` +
    `${tableProbes}\ngetRunTypeId(fzValueProbe);\n${modelProbes}\n`;
  return {source, specs, names};
}

describe('pg type-road fuzz: authored type source through the real resolver', () => {
  register(
    `reflects ${ITERATIONS}x${TABLES_PER_ITERATION} random type tables into equal drizzle tables`,
    {timeout: 900_000},
    async () => {
      const client = openClient();
      try {
        for (let iteration = 0; iteration < ITERATIONS; iteration++) {
          const seed = mixSeed(BASE_SEED, 'pg-type-source', iteration);
          const fixture = renderFixture(mulberry32(seed), iteration);
          const detail = `iteration ${iteration}, seed ${seed} (set RT_FUZZ_SEED=${BASE_SEED} to replay)\nsource:\n${fixture.source}`;
          await client.setSources({[FIXTURE]: fixture.source});
          const resp = await client.scanFiles([FIXTURE], {includeEntryModules: true});
          const errors = (resp.diagnostics ?? []).filter((diag) => diag.severity === 1);
          expect(errors, `resolver errors\n${detail}\n${JSON.stringify(errors, null, 1)}`).toEqual([]);
          const reflectionSites = (resp.sites ?? []).filter((site) => !site.fnId).sort((a, b) => a.pos - b.pos);
          // specs table probes + the value probe + one model pair per spec.
          expect(reflectionSites.length, `reflection sites\n${detail}`).toBe(fixture.specs.length * 3 + 1);
          const registered = instantiateRunTypes(evalEntryModules(resp.entryModules ?? {}));
          // Marker rule pair: the reflection-form probe (last site) matches the
          // static-form probe of Fz0 (first site).
          expect(reflectionSites[fixture.specs.length].id, `marker pair\n${detail}`).toBe(reflectionSites[0].id);
          // The two-roads oracle: the select model of the type-road table and of
          // the builder-road table must be ONE runtype, per generated spec.
          for (let i = 0; i < fixture.specs.length; i++) {
            const typeRoadId = reflectionSites[fixture.specs.length + 1 + i * 2].id;
            const builderRoadId = reflectionSites[fixture.specs.length + 2 + i * 2].id;
            expect(typeRoadId, `two-roads runtype id, table ${i}\n${detail}`).toBe(builderRoadId);
          }
          for (let i = 0; i < fixture.specs.length; i++) {
            const node = registered[reflectionSites[i].id];
            expect(node, `graph for table ${i}\n${detail}`).toBeTruthy();
            // The graph was loaded dynamically, so this uses the low-level
            // bridge (tableFromType's marker form needs a static type argument).
            const slim = buildRtTableFromGraph(node as never, pgBuildTable, {
              tables: {[FUZZ_PARENT_NAME]: slimParent as object},
            });
            const bridge = toDrizzle(slim as never);
            const raw = buildTable(rawSurface, fixture.specs[i], fixture.names[i]);
            expect(project(bridge), `table ${i}\n${detail}`).toEqual(project(raw));
          }
        }
      } finally {
        client.close();
      }
    }
  );
});
