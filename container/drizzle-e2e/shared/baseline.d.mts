// Types for baseline.mjs, so a TypeScript consumer can import it.
//
// The module itself stays plain JS: it is loaded by run-suite.mjs INSIDE the
// container, where there is no TypeScript and no build step. Its only typed
// consumer is the lane-contract test, which pins the normalization this file
// describes (packages/ts-runtypes-devtools/test/drizzle-e2e-lane-contracts.test.ts).

/** One tsc error line, reduced to what survives the translation. */
export function normalizeError(line: string, roots: readonly string[]): string;

/** What the translation ADDED and what it REMOVED. Both empty means the
 *  translated tree typechecks exactly as the untranslated one does. */
export function diffTypeErrors(input: {
  translated: readonly string[];
  control: readonly string[];
  roots: readonly string[];
}): {added: string[]; removed: string[]; translatedCount: number; controlCount: number};

/** Only the `error TSxxxx:` lines of a tsc run. */
export function errorLines(output: string): string[];
