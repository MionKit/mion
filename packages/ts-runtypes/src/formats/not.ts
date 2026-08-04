// `Not<F>` — format negation. The ONLY user-authorable negation surface:
// TypeScript cannot reflect a general complement type, so negation is offered
// exactly where it is crisp — over type formats on the string / number /
// bigint bases (and same-base unions of them, where ¬(A ∨ B) = ¬A ∧ ¬B holds
// by construction). Everything else — `Not<string>`, `Not<{a: number}>`,
// mixed-base unions, `Not<Not<F>>` — fails the generic CONSTRAINT, so the
// error lands at the write site, not downstream as a mystery `never`.
//
// Encoding: `Base & {readonly __rtNot?: F}` — the negated format rides an
// OPTIONAL, readonly, unspellable sentinel (the exact TypeFormat discipline:
// optionality keeps the type mutually assignable with its base). The Go
// resolver lifts the sentinel onto the node's Negations and the generated
// validator checks `base && !(child)`; the structural id folds the child id
// under a `!{…}` tag so `Not<F>` can never share a cache entry with `F`.
// JSON codecs, DataOnly and binary all key off the positive base — negation
// is validate / validationErrors / mock semantics only.
//
// The nominal brand of a branded format is deliberately STRIPPED: `Not<F>`
// carries `F` (brand included) inside the sentinel, but the outer type gains
// no `__rtFormatBrand`, so a negation is never assignable where the branded
// format itself is demanded.

import {builderResult, lastInjectedId} from '../runtypes/builderCore.ts';
import type {RunType} from '../runtypes/types.ts';
import type {__rtFormatName, __rtFormatParams, __rtNot} from '../runtypes/sentinelKeys.ts';
import type {InjectRunTypeId, CompTimeArgs} from '../markers.ts';

/** The shape a `Not` operand must have. NOTE: the optional sentinels make
 *  plain `string`/`number`/`bigint` structurally assignable to this alias —
 *  that is WHY `ValidNotOperand` exists (it keys on actually inferring a
 *  format-name literal, which a bare primitive cannot produce). */
export type NotableFormat = (string | number | bigint) & {
  readonly [__rtFormatName]?: string;
  readonly [__rtFormatParams]?: object;
};

/** True only when EVERY union arm of F carries a real format-name literal.
 *  For a bare primitive the inferred N is unconstrained (`unknown`), which
 *  `[string] extends [N]` detects; for a genuine format N is `'email' |
 *  undefined`-shaped and the test fails, marking the arm real. */
type EveryArmIsFormat<F> = (
  F extends {readonly [__rtFormatName]?: infer N} ? ([string] extends [N] ? false : true) : false
) extends true
  ? true
  : false;

/** True when all arms share ONE base kind (string / number / bigint). A
 *  same-base union is a sound operand (¬(A ∨ B) ≡ ¬A ∧ ¬B on that base);
 *  a mixed-base union is not, and must fail at the write site. */
type OneBase<F> = [F] extends [string] ? true : [F] extends [number] ? true : [F] extends [bigint] ? true : false;

/** Constraint half of the misuse contract: resolves to `unknown` (no-op) for
 *  a valid operand and to `never` otherwise, so an invalid `Not<X>` /
 *  `TF.not(x)` errors AT the type argument. `Not<Not<F>>` fails here too —
 *  the outer sentinel type carries no format name. Double negation has no
 *  JSON Schema counterpart worth the id subtleties; unwrap by hand. */
export type ValidNotOperand<F> = OneBase<F> extends true ? (EveryArmIsFormat<F> extends true ? unknown : never) : never;

/** Format negation: still the base type, accepting exactly the values the
 *  negated format rejects (within that base). `Not<Email>` is a string that
 *  is NOT a valid email. */
export type Not<F extends NotableFormat & ValidNotOperand<F>> = ([F] extends [string]
  ? string
  : [F] extends [number]
    ? number
    : bigint) & {readonly [__rtNot]?: F};

/** Value-first negation: `TF.not(TF.email())` / `RT.not(RT.string({pattern}))`.
 *  Wraps a format builder's RunType; the reflected return type IS `Not<F>`,
 *  so the value-first and type-first spellings converge on one structural id
 *  by construction. The inner builder folds into this call site (nested
 *  builder leaf), exactly like composer arguments. */
export function not<const F extends NotableFormat & ValidNotOperand<F>>(
  format: CompTimeArgs<RunType<F>>,
  id?: InjectRunTypeId<Not<F>>
): RunType<Not<F>> {
  return builderResult(lastInjectedId(format, id), {type: 'not', child: format});
}
