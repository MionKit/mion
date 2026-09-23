// FormatPattern — a pre-validated regex bundle for a format's `pattern` slot, authored as TYPE-LEVEL string literals so it
// survives `.d.ts` emission: the Go scanner recovers {source, flags, mockSamples, message} from the RESOLVED TYPE of the
// `pattern` property, `typeof /x/` is plain `RegExp`, and a published `.d.ts` erases any runtime initializer, so only literals
// captured via `const` type params reach a downstream consumer. Hence the `const A` generic over the WHOLE args object.
// mockSamples are OPTIONAL: a pattern that declares none gets a pool generated from the regex at build time, fresh per build
// unless a literal createMockDataFn seed pins it (patternSampleCount of them; patterns the generator cannot handle fail the
// build with FMT005). Declared samples always win.

import type {CompTimeArgs} from '../markers.ts';

// The regex as a `source` string plus optional `flags` (a `/regex/` literal can't be lifted into a type), optional `mockSamples`
// (canonical valid values the mock generator draws from) and an optional `message` label surfaced in diagnostics.
// Every field is a compile-time literal at the call site so the scanner can read each one straight from the type.
export interface StringPatternArgs {
  source: string;
  flags?: string;
  mockSamples?: readonly string[];
  message?: string;
  // Opts out of the build-time backtracking check (FMT008), which rejects a pattern a crafted input can make take exponential time.
  // For the rare pattern the check reads wrongly: the emitted validator still runs the regex, so turning it off is a promise the pattern is safe.
  unsafePattern?: boolean;
  // Blocks a RegExp VALUE, which has source + flags and would otherwise fit structurally.
  // `typeof /x/` is plain RegExp, so no field would stay a literal type and the scanner could never read the pattern.
  exec?: never;
}

declare const formatPatternBrand: unique symbol;

// Generic over the args object so every field stays a literal type (and survives `.d.ts`); the brand keeps it distinct from a plain object literal.
// Bare `FormatPattern` (A defaulted) is the widened shape used where a pattern's specific literals don't matter (the `PatternParam` union).
export interface FormatPattern<A extends StringPatternArgs = StringPatternArgs> {
  readonly source: A['source'];
  readonly flags: 'flags' extends keyof A ? NonNullable<A['flags']> : '';
  readonly mockSamples: 'mockSamples' extends keyof A ? A['mockSamples'] : undefined;
  readonly message?: 'message' extends keyof A ? A['message'] : undefined;
  readonly unsafePattern?: 'unsafePattern' extends keyof A ? A['unsafePattern'] : undefined;
  readonly [formatPatternBrand]: true;
}

// Validates each declared mockSample with the same JS engine the runtime validators use, and freezes the bundle.
// Throws on the first sample that doesn't match: a sample is meant to be a canonical valid value, so a mismatch is a definition bug.
// `const A` keeps every field literal, which is what carries them into the published `.d.ts` — see the file header.
export function registerFormatPattern<const A extends StringPatternArgs>(args: CompTimeArgs<A>): FormatPattern<A> {
  const resolved = args as A;
  const source = resolved.source;
  const flags = resolved.flags ?? '';
  const {mockSamples, message, unsafePattern} = resolved;
  // Test with a non-stateful copy: `g`/`y` make `.test` advance lastIndex.
  const tester = new RegExp(source, flags.replace(/[gy]/g, ''));
  for (const sample of mockSamples ?? []) {
    if (!tester.test(sample)) {
      throw new Error(
        `registerFormatPattern: mockSample ${JSON.stringify(sample)} does not match /${source}/${flags}` +
          (message ? ` — ${message}` : '')
      );
    }
  }
  return Object.freeze({source, flags, mockSamples, message, unsafePattern}) as unknown as FormatPattern<A>;
}
