/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// In-vitest mirror of the manifest gate for this dialect: migrated entries
// are callable exports of the shipped root module, every column is migrated,
// nothing is pending, and the dialects.json row points here. The all-dialects
// invariant is pinned in the pg package's twin spec.

import {describe, it, expect} from 'vitest';
import dialectsConfig from '../../../drizzle-dialects.json';
import ownManifest from '../manifests/mysql.manifest.json';
import * as surface from './index.ts';

const DIALECT = 'mysql';
const surfaceModule = surface as Record<string, unknown>;

describe(`the ${DIALECT} manifest matches the shipped root module`, () => {
  it('the dialects.json row for this dialect points at this package', () => {
    const row = dialectsConfig.dialects.find((candidate) => candidate.dialect === DIALECT);
    expect(row?.packageDir).toBe('packages/drizzle-orm-mysql-core');
    expect(row?.proxy).toBe('src/index.ts');
    expect(row?.module).toBe('drizzle-orm/mysql-core');
  });

  it('every migrated entry is a callable export; columns migrated; nothing pending', () => {
    for (const entry of ownManifest.entries) {
      if (entry.status === 'migrated') {
        expect(typeof surfaceModule[entry.fn], `migrated ${entry.fn} must be exported and callable`).toBe('function');
      }
      if (entry.kind === 'column') expect(entry.status, `column ${entry.fn} must be migrated`).toBe('migrated');
      expect(entry.status, `${entry.fn} must not be pending`).not.toBe('pending');
    }
  });
});
