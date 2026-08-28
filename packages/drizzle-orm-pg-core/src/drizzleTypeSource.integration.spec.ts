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
  makeSpec,
  project,
  renderTableType,
  typeRoadReduce,
  type Surface,
  type TableSpec,
} from '../test/tableSpecShared.ts';
import {tableFromType} from './table.ts';
import {toDrizzle} from './drizzle.ts';

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
  parent: {},
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
  const decls = specs.map((spec, i) => `export type Fz${i} = ${renderTableType(spec, names[i], 'DB')};`).join('\n');
  const probes = specs.map((_, i) => `getRunTypeId<Fz${i}>();`).join('\n');
  const source =
    `import {getRunTypeId} from '@ts-runtypes/core';\n` +
    `import type * as DB from './src/index.ts';\n` +
    `${decls}\ndeclare const fzValueProbe: Fz0;\n${probes}\ngetRunTypeId(fzValueProbe);\n`;
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
          expect(reflectionSites.length, `reflection sites\n${detail}`).toBe(fixture.specs.length + 1);
          const registered = instantiateRunTypes(evalEntryModules(resp.entryModules ?? {}));
          // Marker rule pair: the reflection-form probe (last site) matches the
          // static-form probe of Fz0 (first site).
          expect(reflectionSites[reflectionSites.length - 1].id, `marker pair\n${detail}`).toBe(reflectionSites[0].id);
          for (let i = 0; i < fixture.specs.length; i++) {
            const node = registered[reflectionSites[i].id];
            expect(node, `graph for table ${i}\n${detail}`).toBeTruthy();
            const bridge = toDrizzle(tableFromType(node as never));
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
