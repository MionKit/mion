package typefunctions

import (
	"strconv"

	"github.com/mionkit/ts-runtypes/internal/cachegen/operations"
	"github.com/mionkit/ts-runtypes/internal/constants"
	"github.com/mionkit/ts-runtypes/internal/jsengine"
	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// ArgSpec describes one parameter of the emitted rt function. Mirrors
// the `args[key] = name` + `defaultParamValues[key] = default`
// pairing (rtFnCompiler.ts:71). Key is the conceptual slot ("vλl",
// "pλth", "εrr"); Name is the JS identifier in the emitted signature;
// Default is the JS-source default expression (empty for no default).
type ArgSpec struct {
	Key     string
	Name    string
	Default string
}

// Emitter is the per-fn implementation surface. One Emitter per rt
// function id (validate, validationErrors, prepareForJson, …). All fn-specific
// logic lives behind this interface; the Walker (walker.go) drives
// traversal without knowing which fn is being emitted.
//
// Adding a new fn = one new file with one Emitter struct + one giant
// `switch rt.Kind` inside Emit. Zero edits to the Walker.
type Emitter interface {
	// Args returns the inner function's parameter list. The first
	// entry's Name is the base value accessor — the Walker uses it as
	// the starting Vλl for the root frame. validate:
	// `[{Key:"vλl", Name:"v", Default:""}]`. validationErrors will be:
	// `[{vλl,v,""}, {pλth,pth,"[]"}, {εrr,er,"[]"}]`.
	Args() []ArgSpec

	// Supports reports whether Emit will produce valid code for rt
	// at the top level (renderer pre-flight check). Returning false
	// causes the renderer to skip emitting a factory for rt instead
	// of letting Emit panic. Recursive calls from inside Emit are
	// NOT gated by Supports — child kinds the dispatch doesn't
	// handle should panic loudly so the bug surfaces at compile time.
	Supports(rt *reflection.RunType) bool

	// IsRTInlined reports whether the walker should inline rt's
	// emitted code at the call site (true) or emit a dependency call
	// to a precompiled factory (false). The walker enforces an
	// independent depth gate (only dependency-call at depth > 1, so
	// the root always inlines); this predicate answers the intrinsic
	// "is rt cheap enough to inline?" question.
	//
	// The reference run-types/src/lib/baseRunTypes.ts:52 defines this
	// once on BaseRunType — shared across every rt fn. Our equivalent
	// is `DefaultIsRTInlined` (inlining.go); emitters that want
	// the reference behaviour delegate to it. Emitters that need different
	// rules (the user's stated reason for surfacing this on the
	// Emitter interface) override the body. Per-fn override is
	// CAPABILITY, not policy — share unless you have a concrete
	// reason to diverge.
	IsRTInlined(ctx *InlineContext) bool

	// Emit dispatches the giant per-kind switch. The Walker calls
	// this once per node in the RunType graph. EmitContext exposes
	// the current value accessor + the hooks the emitter needs
	// (recursion into children, context-item registration).
	// expectedCType is the parent frame's required CodeType — most
	// emitters can ignore it; reconciliation happens in the Walker.
	Emit(rt *reflection.RunType, ctx *EmitContext, expectedCType CodeType) RTCode

	// EmitDependencyCall returns the JS expression that invokes a
	// pre-rendered child RT entry. Used by the Walker when the
	// dispatch site decides a child is non-inline-cheap and the
	// stack is past depth 1 (mirrors
	// BaseFnCompiler.callDependency at rtFnCompiler.ts:326). The
	// emitter also registers a context-item declaration of the form
	// `const <hash> = utl.getRT('<hash>')` so the inner factory's
	// closure resolves the child via the rtUtils singleton.
	//
	// Self-recursive calls (childID == own hash) emit `<hash>(args)`;
	// cross-function calls emit `<hash>.fn(args)` — same split as
	// the `isSelf` branch.
	EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string

	// Finalize normalises the raw concatenated body produced by the
	// walk, detects noop bodies (empty / tautology / "just return
	// vλl"), and returns the final body string + an isNoop flag the
	// renderer uses to skip noop factories entirely.
	//
	//   validate: empty/"true"/"return true" → ("return true", true)
	//   validationErrors: empty → ("return εrr", true)
	//   prepareForJson et al: empty → ("return v", true)
	Finalize(rawCode string) (code string, isNoop bool)

	// ReturnName is the JS identifier the walker appends after a
	// statement-shaped body via `… return <ReturnName>`. For validate /
	// prepareForJson / format / mock this is the first arg's Name
	// (`v`). For validationErrors the accumulator is the third arg (`er`),
	// so the emitter overrides this method to return `"er"` instead.
	ReturnName() string
}

// EmitContext is the narrow surface Emit implementations see. They
// never touch the Walker directly — keeps the interface stable as the
// walker's internals evolve and prevents emitters from poking at
// traversal state (Stack mutation, finalize hooks, etc.).
//
// Vλl is a snapshot taken when Emit is called. CompileChild can
// recurse into nested kinds; by the time it returns the walker has
// popped back to this frame, so Vλl stays correct for the duration of
// the calling Emit body.
type EmitContext struct {
	Vλl    string
	walker *Walker
}

// CompileChild recurses into rt as a child of the current frame.
// Used by collection emitters (object literal, union, …) that need
// to compose child code into their own snippet. v1's atomic-only
// scope never reaches this path; the method is here so the first
// collection emitter that lands can call into it without restructuring.
func (ctx *EmitContext) CompileChild(rt *reflection.RunType, expectedCType CodeType) RTCode {
	return ctx.walker.compileNode(rt, expectedCType)
}

// AsExpression converts a statement / return-block RTCode into a call
// expression by hoisting the body into a factory-local context function
// (tier 3 of the dispatch ladder — see wrapAsCtxFn). Pass-through for
// CodeE and empty bodies. Used by emitters that must AND-chain onto a
// base whose kind emits a statement body, e.g. negations over array /
// tuple / object bases.
func (ctx *EmitContext) AsExpression(code RTCode) RTCode {
	if code.Type == CodeE || code.Code == "" {
		return code
	}
	return ctx.walker.wrapAsCtxFn(code)
}

// IsRoot reports whether the current Emit call is at the RT
// function's root (the outermost frame). Mirrors
// `comp.getNestLevel(runType) === 0`. Used by emitters whose output
// shape depends on root-vs-nested context — e.g. stringifyJson's
// atomic number/null emits return `String(v)` at root (so the RT
// fn returns a JSON-parseable string) but bare `v` at non-root
// (the parent concatenates and the JS `+` coerces).
func (ctx *EmitContext) IsRoot() bool {
	return ctx.walker != nil && len(ctx.walker.Stack) == 1
}

// ParentIsUnion reports whether the immediate parent frame is a union.
// compileNode resolves refs before pushStack (walker.go), so the parent
// frame's RT is the real resolved type, never a ref placeholder. Used by
// emitObjectValidate to drop its own `typeof === 'object'` guard when it
// sits as a direct union member — emitUnionValidate already wraps the whole
// object OR-chain in one shared guard, so the per-arm repeat is dead weight.
func (ctx *EmitContext) ParentIsUnion() bool {
	if ctx.walker == nil || len(ctx.walker.Stack) < 2 {
		return false
	}
	parent := ctx.walker.Stack[len(ctx.walker.Stack)-2].RT
	return parent != nil && parent.Kind == reflection.KindUnion
}

// HasVariantOption reports whether the current walker is rendering
// the variant identified by `name` (e.g. "noLiterals",
// "noIsArrayCheck"). Always false for plain walkers. Root-scoped:
// child compiles dispatch through dep calls to plain factories, so
// only the variant root's own emit sees `true` — nested same-kind
// nodes inside a variant render with the option turned OFF.
func (ctx *EmitContext) HasVariantOption(name string) bool {
	if ctx.walker == nil || ctx.walker.VariantOptions == nil {
		return false
	}
	return ctx.walker.VariantOptions[name]
}

// VariantOptionNames returns the ValidateOptions names in force on the current
// walker, in ValidateOptions DECLARATION order — the order Canonical /
// FnHashFor expect. Empty for a plain walker. Walker-scoped exactly like
// HasVariantOption: it is the option set in force over everything this walker
// inlines, which is what a cross-family reference must match (see
// CrossFamilyVariantHash).
func (ctx *EmitContext) VariantOptionNames() []string {
	if ctx.walker == nil || len(ctx.walker.VariantOptions) == 0 {
		return nil
	}
	var names []string
	for _, opt := range constants.ValidateOptions {
		if ctx.walker.VariantOptions[opt.Name] {
			names = append(names, opt.Name)
		}
	}
	return names
}

// CrossFamilyVariantHash returns the fnHash another family's operation is keyed
// by UNDER THIS WALKER'S VARIANT — the hash a cross-family reference must name
// so the entry it resolves was compiled with the same options as the body
// referring to it. Reduces to PlainHash on a plain walker.
//
// rejectCircularRefs is deliberately NOT folded in. The armed guard is emitted
// once at the variant ROOT, so at any node the walker inlines the armed fork
// behaves exactly like the plain one — while the armed ENTRY for that node's own
// type would carry a guard of its own. Naming the plain hash is what keeps the
// two sides in step.
func (ctx *EmitContext) CrossFamilyVariantHash(opName string) string {
	return operations.VariantHash(opName, ctx.VariantOptionNames())
}

// ChecksUnknownKeys reports whether the family being rendered folds the
// unknown-key check into its own walk (the fused validateStrict /
// validationErrorsStrict families behind `{checkUnknowns: true}`). The shared
// object-ish emit arms call this to decide whether to splice the check.
//
// UNLIKE HasVariantOption this is NOT root-scoped: the verdict rides the
// emitter identity, and the renderer renders every child entry of a family with
// that same emitter, so the root and the whole transitive subtree agree. That
// is the whole reason the fused validators are families rather than variants —
// see validate_strict.go.
func (ctx *EmitContext) ChecksUnknownKeys() bool {
	if ctx.walker == nil {
		return false
	}
	_, ok := ctx.walker.Emitter.(StrictUnknownKeys)
	return ok
}

// NumberMode returns the numberMode (validateOptions.numberMode) the current
// variant root is rendering — "typeof" / "notNaN" / "isFinite" (default).
// Root-scoped like HasVariantOption: nested same-kind nodes render with the
// default check and dispatch to plain factories.
func (ctx *EmitContext) NumberMode() string {
	return constants.NumberModeFromOptions(ctx.HasVariantOption)
}

// ResolveRef dereferences a KindRef sentinel via the walker's ref
// table. Returns the input unchanged when it isn't a ref; nil when
// the ref points at a missing entry. Useful for emit decisions that
// need to peek at the resolved kind (e.g. PropertySignature checking
// whether its wrapped child is a function — which would skip the
// property from the parent's AND chain).
func (ctx *EmitContext) ResolveRef(rt *reflection.RunType) *reflection.RunType {
	return ctx.walker.resolveRef(rt)
}

// NextLocalVar allocates and returns a fresh local variable name
// scoped to the current emitter instance. Mirrors
// RTFnCompiler.getLocalVarName (rtFnCompiler.ts:236) — each call
// hands out a unique name so child accessors and result locals
// never collide across nested frames. Prefix convention: "i" for
// loop counters, "res" for child-result locals.
func (ctx *EmitContext) NextLocalVar(prefix string) string {
	return ctx.walker.nextLocalVar(prefix)
}

// SetChildAccessor records the value-accessor expression that the
// next pushStack will use as the child's Vλl. Used by collection
// emitters (Array, Object, Tuple, …) that need to point a child
// frame at a specific subscript or property expression instead of
// the parent's own Vλl. The accessor stays attached to the current
// (parent) frame so getStackVλl reads it at the next pushStack and
// then the parent emit can move on to its next child by calling
// SetChildAccessor again.
func (ctx *EmitContext) SetChildAccessor(accessor string) {
	ctx.walker.setChildAccessor(accessor)
}

// SuppressInlineReserve reports whether the current frame should emit raw inline
// scalar writes WITHOUT their own `Ser.ensureCapacity?.(n)` reserve — set by a
// fixed-width array that reserves its whole element block once before the loop.
func (ctx *EmitContext) SuppressInlineReserve() bool {
	return ctx.walker != nil && ctx.walker.suppressInlineReserve
}

// SetSuppressInlineReserve toggles the raw-inline-write mode (see
// SuppressInlineReserve). Callers must restore the prior value after the scoped
// CompileChild so siblings/parents are unaffected.
func (ctx *EmitContext) SetSuppressInlineReserve(suppress bool) {
	if ctx.walker != nil {
		ctx.walker.suppressInlineReserve = suppress
	}
}

// SetChildPathLiteral records the path-literal contribution the next
// pushStack frame inherits. Symmetric with SetChildAccessor — collection
// emitters call it before each CompileChild so the child frame's
// PathLiteral reflects the property name, tuple index, or loop counter
// the child sits at relative to the parent. Used by validationErrors-style
// emitters to build access-path arrays for error reporting; validate
// ignores it.
func (ctx *EmitContext) SetChildPathLiteral(literal string) {
	ctx.walker.setChildPathLiteral(literal)
}

// AccessPathLiteral returns a JS array-literal expression listing every
// non-empty PathLiteral on the current stack, with `extra` appended as a
// trailing segment when non-empty. Empty path → empty string (caller
// omits the argument). Used by validationErrors emitters when calling
// pf_newRunTypeErr to embed the static path segments at error sites.
//
// Mirrors `getAccessPath` + `getAccessPathLiteral`
// (rtFnCompiler.ts:677-681) — same join, same `extra` semantics.
func (ctx *EmitContext) AccessPathLiteral(extra string) string {
	segments := ctx.walker.accessPath()
	if extra != "" {
		segments = append(segments, extra)
	}
	if len(segments) == 0 {
		return ""
	}
	return "[" + joinArgs(segments) + "]"
}

// AccessPathLength returns the number of static path segments the
// current stack contributes (with `extra` counted when non-empty).
// Used by validationErrors EmitDependencyCall to size the `pth.splice(-N)`
// pop that unwinds the path after a dependency-call returns. Mirrors
// `getAccessPathLength` (rtFnCompiler.ts implicit via array
// length on getAccessPath result).
func (ctx *EmitContext) AccessPathLength(extra string) int {
	n := len(ctx.walker.accessPath())
	if extra != "" {
		n++
	}
	return n
}

// SetContextItem registers a closure-prologue `const xyz = …;`
// declaration. WrapClosure emits these before the inner function so
// they're evaluated once per factory call, not on every validator
// invocation. Mirrors rtFnCompiler.ts:243.
func (ctx *EmitContext) SetContextItem(key, value string) {
	ctx.walker.ContextItems.set(key, value)
}

// HasContextItem mirrors rtFnCompiler.ts:253.
func (ctx *EmitContext) HasContextItem(key string) bool {
	return ctx.walker.ContextItems.has(key)
}

// GetContextItem mirrors rtFnCompiler.ts:248.
func (ctx *EmitContext) GetContextItem(key string) (string, bool) {
	return ctx.walker.ContextItems.get(key)
}

// registerRTLookup ensures the closure-prologue declaration
// `const <childID> = utl.getRT('<childID>')` exists so the inner factory
// resolves the child RT via the rtUtils singleton. Idempotent — the ordered
// context-item set dedups repeat registrations.
func (ctx *EmitContext) registerRTLookup(childID string) {
	if !ctx.HasContextItem(childID) {
		ctx.SetContextItem(childID, "const "+childID+" = utl.getRT("+quoteJS(childID)+")")
	}
	// Capture cross-family lookups as tracked dependency edges. A lookup
	// is cross-family when childID's tag prefix differs from this walker's
	// own InnerPrefix (e.g. a prepareForJson/toBinary/validationErrors body
	// resolving `val_<member>`). recordCrossFamilyDep applies that prefix
	// gate, so same-family lookups (also funnelled through here by
	// emitDepCall) stay in RTDependencies and only genuine cross-family
	// references are captured. Additive: nothing consumes CrossFamilyDeps
	// in emission today.
	if ctx.walker != nil {
		ctx.walker.recordCrossFamilyDep(childID)
	}
}

// emitDepCall builds the JS expression that invokes child childID's
// precompiled factory with argsExpr. Self-recursive calls (childID is the
// current fn's own RTFnHash) call the inner function declaration directly;
// cross-function calls go through `<childID>.fn(args)` and register the getRT
// lookup. A non-empty assignTo wraps the result as `<assignTo> = <call>` (the
// mutate-in-place families); empty assignTo returns the bare call expression.
// Mirrors BaseFnCompiler.callDependency.
func (ctx *EmitContext) emitDepCall(childID, argsExpr, assignTo string) string {
	var call string
	if ctx.walker != nil && childID == ctx.walker.RTFnHash {
		call = ctx.walker.FnName + "(" + argsExpr + ")"
	} else {
		ctx.registerRTLookup(childID)
		call = childID + ".fn(" + argsExpr + ")"
	}
	if assignTo != "" {
		return assignTo + " = " + call
	}
	return call
}

// emitPathTrackedDepCall wraps a dependency call in the
// `pth.push(...) , <call> , pth.splice(-N)` envelope when static path
// segments are pending, so the child's errors carry the right
// access-path prefix. Shared by the validationErrors and
// unknownKeyErrors families; returned as a comma-expression so the
// caller can drop it into an expression slot (a parent's CodeE arm) or
// a statement slot (CodeS) without restructuring. Mirrors the
// BaseFnCompiler.callDependency branch at rtFnCompiler.ts:388-397.
func (ctx *EmitContext) emitPathTrackedDepCall(childID string) string {
	pthArg := ctx.ArgName("pλth")
	errArg := ctx.ArgName("εrr")
	callCode := ctx.emitDepCall(childID, ctx.Vλl+","+pthArg+","+errArg, "")
	pathLit := ctx.AccessPathLiteral("")
	pathLen := ctx.AccessPathLength("")
	if pathLen == 0 {
		return callCode
	}
	pushArgs := pathLit[1 : len(pathLit)-1] // strip `[` … `]` for push(...args)
	return "(" + pthArg + ".push(" + pushArgs + ")," + callCode + "," + pthArg + ".splice(-" + strconv.Itoa(pathLen) + "))"
}

// CreateFnInContext is the EmitContext face of Walker.createFnInContext for
// emitters that hand-build statement blocks in expression position (the old
// hand-rolled IIFE sites): registers the block as a context function created
// once per factory materialization and returns the `ctxFn<N>(<args>)` call
// expression. See Walker.createFnInContext for the params/args contract.
func (ctx *EmitContext) CreateFnInContext(body string, codeType CodeType, params, args []string) string {
	return ctx.walker.createFnInContext(body, codeType, params, args)
}

// CtxFnParams derives a context function's parameter list for a block whose
// body was emitted against accessor — the emitter's Args plus any allocated
// loop counters free in the accessor (see Walker.ctxFnParamsFor).
func (ctx *EmitContext) CtxFnParams(accessor string) []string {
	return ctx.walker.ctxFnParamsFor(accessor)
}

// AddPureFnDependency records that the emitted body reaches a pure-fn
// at `utl.getPureFn(<namespace>, <fnName>)`. The walker forwards each
// dependency to the resolver's integrity check at end of compilation —
// see internal/cachegen/typefunctions/walker.go's AddPureFnDependency for the
// recording contract. Used by validationErrors to register `pf_newRunTypeErr`
// before emitting calls into it.
func (ctx *EmitContext) AddPureFnDependency(namespace, fnName, filePath string) {
	ctx.walker.AddPureFnDependency(namespace, fnName, filePath)
}

// UsePureFn is the ONE choke point for referencing a package-owned pure fn
// from an emitted body. It does all three steps at once: (1) records the
// dependency (so it rides the entry's SoftDeps / PFE9012 check), (2) hoists
// the deduped `const <alias> = utl.getPureFn('<ns>::<fnName>')` prologue line,
// and (3) returns the alias the body calls. Every emitter reference to a pure
// fn must go through here — a raw `utl.getPureFn` string anywhere else is a
// review smell (a missed AddPureFnDependency becomes a missing import once
// delivery is build-owned, so recording can no longer be skipped). filePath is
// the canonical source path the pure fn's body is registered under.
//
// The alias + prologue bytes are byte-identical to what the pre-migration
// call sites emitted (see pureFnAliasFor) — this is a refactor of the
// recording convention, never a change to emitted body bytes.
func (ctx *EmitContext) UsePureFn(namespace, fnName, filePath string) string {
	ctx.AddPureFnDependency(namespace, fnName, filePath)
	alias := pureFnAliasFor(namespace, fnName)
	if !ctx.HasContextItem(alias) {
		ctx.SetContextItem(alias, "const "+alias+" = utl.getPureFn('"+namespace+"::"+fnName+"')")
	}
	return alias
}

// DiagSlot identifies a RT-throw / silent-skip site by its semantic
// shape rather than its per-family code. Emitters expose a DiagCodeFor
// map keyed by these slots so that emit code shared across multiple
// emitters (e.g. json_prepare_safe.go shared by the validate / validationErrors
// drop-slot machinery) emits diagnostics under the correct per-family
// prefix.
type DiagSlot string

const (
	// Root-position throw slots — factory throws on call.
	SlotNeverRoot           DiagSlot = "never-root"
	SlotNonSerializableRoot DiagSlot = "ns-root"
	SlotFunctionRoot        DiagSlot = "fn-root"
	SlotArrayElement        DiagSlot = "array-element"
	SlotNonSerializableElem DiagSlot = "ns-elem"

	// Child-position silent-skip slots — factory degrades.
	SlotFunctionPropDropped DiagSlot = "fn-prop-dropped"
	SlotMethodDropped       DiagSlot = "method-dropped"
	SlotStaticDropped       DiagSlot = "static-dropped"
	SlotSymbolKeyedDropped  DiagSlot = "symbol-keyed-dropped"
	// SlotNonSerializablePropDropped — a property whose VALUE is directly
	// DataOnly-stripped to `never` (symbol / Promise / never / non-serializable
	// built-in; function-valued props use SlotFunctionPropDropped) was dropped
	// so `{a: symbol}` serializes/validates as `{}`, matching
	// `DataOnly<{a: symbol}>` = `{}`. Distinct from SlotSymbolKeyedDropped (a
	// symbol KEY) and the *Root error slots (a propagating position). Emitted by
	// strippedPropertyDrop, shared by validate and the six serialization families.
	SlotNonSerializablePropDropped DiagSlot = "non-serializable-prop-dropped"
	// SlotUnionMemberDropped — a union member DataOnly strips to `never`
	// (symbol / function / Promise / non-serializable built-in) was dropped
	// so the union projects to its data members (DataOnly<Date | symbol> =
	// Date). Emitted from dataOnlyUnionMembers, shared by validate and the
	// six flat-union serialization families.
	SlotUnionMemberDropped DiagSlot = "union-member-dropped"

	// Advisory slots.
	SlotRootAnyUnknown DiagSlot = "root-any-unknown"
)

// VariantPropagator is the optional capability an emitter implements when its
// compile-time option variant changes the body of EVERY node in the subtree,
// not just the root's.
//
// A plain variant is ROOT-SCOPED: the walker keeps the family's plain inner
// prefix, so a child that goes external (a NAMED nested type, per
// DefaultIsRTInlined) is dep-called at its PLAIN entry and the option is lost
// there. That is right for an option describing the root's call shape
// (validate's noIsArrayCheck drops a guard the caller already ran) and wrong
// for one describing the VALUE — hasUnknownKeys's runsAfterValidation says the
// whole value passed validation, which is as true of `v.address` as of `v`.
//
// A propagating variant gets the family treatment: the walker's inner prefix
// becomes the variant's own fnHash, so children render (and are dep-called) as
// variant entries; the collector carries the option set down the child
// worklist; entries disk-cache under `<typeID>/<tag><suffix>.json`; and a user
// override on the type still redirects, exactly as it does for the plain entry.
type VariantPropagator interface {
	PropagatesVariant(options []string) bool
}

// propagatesVariant reports whether this (emitter, option set) renders the
// whole subtree under the variant rather than only the root.
func propagatesVariant(emitter Emitter, options []string) bool {
	if len(options) == 0 {
		return false
	}
	propagator, ok := emitter.(VariantPropagator)
	return ok && propagator.PropagatesVariant(options)
}

// DiagCodeProvider is the optional capability emitters implement when
// they want per-family diagnostic codes attached to their child-position
// silent-skip sites. Returning "" for a slot disables emission at that
// slot.
type DiagCodeProvider interface {
	DiagCodeFor(slot DiagSlot) string
}

// LeafDiagCodeProvider is the optional capability emitters implement when
// they want per-family diagnostic codes attached to unsupported root
// leaves. The walker hands the leaf RunType to this method when
// finalising an alwaysThrow factory; the emitter returns the
// per-family code (PJ001 for Never under prepareForJson, etc.).
// Returning "" preserves the silent-skip path (no factory emitted) —
// used as a safety net for unknown future kinds without a registered
// code (the unified throw model).
type LeafDiagCodeProvider interface {
	DiagCodeForLeaf(leaf *reflection.RunType) string
}

// DiagCodeFor returns the per-family diag code the current emitter
// registered for slot, or "" when the emitter doesn't provide one.
func (ctx *EmitContext) DiagCodeFor(slot DiagSlot) string {
	if provider, ok := ctx.walker.Emitter.(DiagCodeProvider); ok {
		return provider.DiagCodeFor(slot)
	}
	return ""
}

// DiagCodeForLeaf returns the per-family code the current emitter
// associates with the given unsupported leaf kind, or "" when the
// emitter doesn't register one.
func (ctx *EmitContext) DiagCodeForLeaf(leaf *reflection.RunType) string {
	if provider, ok := ctx.walker.Emitter.(LeafDiagCodeProvider); ok {
		return provider.DiagCodeForLeaf(leaf)
	}
	return ""
}

// RTThrowDiag combines a RTThrow (factory-body runtime throw) with an
// EmitDiagnostic call. The runtime throw still fires when the user calls
// createXxx<T>(); the diagnostic surfaces the same problem at build
// time so the user can fix it before the factory is materialised.
// Use this in place of bare RTThrow for any throw whose user-facing
// cause is a fixable type-level problem (Never at root, function in
// array, etc.) — i.e. all of them. `inlineMsg` is the legacy runtime
// throw message embedded in the JS factory body; the build-time
// Diagnostic carries only the code+args and resolves text via the
// JS-side catalog.
func (ctx *EmitContext) RTThrowDiag(code string, inlineMsg string, args ...string) RTCode {
	ctx.walker.EmitDiagnostic(code, args...)
	return RTThrow(inlineMsg)
}

// RTThrowDiagSlot is the slot-keyed sibling of RTThrowDiag. Used by
// emit code shared across multiple emitters — the slot resolves to the
// active emitter's per-family code via DiagCodeFor. Falls back to bare
// RTThrow (no diagnostic) when the emitter hasn't registered a code
// for the slot.
func (ctx *EmitContext) RTThrowDiagSlot(slot DiagSlot, inlineMsg string, args ...string) RTCode {
	code := ctx.DiagCodeFor(slot)
	if code == "" {
		return RTThrow(inlineMsg)
	}
	return ctx.RTThrowDiag(code, inlineMsg, args...)
}

// EmitDiagnosticSlot is the slot-keyed sibling of EmitDiagnostic for
// silent-skip sites. Resolves the code via the active emitter's
// DiagCodeFor; no-op when the slot isn't registered.
func (ctx *EmitContext) EmitDiagnosticSlot(slot DiagSlot, args ...string) {
	code := ctx.DiagCodeFor(slot)
	if code == "" {
		return
	}
	ctx.walker.EmitDiagnostic(code, args...)
}

// EmitDiagnostic surfaces a build-time diagnostic without changing the
// emitted runtime behavior. Use this at silent-skip sites — places
// where the emitter drops a member (function-typed property, method,
// static field, …) and the user has no signal in their build output
// that the slot is missing.
func (ctx *EmitContext) EmitDiagnostic(code string, args ...string) {
	ctx.walker.EmitDiagnostic(code, args...)
}

// JSEngine returns the JS engine format-pattern checks run on — see
// formats.EmitContext. Nil when no engine is configured (the format
// emitters then fail pattern checks closed with FMT004).
func (ctx *EmitContext) JSEngine() jsengine.Engine {
	if ctx.walker == nil {
		return nil
	}
	return ctx.walker.JSEngine
}

// PatternSampleCount / PatternGenFailure mirror the resolver's pattern
// mockSample auto-generation state — see formats.EmitContext.
func (ctx *EmitContext) PatternSampleCount() int {
	if ctx.walker == nil {
		return 0
	}
	return ctx.walker.PatternSampleCount
}

func (ctx *EmitContext) PatternGenFailure(source, flags string) string {
	if ctx.walker == nil || ctx.walker.PatternGenFailures == nil {
		return ""
	}
	return ctx.walker.PatternGenFailures[source+"\x00"+flags]
}

// ArgName looks up the JS identifier the inner function uses for a
// conceptual arg slot ("vλl", "pλth", "εrr") via the emitter's Args
// list. Returns "" when the slot isn't declared on this emitter — eg
// validate has no "pλth" / "εrr", so callers gating on those slots
// short-circuit cleanly without panicking. Mirrors
// `this.args.<key>` access (rtFnCompiler.ts:671).
func (ctx *EmitContext) ArgName(key string) string {
	for _, arg := range ctx.walker.Emitter.Args() {
		if arg.Key == key {
			return arg.Name
		}
	}
	return ""
}
