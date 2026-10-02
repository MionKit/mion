// Prefilter gate tests + the Go↔TS constant-sync guard: the generated tag
// constants the JS side matches with must be byte-identical to the literals
// the Go emitters/detectors define in internal/enrichment/mirror/tags.go (the
// single source of truth). A drifted literal silently stops enforcing, so
// this guard reads the Go source directly.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  declaresUnsafePropertyName,
  looksLikeEnrichmentFile,
  referencesRouter,
  needsResolverPass,
  referencesMarkerModule,
} from '../../src/lint/prefilter.ts';
import {
  FRIENDLY_TEXT_NAME,
  MARKER_COMMENT_PREFIX,
  MOCK_DATA_NAME,
  ORPHAN_BLOCK_PATTERN_SOURCE,
  ORPHAN_CHILD_TAG,
  ORPHAN_TAG,
  RT_IDS_TAG,
  RT_TYPE_TAG,
  TODO_LINE,
  TODO_TAG,
} from '../../src/core/go-generated/runtypes-constants.generated.ts';

const TAGS_GO = fs.readFileSync(path.resolve(__dirname, '../../../../ts-go-runtypes/internal/enrichment/mirror/tags.go'), 'utf8');
const NAMES_GO = fs.readFileSync(path.resolve(__dirname, '../../../../ts-go-runtypes/internal/enrichment/names.go'), 'utf8');

describe('constant sync with internal/enrichment/mirror/tags.go', () => {
  it('tag literals match the Go definitions byte for byte', () => {
    expect(TAGS_GO).toContain(`RtTypeTag = "${RT_TYPE_TAG}"`);
    expect(TAGS_GO).toContain(`RtIdsTag  = "${RT_IDS_TAG}"`);
    expect(TAGS_GO).toContain(`TodoTag = "${TODO_TAG}"`);
    expect(TAGS_GO).toContain(`OrphanTag      = "${ORPHAN_TAG}"`);
    expect(ORPHAN_CHILD_TAG).toBe(`${ORPHAN_TAG}Child`);
    expect(NAMES_GO).toContain(`FriendlyTextName = "${FRIENDLY_TEXT_NAME}"`);
    expect(NAMES_GO).toContain(`MockDataName     = "${MOCK_DATA_NAME}"`);
  });

  it('composite constants keep the Go composition shape', () => {
    expect(TODO_LINE.startsWith(`// ${TODO_TAG}: `)).toBe(true);
    expect(MARKER_COMMENT_PREFIX).toBe(`/** ${RT_TYPE_TAG} `);
  });

  it('the orphan-block pattern compiles in JS with the s flag and matches both emit forms', () => {
    const pattern = new RegExp(ORPHAN_BLOCK_PATTERN_SOURCE, 'gs');
    expect(`/* ${ORPHAN_TAG} export const gone = {}; */`).toMatch(pattern);
    pattern.lastIndex = 0;
    expect(`/* ${ORPHAN_CHILD_TAG} old: {},\nmore */`).toMatch(pattern);
    // No Go-only inline flags leaked into the shared source.
    expect(ORPHAN_BLOCK_PATTERN_SOURCE).not.toContain('(?s)');
  });
});

describe('referencesMarkerModule', () => {
  it('matches quoted import specifiers only, not path mentions in comments', () => {
    expect(referencesMarkerModule(`import {createValidateFn} from '@mionjs/run-types';`)).toBe(true);
    expect(referencesMarkerModule(`import {x} from "@mionjs/run-types/builders";`)).toBe(true);
    expect(referencesMarkerModule('// see packages/run-types/src for details')).toBe(false);
  });

  it('matches a configured marker package, additively with the default one', () => {
    const markers = {packages: ['@my-org/markers']};
    const ownPackage = `import {getRunTypeId} from '@my-org/markers';`;
    // Unconfigured, the file never reaches the resolver and its diagnostics vanish.
    expect(referencesMarkerModule(ownPackage)).toBe(false);
    expect(referencesMarkerModule(ownPackage, undefined, markers)).toBe(true);
    // Configuring one must not stop matching the built-in package.
    expect(referencesMarkerModule(`import {getRunTypeId} from '@mionjs/run-types';`, undefined, markers)).toBe(true);
    // Subpaths of a configured package match too, same as the default's.
    expect(referencesMarkerModule(`import {x} from "@my-org/markers/builders";`, undefined, markers)).toBe(true);
    // A path mention in prose still must not fire.
    expect(referencesMarkerModule('// see @my-org/markers for details', undefined, markers)).toBe(false);
  });

  it('lets every file through when the package check is disabled', () => {
    // Any file may declare a marker, so filtering by specifier would silently drop files.
    expect(referencesMarkerModule('const unrelated = 1;', undefined, {checkPackage: false})).toBe(true);
  });
});

// Real directories, because the gate reads imported package.json files and local wrappers from disk.
describe('referencesMarkerModule follows imports', () => {
  const REPO_ROOT = path.resolve(__dirname, '../../../..');
  let dir: string;
  const write = (rel: string, text: string): string => {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), {recursive: true});
    fs.writeFileSync(abs, text);
    return abs;
  };
  const installPackage = (name: string, manifest: Record<string, unknown>): void => {
    write(`node_modules/${name}/package.json`, JSON.stringify({name, ...manifest}));
  };

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-prefilter-'));
    installPackage('@acme/pg-tables', {peerDependencies: {'@mionjs/run-types': '*'}});
    installPackage('@acme/dep-tables', {dependencies: {'@mionjs/run-types': '*'}});
    installPackage('@acme/opt-tables', {optionalDependencies: {'@mionjs/run-types': '*'}});
    installPackage('@acme/own-tables', {peerDependencies: {'@my-org/markers': '*'}});
    installPackage('left-pad', {dependencies: {'is-number': '*'}});
  });
  afterAll(() => fs.rmSync(dir, {recursive: true, force: true}));

  it('admits a file importing only a package that depends on the marker package', () => {
    const file = path.join(dir, 'src/users.ts');
    const text = `import {tableFromType} from '@acme/pg-tables';\nexport const users = tableFromType<Users>();`;
    expect(text).not.toContain('@mionjs/run-types');
    expect(referencesMarkerModule(text)).toBe(false);
    expect(referencesMarkerModule(text, file)).toBe(true);
    expect(referencesMarkerModule(`import {t} from '@acme/dep-tables/columns';`, file)).toBe(true);
    expect(referencesMarkerModule(`const t = require("@acme/opt-tables");`, file)).toBe(true);
    expect(referencesMarkerModule(`const t = await import('@acme/pg-tables');`, file)).toBe(true);
  });

  it('rejects packages with no marker dependency, missing packages and builtins', () => {
    const file = path.join(dir, 'src/plain.ts');
    expect(referencesMarkerModule(`import pad from 'left-pad';`, file)).toBe(false);
    expect(referencesMarkerModule(`import {x} from '@acme/not-installed';`, file)).toBe(false);
    expect(referencesMarkerModule(`import fs from 'node:fs';`, file)).toBe(false);
    // A dependency on a configured marker package counts only once it is configured.
    const own = `import {t} from '@acme/own-tables';`;
    expect(referencesMarkerModule(own, file)).toBe(false);
    expect(referencesMarkerModule(own, file, {packages: ['@my-org/markers']})).toBe(true);
  });

  it('admits a real repo file importing only a drizzle dialect package', () => {
    const file = path.join(REPO_ROOT, 'packages/drizzle-orm-pg-core/test/users.ts');
    const text = `import {tableFromType} from '@mionjs/drizzle-orm-pg-core';\nexport const users = tableFromType<Users>();`;
    expect(referencesMarkerModule(text, file)).toBe(true);
  });

  it('admits a file importing a local wrapper, whatever the specifier spelling', () => {
    write('lib/db.ts', `import {tableFromType} from '@acme/pg-tables';\nexport {tableFromType};`);
    write('lib/markers/index.ts', `import {getRunTypeId} from '@mionjs/run-types';\nexport {getRunTypeId};`);
    write('lib/pure.ts', `export const f = registerPureFnFactory('ns', 'f', () => 1);`);
    const file = path.join(dir, 'src/users.ts');
    expect(referencesMarkerModule(`import {tableFromType} from '../lib/db';`, file)).toBe(true);
    expect(referencesMarkerModule(`import {tableFromType} from '../lib/db.ts';`, file)).toBe(true);
    expect(referencesMarkerModule(`import {tableFromType} from '../lib/db.js';`, file)).toBe(true);
    expect(referencesMarkerModule(`import {getRunTypeId} from '../lib/markers';`, file)).toBe(true);
    expect(referencesMarkerModule(`import {f} from '../lib/pure';`, file)).toBe(true);
  });

  it('follows local imports one level only, and rejects a wrapper that holds no marker', () => {
    write('lib/plain.ts', `export const answer = 42;`);
    write('lib/outer.ts', `export {tableFromType} from './db';`);
    const file = path.join(dir, 'src/users.ts');
    expect(referencesMarkerModule(`import {answer} from '../lib/plain';`, file)).toBe(false);
    expect(referencesMarkerModule(`import {x} from '../lib/missing';`, file)).toBe(false);
    expect(referencesMarkerModule(`import {tableFromType} from '../lib/outer';`, file)).toBe(false);
  });

  it('keeps one verdict per wrapper file, even when two share a modified time', () => {
    const marked = write('same/marked.ts', `export {tableFromType} from '@acme/pg-tables';`);
    const plain = write('same/plain.ts', `export const answer = 42;`);
    const stamp = new Date(Date.now() - 60_000);
    for (const wrapper of [marked, plain]) fs.utimesSync(wrapper, stamp, stamp);
    const file = path.join(dir, 'src/users.ts');
    expect(referencesMarkerModule(`import {t} from '../same/marked';`, file)).toBe(true);
    expect(referencesMarkerModule(`import {a} from '../same/plain';`, file)).toBe(false);
  });

  it('re-reads a wrapper after it changes', () => {
    const wrapper = write('lib/late.ts', `export const answer = 42;`);
    const file = path.join(dir, 'src/users.ts');
    const text = `import {tableFromType} from '../lib/late';`;
    expect(referencesMarkerModule(text, file)).toBe(false);
    fs.writeFileSync(wrapper, `export {tableFromType} from '@acme/pg-tables';`);
    const later = new Date(Date.now() + 5_000);
    fs.utimesSync(wrapper, later, later);
    expect(referencesMarkerModule(text, file)).toBe(true);
  });
});

describe('looksLikeEnrichmentFile', () => {
  it('matches the marker EMIT form and the annotation form', () => {
    expect(looksLikeEnrichmentFile(`${MARKER_COMMENT_PREFIX}User#a1 */\nexport const friendlyUser = {};`)).toBe(true);
    expect(looksLikeEnrichmentFile(`export const f: ${FRIENDLY_TEXT_NAME}<User> = {};`)).toBe(true);
    expect(looksLikeEnrichmentFile(`export const m:\n  ${MOCK_DATA_NAME}<User> = {};`)).toBe(true);
  });

  it('never matches bare tag strings, declarations, parameter annotations, or prose mentions', () => {
    expect(looksLikeEnrichmentFile(`export const RT_TYPE_TAG = '${RT_TYPE_TAG}';`)).toBe(false);
    expect(looksLikeEnrichmentFile(`export type ${FRIENDLY_TEXT_NAME}<T> = unknown; // the \`${TODO_TAG}\` layer`)).toBe(false);
    expect(looksLikeEnrichmentFile(`// ${TODO_TAG}: refactor\nexport const a = 1;`)).toBe(false);
    // The runtime's own signature takes the map as a PARAMETER — not a mirror.
    expect(looksLikeEnrichmentFile(`export function createFriendlyText<T>(map: ${FRIENDLY_TEXT_NAME}<T>) {}`)).toBe(false);
  });
});

describe('referencesRouter', () => {
  it('matches the router package as a quoted specifier', () => {
    expect(referencesRouter(`import {createMionRouter} from '@mionjs/router';`)).toBe(true);
    expect(referencesRouter(`import type {Handler} from "@mionjs/router";`)).toBe(true);
  });

  it('matches a helper call, so a router imported from a relative module still gets through', () => {
    // The usual project layout: the router is created in one module and every
    // route file imports it relatively, naming the package nowhere.
    const relative = `import {mion} from './mion.ts';\nexport const r = mion.route((ctx, n: string): string => n);`;
    expect(relative).not.toContain('@mionjs/router');
    expect(referencesRouter(relative)).toBe(true);
    // A destructured helper is the same story without the dot.
    expect(referencesRouter(`const {route} = mion;\nexport const r = route(handler);`)).toBe(true);
    expect(referencesRouter(`const {headersMiddleware} = mion;\nexport const r = headersMiddleware(handler);`)).toBe(true);
  });

  it('matches the JSDoc handler tags', () => {
    expect(referencesRouter('/** @mion:route */\nexport const h = (ctx, n) => n;')).toBe(true);
  });

  it('leaves a file that could declare no handler alone', () => {
    expect(referencesRouter('export const a = 1;')).toBe(false);
    // A word merely ENDING in a helper name is not a helper call.
    expect(referencesRouter('export const x = enroute(1);')).toBe(false);
    expect(referencesRouter('// the route() helper is documented elsewhere')).toBe(true); // deliberately permissive
  });
});

describe('declaresUnsafePropertyName', () => {
  it('matches a property named `__proto__`, in any declaration form', () => {
    expect(declaresUnsafePropertyName('interface S { __proto__: string }')).toBe(true);
    expect(declaresUnsafePropertyName('type S = {__proto__?: string};')).toBe(true);
    expect(declaresUnsafePropertyName('type Poison = {__proto__: {admin: boolean}};')).toBe(true);
    expect(declaresUnsafePropertyName('class Box { __proto__ = 1 }')).toBe(true);
  });

  it('leaves `prototype` and `constructor` alone, they are ordinary property names', () => {
    expect(declaresUnsafePropertyName('interface S { constructor: string }')).toBe(false);
    expect(declaresUnsafePropertyName('type P = {IndexBuilder: {prototype: object}};')).toBe(false);
    expect(declaresUnsafePropertyName('class Box { constructor(size: number) {} }')).toBe(false);
    expect(declaresUnsafePropertyName('const c = value.constructor;')).toBe(false);
  });
});

describe('needsResolverPass', () => {
  it('is the union of all three gates', () => {
    expect(needsResolverPass(`import {getRunTypeId} from '@mionjs/run-types';`)).toBe(true);
    expect(needsResolverPass(`export const f: ${FRIENDLY_TEXT_NAME}<User> = {};`)).toBe(true);
    expect(needsResolverPass('export const a = 1;')).toBe(false);
  });

  // The gap the move opened: the mion route rules run on files that import no
  // marker at all, so without the router gate they would be skipped before the
  // resolver was ever asked and would silently never fire.
  // The unsafe-name rule reports a declaration, so it must reach files that
  // import nothing of ours — types no route has touched yet are exactly what it
  // is for.
  it('admits a file that only declares an unsafe property name', () => {
    const types = 'export type Poison = {__proto__: {admin: boolean}};';
    expect(types).not.toContain('@mionjs/');
    expect(needsResolverPass(types)).toBe(true);
  });

  it('admits a file whose markers come through an imported package', () => {
    const file = path.join(path.resolve(__dirname, '../../../..'), 'packages/drizzle-orm-pg-core/test/users.ts');
    expect(needsResolverPass(`import {tableFromType} from '@mionjs/drizzle-orm-pg-core';`, file)).toBe(true);
  });

  it('admits a route file that references no marker package', () => {
    const routes = `import {createMionRouter} from '@mionjs/router';\nconst mion = createMionRouter();\nexport const r = mion.route((ctx, n: string): string => n);`;
    expect(routes).not.toContain('@mionjs/run-types');
    expect(needsResolverPass(routes)).toBe(true);
  });
});
