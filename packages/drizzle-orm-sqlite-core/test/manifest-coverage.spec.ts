/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// In-vitest mirror of `pnpm miondevx core drizzle-manifest --check` for this dialect: every migrated entry is a
// callable root export, nothing is pending, and the drizzle-dialects.json row points here. Also pins that every
// configured manifest exists and shares ONE drizzle-orm version.

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
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../manifests/sqlite.manifest.json'), 'utf8')
) as {entries: ManifestEntry[]};
import * as surface from '../src/index.ts';

const DIALECT = 'sqlite';
const PACKAGE_DIR = 'packages/drizzle-orm-sqlite-core';

const surfaceModule = surface as Record<string, unknown>;

describe(`the ${DIALECT} manifest matches the root module`, () => {
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

  it('every migrated column entry records its pure-type alias (upperFirst rule)', () => {
    // No exemptions: int records its own builder name, so a converted table prints int() back and needs its own Int type.
    for (const entry of ownManifest.entries) {
      if (entry.kind !== 'column' || entry.status !== 'migrated') continue;
      const expected = entry.fn.charAt(0).toUpperCase() + entry.fn.slice(1);
      expect(entry.typeAlias, `column ${entry.fn} must export the ${expected} column type`).toBe(expected);
    }
  });

  it('every manifest modifier is spellable in a builder props object and a column type', () => {
    // A modifier drizzle records that no *In interface or *ColMods bag declares has no spelling at all, silently.
    const sourceOf = (file: string) => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', file), 'utf8');
    const keysOf = (source: string, interfaces: RegExp): Set<string> => {
      const keys = new Set<string>();
      for (const declared of source.matchAll(interfaces)) {
        // Inherited names come through `Pick<ColMods, 'a' | 'b'>`, own ones are declared in the body.
        for (const picked of declared[0].matchAll(/'([\w$]+)'/g)) keys.add(picked[1]);
        for (const own of declared[0].matchAll(/^ {2}([\w$]+)\?:/gm)) keys.add(own[1]);
      }
      return keys;
    };
    const bagKeys = keysOf(sourceOf('types.ts'), /export interface \w*ColMods[\s\S]*?\n\}/g);
    const propsKeys = keysOf(sourceOf('types.ts'), /export interface (?:\w*In|\w*SharedColMods)\b[\s\S]*?\n\}/g);
    const modifierNames = new Set<string>();
    for (const entry of ownManifest.entries) {
      for (const modifier of entry.modifiers ?? []) modifierNames.add(modifier);
    }
    expect(modifierNames.size).toBeGreaterThan(0);
    expect(bagKeys.size, 'no *ColMods bag found, this gate is reading nothing').toBeGreaterThan(5);
    expect(propsKeys.size, 'no builder props interface found, this gate is reading nothing').toBeGreaterThan(5);
    for (const modifier of modifierNames) {
      expect(bagKeys.has(modifier), `modifier ${modifier} has no key in any *ColMods bag`).toBe(true);
      expect(propsKeys.has(modifier), `modifier ${modifier} has no key in any builder props interface`).toBe(true);
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
