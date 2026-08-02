// The lean subset the light smoke apps build: validate (both truthy + falsy),
// reflection (both marker call shapes, with convergence), one JSON round-trip,
// and one SUBPATH import. Enough to prove an adapter loads, transforms marker
// calls, and its output runs — without paying the full-matrix cost on every
// bundler.
//
// The `@ts-runtypes/core/json-schema` import is deliberate and load-bearing:
// every light smoke must resolve at least one subpath export out of the PACKED
// tarball, or a broken `exports` entry ships unnoticed (the gap that let
// `formats/temporal` go uncovered). It also puts a BUILDER-form marker call
// (`runTypeFromJsonSchema({…})`, rewritten by appending an argument rather than by
// stripping a type argument) in front of all six adapters.
import {createValidateFn, getRunTypeId, createJsonEncoderFn, createJsonDecoderFn} from '@ts-runtypes/core';
import {runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';
import {type CheckResult, eq, ok} from './check';

export interface Widget {
  id: number;
  name: string;
  when: Date;
}

export const isWidget = createValidateFn<Widget>();

// Both marker call shapes (CLAUDE.md marker rule).
export const widgetIdStatic = getRunTypeId<Widget>();
const sample: Widget = {id: 1, name: 'w', when: new Date('2026-01-01T00:00:00Z')};
export const widgetIdFromValue = getRunTypeId(sample);

export const encodeWidget = createJsonEncoderFn<Widget>();
export const decodeWidget = createJsonDecoderFn<Widget>();

// Subpath + builder-form marker call. `Tag` is the hand-written twin the
// schema-authored type must converge on.
export interface Tag {
  label: string;
  weight: number;
}
export const tagIdStatic = getRunTypeId<Tag>();
export const isTag = createValidateFn(
  runTypeFromJsonSchema({
    type: 'object',
    properties: {label: {type: 'string'}, weight: {type: 'number'}},
    required: ['label', 'weight'],
  })
);
export const tagIdFromSchema = getRunTypeId(
  runTypeFromJsonSchema({
    type: 'object',
    properties: {label: {type: 'string'}, weight: {type: 'number'}},
    required: ['label', 'weight'],
  })
);

export function selfCheck(): {ok: boolean; results: CheckResult[]} {
  const wire = encodeWidget(sample)!;
  const back = decodeWidget(wire);
  const results: CheckResult[] = [
    ok('minimal: validate accepts a good value', isWidget(sample)),
    ok('minimal: validate rejects a bad value', !isWidget({id: 'x', name: 5, when: 'nope'})),
    ok('minimal: static typeId is a non-empty string', typeof widgetIdStatic === 'string' && widgetIdStatic.length > 0),
    // Convergence: static id ≡ value-first id for equal T.
    eq('minimal: static id ≡ value-first id', widgetIdStatic, widgetIdFromValue),
    ok('minimal: JSON round-trip restores the Date', back.when instanceof Date),
    // The json-schema subpath resolved out of the packed tarball AND its
    // builder-form call site was rewritten (an un-rewritten one cannot validate).
    ok('minimal: json-schema subpath validator accepts a good value', isTag({label: 'a', weight: 1})),
    ok('minimal: json-schema subpath validator rejects a bad value', !isTag({label: 5, weight: 'x'})),
    eq('minimal: static id ≡ schema-authored id', tagIdStatic, tagIdFromSchema),
  ];
  return {ok: results.every((result) => result.ok), results};
}
