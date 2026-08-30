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
import * as surface from './index.ts';

const DIALECT = 'sqlite';
const surfaceModule = surface as Record<string, unknown>;

describe(`the ${DIALECT} manifest matches the shipped root module`, () => {
  it('the dialects.json row for this dialect points at this package', () => {
    const row = dialectsConfig.dialects.find((candidate) => candidate.dialect === DIALECT);
    expect(row?.packageDir).toBe('packages/drizzle-orm-sqlite-core');
    expect(row?.proxy).toBe('src/index.ts');
    expect(row?.module).toBe('drizzle-orm/sqlite-core');
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

  it('every migrated column entry records its pure-type alias (upperFirst rule)', () => {
    // No exemptions: int is drizzle's alias of integer, but it records its own
    // builder name, so a converted table has to print it back as int() and it
    // needs its own Int column type.
    for (const entry of ownManifest.entries) {
      if (entry.kind !== 'column' || entry.status !== 'migrated') continue;
      const expected = entry.fn.charAt(0).toUpperCase() + entry.fn.slice(1);
      expect(entry.typeAlias, `column ${entry.fn} must export the ${expected} column type`).toBe(expected);
    }
  });

  it('every manifest modifier is spellable in a column type props bag', () => {
    // Modifiers are PROPS now, not marker types: a column type takes one object
    // holding the builder's config keys and its modifier calls, constrained by
    // the *ColMods bags beside the builders. A modifier drizzle records but no
    // bag declares has no type-road spelling at all, silently.
    const columnsSource = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), './columns.ts'), 'utf8');
    const bagKeys = new Set<string>();
    for (const bag of columnsSource.matchAll(/export interface \w*ColMods[\s\S]*?\n\}/g)) {
      // Inherited names come through `Pick<ColMods, 'a' | 'b'>`, own ones are
      // declared in the body.
      for (const picked of bag[0].matchAll(/'([\w$]+)'/g)) bagKeys.add(picked[1]);
      for (const own of bag[0].matchAll(/^ {2}([\w$]+)\?:/gm)) bagKeys.add(own[1]);
    }
    const modifierNames = new Set<string>();
    for (const entry of ownManifest.entries) {
      for (const modifier of entry.modifiers ?? []) modifierNames.add(modifier);
    }
    expect(modifierNames.size).toBeGreaterThan(0);
    expect(bagKeys.size, 'no *ColMods bag found — this gate is reading nothing').toBeGreaterThan(5);
    for (const modifier of modifierNames) {
      expect(bagKeys.has(modifier), `modifier .${modifier}() has no key in any *ColMods bag`).toBe(true);
    }
  });
});
