import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {measureCase, measureDirectModel, readRouteFile} from './costHarness.ts';
import {DIALECTS} from './routeVariants.ts';

it.each([
  ["const invalid:number='wrong';", 'not assignable'],
  ['const = 1;', 'Variable declaration expected'],
])('rejects an invalid measured model dependency: %s', (invalid, message) => {
  const measured = measureDirectModel(`export type User={name:string}; ${invalid}`, './__cost_model__.ts');
  expect(measured.errors.join('\n')).toContain(message);
});

// Compile the client alone, matching a consumer that imports the API type.
describe.each(DIALECTS)('%s explicit public type boundary', (dialect) => {
  it.each(['builders', 'types'] as const)(
    '%s costs the same with schemas, conversion and routes in one file',
    (form) => {
      const {header, cases} = readRouteFile(`${dialect}.${form}.routes.ts`);
      const schema = readFileSync(fileURLToPath(new URL(`../src/db/${dialect}.${form}.ts`, import.meta.url)), 'utf8')
        .replace(/\bsql\b/g, 'schemaSql')
        .replace(/(?<=[{,]\s*)schemaSql(?=[,}])/g, 'sql as schemaSql');
      const db = readFileSync(fileURLToPath(new URL(`../src/db/${dialect}.${form}.db.ts`, import.meta.url)), 'utf8')
        .split('\n')
        .filter((line) => !line.startsWith('import ') || !line.includes(`${dialect}.${form}.ts`))
        .join('\n');
      const mixedHeader =
        header.replace(/^import.*from '\.\.\/db\/.+\.ts';\n?/gm, '') +
        '\n' +
        schema +
        '\n' +
        db.replace("from './fakeDriver.ts'", "from '../db/fakeDriver.ts'");
      const directSplit = measureDirectModel('', `../db/${dialect}.${form}.ts`);
      const directMixed = measureDirectModel(mixedHeader, './__cost_model__.ts');
      expect([...directSplit.errors, ...directMixed.errors]).toEqual([]);
      expect(directSplit.drizzleFiles).toBe(0);
      expect(directMixed.drizzleFiles).toBeGreaterThan(0);
      expect(directMixed.whole).toBeGreaterThan(directSplit.whole);
      for (const name of ['selectAll', 'innerJoin', 'relations']) {
        const routeCase = cases.find((c) => c.name === name);
        expect(routeCase, name).toBeDefined();
        const split = measureCase(header, routeCase!);
        const mixed = measureCase(mixedHeader, routeCase!);
        expect([...split.errors, ...mixed.errors], name).toEqual([]);
        expect(mixed.client.total, name).toBe(split.client.total);
      }
    },
    900_000
  );
});
