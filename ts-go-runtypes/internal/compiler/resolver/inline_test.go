package resolver_test

import (
	"sort"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/constants"
	"github.com/mionkit/ts-runtypes/internal/jsengine"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// runtypesDTS mirrors internal/testfixtures/runtypes.d.ts — the fake
// `ts-runtypes` module declaration. setupInline always
// overlays it under the test cwd so caller snippets stay terse, the
// same trick the FE helper uses (packages/ts-runtypes-devtools/test/helpers/inline.ts:30).
const runtypesDTS = `declare module '@ts-runtypes/core' {
  export type InjectRunTypeId<T> = string & {readonly __rtInjectRunTypeIdBrand?: T};
  export type CompTimeArgs<T> = T & {readonly __rtCompTimeArgsBrand?: never};
  export type CompTimeFnArgs<T> = T & {readonly __rtCompTimeFnArgsBrand?: never};
  export type InjectTypeFnArgs<T, F1 extends string, F2 extends string = never, F3 extends string = never> = string & {readonly __rtInjectTypeFnArgsBrand?: T; readonly __rtInjectTypeFnArgsFns?: [F1, F2, F3]};
  export interface ValidateOptions {noLiterals?: boolean; noIsArrayCheck?: boolean; rejectCircularRefs?: boolean}
  export function getRunTypeId<T>(value?: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
  export function createValidateFn<T>(val?: T, options?: CompTimeFnArgs<ValidateOptions>, id?: InjectTypeFnArgs<T, 'val'>): (v: unknown) => boolean;
  export function createGetValidationErrorsFn<T>(val?: T, options?: CompTimeFnArgs<ValidateOptions>, id?: InjectTypeFnArgs<T, 'verr'>): (v: unknown, p?: unknown[], e?: unknown[]) => unknown[];
  export function createStandardSchema<T>(val?: T, options?: CompTimeFnArgs<ValidateOptions>, ids?: InjectTypeFnArgs<T, 'val', 'verr'>): {'~standard': {version: 1; vendor: string; validate: (v: unknown) => unknown}};
  export function createHasUnknownKeysFn<T>(val?: T, id?: InjectTypeFnArgs<T, 'huk'>): (v: unknown) => unknown;
  export function createStripUnknownKeys<T>(val?: T, id?: InjectTypeFnArgs<T, 'suk'>): (v: unknown) => unknown;
  export function createUnknownKeyErrorsFn<T>(val?: T, id?: InjectTypeFnArgs<T, 'uke'>): (v: unknown) => unknown;
  export function createUnknownKeysToUndefined<T>(val?: T, id?: InjectTypeFnArgs<T, 'uku'>): (v: unknown) => unknown;
  export function createFormatTransformFn<T>(val?: T, id?: InjectTypeFnArgs<T, 'fmt'>): (v: unknown) => unknown;
  export function createBinaryEncoderFn<T>(val?: T, options?: any, id?: InjectTypeFnArgs<T, 'tb'>): (v: unknown) => unknown;
  export function createBinaryDecoderFn<T>(val?: T, options?: any, id?: InjectTypeFnArgs<T, 'fb'>): (v: unknown) => unknown;
  export type JsonEncoderOptions = {strategy?: 'clone' | 'mutate' | 'direct'; rejectCircularRefs?: boolean};
  export type JsonDecoderOptions = {strategy?: 'strip' | 'preserve'};
  export function createJsonEncoderFn<T>(val?: T, options?: CompTimeFnArgs<JsonEncoderOptions>, id?: InjectTypeFnArgs<T, 'jsonEncoder'>): (v: unknown) => string | undefined;
  export function createJsonDecoderFn<T>(val?: T, options?: CompTimeFnArgs<JsonDecoderOptions>, id?: InjectTypeFnArgs<T, 'jsonDecoder'>): (s: string) => unknown;
  // Minimal DataOnly stand-in — preserves the alias-clearing key-filtering
  // mapped-type shape that the real DataOnly uses in dataOnly.ts, just
  // enough to exercise the serializer's mapped-type recognition path.
  export type DataOnly<T> = T extends object
    ? {[K in keyof T as K extends symbol ? never : K]: DataOnly<T[K]>}
    : T;
}
`

// temporalDTS is a minimal ambient `Temporal` namespace so snippets can
// reference Temporal.PlainDate etc. Mirrors the SHAPE of
// internal/testfixtures/temporal.d.ts (interface X + const X: XConstructor).
// Always overlaid by setupInline under the test cwd, like runtypesDTS.
const temporalDTS = `declare namespace Temporal {
  interface Instant { readonly epochMilliseconds: number; readonly epochNanoseconds: bigint; toJSON(): string; equals(o: Instant): boolean; }
  interface InstantConstructor { from(item: Instant | string): Instant; fromEpochMilliseconds(ms: number): Instant; compare(a: Instant, b: Instant): number; prototype: Instant; }
  const Instant: InstantConstructor;
  interface ZonedDateTime { readonly epochNanoseconds: bigint; readonly timeZoneId: string; toJSON(): string; equals(o: ZonedDateTime | string): boolean; }
  interface ZonedDateTimeConstructor { from(item: ZonedDateTime | string): ZonedDateTime; compare(a: ZonedDateTime, b: ZonedDateTime): number; prototype: ZonedDateTime; }
  const ZonedDateTime: ZonedDateTimeConstructor;
  interface PlainDate { readonly year: number; readonly month: number; readonly day: number; toJSON(): string; equals(o: PlainDate | string): boolean; }
  interface PlainDateConstructor { from(item: PlainDate | string): PlainDate; compare(a: PlainDate, b: PlainDate): number; prototype: PlainDate; }
  const PlainDate: PlainDateConstructor;
  interface PlainTime { readonly hour: number; readonly minute: number; readonly second: number; toJSON(): string; equals(o: PlainTime | string): boolean; }
  interface PlainTimeConstructor { from(item: PlainTime | string): PlainTime; compare(a: PlainTime, b: PlainTime): number; prototype: PlainTime; }
  const PlainTime: PlainTimeConstructor;
  interface PlainDateTime { readonly year: number; readonly month: number; readonly day: number; toJSON(): string; equals(o: PlainDateTime | string): boolean; }
  interface PlainDateTimeConstructor { from(item: PlainDateTime | string): PlainDateTime; compare(a: PlainDateTime, b: PlainDateTime): number; prototype: PlainDateTime; }
  const PlainDateTime: PlainDateTimeConstructor;
  interface PlainYearMonth { readonly year: number; readonly month: number; toJSON(): string; equals(o: PlainYearMonth | string): boolean; }
  interface PlainYearMonthConstructor { from(item: PlainYearMonth | string): PlainYearMonth; compare(a: PlainYearMonth, b: PlainYearMonth): number; prototype: PlainYearMonth; }
  const PlainYearMonth: PlainYearMonthConstructor;
  interface PlainMonthDay { readonly monthCode: string; readonly day: number; toJSON(): string; equals(o: PlainMonthDay | string): boolean; }
  interface PlainMonthDayConstructor { from(item: PlainMonthDay | string): PlainMonthDay; prototype: PlainMonthDay; }
  const PlainMonthDay: PlainMonthDayConstructor;
  interface Duration { readonly years: number; readonly seconds: number; toJSON(): string; }
  interface DurationConstructor { from(item: Duration | string): Duration; compare(a: Duration, b: Duration): number; prototype: Duration; }
  const Duration: DurationConstructor;
}
`

// setupInline builds a Session over an in-memory overlay of TypeScript
// sources. Mirrors withInlineSources in helpers/inline.ts so Go tests can
// keep their snippet right next to the assertions instead of jumping to a
// fixture file. Single-threaded (one pool checker, serial scan) — the
// shape every pre-parallel test was written against.
func setupInline(t testing.TB, sources map[string]string) *resolver.Session {
	t.Helper()
	return setupInlineWith(t, sources, func(programOpts *program.Options, resolverOpts *resolver.Options) {
		programOpts.SingleThreaded = true
		resolverOpts.SingleThreaded = true
	})
}

// setupInlineWith is setupInline with an options hook: mutate receives the
// program + resolver options after defaults are filled, letting parallel
// tests build multi-checker programs (leave SingleThreaded false) or flip
// the Disable* toggles. Overlay file names are registered in sorted order
// so the Program's file list — and therefore the pool's round-robin
// file→checker association — is deterministic across runs (Go map
// iteration order is not).
func setupInlineWith(t testing.TB, sources map[string]string, mutate func(*program.Options, *resolver.Options)) *resolver.Session {
	t.Helper()
	cwd := tspath.NormalizePath(t.TempDir())
	overlay := make(map[string]string, len(sources)+2)
	relNames := make([]string, 0, len(sources)+2)
	if _, ok := sources["runtypes.d.ts"]; !ok {
		overlay[tspath.ResolvePath(cwd, "runtypes.d.ts")] = runtypesDTS
		relNames = append(relNames, "runtypes.d.ts")
	}
	if _, ok := sources["temporal.d.ts"]; !ok {
		overlay[tspath.ResolvePath(cwd, "temporal.d.ts")] = temporalDTS
		relNames = append(relNames, "temporal.d.ts")
	}
	for rel, code := range sources {
		overlay[tspath.ResolvePath(cwd, rel)] = code
		relNames = append(relNames, rel)
	}
	sort.Strings(relNames)
	fileNames := make([]string, 0, len(relNames))
	for _, rel := range relNames {
		fileNames = append(fileNames, tspath.ResolvePath(cwd, rel))
	}
	programOpts := program.Options{Cwd: cwd, Overlay: overlay}
	// The real sidecar engine (host node) is the default so pattern-bearing
	// fixtures validate exactly as a real build would; tests exercising the
	// missing-runtime path override JSEngine in their mutate hook. The
	// sample-generation knobs default to the binary defaults for the same
	// reason (a real build always carries them); tests exercising the
	// disabled lane set PatternSampleCount to 0 explicitly.
	resolverOpts := resolver.Options{
		Cwd:                  cwd,
		JSEngine:             jsengine.NewSidecar(""),
		PatternSampleCount:   constants.DefaultPatternSampleCount,
		PatternSampleRetries: constants.DefaultPatternSampleRetries,
	}
	if mutate != nil {
		mutate(&programOpts, &resolverOpts)
	}
	p, err := program.NewInferred(programOpts, fileNames)
	if err != nil {
		t.Fatalf("program.NewInferred: %v", err)
	}
	r, err := resolver.New(p, resolverOpts)
	if err != nil {
		t.Fatalf("resolver.New: %v", err)
	}
	t.Cleanup(r.Close)
	return r
}

// resolveInline pins code to test.ts in an in-memory program, scans it,
// and returns the resolver plus the RunType entry for the first call site.
// Tests that need to dump the full type list after the scan use the
// returned resolver; tests that only check the root type ignore it.
func resolveInline(t *testing.T, code string) (*resolver.Session, *protocol.RunType) {
	t.Helper()
	r := setupInline(t, map[string]string{"test.ts": code})
	tn := resolveFile(t, r, "test.ts")
	return r, tn
}
