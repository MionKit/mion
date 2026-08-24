// A tiny, dependency-free assertion helper. Every feature module exports a
// `check*()` that returns these records; the app entry aggregates them and the
// build-output tests assert over the report. Kept deliberately minimal so it
// survives every bundler's tree-shaking / minification intact.
export interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
}

// eq builds a pass/fail record from an equality; unequal values land in `detail`
// so a failure is legible in the test output no matter which bundler produced it.
export function eq<T>(name: string, actual: T, expected: T): CheckResult {
  const ok = actual === expected;
  return ok ? {name, ok} : {name, ok, detail: `expected ${String(expected)}, got ${String(actual)}`};
}

// ok wraps a boolean the caller already computed.
export function ok(name: string, value: boolean, detail?: string): CheckResult {
  return value ? {name, ok: true} : {name, ok: false, detail};
}
