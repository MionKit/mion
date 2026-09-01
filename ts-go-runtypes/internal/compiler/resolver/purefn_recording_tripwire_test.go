package resolver_test

import (
	"regexp"
	"sort"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// The pure-fn RECORDING tripwire, in the spirit of noop_predicate_test.go.
//
// Every reference to a package-owned pure fn from an emitted body now flows
// through the single choke point `ctx.UsePureFn(ns, fn, path)` — it records the
// dependency AND hoists the `utl.getPureFn('<ns>::<fn>')` prologue in one step,
// so the emitted `getPureFn(...)` call and the entry's recorded
// `pureFnDependencies` slot are populated together. A raw `utl.getPureFn` string
// written anywhere else would emit the call WITHOUT recording the dep.
//
// This matters because the recording drives delivery: the demand-driven built-in
// pure-fn work makes the recorded list the source of a fn entry's pure-fn
// imports. Once delivery is build-owned,
// a missed recording is no longer masked by the always-on side-effect import — it
// becomes a MISSING IMPORT and a runtime `getPureFn(...) === undefined`. So we pin
// the invariant now: for every rendered live entry, every `getPureFn('K')` /
// `usePureFn('K')` key in its body MUST appear in that same entry's recorded
// `pureFnDependencies` slot.

// tripwireCorpus exercises the built-in-referencing families across a spread of
// shapes: plain objects (validationErrors → rt::newRunTypeErr; the unknown-keys
// group → rt::hasUnknownKeysFromArray / rt::getUnknownKeysFromArray) and
// format-branded strings (the format validators → rtFormats::isUUID). Each
// createX<T>() call site demands its family so the resolver renders a real live
// body for it.
const tripwireCorpus = `import {
  createValidateFn, createGetValidationErrorsFn, createHasUnknownKeysFn,
  createCloneExactShapeFn, createUnknownKeyErrorsFn, createFormatTransformFn,
  createJsonEncoderFn, createJsonDecoderFn, createBinaryEncoderFn, createBinaryDecoderFn,
} from '@mionjs/run-types';
type TypeFormat<Base, Name extends string, Params> = Base & {
  readonly __rtFormatName?: Name;
  readonly __rtFormatParams?: Params;
};
type Obj = {a: string; b: number; c?: boolean};
type Nested = {inner: Obj; tags: string[]};
type WithFmt = {id: TypeFormat<string, 'uuid', {version: '4'}>; note: string};
export const v = createValidateFn<Obj>();
export const vf = createValidateFn<WithFmt>();
export const vn = createValidateFn<Nested>();
export const e = createGetValidationErrorsFn<Obj>();
export const ef = createGetValidationErrorsFn<WithFmt>();
export const en = createGetValidationErrorsFn<Nested>();
export const h = createHasUnknownKeysFn<Obj>();
export const cl = createCloneExactShapeFn<Obj>();
export const uke = createUnknownKeyErrorsFn<Obj>();
export const ft = createFormatTransformFn<WithFmt>();
export const je = createJsonEncoderFn<WithFmt>();
export const jd = createJsonDecoderFn<WithFmt>();
export const be = createBinaryEncoderFn<WithFmt>();
export const bd = createBinaryDecoderFn<WithFmt>();
`

// emittedPureFnRe matches a `getPureFn`/`usePureFn` call in an emitted body. The
// body rides the tuple as a quoteJS single-quoted string, so its inner quotes
// arrive escaped (`getPureFn(\'rt::newRunTypeErr\')`); the leading `\\*['"]`
// tolerates the escaped form, a bare single quote, or a double quote so a raw
// getPureFn written in any quote style is still caught (that's the whole point).
var emittedPureFnRe = regexp.MustCompile(`(?:get|use)PureFn\(\s*\\*['"]([\w$-]+::[\w$-]+)`)

// recordedPureFnRe matches an UNescaped `'<ns>::<fn>'` token — the shape the
// pureFnDependencies slot renders (pureFnDepsJS). The `[^\\]` guard rejects the
// escaped `\'…\'` keys that live inside the body string, so this isolates the
// recorded-deps slot from the getPureFn calls in the code. rtDependencies /
// cross-family refs are `<fnHash>_<id>` (no `::`), so they never match.
var recordedPureFnRe = regexp.MustCompile(`(?:^|[^\\])'([\w$-]+::[\w$-]+)'`)

func pureFnKeysOf(re *regexp.Regexp, module string) map[string]bool {
	out := map[string]bool{}
	for _, match := range re.FindAllStringSubmatch(module, -1) {
		out[match[1]] = true
	}
	return out
}

// TestPureFnRecording_EmittedKeysAreRecorded renders the corpus and asserts,
// per entry module, that every pure-fn key the body reaches via getPureFn is
// present in that entry's recorded pureFnDependencies slot. A raw getPureFn that
// skipped ctx.UsePureFn would emit a key the slot never recorded, tripping this.
func TestPureFnRecording_EmittedKeysAreRecorded(t *testing.T) {
	r := setupInline(t, map[string]string{"a.ts": tripwireCorpus})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}, IncludeEntryModules: true})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}

	entriesWithPureFns := 0
	allEmitted := map[string]bool{}
	for name, module := range resp.EntryModules {
		emitted := pureFnKeysOf(emittedPureFnRe, module)
		if len(emitted) == 0 {
			continue
		}
		entriesWithPureFns++
		recorded := pureFnKeysOf(recordedPureFnRe, module)
		for key := range emitted {
			allEmitted[key] = true
			if !recorded[key] {
				t.Errorf("entry %q emits getPureFn('%s') but its pureFnDependencies slot does not record it — a raw getPureFn bypassed ctx.UsePureFn.\n  recorded: %v\n  module:\n%s",
					name, key, sortedPureFnKeys(recorded), module)
			}
		}
	}

	if entriesWithPureFns == 0 {
		t.Fatal("corpus produced no entry that references a pure fn — harness wiring broke")
	}
	// Coverage floor: the corpus is meant to reach both `rt::` core built-ins and
	// an `rtFormats::` format validator through the choke point. If the emitters
	// stop reaching these (a refactor drops the reference), the invariant above
	// goes vacuous — pin the expected keys so that regression is loud.
	for _, want := range []string{"rt::newRunTypeErr", "rt::hasUnknownKeysFromArray", "rt::getUnknownKeysFromArray", "rtFormats::isUUID"} {
		if !allEmitted[want] {
			t.Errorf("corpus no longer exercises %q (emitted keys: %v) — broaden tripwireCorpus or fix the emitter", want, sortedPureFnKeys(allEmitted))
		}
	}
	t.Logf("pure-fn recording tripwire: %d entries with pure-fn refs, keys seen: %v", entriesWithPureFns, sortedPureFnKeys(allEmitted))
}

func sortedPureFnKeys(set map[string]bool) []string {
	out := make([]string, 0, len(set))
	for key := range set {
		out = append(out, key)
	}
	sort.Strings(out)
	return out
}
