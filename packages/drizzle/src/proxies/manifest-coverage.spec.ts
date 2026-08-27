/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// In-vitest mirror of the `pnpm rtx core drizzle-manifest --check` gate:
// every manifest entry exists on the matching proxy namespace (export-star
// passthrough included) and every migrated column fn is callable. The Go gate
// validates the manifest against drizzle's d.ts; this spec validates it
// against the runtime modules the package actually ships.

import {describe, it, expect} from 'vitest';
import manifest from '../../drizzle-columns.manifest.json';
import * as pgProxy from './pg.ts';
import * as mysqlProxy from './mysql.ts';
import * as sqliteProxy from './sqlite.ts';

const proxies: Record<string, Record<string, unknown>> = {pg: pgProxy, mysql: mysqlProxy, sqlite: sqliteProxy};

describe('drizzle-columns.manifest.json matches the shipped proxy modules', () => {
  it('covers all three dialects with no pending entries', () => {
    const dialects = new Set(manifest.entries.map((entry) => entry.dialect));
    expect([...dialects].sort()).toEqual(['mysql', 'pg', 'sqlite']);
    const pending = manifest.entries.filter((entry) => entry.status === 'pending');
    expect(pending).toEqual([]);
  });

  it('every entry exists on its proxy namespace and every migrated fn is callable', () => {
    for (const entry of manifest.entries) {
      const proxyModule = proxies[entry.dialect];
      expect(proxyModule, entry.dialect).toBeDefined();
      expect(entry.fn in proxyModule, `${entry.dialect}.${entry.fn} missing from proxy`).toBe(true);
      if (entry.status === 'migrated') {
        expect(typeof proxyModule[entry.fn], `${entry.dialect}.${entry.fn} must be callable`).toBe('function');
      }
    }
  });

  it('skipped entries always carry a reason', () => {
    for (const entry of manifest.entries) {
      if (entry.status === 'skipped') expect(entry.reason, `${entry.dialect}.${entry.fn}`).toBeTruthy();
    }
  });
});
