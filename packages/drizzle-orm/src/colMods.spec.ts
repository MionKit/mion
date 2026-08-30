/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The gate under the one-object column spelling.
//
// A column type takes its builder config and its modifier calls in the SAME
// object (`Varchar<'name', {length: 100; notNull: true}>`), and both readers
// split that object by colModNames: this package's runtime bridge
// (./fromType.ts) and the Go convert program
// (ts-go-runtypes/internal/convert/drizzle.go). Two things must hold for that
// split to be sound, and neither is visible from either reader alone:
//
//   1. the list covers every modifier the dialects actually record, so a
//      drizzle upgrade that adds one cannot land as a silent config key;
//   2. no builder config key is NAMED like a modifier, or it would be pulled
//      out of the call and replayed as a method.
//
// Both are checked against the generated manifests and the dialect sources
// rather than against a second hand-written list.

import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {colModNames, isColModName} from './typeColumns.ts';
import {RtColumnRecorder} from './recorder.ts';

const DIALECTS = ['pg', 'mysql', 'sqlite'] as const;

const packageDir = (dialect: string) => fileURLToPath(new URL(`../../drizzle-orm-${dialect}-core/`, import.meta.url));

interface ManifestEntry {
  fn: string;
  kind?: string;
  status?: string;
  modifiers?: string[];
}

function manifestModifiers(dialect: string): string[] {
  const path = `${packageDir(dialect)}manifests/${dialect}.manifest.json`;
  const entries = JSON.parse(readFileSync(path, 'utf8')).entries as ManifestEntry[];
  return entries
    .filter((entry) => entry.kind === 'column' && entry.status === 'migrated')
    .flatMap((entry) => entry.modifiers ?? []);
}

/** The config interfaces the column aliases actually constrain their props by,
 *  read off the `C extends <Config> & <Bag>` line every alias now carries. */
function configTypeNames(source: string): string[] {
  const names = new Set<string>();
  for (const match of source.matchAll(/^ {2}C extends (.+?) = .*$/gm)) {
    const bare = match[1]
      .replace(/\s*&\s*\w*ColMods$/, '')
      .replace(/^Partial<(.+)>$/, '$1')
      .replace(/<.*>$/, '')
      .trim();
    if (/^[A-Za-z][\w]*$/.test(bare) && !bare.endsWith('ColMods')) names.add(bare);
  }
  return [...names];
}

/** Top-level property names of `export interface <name> {...}`. */
function interfaceKeys(source: string, name: string): string[] {
  const head = new RegExp(`^export interface ${name}(<[^>]*>)? \\{$`, 'm').exec(source);
  if (head === null) throw new Error(`no interface ${name} found`);
  const body = source.slice(head.index + head[0].length, source.indexOf('\n}', head.index));
  return [...body.matchAll(/^ {2}([A-Za-z_$][\w$]*)\??:/gm)].map((match) => match[1]);
}

describe('the one-object column spelling', () => {
  it('colModNames covers every modifier the dialects record', () => {
    const recorded = [...new Set(DIALECTS.flatMap(manifestModifiers))].sort();
    expect(recorded, 'add the new modifier to colModNames (and to the Go convert list)').toEqual([...colModNames].sort());
  });

  it('is sorted, so the two readers can be diffed by eye', () => {
    expect([...colModNames]).toEqual([...colModNames].sort());
  });

  it('every name is a method the column recorder can replay', () => {
    // The bridge replays a modifier by calling the same-named method on the
    // recorder. A name here with no method would fail at runtime, on a table
    // that type-checked, in whichever dialect first spelled it.
    const recorder = new RtColumnRecorder(() => undefined) as unknown as Record<string, unknown>;
    const missing = colModNames.filter((name) => name !== '$type' && typeof recorder[name] !== 'function');
    expect(missing, 'add the recorder method in recorder.ts').toEqual([]);
  });

  for (const dialect of DIALECTS) {
    it(`no ${dialect} column config key is named like a modifier`, () => {
      const source = readFileSync(`${packageDir(dialect)}src/columns.ts`, 'utf8');
      const configs = configTypeNames(source);
      expect(configs.length, 'the alias constraints changed shape, this gate is reading nothing').toBeGreaterThan(3);
      const clashes = configs.flatMap((name) =>
        interfaceKeys(source, name)
          .filter(isColModName)
          .map((key) => `${name}.${key}`)
      );
      expect(clashes, 'a config key with a modifier name would be replayed as a method call').toEqual([]);
    });
  }
});
