/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// In-vitest mirror of the `pnpm rtx core drizzle-manifest --check` gate, scoped
// to THIS package's dialect: every entry of manifests/mysql.manifest.json
// exists on the shipped root module (export-star passthrough included), every
// migrated column fn is callable, and the hand-owned dialects.json config row
// for this dialect points at this package's files. The Go gate validates the
// manifests against drizzle's d.ts; this spec validates them against the
// runtime module the package actually ships. The all-dialects invariant (every
// configured manifest exists and shares ONE drizzle-orm version) is pinned here
// too, reading the sibling packages' manifests off the config rows.

import {describe, it, expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import dialectsConfig from '../../drizzle-orm-manifests/dialects.json';
import ownManifest from '../manifests/mysql.manifest.json';
import * as proxy from './index.ts';

const DIALECT = 'mysql';
const PACKAGE_DIR = 'packages/drizzle-orm-mysql-core';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const proxyModule = proxy as Record<string, unknown>;
const entries = ownManifest.entries.map((entry) => ({...entry, dialect: ownManifest.dialect}));

describe(`the ${DIALECT} manifest matches the shipped root module`, () => {
  it('the dialects.json row for this dialect points at this package', () => {
    const row = dialectsConfig.dialects.find((candidate) => candidate.dialect === DIALECT);
    expect(row).toBeDefined();
    expect(row?.packageDir).toBe(PACKAGE_DIR);
    expect(row?.proxy).toBe('src/index.ts');
    expect(row?.manifest).toBe(`manifests/${DIALECT}.manifest.json`);
    expect(row?.module).toBe(`drizzle-orm/${DIALECT}-core`);
  });

  it('every configured manifest exists and all share one drizzle-orm version', () => {
    const versions = new Set(
      dialectsConfig.dialects.map((row) => {
        const manifest = JSON.parse(readFileSync(resolve(REPO_ROOT, row.packageDir, row.manifest), 'utf8'));
        expect(manifest.dialect).toBe(row.dialect);
        return manifest.drizzleOrm as string;
      })
    );
    expect(versions.size).toBe(1);
  });

  it('names its own dialect with no pending entries', () => {
    expect(ownManifest.dialect).toBe(DIALECT);
    const pending = entries.filter((entry) => entry.status === 'pending');
    expect(pending).toEqual([]);
  });

  it('every entry exists on the root module and every migrated fn is callable', () => {
    for (const entry of entries) {
      expect(entry.fn in proxyModule, `${entry.dialect}.${entry.fn} missing from the root module`).toBe(true);
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

  it('every entry carries a known kind and functions are reviewed', () => {
    for (const entry of entries) {
      expect(['column', 'function', 'passthrough']).toContain(entry.kind);
      if (entry.kind === 'function') expect(entry.status, `${entry.dialect}.${entry.fn}`).not.toBe('pending');
    }
  });
});
