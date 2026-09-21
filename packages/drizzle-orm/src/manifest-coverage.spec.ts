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
  typeAlias?: string;
  modifiers?: string[];
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
import {columnParity} from '../test/modifierParity.ts';
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

  // Every DIALECT's per-column modifier parity, from this one place: a new
  // dialect row is covered the day it lands. The dialect packages each gate the
  // union (every modifier sits in SOME bag), which cannot see a column whose
  // bag and builder disagree with each other.
  const columnDialects = dialectsConfig.dialects.filter((row) => !row.noColumnBuilders);
  it.each(columnDialects.map((row) => row.dialect))(
    '%s: every column type and its builder offer exactly the manifest modifiers',
    (dialect) => {
      const row = columnDialects.find((candidate) => candidate.dialect === dialect)!;
      const packageDir = resolve(REPO_ROOT, row.packageDir);
      const manifest = JSON.parse(readFileSync(resolve(packageDir, row.manifest), 'utf8')) as {entries: ManifestEntry[]};
      const report = columnParity(
        manifest.entries,
        readFileSync(resolve(packageDir, 'src/columns.ts'), 'utf8'),
        readFileSync(resolve(packageDir, row.proxy), 'utf8')
      );
      expect(report.length, `${dialect}: no migrated columns read - this gate is reading nothing`).toBeGreaterThan(5);
      for (const column of report) {
        expect(column.unresolved, `${dialect} ${column.fn}: ${column.unresolved ?? 'resolved'}`).toBe(null);
        const drift = {
          bagMissing: column.bagMissing,
          bagExtra: column.bagExtra,
          builderMissing: column.builderMissing,
          builderExtra: column.builderExtra,
        };
        expect(
          drift,
          `${dialect} ${column.fn}: bag ${column.bag ?? 'none'} and builder ${column.returns.join('+')} must both offer exactly [${column.manifestModifiers.join(',')}]`
        ).toEqual({bagMissing: [], bagExtra: [], builderMissing: [], builderExtra: []});
      }
    }
  );
});
