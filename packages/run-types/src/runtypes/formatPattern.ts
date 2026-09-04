// FormatPattern — a pre-validated regex bundle for a format's `pattern` slot,
// authored as TYPE-LEVEL string literals so it survives `.d.ts` emission:
//
//   const slug = registerFormatPattern({
//     source: '^[a-z0-9-]+$',
//     mockSamples: ['my-slug', 'abc'],
//     message: 'must be a slug',
//   });
//   type Slug = String<{pattern: typeof slug}>;
//
// Why string literals and not a `/regex/`: the Go scanner recovers
// {source, flags, mockSamples, message} from the RESOLVED TYPE of the `pattern`
// property. `typeof /x/` is `RegExp` — TypeScript has no literal type for a
// regex — and a published `.d.ts` erases any runtime initializer, so only string
// literals captured via `const` type params reach a downstream consumer (any
// normal npm dependent, and the benchmark). registerFormatPattern is therefore
// generic over the WHOLE args object (`const A`): source / flags / mockSamples /
// message all land in `FormatPattern<A>` and ride the type into `.d.ts`. It
// still validates any declared mockSamples against the pattern at registration
// (the same JS engine the runtime validator uses) and freezes the bundle.
//
// mockSamples are OPTIONAL: a pattern that declares none gets a deterministic
// sample pool generated from the regex at build time (patternSampleCount of
// them; patterns the generator cannot handle fail the build with FMT005,
// telling you to declare samples). Declared samples always win over generation.

import type {CompTimeArgs} from '../markers.ts';

// Args to registerFormatPattern: the regex as a `source` string + optional
// `flags` string (a `/regex/` literal can't be lifted into a type), plus
// optional `mockSamples` (canonical valid values the mock generator draws
// from — omit them and the build generates a pool from the regex) and an
// optional `message` label surfaced in diagnostics/errors. Every field is a
// compile-time literal at the call site (wrapped in CompTimeArgs) so the scanner
// can read each one straight from the type.
export interface StringPatternArgs {
  source: string;
  flags?: string;
  mockSamples?: readonly string[];
  message?: string;
  // Opts this pattern out of the build-time backtracking check (FMT008),
  // which rejects a pattern a crafted input can make take exponential time.
  // For the rare pattern the check reads wrongly: the emitted validator
  // still runs the regex on every value, so turning the check off is a
  // promise that the pattern really is safe.
  unsafePattern?: boolean;
  // Deliberately blocks a RegExp VALUE (now that mockSamples is optional a
  // RegExp — which has source + flags — would otherwise fit structurally):
  // `typeof /x/` is plain RegExp, so no field would stay a literal type and
  // the build-time scanner could never read the pattern. Spell the regex as
  // a `{source, flags?}` literal instead.
  exec?: never;
}

declare const formatPatternBrand: unique symbol;

// FormatPattern<A> is the branded result, generic over the args object so every
// field stays a literal type (and survives `.d.ts`). The brand keeps it
// assignable into a format's `pattern` slot and distinct from a plain object
// literal. Bare `FormatPattern` (A defaulted to StringPatternArgs) is the
// widened shape used where a pattern's specific literals don't matter (the
// `PatternParam` union) — matching the previously opaque interface.
export interface FormatPattern<A extends StringPatternArgs = StringPatternArgs> {
  readonly source: A['source'];
  readonly flags: 'flags' extends keyof A ? NonNullable<A['flags']> : '';
  readonly mockSamples: 'mockSamples' extends keyof A ? A['mockSamples'] : undefined;
  readonly message?: 'message' extends keyof A ? A['message'] : undefined;
  readonly unsafePattern?: 'unsafePattern' extends keyof A ? A['unsafePattern'] : undefined;
  readonly [formatPatternBrand]: true;
}

// registerFormatPattern validates each declared mockSample against the pattern
// (real JS engine, the same one runtime validators use) and returns a frozen
// FormatPattern. Throws on the first sample that doesn't match — a sample is
// meant to be a canonical valid value, so a mismatch is a definition bug worth
// failing loudly at module load. Samples may be omitted entirely: the build
// then generates a deterministic pool from the regex. `const A` keeps every
// field literal so the returned `FormatPattern<A>` carries them into the type
// (and the published `.d.ts`), which is the whole point — see the file header.
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
