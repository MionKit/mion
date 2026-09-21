package typefunctions

import (
	"strconv"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/operations"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/jsengine"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// ArgSpec describes one parameter of the emitted rt function: Key is the conceptual slot ("vλl", "pλth",
// "εrr"), Name the JS identifier in the emitted signature, Default the JS-source default expression.
type ArgSpec struct {
	Key     string
	Name    string
	Default string
}

// Emitter is the per-fn implementation surface, one per rt function id. All fn-specific logic lives behind
// this interface, so the Walker drives traversal without knowing which fn is being emitted: a new fn is one
// new file with one Emitter struct and one `switch rt.Kind` inside Emit, and zero Walker edits.
type Emitter interface {
	// Args returns the inner function's parameter list. The first entry's Name is
	// the base value accessor, which the Walker uses as the root frame's Vλl.
	Args() []ArgSpec

	// Supports reports whether Emit will produce valid code for rt at the top
	// level, so the renderer can skip it instead of letting Emit panic. Recursive
	// calls from inside Emit are NOT gated: a child kind the dispatch doesn't
	// handle should panic loudly so the bug surfaces at compile time.
	Supports(rt *reflection.RunType) bool

	// IsRTInlined answers the intrinsic "is rt cheap enough to inline?" question.
	// The walker adds its own depth gate (dependency calls only past depth 1, so
	// the root always inlines).
	//
	// `DefaultIsRTInlined` (inlining.go) is the shared answer every emitter
	// delegates to unless it needs different rules. Per-fn override is CAPABILITY,
	// not policy: share unless you have a concrete reason to diverge.
	IsRTInlined(ctx *InlineContext) bool

	// Emit dispatches the giant per-kind switch, once per node in the RunType
	// graph. expectedCType is the parent frame's required CodeType, which most
	// emitters can ignore: the Walker reconciles.
	Emit(rt *reflection.RunType, ctx *EmitContext, expectedCType CodeType) RTCode

	// EmitDependencyCall returns the JS expression that invokes a pre-rendered
	// child RT entry, used when the dispatch site finds a child non-inline-cheap
	// past depth 1. The emitter also registers a `const <hash> = utl.getRT('<hash>')`
	// context item so the inner factory's closure resolves the child.
	//
	// A self-recursive call (childID == own hash) emits `<hash>(args)`, a
	// cross-function one `<hash>.fn(args)`.
	EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string

	// Finalize normalises the raw concatenated body, detects a noop body (empty /
	// tautology / "just return vλl"), and returns the final body plus the isNoop
	// flag the renderer skips noop factories on.
	//
	//   validate: empty/"true"/"return true" → ("return true", true)
	//   validationErrors: empty → ("return εrr", true)
	//   prepareForJson et al: empty → ("return v", true)
	Finalize(rawCode string) (code string, isNoop bool)

	// ReturnName is the identifier the walker appends as `… return <ReturnName>`
	// after a statement-shaped body: the first arg's Name for most families, and
	// `er` for validationErrors, whose accumulator is the third arg.
	ReturnName() string
}

// EmitContext is the narrow surface Emit implementations see. They never touch the Walker directly, which
// keeps the interface stable and keeps emitters out of traversal state.
//
// Vλl is a snapshot taken when Emit is called. CompileChild can recurse into nested kinds, but the walker
// has popped back to this frame by the time it returns, so Vλl stays correct for the whole Emit body.
type EmitContext struct {
	Vλl    string
	walker *Walker
}

// CompileChild recurses into rt as a child of the current frame, for collection emitters (object literal,
// union, …) that compose child code into their own snippet.
func (ctx *EmitContext) CompileChild(rt *reflection.RunType, expectedCType CodeType) RTCode {
	return ctx.walker.compileNode(rt, expectedCType)
}

// AsExpression converts a statement / return-block RTCode into a call expression by hoisting the body into a
// factory-local context function (tier 3 of the dispatch ladder, see wrapAsCtxFn); CodeE and empty bodies
// pass through. Used by emitters that must AND-chain onto a base whose kind emits a statement body.
func (ctx *EmitContext) AsExpression(code RTCode) RTCode {
	if code.Type == CodeE || code.Code == "" {
		return code
	}
	return ctx.walker.wrapAsCtxFn(code)
}

// IsRoot reports whether the current Emit call is at the RT function's outermost frame, for emitters whose
// output shape depends on it: stringifyJson's atomic number/null emits `String(v)` at root, so the fn
// returns a JSON-parseable string, and bare `v` deeper, where the parent's `+` coerces.
func (ctx *EmitContext) IsRoot() bool {
	return ctx.walker != nil && len(ctx.walker.Stack) == 1
}

// ParentIsUnion reports whether the immediate parent frame is a union; compileNode resolves refs before
// pushStack, so the parent frame is the real resolved type, never a ref placeholder. Used by
// emitObjectValidate to drop its own `typeof === 'object'` guard as a direct union member, where
// emitUnionValidate's one shared guard already covers the whole OR-chain.
func (ctx *EmitContext) ParentIsUnion() bool {
	if ctx.walker == nil || len(ctx.walker.Stack) < 2 {
		return false
	}
	parent := ctx.walker.Stack[len(ctx.walker.Stack)-2].RT
	return parent != nil && parent.Kind == reflection.KindUnion
}

// HasVariantOption reports whether the current walker is rendering the variant `name`; always false for a
// plain walker. Root-scoped: children dispatch to plain factories, so only the variant root's own emit sees
// `true` and a nested same-kind node renders with the option turned OFF.
func (ctx *EmitContext) HasVariantOption(name string) bool {
	if ctx.walker == nil || ctx.walker.VariantOptions == nil {
		return false
	}
	return ctx.walker.VariantOptions[name]
}

// VariantOptionNames returns the ValidateOptions names in force on the current walker, in DECLARATION
// order, the order Canonical / FnHashFor expect; empty for a plain walker. Walker-scoped like
// HasVariantOption: it is the option set in force over everything this walker inlines, which is what a
// cross-family reference must match (see CrossFamilyVariantHash).
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

// CrossFamilyVariantHash returns the fnHash another family's operation is keyed by UNDER THIS WALKER'S
// VARIANT, so the entry a cross-family reference resolves was compiled with the same options as the body
// referring to it. Reduces to PlainHash on a plain walker.
//
// rejectCircularRefs is deliberately NOT folded in: the armed guard is emitted once at the variant ROOT, so
// at any node the walker inlines the armed fork behaves exactly like the plain one, while the armed ENTRY
// for that node's own type would carry a guard of its own. Naming the plain hash keeps the two in step.
func (ctx *EmitContext) CrossFamilyVariantHash(opName string) string {
	return operations.VariantHash(opName, ctx.VariantOptionNames())
}

// ChecksUnknownKeys reports whether the family being rendered folds the unknown-key check into its own walk
// (the fused validateStrict / validationErrorsStrict families), which the shared object-ish arms splice on.
//
// UNLIKE HasVariantOption this is NOT root-scoped: the verdict rides the emitter identity, and every child
// entry of a family renders with that same emitter, so the root and the whole subtree agree. That is why the
// fused validators are families rather than variants — see validate_strict.go.
func (ctx *EmitContext) ChecksUnknownKeys() bool {
	if ctx.walker == nil {
		return false
	}
	_, ok := ctx.walker.Emitter.(StrictUnknownKeys)
	return ok
}

// ChecksUnionMemberKeys reports whether the family being rendered asserts, on each union arm, that the member which
// matched declares every key on the value (the validateUnionKeys / validationErrorsUnionKeys families).
//
// Rides the emitter identity like ChecksUnknownKeys, and for the same reason: a union nested under a named type is
// dep-called into its own entry, which renders with this same emitter and so reaches the same verdict.
func (ctx *EmitContext) ChecksUnionMemberKeys() bool {
	if ctx.walker == nil {
		return false
	}
	_, ok := ctx.walker.Emitter.(UnionMemberKeys)
	return ok
}

// NumberMode returns the numberMode the current variant root is rendering: "typeof" / "notNaN" / "isFinite"
// (default). Root-scoped like HasVariantOption, so nested same-kind nodes render with the default check.
func (ctx *EmitContext) NumberMode() string {
	return constants.NumberModeFromOptions(ctx.HasVariantOption)
}

// ResolveRef dereferences a KindRef sentinel via the walker's ref table: the input passes through when it
// isn't a ref, and a ref pointing at a missing entry returns nil. For emit decisions that must peek at the
// resolved kind, as when a PropertySignature checks whether its wrapped child is a function.
func (ctx *EmitContext) ResolveRef(rt *reflection.RunType) *reflection.RunType {
	return ctx.walker.resolveRef(rt)
}

// NextLocalVar returns a fresh local variable name, so child accessors and result locals never collide
// across nested frames. Prefix convention: "i" for loop counters, "res" for child-result locals.
func (ctx *EmitContext) NextLocalVar(prefix string) string {
	return ctx.walker.nextLocalVar(prefix)
}

// SetChildAccessor records the value-accessor the next pushStack uses as the child's Vλl, for collection
// emitters pointing a child frame at a subscript or property expression instead of the parent's own Vλl.
// The accessor stays attached to the parent frame, so the parent can call it again for its next child.
func (ctx *EmitContext) SetChildAccessor(accessor string) {
	ctx.walker.setChildAccessor(accessor)
}

// SuppressInlineReserve reports whether the current frame emits raw inline scalar writes WITHOUT their own
// `Ser.ensureCapacity?.(n)` reserve, set by a fixed-width array that reserves its element block once.
func (ctx *EmitContext) SuppressInlineReserve() bool {
	return ctx.walker != nil && ctx.walker.suppressInlineReserve
}

// SetSuppressInlineReserve toggles the raw-inline-write mode (see SuppressInlineReserve). Callers must
// restore the prior value after the scoped CompileChild so siblings and parents are unaffected.
func (ctx *EmitContext) SetSuppressInlineReserve(suppress bool) {
	if ctx.walker != nil {
		ctx.walker.suppressInlineReserve = suppress
	}
}

// SetChildPathLiteral records the path-literal the next pushStack frame inherits. Symmetric with
// SetChildAccessor: collection emitters call it before each CompileChild so the child's PathLiteral names
// the property, tuple index or loop counter it sits at. validationErrors-style emitters build access-path
// arrays from it; validate ignores it.
func (ctx *EmitContext) SetChildPathLiteral(literal string) {
	ctx.walker.setChildPathLiteral(literal)
}

// AccessPathLiteral returns a JS array literal of every non-empty PathLiteral on the current stack, with
// `extra` appended as a trailing segment when non-empty; an empty path returns "" so the caller omits the
// argument. Used by validationErrors emitters to embed the static path segments at error sites.
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

// AccessPathLength counts the static path segments the current stack contributes, `extra` included when
// non-empty. Sizes the `pth.splice(-N)` pop that unwinds the path after a dependency call returns.
func (ctx *EmitContext) AccessPathLength(extra string) int {
	n := len(ctx.walker.accessPath())
	if extra != "" {
		n++
	}
	return n
}

// SetContextItem registers a closure-prologue `const xyz = …;` declaration. WrapClosure emits these before
// the inner function, so they evaluate once per factory call rather than on every validator invocation.
func (ctx *EmitContext) SetContextItem(key, value string) {
	ctx.walker.ContextItems.set(key, value)
}

func (ctx *EmitContext) HasContextItem(key string) bool {
	return ctx.walker.ContextItems.has(key)
}

func (ctx *EmitContext) GetContextItem(key string) (string, bool) {
	return ctx.walker.ContextItems.get(key)
}

// registerRTLookup ensures the closure-prologue `const <childID> = utl.getRT('<childID>')` exists, so the
// inner factory resolves the child RT via the rtUtils singleton. Idempotent via the ordered context set.
func (ctx *EmitContext) registerRTLookup(childID string) {
	if !ctx.HasContextItem(childID) {
		ctx.SetContextItem(childID, "const "+childID+" = utl.getRT("+quoteJS(childID)+")")
	}
	// A lookup is cross-family when childID's tag prefix differs from this
	// walker's own InnerPrefix, as when a serializer body resolves a validator
	// entry. recordCrossFamilyDep applies that gate, so the same-family lookups
	// emitDepCall also funnels through here stay in RTDependencies.
	if ctx.walker != nil {
		ctx.walker.recordCrossFamilyDep(childID)
	}
}

// emitDepCall builds the JS expression that invokes child childID's precompiled factory with argsExpr. A
// self-recursive call (childID is this fn's own RTFnHash) calls the inner declaration directly; a
// cross-function one goes through `<childID>.fn(args)` and registers the getRT lookup. A non-empty assignTo
// wraps the result as `<assignTo> = <call>`, for the mutate-in-place families.
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

// emitPathTrackedDepCall wraps a dependency call in the `pth.push(...) , <call> , pth.splice(-N)` envelope
// when static path segments are pending, so the child's errors carry the right access-path prefix. Shared by
// the validationErrors and unknownKeyErrors families, and returned as a comma-expression so the caller can
// drop it into an expression or a statement slot without restructuring.
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

// CreateFnInContext is the EmitContext face of Walker.createFnInContext, for emitters that hand-build
// statement blocks in expression position. See it for the params/args contract.
func (ctx *EmitContext) CreateFnInContext(body string, codeType CodeType, params, args []string) string {
	return ctx.walker.createFnInContext(body, codeType, params, args)
}

// CtxFnParams derives a context function's parameter list for a block emitted against accessor: the
// emitter's Args plus any allocated loop counters free in it (see Walker.ctxFnParamsFor).
func (ctx *EmitContext) CtxFnParams(accessor string) []string {
	return ctx.walker.ctxFnParamsFor(accessor)
}

// AddPureFnDependency records that the emitted body reaches the pure fn `id` names. The walker forwards
// each dependency to the resolver's integrity check; see Walker.AddPureFnDependency for the contract.
func (ctx *EmitContext) AddPureFnDependency(id string) {
	ctx.walker.AddPureFnDependency(id)
}

// UsePureFn is the ONE choke point for referencing a package-owned pure fn from an emitted body: it records
// the dependency (so it rides the entry's SoftDeps / PFE9012 check), hoists the deduped
// `const <alias> = utl.getPureFn('<id>')` prologue line, and returns the alias the body calls. A raw
// `utl.getPureFn` string anywhere else is a review smell: a missed dependency becomes a missing import,
// since delivery is build-owned.
//
// `id` comes from the generated purefnids constants, so a built-in that moves or is renamed fails codegen
// rather than emitting a body that reaches nothing.
func (ctx *EmitContext) UsePureFn(id string) string {
	ctx.AddPureFnDependency(id)
	alias := pureFnAliasFor(id)
	if !ctx.HasContextItem(alias) {
		ctx.SetContextItem(alias, "const "+alias+" = utl.getPureFn('"+id+"')")
	}
	return alias
}

// DiagSlot identifies a RT-throw / silent-skip site by its semantic shape rather than its per-family code,
// so emit code shared across several emitters still emits its diagnostics under the right per-family prefix.
type DiagSlot string

const (
	// Root-position throw slots — factory throws on call.
	SlotNeverRoot           DiagSlot = "never-root"
	SlotNonSerializableRoot DiagSlot = "ns-root"
	SlotFunctionRoot        DiagSlot = "fn-root"

	// Child-position silent-skip slots — factory degrades.
	SlotFunctionPropDropped DiagSlot = "fn-prop-dropped"
	SlotMethodDropped       DiagSlot = "method-dropped"
	SlotStaticDropped       DiagSlot = "static-dropped"
	SlotSymbolKeyedDropped  DiagSlot = "symbol-keyed-dropped"
	// SlotNonSerializablePropDropped — a property whose VALUE is DataOnly-stripped
	// to `never` was dropped, so `{a: symbol}` behaves as `{}`, matching
	// `DataOnly<{a: symbol}>`. Distinct from SlotSymbolKeyedDropped (a symbol KEY),
	// from SlotFunctionPropDropped, and from the *Root slots (a propagating
	// position). Emitted by strippedPropertyDrop.
	SlotNonSerializablePropDropped DiagSlot = "non-serializable-prop-dropped"
	// SlotUnsafeNamePropDropped — a property DECLARED with a name that is never a
	// property (reflection.UnsafePropertyNames, i.e. `__proto__`) was dropped, so
	// `{a: number, __proto__: string}` behaves as `{a: number}`: the VALUE is fine,
	// the NAME cannot carry data. Every family maps it to the family-agnostic UPN001.
	SlotUnsafeNamePropDropped DiagSlot = "unsafe-name-prop-dropped"
	// SlotUnionMemberDropped — a union member DataOnly strips to `never` was
	// dropped, so the union projects to its data members (DataOnly<Date | symbol>
	// = Date). Emitted from dataOnlyUnionMembers.
	SlotUnionMemberDropped DiagSlot = "union-member-dropped"

	// Advisory slots.
	SlotRootAnyUnknown DiagSlot = "root-any-unknown"
)

// VariantPropagator is the optional capability an emitter implements when its compile-time option variant
// changes the body of EVERY node in the subtree, not just the root's.
//
// A plain variant is ROOT-SCOPED: the walker keeps the family's plain inner prefix, so a child that goes
// external is dep-called at its PLAIN entry and loses the option there. That is right for an option
// describing the root's call shape (validate's noIsArrayCheck drops a guard the caller already ran) and
// wrong for one describing the VALUE: hasUnknownKeys's runsAfterValidation is as true of `v.address` as of `v`.
//
// A propagating variant gets the family treatment: the inner prefix becomes the variant's own fnHash, so
// children render and are dep-called as variant entries; the collector carries the option set down the child
// worklist; entries disk-cache under their own basename; and a user override still redirects.
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

// DiagCodeProvider is the optional capability for per-family diagnostic codes at child-position
// silent-skip sites; returning "" for a slot disables emission there.
type DiagCodeProvider interface {
	DiagCodeFor(slot DiagSlot) string
}

// LeafDiagCodeProvider is the optional capability for per-family diagnostic codes at unsupported root
// leaves; the walker hands the leaf over when finalising an alwaysThrow factory. Returning "" preserves the
// silent-skip path, the safety net for an unknown future kind with no registered code.
type LeafDiagCodeProvider interface {
	DiagCodeForLeaf(leaf *reflection.RunType) string
}

// DiagCodeFor returns the per-family diag code the current emitter registered for slot, or "" when it provides none.
func (ctx *EmitContext) DiagCodeFor(slot DiagSlot) string {
	if provider, ok := ctx.walker.Emitter.(DiagCodeProvider); ok {
		return provider.DiagCodeFor(slot)
	}
	return ""
}

// DiagCodeForLeaf returns the per-family code the current emitter associates with an unsupported leaf kind, or "".
func (ctx *EmitContext) DiagCodeForLeaf(leaf *reflection.RunType) string {
	if provider, ok := ctx.walker.Emitter.(LeafDiagCodeProvider); ok {
		return provider.DiagCodeForLeaf(leaf)
	}
	return ""
}

// EmitDiagnosticSlot is the slot-keyed sibling of EmitDiagnostic for silent-skip sites.
func (ctx *EmitContext) EmitDiagnosticSlot(slot DiagSlot, args ...string) {
	code := ctx.DiagCodeFor(slot)
	if code == "" {
		return
	}
	ctx.walker.EmitDiagnostic(code, args...)
}

// EmitDiagnostic surfaces a build-time diagnostic without changing the emitted runtime behavior. Use it at
// silent-skip sites, where the emitter drops a member and the user has no other signal that it is missing.
func (ctx *EmitContext) EmitDiagnostic(code string, args ...string) {
	ctx.walker.EmitDiagnostic(code, args...)
}

// JSEngine returns the JS engine format-pattern checks run on (see formats.EmitContext). Nil when no engine
// is configured, and the format emitters then fail pattern checks closed with FMT004.
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

func (ctx *EmitContext) PatternGenFailure(source, flags string) formats.PatternGenFailure {
	if ctx.walker == nil || ctx.walker.PatternGenFailures == nil {
		return formats.PatternGenFailure{}
	}
	return ctx.walker.PatternGenFailures[source+"\x00"+flags]
}

// ArgName looks up the JS identifier the inner function uses for a conceptual arg slot, via the emitter's
// Args list. Returns "" when the slot isn't declared on this emitter (validate has no "pλth" / "εrr"), so
// callers gating on those slots short-circuit cleanly instead of panicking.
func (ctx *EmitContext) ArgName(key string) string {
	for _, arg := range ctx.walker.Emitter.Args() {
		if arg.Key == key {
			return arg.Name
		}
	}
	return ""
}
