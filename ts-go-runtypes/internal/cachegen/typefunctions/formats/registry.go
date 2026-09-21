// Package formats is the Go-side registry of TypeFormat emitters: each format registers an Emitter from
// its own init(), and the host rt-fn emitters call Lookup at compile time to splice the per-format JS in.
// Kept in lock-step with the JS side by convention: every format ships a Go file under this subtree AND a
// JS format type under `@mionjs/run-types/formats`, under the same name.
package formats

import (
	"sort"
	"sync"

	"github.com/mionkit/mion/ts-go-runtypes/internal/jsengine"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// PatternGenFailure is the reason the resolver's enrichment pass recorded for
// a pattern it could not generate samples for.
type PatternGenFailure struct {
	// Reason is the engine's own explanation; "" means no failure recorded.
	Reason string
	// TimedOut marks a draw that ran out of the sidecar's match budget, retry included.
	// That verdict is the build host's load as much as the pattern, so the emitter raises the transient
	// FMT007 instead of FMT005 and the entry stays out of the disk cache.
	TimedOut bool
}

// EmitContext is the subset of typefns.EmitContext format emitters need, satisfied by it structurally so
// host emitters pass their own ctx through unchanged. Defined here, not in typefns, to avoid an import cycle.
type EmitContext interface {
	// AddPureFnDependency records the pure-fn id the emitted body will reach via `utl.getPureFn('<id>')`.
	AddPureFnDependency(id string)

	// UsePureFn is the single choke point for referencing a pure fn: it records the dependency, hoists the
	// deduped `const <alias> = utl.getPureFn('<id>')` prologue line and returns the alias the body calls.
	// Prefer it over the three-step AddPureFnDependency + HasContextItem + SetContextItem dance.
	UsePureFn(id string) string

	// HasContextItem reports whether a hoisted-declaration key is already set in the current factory's prologue.
	HasContextItem(key string) bool

	// SetContextItem hoists `value` (a JS statement) into the factory's prologue, emitted once per factory
	// however many emit sites reference it.
	SetContextItem(key, value string)

	// EmitDiagnostic records a build-time diagnostic against every call site referencing the current root
	// RunType, deduped per-code per-walk by the walker.
	EmitDiagnostic(code string, args ...string)

	// JSEngine returns the JS engine pattern checks run on (the sidecar under node/bun, the host under WASM),
	// the validation authority since samples exist to satisfy the JS runtime validator.
	// May be nil (tests, engine not configured): callers treat nil like an engine error and emit the missing-runtime diagnostic.
	JSEngine() jsengine.Engine

	// PatternSampleCount / PatternGenFailure mirror the resolver's mockSample auto-generation state, so the
	// pattern emitter can tell "generation disabled" (count 0) from "generation failed" for a sample-less pattern.
	PatternSampleCount() int
	PatternGenFailure(source, flags string) PatternGenFailure

	// NextLocalVar returns a fresh, collision-free local identifier, for hoisting a `const re_N = new RegExp(...)`
	// into the factory prologue (mirrors the template-literal emitter).
	NextLocalVar(prefix string) string
}

// Emitter is the per-format hook surface; `""` from any emit method means "fall back to the base-kind emit".
// Name + Kind are mandatory: they form the registry key.
type Emitter interface {
	// Name returns the canonical format name, matching FormatAnnotation.Name on RunTypes that dispatch here.
	Name() string

	// Kind returns the base ReflectionKind this format wraps; Lookup rejects entries whose Kind doesn't match
	// the host RunType.
	Kind() reflection.ReflectionKind

	// EmitValidateCheck returns a JS expression (no `return`) that is true when `vλl` satisfies annotation.Params.
	EmitValidateCheck(annotation *reflection.FormatAnnotation, vλl string, ctx EmitContext) string

	// EmitValidationErrorsCheck returns a JS statement pushing a TypeFormatError onto errorsArr for `vλl` at
	// `pathExpr` when the value fails this format.
	EmitValidationErrorsCheck(annotation *reflection.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx EmitContext) string
}

// ParamValidator is an OPTIONAL Emitter capability for formats with build-time param invariants.
// It runs AOT in place of the JS-side `validateParams` throw; the host emits one CodeFMTInvalidParams
// diagnostic per returned message.
type ParamValidator interface {
	ValidateParams(annotation *reflection.FormatAnnotation) []string
}

// FormatTransformer is an OPTIONAL Emitter capability for formats that rewrite the value in the
// formatTransform RT-fn; a format that doesn't implement it is treated as identity.
// Kept off the mandatory Emitter surface so adding a transform to one format forces no no-op method on the rest.
type FormatTransformer interface {
	// EmitFormatTransform returns a JS EXPRESSION transforming `vλl`, or "" for identity.
	// The format emitter wraps a non-empty result as `vλl = <expr>`.
	EmitFormatTransform(annotation *reflection.FormatAnnotation, vλl string, ctx EmitContext) string
}

// BinaryEncoder is an OPTIONAL Emitter capability for formats that pack into fewer bytes than the base-kind
// serializer (the numeric int8/16/32 ladder, the bigint 64-bit path), mirroring the emitToBinary override.
// Returns a JS STATEMENT writing `vλl` into the serializer `ser` and advancing `ser.index`, or "" to fall
// back to the host's base KindNumber / KindBigInt arm.
type BinaryEncoder interface {
	EmitToBinary(annotation *reflection.FormatAnnotation, vλl, ser string, ctx EmitContext) string
}

// BinaryDecoder is the read-side sibling of BinaryEncoder (the emitFromBinary override): a JS EXPRESSION
// reading the next value from `des` and advancing `des.index`, wrapped by the host as `ret = <expr>`, or "".
// MUST stay byte-symmetric with the same format's EmitToBinary; the round-trip is the only test of either half.
type BinaryDecoder interface {
	EmitFromBinary(annotation *reflection.FormatAnnotation, des string, ctx EmitContext) string
}

// BinarySizeHint reports a format's on-wire byte footprint; the zero value falls back to the base-kind width.
type BinarySizeHint struct {
	// Fixed is the exact wire width in bytes, zero when the format does not pack to a constant size.
	Fixed int
}

// BinarySizer is an OPTIONAL Emitter capability mirroring BinaryEncoder, so the compile-time estimator seeds
// the `dynamic` cold-start buffer from the SAME min/max logic EmitToBinary uses and the two cannot drift.
// A format with no fixed width doesn't implement it and the estimator uses the base-kind width.
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

// Register adds an Emitter to the global table, called from a per-format file's init().
// Re-registering the same (kind, name) pair panics: two emitters claiming one format is always a bug.
func Register(emitter Emitter) {
	key := registryKey{kind: emitter.Kind(), name: emitter.Name()}
	registryMu.Lock()
	defer registryMu.Unlock()
	if _, exists := registry[key]; exists {
		panic("formats.Register: duplicate emitter for " + key.name)
	}
	registry[key] = emitter
}

// Lookup returns the Emitter registered for (kind, name).
// A missing entry is NOT an error: host emitters fall back to the kind-default validation.
func Lookup(kind reflection.ReflectionKind, name string) (Emitter, bool) {
	registryMu.RLock()
	defer registryMu.RUnlock()
	emitter, ok := registry[registryKey{kind: kind, name: name}]
	return emitter, ok
}

// LookupForRunType wraps Lookup, keyed off the RunType's Kind + FormatAnnotation.Name.
func LookupForRunType(rt *reflection.RunType) (Emitter, bool) {
	if rt == nil || rt.FormatAnnotation == nil {
		return nil, false
	}
	return Lookup(rt.Kind, rt.FormatAnnotation.Name)
}

// Registered returns a fresh snapshot of every registered Emitter, sorted by Kind then Name so enumeration
// is deterministic; cmd/gen-type-formats emits the TS metadata table off it. Never on a hot path.
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
