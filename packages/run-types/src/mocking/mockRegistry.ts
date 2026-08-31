// Per-kind mock-fn registry. The type-formats package registers ONE
// mock function per ReflectionKind (e.g. every string format registers a
// single switch keyed by the format name); the mock walker consults it
// before the kind-default mock. Replaces the old per-format class +
// getRunTypeFormat lookup — same dispatch, collapsed to one fn per kind
// so related logic lives in a single file (the project's class→switch
// convention).

import type {FormatAnnotation} from '../runtypes/formatAnnotation.ts';
import type {RunTypeKindValue} from '../go-generated/runTypeKind.generated.ts';
import type {MockRandom} from './mockRandom.ts';

/** Produces a base mock value for a format-branded runtype. Returns
 *  `undefined` to defer to the kind-default mock (e.g. an unknown format
 *  name). The value-transform (lowercase/trim) is applied separately by
 *  the mock walker, after this returns.
 *
 *  `random` is the generation's shared random source — draw every value from it
 *  (not `Math.random`) so a custom mock fn stays reproducible under a `seed`.
 *  Optional for backward compatibility: an existing `(annotation) => …` fn still
 *  satisfies the type and simply ignores it. **/
export type MockFormatFn = (annotation: FormatAnnotation, random?: MockRandom) => unknown;

const registry = new Map<number, MockFormatFn>();

/** Register the mock fn for a ReflectionKind. The type-formats package
 *  calls this once per kind at module load. **/
export function registerMockingFunction(kind: RunTypeKindValue, fn: MockFormatFn): void {
  registry.set(kind as number, fn);
}

/** The registered mock fn for `kind`, or undefined when none is registered. **/
export function getMockingFunction(kind: RunTypeKindValue): MockFormatFn | undefined {
  return registry.get(kind as number);
}
