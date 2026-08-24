/**
 * One place that gathers all your rule-checks (this is the rules worksheet's
 * deliverable). One check*() per rule; each returns a replayable failure record
 * (a Violation) or null when the rule holds. Adapt from
 * packages/ts-runtypes/test/fuzz/fuzzOracle.ts. Replace the generic <Value, Output,
 * Wire> with the real types of the code you're testing, and keep only the checks whose
 * rule shape survived the checklist in the rules worksheet.
 */

/** The error the code is *expected* to throw — a controlled outcome, not a bug (① never crashes). */
export class ControlledError extends Error {}

/** The handshake between the input maker and the rules: the functions of the code under test. */
export interface Target<Value, Output, Wire = string> {
  title: string;
  run: (input: Value) => Output; // the code under test, wrapped so you can call it directly
  encode?: (value: Value) => Wire; // for ② do it then undo it
  decode?: (wire: Wire) => Value;
  reference?: (input: Value) => Output; // a second, trusted way to get the answer (⑤ compare to a trusted source)
}

export interface CheckCtx {
  seed: number;
  step?: number; // for code with memory, driven by a sequence of actions
}

export interface Violation {
  rule: string; // 'totality', 'round-trip', …
  title: string;
  seed: number;
  message: string;
}

const fail = (rule: string, ctx: CheckCtx, title: string, message: string): Violation => ({rule, title, seed: ctx.seed, message});

/** ① never crashes — only CONTROLLED outcomes; never an uncontrolled throw or hang. */
export function checkTotality<V, O, W>(target: Target<V, O, W>, value: V, ctx: CheckCtx): Violation | null {
  try {
    target.run(value);
    return null;
  } catch (error) {
    if (error instanceof ControlledError) return null; // a declared rejection is fine
    return fail('totality', ctx, target.title, `run() threw uncontrolled: ${String(error)}`);
  }
}

/** ② do it then undo it — decoding the encoding gives back the value (strongest when an undo exists). */
export function checkRoundTrip<V, O, W>(target: Target<V, O, W>, value: V, ctx: CheckCtx): Violation | null {
  if (!target.encode || !target.decode) return null;
  const back = target.decode(target.encode(value));
  return equals(back, value) ? null : fail('round-trip', ctx, target.title, 'decode(encode(x)) !== x');
}

/** ⑤ compare to a trusted source — run() agrees with a second, trusted way to get the answer. */
export function checkDifferential<V, O, W>(target: Target<V, O, W>, value: V, ctx: CheckCtx): Violation | null {
  if (!target.reference) return null;
  return equals(target.run(value), target.reference(value))
    ? null
    : fail('differential', ctx, target.title, 'run() disagrees with reference()');
}

/**
 * ⑧ reject bad input — a value that is provably wrong must be reported, never quietly
 * accepted. `wasReported` is what you can see (from Step 1): a thrown ControlledError,
 * a `false` return, a non-empty diagnostics list — whatever surface exposes the
 * rejection. Once you have watched it happen, pin the SPECIFIC signal (a diagnostic code).
 */
export function checkNegativeSpace<V, O, W>(
  target: Target<V, O, W>,
  badValue: V,
  ctx: CheckCtx,
  wasReported: (target: Target<V, O, W>, value: V) => boolean
): Violation | null {
  return wasReported(target, badValue)
    ? null
    : fail('negative-space', ctx, target.title, 'a provably-invalid value was silently accepted');
}

/** Deep value comparison — REPLACE with your real comparison (see test/util/equalsHelpers.ts:
 *  symbols by description, Date/Map/Set/RegExp, Temporal, padded arrays, …). */
function equals(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b); // placeholder only
}
