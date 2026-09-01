// Package formats is the Go-side registry of TypeFormat emitters. Each
// concrete format ("stringFormat", "uuid", "email", …) registers an
// Emitter via Register from its own init(). The host rt-fn emitters
// (istype, typeerrors, …) call Lookup at compile time and splice the
// per-format JS into their own output.
//
// Sibling of the JS-side runtime registry (packages/run-types/src/
// runtypes/formatRegistry.ts) — the two are kept in lock-step by
// convention: every format ships a Go file under this subtree AND a
// JS format type under `@mionjs/run-types/formats`. Names must match.
package formats

import (
	"sort"
	"sync"

	"github.com/mionkit/mion/ts-go-runtypes/internal/jsengine"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// EmitContext is the narrow surface format emitters use to declare
// dependencies on pure-fn bodies and hoist `const` declarations into
// the RT factory prologue. Subset of the typefns EmitContext;
// typefns.EmitContext satisfies this interface by structural typing
// so the host emitters pass their own ctx through unchanged. Defined
// here (not in typefns) to keep the format-emitter packages free of
// cross-package cycles.
type EmitContext interface {
	// AddPureFnDependency records a (namespace, fnName, filePath)
	// triple the emitted body will reach via
	// `utl.getPureFn('<ns>::<fnName>')`. The resolver threads the
	// path through to the JS-side cache so the pure fn body lives at
	// the right import location.
	AddPureFnDependency(namespace, fnName, filePath string)

	// UsePureFn is the single choke point for referencing a pure fn from
	// an emitted body: it records the dependency, hoists the deduped
	// `const <alias> = utl.getPureFn('<ns>::<fnName>')` prologue line, and
	// returns the alias the body calls. PureFnAlias is a thin wrapper over
	// it (rtFormats namespace). Prefer this over the three-step
	// AddPureFnDependency + HasContextItem + SetContextItem dance.
	UsePureFn(namespace, fnName, filePath string) string

	// HasContextItem reports whether a hoisted-declaration key has
	// already been set in the current factory's prologue. Used to
	// dedupe pure-fn alias declarations when multiple emit sites in
	// the same factory reference the same pure fn.
	HasContextItem(key string) bool

	// SetContextItem hoists `value` (a JS statement) into the
	// factory's prologue under the supplied key. The renderer emits
	// `value` once per factory, regardless of how many emit sites
	// reference it.
	SetContextItem(key, value string)

	// EmitDiagnostic records a build-time diagnostic against every call
	// site referencing the current root RunType. Used by format
	// emitters to surface e.g. a mockSample that doesn't match its own
	// pattern. Deduped per-code per-walk by the walker.
	EmitDiagnostic(code string, args ...string)

	// JSEngine returns the JS engine pattern checks run on (the sidecar
	// under node/bun natively, the host itself under WASM) — the
	// validation authority, since samples exist to satisfy the JS runtime
	// validator. May be nil (tests, engine not configured): callers treat
	// nil like an engine error and emit the missing-runtime diagnostic.
	JSEngine() jsengine.Engine

	// PatternSampleCount / PatternGenFailure mirror the resolver's pattern
	// mockSample auto-generation state, so the pattern emitter can tell
	// "generation disabled" (count 0) from "generation failed" when a
	// sample-less pattern reaches emit time — PatternGenFailure returns
	// the reason the resolver's enrichment pass recorded for
	// (source, flags), or "" when none.
	PatternSampleCount() int
	PatternGenFailure(source, flags string) string

	// NextLocalVar returns a fresh, collision-free local identifier with
	// the given prefix — used to hoist a `const re_N = new RegExp(...)`
	// into the factory prologue (mirrors the template-literal emitter).
	NextLocalVar(prefix string) string
}

// Emitter is the per-format hook surface. A format implements as many
// of the optional methods as make sense (`""` from a method means "no
// format-specific behaviour — fall back to the base-kind emit"). Name
// + Kind are mandatory: they form the registry key.
type Emitter interface {
	// Name returns the canonical format name. Matches the
	// FormatAnnotation.Name on RunTypes that should dispatch here.
	Name() string

	// Kind returns the base ReflectionKind this format wraps. KindString
	// for FormatString / FormatUUID / FormatEmail; KindNumber for the
	// number-format family; etc. Used as a sanity guard — Lookup
	// rejects entries whose Kind doesn't match the host RunType.
	Kind() reflection.ReflectionKind

	// EmitValidateCheck returns a JS expression (no `return`) evaluating
	// to true when `vλl` satisfies the format constraints in
	// annotation.Params. ctx lets the emitter declare pure-fn
	// dependencies + hoist alias declarations into the factory's
	// prologue. Empty return means "no additional check beyond the
	// base-kind validator".
	EmitValidateCheck(annotation *reflection.FormatAnnotation, vλl string, ctx EmitContext) string

	// EmitValidationErrorsCheck returns a JS statement that, when executed,
	// pushes a TypeFormatError onto the errors array (named
	// errorsArr) for `vλl` at `pathExpr` if the value fails this
	// format. Empty return means "no format-specific error — the
	// caller's base-kind error path is sufficient".
	EmitValidationErrorsCheck(annotation *reflection.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx EmitContext) string
}

// ParamValidator is an OPTIONAL Emitter capability: formats that have
// build-time param invariants (mutual exclusivity, ranges, required
// mockSamples, enum membership) implement it. Replaces the JS-side
// `validateParams` throw — we run it AOT in Go and the host emits a
// CodeFMTInvalidParams diagnostic per returned message. Returns nil when
// the params are valid.
type ParamValidator interface {
	ValidateParams(annotation *reflection.FormatAnnotation) []string
}

// FormatTransformer is an OPTIONAL Emitter capability: formats that
// rewrite the value as part of the formatTransform RT-fn (the string-family
// formats, reading the `transform` params block) implement it. Formats with
// no transform (uuid/date/time/…) simply don't, and the format emitter
// treats them as identity. Kept off the mandatory Emitter surface so
// adding a transform to one format doesn't force a no-op method onto
// every other.
type FormatTransformer interface {
	// EmitFormatTransform returns a JS EXPRESSION that transforms `vλl`
	// (e.g. `v.trim().toLowerCase()`), or "" when this format's params
	// specify no transform (identity). The format emitter wraps a
	// non-empty result as `vλl = <expr>`.
	EmitFormatTransform(annotation *reflection.FormatAnnotation, vλl string, ctx EmitContext) string
}

// BinaryEncoder is an OPTIONAL Emitter capability: formats that pack the
// value into fewer (or different) bytes than the base-kind binary
// serializer — the numeric int8/16/32 ladder, the bigint 64-bit path —
// implement it. Mirrors the emitToBinary override. Returns a JS
// STATEMENT that writes `vλl` into the serializer named `ser` (advancing
// `ser.index`), or "" to fall back to the host's base-kind binary arm
// (`{code: undefined}` → run-types default). The host splices the
// non-empty result in place of the base KindNumber / KindBigInt arm.
type BinaryEncoder interface {
	EmitToBinary(annotation *reflection.FormatAnnotation, vλl, ser string, ctx EmitContext) string
}

// BinaryDecoder is the read-side sibling of BinaryEncoder (the
// emitFromBinary override). Returns a JS EXPRESSION that reads the next
// value from the deserializer named `des` (advancing `des.index`); the
// host wraps it as `ret = <expr>`. Returns "" to fall back to the
// base-kind decode arm. MUST stay byte-symmetric with the same format's
// EmitToBinary — the round-trip is the only test of either half.
type BinaryDecoder interface {
	EmitFromBinary(annotation *reflection.FormatAnnotation, des string, ctx EmitContext) string
}

// BinarySizeHint reports a format's on-wire byte footprint to the
// compile-time buffer-size estimator. A zero value means "no hint — the
// estimator falls back to the base-kind width".
type BinarySizeHint struct {
	// Fixed is the exact wire width in bytes when the format packs to a
	// constant size (the numeric int8/16/32 ladder, the 64-bit bigint
	// path). Zero means "not fixed".
	Fixed int
}

// BinarySizer is an OPTIONAL Emitter capability mirroring BinaryEncoder: a
// format that packs into a known wire width reports it here so the
// compile-time estimator can seed the `dynamic` cold-start buffer from the
// SAME min/max logic EmitToBinary uses — single source of truth, can't
// drift. A format with no fixed width simply doesn't implement it (the
// estimator then uses the base-kind width).
type BinarySizer interface {
	BinarySize(annotation *reflection.FormatAnnotation) BinarySizeHint
}

var (
	registryMu sync.RWMutex
	registry   = map[registryKey]Emitter{}
)

type registryKey struct {
	kind reflection.ReflectionKind
	name string
}

// Register adds an Emitter to the global table. Intended for use from a
// per-format file's init(): `func init() { formats.Register(stringFormat{}) }`.
// Re-registering the same (kind, name) pair panics — drift between two
// emitters claiming the same format is always a bug, never a fallback
// case worth tolerating silently.
func Register(emitter Emitter) {
	key := registryKey{kind: emitter.Kind(), name: emitter.Name()}
	registryMu.Lock()
	defer registryMu.Unlock()
	if _, exists := registry[key]; exists {
		panic("formats.Register: duplicate emitter for " + key.name)
	}
	registry[key] = emitter
}

// Lookup returns the Emitter registered for (kind, name), or (nil,
// false) when no concrete emitter exists. A missing entry is NOT an
// error — host emitters fall back to the kind-default validation. This
// is the same forward-compat lever that lets Phase 0 ship with an
// empty registry and gracefully no-op for any FormatAnnotation it
// encounters.
func Lookup(kind reflection.ReflectionKind, name string) (Emitter, bool) {
	registryMu.RLock()
	defer registryMu.RUnlock()
	emitter, ok := registry[registryKey{kind: kind, name: name}]
	return emitter, ok
}

// LookupForRunType is a convenience wrapper around Lookup keyed off the
// RunType's Kind + FormatAnnotation.Name. Returns (nil, false) when rt
// has no FormatAnnotation set.
func LookupForRunType(rt *reflection.RunType) (Emitter, bool) {
	if rt == nil || rt.FormatAnnotation == nil {
		return nil, false
	}
	return Lookup(rt.Kind, rt.FormatAnnotation.Name)
}

// Registered returns every registered format Emitter, sorted by base Kind
// then canonical Name so enumeration is deterministic. Used by codegen
// (cmd/gen-type-formats emits the TS metadata table off this) and any
// tooling that needs the full format list; never on a hot path. The slice is
// a fresh snapshot — mutating it does not touch the registry.
func Registered() []Emitter {
	registryMu.RLock()
	defer registryMu.RUnlock()
	out := make([]Emitter, 0, len(registry))
	for _, emitter := range registry {
		out = append(out, emitter)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Kind() != out[j].Kind() {
			return out[i].Kind() < out[j].Kind()
		}
		return out[i].Name() < out[j].Name()
	})
	return out
}
