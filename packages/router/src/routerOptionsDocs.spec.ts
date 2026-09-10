/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The `@default` tag on a RouterOptions field is what a consumer reads to decide whether to set the
// option at all, and nothing linked it to the value the router actually uses: `maxContextPoolSize`
// was documented as `0 (disabled)` while DEFAULT_ROUTE_OPTIONS set it to 100, so the option that
// decides whether a CallContext is reused between requests read as off while it was on.
// This reads the tags straight out of the source and compares each one to the real default.

import {describe, it, expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {DEFAULT_ROUTE_OPTIONS} from './constants.ts';

const GENERAL_TYPES = join(dirname(fileURLToPath(import.meta.url)), 'types/general.ts');

// A JSDoc block followed by the field it documents: `/** ... */ name?: type;`
const DOCUMENTED_FIELD = /\/\*\*([\s\S]*?)\*\/\s*(\w+)\??\s*:/g;

/** Every `@default` tag in RouterOptions, keyed by the option it sits on. */
function documentedDefaults(): Map<string, string> {
  const defaults = new Map<string, string>();
  const source = readFileSync(GENERAL_TYPES, 'utf8');
  for (const [, comment, field] of source.matchAll(DOCUMENTED_FIELD)) {
    const tag = /@default\s+(.*)/.exec(comment!);
    if (tag) defaults.set(field!, tag[1]!.replace(/\*\/\s*$/, '').trim());
  }
  return defaults;
}

describe('router-options-documented-defaults', () => {
  const documented = documentedDefaults();

  it('finds the tags it claims to check', () => {
    expect(documented.get('maxBodySize')).toBe('256000');
    expect(documented.get('alwaysAwait')).toBe('true');
    expect(documented.get('encoder')).toBe("{params: 'clone', return: 'clone'}");
  });

  it('documents the value DEFAULT_ROUTE_OPTIONS actually uses', () => {
    // Options missing from the constant get their default further down the pipeline (`encoder` is
    // resolved at build time), so only the ones the constant declares can be checked here.
    const wrong: string[] = [];
    for (const [option, tag] of documented) {
      if (!(option in DEFAULT_ROUTE_OPTIONS)) continue;
      const actual = DEFAULT_ROUTE_OPTIONS[option as keyof typeof DEFAULT_ROUTE_OPTIONS];
      // The tag must be the bare literal: `0 (disabled)` is how the pool default drifted unnoticed.
      if (tag !== JSON.stringify(actual)) wrong.push(`${option}: @default ${tag}, actual ${JSON.stringify(actual)}`);
    }
    expect(wrong).toEqual([]);
  });
});
