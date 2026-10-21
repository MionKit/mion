// Types for baseline.mjs, so a TypeScript consumer can import it.
//
// The module itself stays plain JS: it is loaded by run-suite.mjs INSIDE the
// container, where there is no TypeScript and no build step. Its only typed
// consumer is the lane-contract test, which pins the normalization this file
// describes (packages/devtools/test/drizzle-e2e-lane-contracts.test.ts).

/** One tsc error line, reduced to what survives the translation. */
export function normalizeError(line: string, roots: readonly string[]): string;

/** `lineNo` is 1-based, as tsc reports it. */
export function isExactTypeAssertion(sourceLines: readonly string[], lineNo: number): boolean;

/** Both empty means the trees typecheck alike; with `cwd`, added errors on exact-type assertions go to `assertions`. */
export function diffTypeErrors(input: {
  translated: readonly string[];
  control: readonly string[];
  roots: readonly string[];
  cwd?: string;
}): {added: string[]; assertions: string[]; removed: string[]; translatedCount: number; controlCount: number};

/** Only the `error TSxxxx:` lines of a tsc run. */
export function errorLines(output: string): string[];
