/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// refine.ts is ONE shared implementation pattern: the three dialect packages'
// copies must be byte-identical after mapping the allowlisted dialect tokens
// (package name, drizzle module specifier, table/column type names) onto the
// pg spelling. A divergence means a fix landed in one dialect only.

import {describe, it, expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const PACKAGES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// dialect tokens -> their pg spelling; longer tokens first so the package
// name maps before the bare module/type names inside it.
const TOKEN_MAPS: Record<string, [string, string][]> = {
  mysql: [
    ['drizzle-orm-mysql-core', 'drizzle-orm-pg-core'],
    ['drizzle-orm/mysql-core', 'drizzle-orm/pg-core'],
    ['MySqlTableWithColumns', 'PgTableWithColumns'],
    ['MySqlColumn', 'PgColumn'],
    ['MySqlTable', 'PgTable'],
  ],
  sqlite: [
    ['drizzle-orm-sqlite-core', 'drizzle-orm-pg-core'],
    ['drizzle-orm/sqlite-core', 'drizzle-orm/pg-core'],
    ['SQLiteTableWithColumns', 'PgTableWithColumns'],
    ['SQLiteColumn', 'PgColumn'],
    ['SQLiteTable', 'PgTable'],
  ],
};

function refineSource(packageName: string): string {
  return readFileSync(resolve(PACKAGES_DIR, packageName, 'src/refine.ts'), 'utf8');
}

describe('refine.ts parity across the dialect packages', () => {
  const pgSource = refineSource('drizzle-orm-pg-core');

  for (const [dialect, tokenMap] of Object.entries(TOKEN_MAPS)) {
    it(`${dialect} matches pg modulo the dialect tokens`, () => {
      let mapped = refineSource(`drizzle-orm-${dialect}-core`);
      for (const [from, to] of tokenMap) mapped = mapped.replaceAll(from, to);
      expect(mapped).toBe(pgSource);
    });
  }
});
