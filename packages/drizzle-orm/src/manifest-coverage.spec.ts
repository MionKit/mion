/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// In-vitest mirror of the manifest gate for the ROOT drizzle-orm module:
// its one migrated authoring export (sql) is callable here, nothing is
// pending, and the dialects.json row points at this package. Everything else
// the root module exports is query/runtime surface used through toDrizzle()
// results, recorded as skipped with that reason.

import {describe, it, expect} from 'vitest';
import dialectsConfig from '../../drizzle-dialects.json';
import ownManifest from '../manifests/root.manifest.json';
import * as surface from './index.ts';

const surfaceModule = surface as Record<string, unknown>;

describe('the root drizzle-orm manifest matches the shipped module', () => {
  it('the dialects.json row for the root module points at this package', () => {
    const row = dialectsConfig.dialects.find((candidate) => candidate.dialect === 'root');
    expect(row?.packageDir).toBe('packages/drizzle-orm');
    expect(row?.proxy).toBe('src/index.ts');
    expect(row?.module).toBe('drizzle-orm');
    expect((row as {noColumnBuilders?: boolean} | undefined)?.noColumnBuilders).toBe(true);
  });

  it('every migrated entry is a callable export and nothing is pending', () => {
    let migrated = 0;
    for (const entry of ownManifest.entries) {
      if (entry.status === 'migrated') {
        migrated++;
        expect(typeof surfaceModule[entry.fn], `migrated ${entry.fn} must be exported and callable`).toBe('function');
      }
      expect(entry.status, `${entry.fn} must not be pending`).not.toBe('pending');
    }
    expect(migrated).toBeGreaterThanOrEqual(1); // sql at minimum
  });
});
