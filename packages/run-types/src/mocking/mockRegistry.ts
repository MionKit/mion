// Per-kind mock-fn registry: the type-formats package registers ONE mock function per ReflectionKind
// (every string format is a single switch keyed by the format name), and the mock walker consults it
// before the kind-default mock.

import type {FormatAnnotation} from '../runtypes/formatAnnotation.ts';
import type {RunTypeKindValue} from '../go-generated/runTypeKind.generated.ts';
import type {MockRandom} from './mockRandom.ts';
import type {MockOptions} from './mockTypes.ts';

/** Base mock value for a format-branded runtype; return `undefined` to defer to the kind-default mock.
 *  The value-transform (lowercase/trim) is applied by the mock walker after this returns.
 *  Draw every value from `random`, not `Math.random`, so a custom fn stays reproducible under a `seed`.
 *  `options` is the generation's option bag, for the few formats with a mock knob (`testCreditCards`).
 *  Both are optional for backward compatibility: an existing `(annotation) => …` fn still satisfies the type. **/
export type MockFormatFn = (annotation: FormatAnnotation, random?: MockRandom, options?: MockOptions) => unknown;

const registry = new Map<number, MockFormatFn>();

/** The type-formats package calls this once per kind at module load. **/
export function registerMockingFunction(kind: RunTypeKindValue, fn: MockFormatFn): void {
  registry.set(kind as number, fn);
}

export function getMockingFunction(kind: RunTypeKindValue): MockFormatFn | undefined {
  return registry.get(kind as number);
}
