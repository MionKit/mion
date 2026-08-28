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
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
interface ManifestEntry {
  fn: string;
  kind: string;
  status: string;
}
interface DialectRow {
  dialect: string;
  module: string;
  packageDir: string;
  proxy: string;
  manifest: string;
  noColumnBuilders?: boolean;
}
const dialectsConfig = JSON.parse(readFileSync(resolve(REPO_ROOT, 'drizzle-dialects.json'), 'utf8')) as {
  dialects: DialectRow[];
};
const ownManifest = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../manifests/root.manifest.json'), 'utf8')
) as {entries: ManifestEntry[]};
import * as surface from './index.ts';

const surfaceModule = surface as Record<string, unknown>;

describe('the root drizzle-orm manifest matches the shipped module', () => {
  it('the dialects.json row for the root module points at this package', () => {
    const row = dialectsConfig.dialects.find((candidate) => candidate.dialect === 'root');
    expect(row?.packageDir).toBe('packages/drizzle-orm');
    expect(row?.proxy).toBe('src/index.ts');
    expect(row?.module).toBe('drizzle-orm');
    expect(row?.noColumnBuilders).toBe(true);
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
