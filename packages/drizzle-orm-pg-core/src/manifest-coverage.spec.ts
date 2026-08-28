/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// In-vitest mirror of the `pnpm rtx core drizzle-manifest --check` gate,
// scoped to THIS package's dialect: every migrated entry (column builders and
// authoring helpers alike) is a callable export of the shipped root module,
// nothing is pending, and the hand-owned drizzle-dialects.json row points at
// this package. The all-dialects invariant (every configured manifest exists
// and shares ONE drizzle-orm version) is pinned here too, reading the sibling
// packages' manifests off the config rows.

import {describe, it, expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import dialectsConfig from '../../../drizzle-dialects.json';
import ownManifest from '../manifests/pg.manifest.json';
import * as surface from './index.ts';

const DIALECT = 'pg';
const PACKAGE_DIR = 'packages/drizzle-orm-pg-core';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const surfaceModule = surface as Record<string, unknown>;

describe(`the ${DIALECT} manifest matches the shipped root module`, () => {
  it('the dialects.json row for this dialect points at this package', () => {
    const row = dialectsConfig.dialects.find((candidate) => candidate.dialect === DIALECT);
    expect(row).toBeDefined();
    expect(row?.packageDir).toBe(PACKAGE_DIR);
    expect(row?.proxy).toBe('src/index.ts');
    expect(row?.manifest).toBe(`manifests/${DIALECT}.manifest.json`);
    expect(row?.module).toBe(`drizzle-orm/${DIALECT}-core`);
  });

  it('every migrated entry is a callable export of the root module', () => {
    for (const entry of ownManifest.entries) {
      if (entry.status !== 'migrated') continue;
      expect(typeof surfaceModule[entry.fn], `migrated ${entry.fn} must be exported and callable`).toBe('function');
    }
  });

  it('every column entry is migrated and nothing is pending', () => {
    for (const entry of ownManifest.entries) {
      if (entry.kind === 'column') expect(entry.status, `column ${entry.fn} must be migrated`).toBe('migrated');
      expect(entry.status, `${entry.fn} must not be pending`).not.toBe('pending');
    }
  });

  it('every configured manifest exists and shares ONE drizzle-orm version', () => {
    const versions = new Set<string>();
    for (const row of dialectsConfig.dialects) {
      const manifest = JSON.parse(readFileSync(resolve(REPO_ROOT, row.packageDir, row.manifest), 'utf8'));
      versions.add(manifest.drizzleOrm);
    }
    expect([...versions]).toHaveLength(1);
  });
});
