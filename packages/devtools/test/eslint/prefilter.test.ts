// Prefilter gate tests + the Go↔TS constant-sync guard: the generated tag
// constants the JS side matches with must be byte-identical to the literals
// the Go emitters/detectors define in internal/enrichment/mirror/tags.go (the
// single source of truth). A drifted literal silently stops enforcing, so
// this guard reads the Go source directly.

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {looksLikeEnrichmentFile, needsResolverPass, referencesMarkerModule} from '../../src/lint/prefilter.ts';
import {
  FRIENDLY_TEXT_NAME,
  FRIENDLY_TYPE_NAME,
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
    expect(NAMES_GO).toContain(`FriendlyTypeName = "${FRIENDLY_TYPE_NAME}"`); // legacy spelling still declared
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
    // The deprecated `/schema` alias still resolves until 1.0, so a file
    // importing it must still reach the diagnostics pass.
    expect(referencesMarkerModule(`import {x} from "@mionjs/run-types/schema";`)).toBe(true);
    expect(referencesMarkerModule('// see packages/run-types/src for details')).toBe(false);
  });

  it('matches a routes file that imports only the router: its helpers carry the markers', () => {
    // `mion.route(handler, opts)` resolves to a signature with InjectTypeFnArgs markers and a CompTimeArgs options
    // parameter, so such a file can produce diagnostics without ever naming @mionjs/run-types.
    expect(referencesMarkerModule(`import {createMionRouter} from '@mionjs/router';`)).toBe(true);
    expect(referencesMarkerModule(`import type {Routes} from "@mionjs/router";`)).toBe(true);
    expect(referencesMarkerModule('// the routes live next to the @mionjs/router setup')).toBe(false);
  });

  it('matches a configured marker package, additively with the default one', () => {
    const markers = {packages: ['@my-org/markers']};
    const ownPackage = `import {getRunTypeId} from '@my-org/markers';`;
    // Without config the third-party import is invisible to the pre-filter, so
    // the file would never reach the resolver and its diagnostics would vanish.
    expect(referencesMarkerModule(ownPackage)).toBe(false);
    expect(referencesMarkerModule(ownPackage, markers)).toBe(true);
    // Configuring one must not stop matching the built-in package.
    expect(referencesMarkerModule(`import {getRunTypeId} from '@mionjs/run-types';`, markers)).toBe(true);
    // Subpaths of a configured package match too, same as the default's.
    expect(referencesMarkerModule(`import {x} from "@my-org/markers/builders";`, markers)).toBe(true);
    // A path mention in prose still must not fire.
    expect(referencesMarkerModule('// see @my-org/markers for details', markers)).toBe(false);
  });

  it('lets every file through when the package check is disabled', () => {
    // With no package gate a marker can be declared anywhere, so no import
    // probe is sound — pre-filtering by specifier would silently drop files.
    expect(referencesMarkerModule('const unrelated = 1;', {checkPackage: false})).toBe(true);
  });
});

describe('looksLikeEnrichmentFile', () => {
  it('matches the marker EMIT form and the annotation form', () => {
    expect(looksLikeEnrichmentFile(`${MARKER_COMMENT_PREFIX}User#a1 */\nexport const friendlyUser = {};`)).toBe(true);
    expect(looksLikeEnrichmentFile(`export const f: ${FRIENDLY_TEXT_NAME}<User> = {};`)).toBe(true);
    expect(looksLikeEnrichmentFile(`export const f: ${FRIENDLY_TYPE_NAME}<User> = {};`)).toBe(true); // legacy spelling still recognized
    expect(looksLikeEnrichmentFile(`export const m:\n  ${MOCK_DATA_NAME}<User> = {};`)).toBe(true);
  });

  it('never matches bare tag strings, declarations, parameter annotations, or prose mentions', () => {
    expect(looksLikeEnrichmentFile(`export const RT_TYPE_TAG = '${RT_TYPE_TAG}';`)).toBe(false);
    expect(looksLikeEnrichmentFile(`export type ${FRIENDLY_TYPE_NAME}<T> = unknown; // the \`${TODO_TAG}\` layer`)).toBe(false);
    expect(looksLikeEnrichmentFile(`// ${TODO_TAG}: refactor\nexport const a = 1;`)).toBe(false);
    // The runtime's own signature takes the map as a PARAMETER — not a mirror.
    expect(looksLikeEnrichmentFile(`export function createFriendlyText<T>(map: ${FRIENDLY_TYPE_NAME}<T>) {}`)).toBe(false);
  });
});

describe('needsResolverPass', () => {
  it('is the union of both gates', () => {
    expect(needsResolverPass(`import {getRunTypeId} from '@mionjs/run-types';`)).toBe(true);
    expect(needsResolverPass(`export const f: ${FRIENDLY_TYPE_NAME}<User> = {};`)).toBe(true);
    expect(needsResolverPass('export const a = 1;')).toBe(false);
  });
});
