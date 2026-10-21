import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {DIALECTS, codeOf, deriveVariant, type Dialect, type Variant} from './routeVariants.ts';

const read = (dialect: Dialect, variant: Variant) =>
  readFileSync(fileURLToPath(new URL(`../src/server/${dialect}.${variant}.routes.ts`, import.meta.url)), 'utf8');

// the cost table compares like with like only while the three files hold the same routes
describe.each(DIALECTS)('%s route files', (dialect) => {
  it('types is the builders file over the type-form tables', () => {
    expect(codeOf(read(dialect, 'types'))).toBe(codeOf(deriveVariant(read(dialect, 'builders'), dialect, 'types')));
  });

  it('drizzle is the builders file on plain drizzle, with every return type left to drizzle', () => {
    expect(codeOf(read(dialect, 'drizzle'))).toBe(codeOf(deriveVariant(read(dialect, 'builders'), dialect, 'drizzle')));
  });
});

it('every dialect has the same routes', () => {
  const keys = (dialect: Dialect) =>
    [...read(dialect, 'builders').matchAll(/^\s+\/\/ case: (\w+)\n\s+(\w+):/gm)].map((match) => `${match[1]}:${match[2]}`);
  expect(keys('mysql')).toEqual(keys('pg'));
  expect(keys('sqlite')).toEqual(keys('pg'));
  expect(keys('pg')).toHaveLength(12);
});
