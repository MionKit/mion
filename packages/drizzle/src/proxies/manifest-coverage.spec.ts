/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// In-vitest mirror of the `pnpm rtx core drizzle-manifest --check` gate:
// every entry of every per-dialect manifest (manifests/<dialect>.manifest.json)
// exists on the matching proxy namespace (export-star passthrough included)
// and every migrated column fn is callable. The Go gate validates the
// manifests against drizzle's d.ts; this spec validates them against the
// runtime modules the package actually ships, and pins that the index file
// agrees with the dialect files.

import {describe, it, expect} from 'vitest';
import manifestIndex from '../../manifests/index.json';
import pgManifest from '../../manifests/pg.manifest.json';
import mysqlManifest from '../../manifests/mysql.manifest.json';
import sqliteManifest from '../../manifests/sqlite.manifest.json';
import * as pgProxy from './pg.ts';
import * as mysqlProxy from './mysql.ts';
import * as sqliteProxy from './sqlite.ts';

const proxies: Record<string, Record<string, unknown>> = {pg: pgProxy, mysql: mysqlProxy, sqlite: sqliteProxy};
const manifests = [pgManifest, mysqlManifest, sqliteManifest];
const entries = manifests.flatMap((manifest) => manifest.entries.map((entry) => ({...entry, dialect: manifest.dialect})));

describe('the per-dialect manifests match the shipped proxy modules', () => {
  it('the index lists exactly the supported dialects and their files', () => {
    const indexed = manifestIndex.dialects.map((row) => row.dialect).sort();
    expect(indexed).toEqual(['mysql', 'pg', 'sqlite']);
    for (const row of manifestIndex.dialects) {
      expect(row.manifest).toBe(`${row.dialect}.manifest.json`);
      expect(row.proxy).toBe(`packages/drizzle/src/proxies/${row.dialect}.ts`);
    }
  });

  it('each manifest file names its own dialect and the shared drizzle version', () => {
    for (const manifest of manifests) {
      expect(['pg', 'mysql', 'sqlite']).toContain(manifest.dialect);
      expect(manifest.drizzleOrm).toBe(manifestIndex.drizzleOrm);
    }
  });

  it('covers all three dialects with no pending entries', () => {
    const dialects = new Set(entries.map((entry) => entry.dialect));
    expect([...dialects].sort()).toEqual(['mysql', 'pg', 'sqlite']);
    const pending = entries.filter((entry) => entry.status === 'pending');
    expect(pending).toEqual([]);
  });

  it('every entry exists on its proxy namespace and every migrated fn is callable', () => {
    for (const entry of entries) {
      const proxyModule = proxies[entry.dialect];
      expect(proxyModule, entry.dialect).toBeDefined();
      expect(entry.fn in proxyModule, `${entry.dialect}.${entry.fn} missing from proxy`).toBe(true);
      if (entry.status === 'migrated') {
        expect(typeof proxyModule[entry.fn], `${entry.dialect}.${entry.fn} must be callable`).toBe('function');
      }
    }
  });

  it('skipped entries always carry a reason', () => {
    for (const entry of entries) {
      if (entry.status === 'skipped') expect(entry.reason, `${entry.dialect}.${entry.fn}`).toBeTruthy();
    }
  });

  it('every entry carries one of the three known kinds and functions are reviewed', () => {
    const kinds = new Set(entries.map((entry) => entry.kind));
    expect([...kinds].sort()).toEqual(['column', 'function', 'passthrough']);
    for (const entry of entries) {
      if (entry.kind === 'function') expect(entry.status, `${entry.dialect}.${entry.fn}`).not.toBe('pending');
    }
  });
});
