// Shared **strict validation** suite — the `{checkUnknowns: true}` path, where a
// value is accepted only if it validates AND carries no undeclared keys.
//
// Its own section rather than a flag on the validation suite: the cases mirror
// container/benchmarks/shared/cases/strict/index.ts one for one, so the suite
// table and the benchmark table stay aligned, and the group covers BOTH emit
// paths (the O(1) key-count compare on all-required shapes, the key-array scan
// once an optional property appears).

import {STRICT} from './Strict.ts';
import type {StrictCase} from './Strict.ts';

export const STRICT_VALIDATION_SUITE = {
  STRICT,
} as const satisfies {
  STRICT: Record<string, StrictCase>;
};

export {STRICT};
export type {StrictCase};
