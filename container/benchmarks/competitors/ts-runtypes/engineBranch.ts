// Which counter did `rt::countEnumKeys` pick for THIS engine, and is that the
// one it was supposed to pick?
//
// The pure fn specialises once at materialisation: `for-in` on V8, a
// prototype-guarded `Object.keys` on JavaScriptCore (see pf_countEnumKeys in
// packages/ts-runtypes/src/runtypes/pure-fns-utils.ts). Both are pinned to answer
// identically for every input, so a wrong choice costs throughput and never
// correctness — which is exactly why it can rot unnoticed. The benchmark is the
// only place that runs the real thing on both engines, so it is where the choice
// gets checked.
//
// Modelled on the Temporal assertion in ./setup.ts: fail loudly on a
// misconfigured runtime instead of quietly reporting numbers that mean something
// other than what the table claims.

import {createHasUnknownKeysFn, createValidateFn} from '@ts-runtypes/core';

/** 'jsc' = the Object.keys counter (JavaScriptCore / Bun), 'v8' = the for-in counter. */
export type EngineBranch = 'jsc' | 'v8';

/** The runtime this process is, by the same probe the pure fn itself uses. */
export function currentRuntime(): 'bun' | 'node' {
  return typeof (globalThis as {Bun?: unknown}).Bun !== 'undefined' ? 'bun' : 'node';
}

/** Which branch SHOULD have been taken here. Bun is JavaScriptCore; everything
 *  else we run on (node, deno) is V8 and takes the default counter. */
export function expectedEngineBranch(): EngineBranch {
  return currentRuntime() === 'bun' ? 'jsc' : 'v8';
}

/** Observe which counter is live by watching whether a strict check reaches
 *  `Object.keys`. Uses the real emitted validator + the real
 *  `runsAfterValidation` predicate, so this is the shipped code path and not a
 *  reimplementation of it — a strict check on an all-required object is what
 *  routes through rt::countEnumKeys. */
export function detectEngineBranch(): EngineBranch {
  interface Probe {
    a: number;
    b: string;
  }
  const validate = createValidateFn<Probe>();
  const hasUnknownKeys = createHasUnknownKeysFn<Probe>(undefined, {runsAfterValidation: true});
  const value: Probe = {a: 1, b: 'x'};

  // Warm the factories so materialisation (which is where the branch is decided)
  // happens OUTSIDE the window we are watching.
  validate(value);
  hasUnknownKeys(value);

  const originalKeys = Object.keys;
  let objectKeysCalls = 0;
  Object.keys = ((obj: object) => {
    objectKeysCalls++;
    return originalKeys(obj);
  }) as typeof Object.keys;
  try {
    hasUnknownKeys(value);
  } finally {
    Object.keys = originalKeys;
  }
  return objectKeysCalls > 0 ? 'jsc' : 'v8';
}

/** Detect, and throw when the live counter is not the one this engine should have
 *  selected. Catches: Bun no longer being detected by the probe, the branch being
 *  removed outright, and a lane that claims to run Bun but actually ran node. */
export function assertEngineBranch(): EngineBranch {
  const expected = expectedEngineBranch();
  const actual = detectEngineBranch();
  if (actual !== expected) {
    throw new Error(
      `rt::countEnumKeys selected the '${actual}' counter but this runtime (${currentRuntime()}) must select '${expected}'. ` +
        `Either the engine probe in pf_countEnumKeys stopped matching this runtime, the per-engine branch was removed, ` +
        `or this lane is not running the runtime it claims to.`
    );
  }
  return actual;
}
