// Package typefns ports the RTFnCompiler to Go so validator functions
// (validate, validationErrors, prepareForJson, …) can be precompiled at build
// time and shipped as static JS source instead of being assembled at
// runtime via `new Function`.
//
// Currently implements `validate` for every node category (atomic,
// array, tuple, union, intersection-collapsed, object literal, class,
// property, method, index signature, call signature, function, template
// literal, Map/Set/Promise/Awaited). The walker + dispatcher in
// walker.go and the per-fn switch in istype.go are the two seams; the
// switch dispatches one kind at a time, falling through to a
// `CodeNS` sentinel for any kind without an arm so the renderer can
// silently skip that entry's factory (see CodeNS below).
//
// Mirrors (ref:):
//   - packages/run-types/src/lib/rtFnCompiler.ts (BaseFnCompiler)
//   - packages/run-types/src/lib/createRTFunction.ts (closure assembly)
//   - packages/run-types/src/rtCompilers/json/stringifyJson.ts (the
//     "single big switch over ReflectionKind" dispatch pattern this
//     package uses for `EmitValidate`).
package typefunctions

// CodeType matches the CodeTypes enum
// (ref: run-types/src/constants.functions.ts:11). A RTCode snippet must
// declare which of the four shapes its source text takes so the
// parent frame knows whether it can be interpolated as-is, wrapped
// in a self-invoking function, terminated with a fullstop, or
// (for CodeNS) treated as a signal that the whole top-level entry
// should be skipped.
type CodeType string

const (
	// CodeE — a single JS expression. Concatenable with operators like
	// `&&`, `||`, `+`. The most common shape for atomic checks.
	CodeE CodeType = "E"
	// CodeS — one or more JS statements. Concatenable with `;`.
	CodeS CodeType = "S"
	// CodeRB — a JS block that returns a value via an explicit
	// `return …;`. Must be wrapped in a self-invoking function before it
	// can be embedded inside an expression.
	CodeRB CodeType = "RB"
	// CodeNS — sentinel: NOT actual JS code. Means "the kind reached
	// here has no emit implementation; the walker / parent emits must
	// propagate this upward so the renderer skips the factory entirely."
	//
	// Distinct from `Code == ""` carrying CodeE / CodeS / CodeRB, which
	// means "skip this slot in the parent" (e.g. a function-typed
	// property dropped from an object's AND chain — the parent's
	// validator is still emittable, this single child just contributes
	// nothing). CodeNS escalates: the parent IS unvalidatable too,
	// and so on up to the root.
	//
	// The renderer's contract: when a top-level Walker.Compile()
	// returns isUnsupported=true, no factory is emitted for that
	// RunType — the runtime cache miss is caught by createValidateFn's
	// hasRunType-but-no-rt fallback and degrades to `() => true`,
	// which mirrors the "no validator available" stance.
	CodeNS CodeType = "NS"
)

// RTCode is one emitter's output. `Code == ""` means "no code emitted"
// (the reference uses `undefined` for the same state — both halves treat
// empty snippets as a noop the orchestrator can drop).
//
// ErrorMessage rides along the CodeNS sentinel to flip the renderer's
// "silent skip" into "emit a throwing factory". The per-runtype
// throws inside emitPrepareForJson / emitRestoreFromJson (never,
// Promise, NonSerializableRunType, the `Arrays can not have non
// serializable types` check in array.ts) propagate as JS exceptions out
// of createRTFunction; our equivalent lands the message here, the
// walker latches it onto Walker.ThrowMessage on the first encounter,
// and module.go emits a `function(utl){ throw new Error(<msg>) }`
// factory so the throw surfaces when the entry is first resolved (its
// createX factory or getRTFunction call), matching the "throws at RT
// compile" semantic.
type RTCode struct {
	Code         string
	Type         CodeType
	ErrorMessage string
}

// RTThrow returns a CodeNS RTCode carrying a message. Renderer emits
// a throw-factory whose body raises `new Error(message)` when invoked,
// so the throw surfaces when the entry is first resolved (a `createX<T>()`
// factory or `getRTFunction<'…'>()`, which triggers the entry's first getRT
// lookup → materialize → createRTFn(utl) → throw). Mirrors the per-runtype throws in
// nodes/atomic/never.ts, nodes/native/promise.ts,
// nodes/native/nonSerializable.ts, and the explicit
// checkNonSkipTypes() in nodes/member/array.ts.
func RTThrow(message string) RTCode {
	return RTCode{Code: "", Type: CodeNS, ErrorMessage: message}
}
