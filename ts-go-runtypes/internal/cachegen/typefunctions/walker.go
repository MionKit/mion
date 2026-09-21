package typefunctions

import (
	"fmt"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
	"slices"
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/jsengine"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// StackItem is one frame per RunType the walker is inside; Vλl is snapshotted on push so popStack can
// restore the parent's accessor.
//
// ChildAccessor is the JS expression the NEXT pushStack adopts as the child's Vλl, set by a collection
// emitter before each CompileChild so the child inherits the right subscript / property expression.
//
// ChildPathLiteral is the same idea for validationErrors path tracking, and is empty for kinds that
// contribute no path segment. PathLiteral is its snapshot at pushStack time, which AccessPathLiteral joins
// across frames into a `[seg1, seg2, …]` literal.
type StackItem struct {
	Vλl              string
	RT               *reflection.RunType
	ChildAccessor    string
	ChildPathLiteral string
	PathLiteral      string
}

// orderedItems keeps context items in insertion order, which is what makes the emitted JS source
// deterministic across runs: a Go map alone would not.
type orderedItems struct {
	keys   []string
	values map[string]string
}

// newOrderedItems leaves the map nil: most walkers never register a context item, and set() allocates lazily.
func newOrderedItems() *orderedItems {
	return &orderedItems{}
}

func (o *orderedItems) set(key, value string) {
	if o.values == nil {
		o.values = map[string]string{}
	}
	if _, exists := o.values[key]; !exists {
		o.keys = append(o.keys, key)
	}
	o.values[key] = value
}

func (o *orderedItems) has(key string) bool { _, ok := o.values[key]; return ok }

func (o *orderedItems) get(key string) (string, bool) { v, ok := o.values[key]; return v, ok }

func (o *orderedItems) ordered() []string {
	out := make([]string, len(o.keys))
	for i, key := range o.keys {
		out[i] = o.values[key]
	}
	return out
}

// Walker walks a RunType graph, dispatches each node through the supplied Emitter, reconciles child code
// types with parent expectations, and assembles the final closure body. One Walker per emitted rt function.
//
// The Walker owns traversal state and the Emitter owns the per-fn switch and finalize logic, so adding a new
// fn is one new Emitter implementation and no Walker edit.
type Walker struct {
	// RootType is the entry-point RunType for this rt function.
	RootType *reflection.RunType
	// FnName is the inner function name landing in the emitted
	// `function <FnName>(<args>){…}`.
	FnName string
	// RTFnHash is the namespaced JS-side cache key, so one runtype id can have a
	// distinct entry per rt fn without colliding in the global rtFnsCache.
	// EmitDependencyCall compares childID against it to spot a self-recursive
	// call, which emits `<hash>(args)` without the `.fn` indirection.
	RTFnHash string
	// InnerPrefix is the namespacing prefix the current emitter uses, set by the
	// renderer after NewWalker so the childIDs dispatch composes stay consistent
	// with the factory keys.
	InnerPrefix string
	// OverrideOpKey is this walker's family op key, used to spot a child carrying
	// an `overrideX<T>(pureFn)` for THIS family. Such a child must be
	// dependency-called, never inlined, so the parent references its cfn-redirect
	// entry instead of the structural body. Empty for a family that is not
	// publicly overridable, and for hand-constructed unit-test walkers.
	OverrideOpKey string
	// RefTable resolves KindRef sentinels to their real RunType: every Child /
	// Children / Parameters slot in the JSON wire form carries a ref
	// (`{kind: -1, id: "<hash>"}`), so without it the per-kind switch would see
	// the placeholder. May be nil when the input graph is fully knotted, as in
	// unit tests that hand-construct RunType structs.
	RefTable map[string]*reflection.RunType
	// Emitter supplies the per-fn args, dispatch, and finalize logic.
	Emitter Emitter
	// VariantOptions carries the `ValidateOptions` set for THIS walker only. The
	// renderer fans one RunType across several walkers, one plain plus one per
	// option-tuple seen at a call site, each producing its own cache entry.
	// Root-scoped: children dispatch through plain dep calls, so the variant only
	// changes the root's body. Empty when this walker emits the plain entry.
	VariantOptions map[string]bool
	// RejectCircular renders the armed (`{rejectCircularRefs: true}`) variant of a
	// CircularGuarded family: with a non-nil CircularSkeleton, Compile prepends the
	// inline guard to the finalized body. Root-scoped like VariantOptions, so
	// children render plain and only the root body carries the guard.
	RejectCircular bool
	// CircularSkeleton is the baked cycle-capable graph the inline guard walks, and
	// is nil for an acyclic armed type, where no guard is emitted.
	CircularSkeleton *CircularSkeleton
	// Vλl is the current value-accessor expression, recomputed on every pushStack
	// from the live frames: "v" at an atomic root, "v.foo" or "v[i0]" at a member.
	Vλl string
	// Stack is the live traversal stack: the root is pushed on Compile entry, and
	// emitters push more frames through EmitContext.CompileChild.
	Stack []StackItem
	// localVarCounters numbers the names NextLocalVar hands out, one counter per
	// prefix. A flat per-prefix counter is enough because each Emit allocates a
	// fixed number of names once.
	localVarCounters map[string]int
	// sjSkipCommas is the stringifyJson "suppress the trailing comma" bit a parent
	// frame sets before each child property emit. It must NOT live in ContextItems:
	// every value there is emitted verbatim as a prologue line, so a flag stored
	// there leaks stray `;` / `1;` statements into factories.
	sjSkipCommas bool
	// suppressInlineReserve tells the toBinary scalar arms to emit the RAW inline
	// write WITHOUT its own `Ser.ensureCapacity?.(n)` reserve: a fixed-width array
	// sets it so the loop body stays a tight raw write and the array reserves the
	// whole element block once, then clears it. Never a ContextItems value, for the
	// same reason as sjSkipCommas.
	suppressInlineReserve bool
	// Code is the assembled function body, the most recent root-level emitted code;
	// Finalize normalises it on exit.
	Code string
	// ContextItems is the ordered set of `const xyz = …;` declarations WrapClosure
	// emits before the inner function returns.
	ContextItems *orderedItems
	// RTDependencies / PureFnDependencies track which other rt and pure functions
	// this function reaches via dependency calls.
	RTDependencies     []string
	PureFnDependencies []protocol.PureFnDep
	// JSEngine mirrors RenderOpts.JSEngine, exposed to the format emitters through
	// EmitContext.JSEngine. Nil fails pattern checks closed with FMT004.
	JSEngine jsengine.Engine
	// PatternSampleCount / PatternGenFailures mirror the RenderOpts fields of the
	// same names; the pattern emitter's FMT005 lane reads them at emit time.
	PatternSampleCount int
	PatternGenFailures map[string]formats.PatternGenFailure
	// CrossFamilyDeps records the cross-family RT lookups this function reaches via
	// registerRTLookup: childIDs whose family-tag prefix differs from this walker's
	// own InnerPrefix, as when a serializer body references a validator entry to
	// discriminate a union member. Same-family lookups flow through RTDependencies
	// and are NOT duplicated here.
	CrossFamilyDeps []string
	// IsUnsupported latches the first CodeNS sentinel anywhere in the traversal:
	// the rest of the compile short-circuits without descending UNLESS a parent
	// absorbs the child via AbsorbUnsupported (property / PropertySignature emits
	// are the only positions that absorb). The renderer reads it with
	// UnsupportedLeaf to pick between a regular factory and an alwaysThrow entry.
	IsUnsupported bool
	// UnsupportedLeaf points at the RunType whose emit first returned CodeNS, which
	// DiagCodeForLeaf turns into the per-family alwaysThrow code. First encounter
	// wins, and AbsorbUnsupported clears the slot so a sibling can latch its own.
	UnsupportedLeaf *reflection.RunType

	// DiagSink receives what EmitDiagnostic records. Nil when the caller wants no
	// diagnostics, as in unit tests with no provenance threading. The renderer sets
	// it from RenderOpts.DiagSink so one dispatch collects everything in one slice.
	DiagSink *[]diagnostics.Diagnostic
	// rootProvenance is every marker call site that REACHES the root being walked,
	// whether it named the type or pulled it in as a member. EmitDiagnostic fans
	// out one Diagnostic per site: dedup is one-per-call-site, not one-per-typeid.
	rootProvenance []diagnostics.Site
	// rootedProvenance narrows rootProvenance to the sites that NAMED this
	// type. A ScopeRoot code only belongs to those: it says the function the
	// call produced always fails, which is false at a site that merely
	// contains the type somewhere inside.
	rootedProvenance []diagnostics.Site
	// diagSeen stops one walk emitting the same code twice, which a deep tree with
	// several unsupported leaves of the same kind would otherwise do per call site.
	diagSeen map[string]bool

	// facts is the per-dispatch memo for the canonical-node subtree predicates; nil
	// disables memoization (hand-constructed unit-test walkers). Shared across every
	// family render of one dispatch, because the predicates are pure functions of a
	// canonical node's reachable subgraph, independent of emitter and parent.
	facts *FactsTable
	// inlineCtx is reused across every dispatch call: IsRTInlined completes before
	// any child dispatch runs, so one instance per walker is safe.
	inlineCtx InlineContext
	// ctxPool recycles EmitContext instances LIFO. A parent's context stays checked
	// out while its children compile, so a pooled one can never alias a live frame.
	ctxPool []*EmitContext
	// disableNoopElision turns OFF the dispatch-time noop gate. Test-only escape
	// hatch: the predicate↔emit agreement harness compiles ground-truth bodies with
	// the gate off so the two sides stay independent.
	disableNoopElision bool
}

// factKind enumerates the memoized canonical-node predicates.
type factKind int

const (
	factJsonCompat factKind = iota
	factExtraProof
	factNoopPrepareJson
	factNoopRestoreJson
	factNoopRestoreJsonSafe
	factNoopFormatTransform
	factNoopCompactFromJson
	factNoopToBinary
	factNoopHasUnknownKeys
	factNoopCloneExactShape
	factNoopUnknownKeyErrors
	factNoopUnknownKeysToUndefined
	factNoopStripUnknownKeysWire
	factRestoreKeyGuard
	factCount
)

// FactsTable memoizes the canonical-node subtree predicates, one bool verdict per (fact, node ID). Only
// COMPLETED top-level walks are stored, because an intermediate node's in-walk value can depend on a
// cycle-back assumption for an ancestor still on the stack. A stored verdict is context-free: the predicate
// names the node's full reachable set, which is the same whichever parent asked. One per dispatch.
type FactsTable struct {
	verdicts [factCount]map[string]bool
}

// NewFactsTable returns an empty predicate memo.
func NewFactsTable() *FactsTable {
	table := &FactsTable{}
	for i := range table.verdicts {
		table.verdicts[i] = map[string]bool{}
	}
	return table
}

// Merge folds other's verdicts into table, for the parallel render path where each family memoizes in its
// own shard and the dispatcher merges after the join. A verdict is a pure function of the canonical node, so
// a key present in both shards carries the same value and the union is conflict-free. Nil-safe on both sides.
func (table *FactsTable) Merge(other *FactsTable) {
	if table == nil || other == nil {
		return
	}
	for kind := range other.verdicts {
		for id, verdict := range other.verdicts[kind] {
			table.verdicts[kind][id] = verdict
		}
	}
}

func (w *Walker) factsLookup(kind factKind, id string) (verdict bool, known bool) {
	if w == nil || w.facts == nil {
		return false, false
	}
	verdict, known = w.facts.verdicts[kind][id]
	return verdict, known
}

func (w *Walker) factsStore(kind factKind, id string, verdict bool) {
	if w == nil || w.facts == nil {
		return
	}
	w.facts.verdicts[kind][id] = verdict
}

// getEmitContext pops a recycled EmitContext (or allocates one) primed
// with the current value accessor.
func (w *Walker) getEmitContext(accessor string) *EmitContext {
	if n := len(w.ctxPool); n > 0 {
		ctx := w.ctxPool[n-1]
		w.ctxPool = w.ctxPool[:n-1]
		ctx.Vλl = accessor
		return ctx
	}
	return &EmitContext{Vλl: accessor, walker: w}
}

func (w *Walker) putEmitContext(ctx *EmitContext) {
	w.ctxPool = append(w.ctxPool, ctx)
}

// memberLabel identifies a member-shaped RunType, falling back to "<anonymous>" for the rare
// anonymous-callable case that carries no Name.
func memberLabel(rt *reflection.RunType) string {
	if rt == nil || rt.Name == "" {
		return "<anonymous>"
	}
	return rt.Name
}

// AbsorbUnsupported clears the unsupported-leaf latch so the walker keeps compiling siblings. Used by
// property / PropertySignature emits that drop an unsupported child instead of propagating its CodeNS; the
// parent then returns plain empty code so its own parent's chain treats the slot as a no-op.
func (w *Walker) AbsorbUnsupported() {
	w.IsUnsupported = false
	w.UnsupportedLeaf = nil
}

// EmitDiagnostic records a diagnostic against every call site the code belongs to (see diagnosticSites).
// No-op when DiagSink is unwired, the code already fired for this walk, or no provenance sites are known.
// `args` are positional substitution values for the JS-side catalog template.
func (w *Walker) EmitDiagnostic(code string, args ...string) {
	if w.DiagSink == nil {
		return
	}
	if w.diagSeen[code] {
		return
	}
	if w.diagSeen == nil {
		w.diagSeen = map[string]bool{}
	}
	w.diagSeen[code] = true
	sites := w.diagnosticSites(code)
	if len(sites) == 0 {
		// Without provenance the Diagnostic renders as filePath="", useless to
		// the user.
		return
	}
	for _, site := range sites {
		*w.DiagSink = append(*w.DiagSink, diagnostics.New(code, site, args...))
	}
}

// diagnosticSites picks which call sites a code may be reported at.
//
// A ScopeRoot code describes the ROOT of a marker call, so only a site that named this type reports it: the
// same trigger one level in is a different, child-position code, and reporting the root code where the type
// merely sits inside says the site's function fails when it works fine.
//
// Every other scope keeps the reaching sites, which is what tells a call about the types it pulls in: a
// member dropped from `{pet: Pet}` is news at the site that asked for the object.
func (w *Walker) diagnosticSites(code string) []diagnostics.Site {
	if diagnostics.ScopeOf(code) == diagnostics.ScopeRoot {
		return w.rootedProvenance
	}
	return w.rootProvenance
}

// throwProvenance is the site an alwaysThrow entry names in its runtime message: the site that NAMED the
// type is the one the author can act on, and a child entry nothing named falls back to whatever reaches it.
func (w *Walker) throwProvenance() []diagnostics.Site {
	if len(w.rootedProvenance) > 0 {
		return w.rootedProvenance
	}
	return w.rootProvenance
}

// NewWalker primes a Walker for the given RunType + Emitter pair. Vλl starts at the first arg's Name, the
// base value accessor, and pushStack refreshes it on every descent.
func NewWalker(rt *reflection.RunType, fnName string, emitter Emitter) *Walker {
	args := emitter.Args()
	if len(args) == 0 {
		panic("typefns: emitter returned empty Args()")
	}
	// fnName is `<innerPrefix><rt.ID>`, used directly as the namespaced RTFnHash so
	// the cache key matches the factory registration site. The renderer also sets
	// InnerPrefix, so dispatch can build childIDs for non-root nodes too.
	rtFnHash := ""
	if rt != nil {
		rtFnHash = fnName
	}
	walker := &Walker{
		RootType:           rt,
		FnName:             fnName,
		RTFnHash:           rtFnHash,
		Emitter:            emitter,
		Vλl:                args[0].Name,
		ContextItems:       newOrderedItems(),
		RTDependencies:     []string{},
		PureFnDependencies: []protocol.PureFnDep{},
		CrossFamilyDeps:    []string{},
		localVarCounters:   map[string]int{},
	}
	walker.inlineCtx = InlineContext{walker: walker}
	return walker
}

// nextLocalVar hands out a fresh local-variable name. Each prefix numbers separately, so one Emit can
// allocate `i0` and `res0` without the second colliding with the first.
func (w *Walker) nextLocalVar(prefix string) string {
	count := w.localVarCounters[prefix]
	w.localVarCounters[prefix] = count + 1
	return prefix + strconv.Itoa(count)
}

// setChildAccessor records the accessor for the next pushStack. It persists on the caller's frame until the
// next call, so a parent can iterate children, setting the accessor before each CompileChild.
func (w *Walker) setChildAccessor(accessor string) {
	if len(w.Stack) == 0 {
		return
	}
	w.Stack[len(w.Stack)-1].ChildAccessor = accessor
}

// setChildPathLiteral records the path-literal contribution for the next pushStack. Symmetric with
// setChildAccessor: a collection emitter sets it before each CompileChild so the child frame's PathLiteral
// names the property, tuple index or loop counter the child sits at.
func (w *Walker) setChildPathLiteral(literal string) {
	if len(w.Stack) == 0 {
		return
	}
	w.Stack[len(w.Stack)-1].ChildPathLiteral = literal
}

// accessPath returns the non-empty PathLiteral segments from the current stack in push order, as raw JS
// expressions, so callers can fold in extra trailing segments before joining.
func (w *Walker) accessPath() []string {
	out := make([]string, 0, len(w.Stack))
	for i := range w.Stack {
		lit := w.Stack[i].PathLiteral
		if lit != "" {
			out = append(out, lit)
		}
	}
	return out
}

// AddPureFnDependency records a pure-fn id the emitted RT function will reach via `utl.getPureFn(<id>)`.
// Idempotent.
//
// Recording is O(1) with no source-file walk; the deps ride the wire for the module emitter. At render time
// the resolver cross-checks each against the program-wide registration set, so a dep that never registered
// is PFE9012 at build time instead of a `utl.getPureFn` throw at runtime.
func (w *Walker) AddPureFnDependency(id string) {
	for _, dep := range w.PureFnDependencies {
		if dep.ID == id {
			return
		}
	}
	w.PureFnDependencies = append(w.PureFnDependencies, protocol.PureFnDep{ID: id})
}

// UpdateDependencies records childHash as a rt dependency unless it's a noop or already tracked, so the
// entry's `rtDependencies` slot reflects every nested validator the body reaches.
func (w *Walker) UpdateDependencies(childHash string, childIsNoop bool) {
	if childIsNoop {
		return
	}
	for _, existing := range w.RTDependencies {
		if existing == childHash {
			return
		}
	}
	w.RTDependencies = append(w.RTDependencies, childHash)
}

// recordCrossFamilyDep records childID as a cross-family lookup edge, deduped, only when childID's
// family-tag prefix differs from this walker's own InnerPrefix. registerRTLookup is the single choke point
// both same-family dep calls and cross-family lookups funnel through, so this prefix gate is what separates
// the two. InnerPrefix=="" (hand-constructed unit-test walkers) records nothing.
func (w *Walker) recordCrossFamilyDep(childID string) {
	if w.InnerPrefix == "" || strings.HasPrefix(childID, w.InnerPrefix) {
		return
	}
	for _, existing := range w.CrossFamilyDeps {
		if existing == childID {
			return
		}
	}
	w.CrossFamilyDeps = append(w.CrossFamilyDeps, childID)
}

// Compile walks RootType, drives the Emitter, finalizes, and returns the inner function declaration ready
// for WrapClosure. isNoop makes the renderer skip the factory. isUnsupported means the compile reached a
// kind with no emit, so the renderer skips this RunType entirely and the runtime cache miss falls through to
// createValidateFn's hasRunType-but-no-rt fallback.
func (w *Walker) Compile() (innerFnDecl string, isNoop bool, isUnsupported bool) {
	w.compileNode(w.RootType, CodeE)
	if w.IsUnsupported {
		return "", false, true
	}
	finalCode, noop := w.Emitter.Finalize(w.Code)
	w.Code = finalCode
	// The guard runs a restricted walk of the value against the baked skeleton and
	// applies the family's reaction (return false / push a `circular` error /
	// throw) before the real body, so the finalized body is never an identity noop.
	if w.RejectCircular && w.CircularSkeleton != nil {
		w.emitCircularGuard()
		noop = false
	}
	innerFnDecl = fmt.Sprintf("function %s(%s){%s}", w.FnName, w.argsList(true), w.Code)
	return innerFnDecl, noop, false
}

// CircularGuardReactor is implemented by the walker-path CircularGuarded emitters (validate /
// validationErrors / toBinary). EmitCircularGuard returns the guard statement prepended to the body: on a
// detected cycle it applies the family's policy, `return false`, a recorded `{expected:'circular'}` error,
// or a thrown CircularReferenceError. The JSON composites don't use the walker and inline their own guard
// in json_composite.go.
type CircularGuardReactor interface {
	EmitCircularGuard(fcpAlias, skeletonConst string) string
}

// circularGuardContextKey names the closure-hoisted skeleton const the guard prologue shares.
const circularGuardContextKey = "cyP"

// emitCircularGuard hoists the findCycle alias and the baked skeleton const into the factory closure and
// prepends the family's guard statement. No-op unless the emitter is a CircularGuardReactor.
func (w *Walker) emitCircularGuard() {
	reactor, ok := w.Emitter.(CircularGuardReactor)
	if !ok {
		return
	}
	ctx := w.getEmitContext(w.Vλl)
	defer w.putEmitContext(ctx)
	fcpAlias := ctx.UsePureFn(purefnids.FindCycle)
	ctx.SetContextItem(circularGuardContextKey, "const "+circularGuardContextKey+" = "+w.CircularSkeleton.JSLiteral())
	w.Code = reactor.EmitCircularGuard(fcpAlias, circularGuardContextKey) + w.Code
}

// ContextLines joins the `const xyz = …` declarations in insertion order with `;\n`, so WrapClosure's
// prologue can embed them verbatim. Empty when no emitter registered a context item.
func (w *Walker) ContextLines() string {
	return strings.Join(w.ContextItems.ordered(), ";\n")
}

// compileNode is the recursive entry point: push the frame, dispatch through the Emitter, reconcile the
// result against the parent's expected code type, pop. KindRef sentinels resolve against w.RefTable before
// pushStack, so the per-kind switch never sees a placeholder.
//
// Once w.IsUnsupported is set it short-circuits and returns CodeNS, so a compound parent up the recursion
// chain propagates the sentinel without emitting: no further work happens under an unsupported node.
func (w *Walker) compileNode(rt *reflection.RunType, expectedCType CodeType) RTCode {
	if w.IsUnsupported {
		return RTCode{Code: "", Type: CodeNS}
	}
	if rt == nil {
		return RTCode{Code: "", Type: expectedCType}
	}
	rt = w.resolveRef(rt)
	if rt == nil {
		return RTCode{Code: "", Type: expectedCType}
	}
	w.pushStack(rt)
	jc := w.dispatch(rt, expectedCType)
	if jc.Type == CodeNS {
		// First unsupported leaf wins: the renderer derives its per-family diag
		// code from it, and the latch short-circuits later CompileChild calls.
		if w.UnsupportedLeaf == nil {
			w.UnsupportedLeaf = rt
		}
		w.IsUnsupported = true
		w.popStack(jc)
		return jc
	}
	if jc.Code != "" {
		jc = w.handleCodeInterpolation(jc, expectedCType)
	}
	w.popStack(jc)
	return jc
}

// resolveRef dereferences KindRef sentinels via the walker's RefTable; a non-ref passes through unchanged.
// A ref with no matching entry returns nil so the caller can short-circuit: that is a dangling cache
// reference, treated as a noop here and left for a higher level to surface.
func (w *Walker) resolveRef(rt *reflection.RunType) *reflection.RunType {
	if rt == nil || rt.Kind != reflection.KindRef {
		return rt
	}
	if w.RefTable == nil {
		return nil
	}
	return w.RefTable[rt.ID]
}

// dispatch decides between inline emission and a dependency call: a dep call happens only when BOTH the
// predicate says the node is NOT inline-cheap AND the walker is past depth 1, so the root always inlines and
// the top-level factory has a body. The child's compile is deferred to its own top-level render pass.
//
// dispatch heads a THREE-tier ladder: tier 1 is the external dep call below, tier 2 the inline splice, tier
// 3 an inlined child whose CodeS/CodeRB block lands in an expression slot and hoists into a factory-local
// context function (see wrapAsCtxFn). Tier 3 lives one level up in handleCodeInterpolation because it needs
// the POST-emit CodeType, which only exists after Emit returns.
//
// `childIsNoop` is passed false here because the child hasn't been compiled yet on this path. The renderer's
// dangling-dep cascade in module.go drops any parent whose recorded deps have no emitted factory, so the
// over-recording can't break anything at runtime.
func (w *Walker) dispatch(rt *reflection.RunType, expectedCType CodeType) RTCode {
	w.inlineCtx.RT = rt
	// inlineWouldCycle is the walker's own cycle breaker: a node already on the
	// walk stack must go external whatever the predicate says, or the inline
	// expansion recurses forever. Needed because IsCircular marks only the
	// serializer's RE-ENTRY node, so an anonymous wrapper union (`U | undefined`
	// from an optional `a?: U`) participates in the cycle UNFLAGGED. Default mode
	// makes every compound external anyway; allInternal needs the explicit guard.
	// An overridden child MUST go external so the parent references its
	// cfn-redirect entry: inlining would splice the structural body and the
	// override would never run. That forces the dep path AND skips the noop
	// short-circuits below. A root frame is never redirected here, because
	// renderEntry substitutes an overridden root's entry upstream.
	overrideChild := len(w.Stack) > 1 && w.OverrideOpKey != "" && rt.Overrides[w.OverrideOpKey] != ""
	shouldDepend := overrideChild || ((!w.Emitter.IsRTInlined(&w.inlineCtx) || w.inlineWouldCycle(rt.ID)) && len(w.Stack) > 1)
	if shouldDepend {
		// A child kind this emitter doesn't support gets no factory, and a dep
		// call on a missing one would cascade-remove the parent at the
		// dangling-dep stage. Treat it as an inline noop so the parent composes
		// around it, matching the "skip the slot, let identity restore the
		// original" semantic the JS side already uses for a missing entry.
		if !w.Emitter.Supports(rt) {
			return RTCode{Code: "", Type: expectedCType}
		}
		// Noop gate: when the predicate proves the child's entry would be the
		// family identity, the import, the `utl.getRT` line and the per-call
		// indirection all do nothing, so compose around it with empty code like
		// the unsupported case above. This is also what collapses circular
		// identity bodies: the cycle re-entry dispatches here, the predicate
		// proves it noop, and the surrounding code folds away. Gated on
		// NoopComposeAround, NOT the universal NoopTypePredicate, because empty
		// code only composes for value-transform families (stringifyJson needs
		// the child's JSON fragment, fromBinary its byte reads).
		// An override child skips the gate: the override body is the user's
		// contract, not the structural identity the predicate proves.
		if !overrideChild && !w.disableNoopElision {
			if predicate, ok := w.Emitter.(NoopComposeAround); ok {
				emitCtx := w.getEmitContext(w.Vλl)
				childIsNoop := predicate.IsNoopType(rt, emitCtx)
				w.putEmitContext(emitCtx)
				if childIsNoop {
					return RTCode{Code: "", Type: expectedCType}
				}
			}
		}
		// Namespaced childID, matching the factory registration key the JS-side
		// cache stores the entry under. InnerPrefix is empty for hand-constructed
		// unit-test walkers, where childID stays bare.
		childID := w.InnerPrefix + rt.ID
		emitCtx := w.getEmitContext(w.Vλl)
		callCode := w.Emitter.EmitDependencyCall(rt, childID, emitCtx)
		w.putEmitContext(emitCtx)
		// A child the noop gate proved identity never reaches this line; for an
		// emitter with no predicate the compiled noop bit isn't known at dispatch
		// time, so false is passed and the dep IS recorded.
		w.UpdateDependencies(childID, false)
		return RTCode{Code: callCode, Type: CodeE}
	}
	emitCtx := w.getEmitContext(w.Vλl)
	result := w.Emitter.Emit(rt, emitCtx, expectedCType)
	w.putEmitContext(emitCtx)
	return result
}

// inlineWouldCycle reports whether id already sits on the walk stack BELOW the current frame (compileNode
// pushes the node before dispatching). A revisit means inlining would expand the cycle forever, so dispatch
// goes external instead, which resolves as a self-call when the revisited node is this walker's own root.
func (w *Walker) inlineWouldCycle(id string) bool {
	if id == "" {
		return false
	}
	for i := 0; i < len(w.Stack)-1; i++ {
		if w.Stack[i].RT != nil && w.Stack[i].RT.ID == id {
			return true
		}
	}
	return false
}

// pushStack snapshots the current Vλl onto a new stack frame; getStackVλl computes the descendant accessor
// from the pre-push stack, which for an atomic root is the function's first argument.
func (w *Walker) pushStack(newChild *reflection.RunType) {
	if len(w.Stack) == 0 && newChild != w.RootType {
		panic("typefns: rootType must be the first item pushed onto the stack")
	}
	w.Vλl = w.getStackVλl()
	pathLit := ""
	if len(w.Stack) > 0 {
		pathLit = w.Stack[len(w.Stack)-1].ChildPathLiteral
	}
	w.Stack = append(w.Stack, StackItem{Vλl: w.Vλl, RT: newChild, PathLiteral: pathLit})
}

// popStack stores the emitted code on the Walker, so the root frame's code survives as w.Code, and restores
// Vλl to the parent frame's snapshot.
func (w *Walker) popStack(result RTCode) {
	if result.Code != "" {
		w.Code = result.Code
	}
	if len(w.Stack) == 0 {
		return
	}
	w.Stack = w.Stack[:len(w.Stack)-1]
	if parent := w.peekStack(); parent != nil {
		w.Vλl = parent.Vλl
	} else {
		w.Vλl = w.Emitter.Args()[0].Name
	}
}

func (w *Walker) peekStack() *StackItem {
	if len(w.Stack) == 0 {
		return nil
	}
	return &w.Stack[len(w.Stack)-1]
}

// getStackVλl computes the child accessor for the next pushStack: the parent's ChildAccessor when a member
// kind set one before CompileChild, otherwise the parent's own Vλl, or the first arg's name on an empty stack.
func (w *Walker) getStackVλl() string {
	if len(w.Stack) == 0 {
		return w.Emitter.Args()[0].Name
	}
	parent := &w.Stack[len(w.Stack)-1]
	if parent.ChildAccessor != "" {
		return parent.ChildAccessor
	}
	return parent.Vλl
}

// argsList renders the function's parameter list; includeDefaults spells `name=defaultValue` for a
// parameter that declares a default.
func (w *Walker) argsList(includeDefaults bool) string {
	args := w.Emitter.Args()
	parts := make([]string, 0, len(args))
	for _, arg := range args {
		if includeDefaults && arg.Default != "" {
			parts = append(parts, arg.Name+"="+arg.Default)
		} else {
			parts = append(parts, arg.Name)
		}
	}
	return strings.Join(parts, ",")
}

// handleCodeInterpolation reconciles a child emitter's CodeType with the parent's expected one, over the
// full cross-product so composite emits can compose CodeE / CodeS / CodeRB children.
//
// It returns the fragment WITH its post-reconciliation CodeType: a block hoisted to a context fn comes back
// as the CodeE call expression it now is. Keeping the child's stale type is what the old IIFE double-wrap
// guard absorbed: a wrapped `ctxFn0(v)` re-entering as "CodeRB" would re-wrap and drop the value.
func (w *Walker) handleCodeInterpolation(child RTCode, parentCT CodeType) RTCode {
	code := child.Code
	childCT := child.Type
	isRoot := len(w.Stack) == 1
	if isRoot {
		switch childCT {
		case CodeE:
			return RTCode{Code: "return " + code, Type: childCT}
		case CodeS:
			return RTCode{Code: addFullStop(code) + " return " + w.returnName(), Type: childCT}
		case CodeRB:
			return child
		}
	}
	switch {
	case parentCT == CodeE && childCT == CodeE:
		return child
	case parentCT == CodeE && childCT == CodeS,
		parentCT == CodeE && childCT == CodeRB:
		return w.wrapAsCtxFn(child)
	case parentCT == CodeS && childCT == CodeE:
		return child
	case parentCT == CodeS && childCT == CodeS:
		return RTCode{Code: addFullStop(code), Type: childCT}
	case parentCT == CodeS && childCT == CodeRB:
		return w.wrapAsCtxFn(child)
	case parentCT == CodeRB && childCT == CodeE:
		panic("typefns: expected block but got expression — would emit useless code")
	case parentCT == CodeRB && childCT == CodeS:
		return RTCode{Code: addFullStop(code), Type: childCT}
	case parentCT == CodeRB && childCT == CodeRB:
		return RTCode{Code: addFullStop(code) + " return " + w.returnName(), Type: childCT}
	}
	panic(fmt.Sprintf("typefns: unexpected code type (parent=%s child=%s)", parentCT, childCT))
}

// returnName delegates to the emitter so per-fn divergence stays inside the per-fn file: validate,
// prepareForJson, format and mock return their first arg, validationErrors its accumulator.
func (w *Walker) returnName() string {
	return w.Emitter.ReturnName()
}

// normaliseWhitespace collapses runs of spaces/tabs and repeated `;`. Newlines are preserved, since a
// template literal may rely on them.
func normaliseWhitespace(code string) string {
	var builder strings.Builder
	builder.Grow(len(code))
	prevSpace := false
	prevSemicolon := false
	for _, r := range code {
		switch {
		case r == ' ' || r == '\t':
			if !prevSpace {
				builder.WriteRune(' ')
			}
			prevSpace = true
			prevSemicolon = false
		case r == ';':
			if !prevSemicolon {
				builder.WriteRune(';')
			}
			prevSpace = false
			prevSemicolon = true
		default:
			builder.WriteRune(r)
			prevSpace = false
			prevSemicolon = false
		}
	}
	return builder.String()
}

// addFullStop ensures a snippet ends with a `;` so the next statement can concatenate without ambiguity.
func addFullStop(code string) string {
	if code == "" {
		return code
	}
	last := code[len(code)-1]
	if last == ';' || last == '}' {
		return code
	}
	return code + ";"
}

// createFnInContext registers `const ctxFn<N> = function(<params>){…}` as a context line and returns the
// call expression for the parent's expression slot. The factory-LOCAL analogue of a dep call: the block
// becomes a closure created ONCE per factory materialization instead of an IIFE allocated on every call.
// A CodeS body gets `return ` prepended; a CodeRB body carries its own returns and moves verbatim. params
// deliberately shadow the enclosing bindings BY NAME so the body text moves unchanged, which is safe because
// every outer reference in a moved block is read-only and context consts resolve through the closure.
func (w *Walker) createFnInContext(body string, codeType CodeType, params, args []string) string {
	name := w.nextLocalVar("ctxFn")
	prefix := ""
	if codeType != CodeRB {
		prefix = "return "
	}
	w.ContextItems.set(name, "const "+name+" = function("+strings.Join(params, ",")+"){"+prefix+body+"}")
	return name + "(" + strings.Join(args, ",") + ")"
}

// wrapAsCtxFn hoists an inline child's statement/return-block into a context function and returns the call
// expression, tier 3 of the dispatch ladder. Params are the emitter's own Args plus any walker-allocated
// loop counters free in the current accessor; over-passing a name the body never reads is harmless.
func (w *Walker) wrapAsCtxFn(child RTCode) RTCode {
	body := strings.TrimSpace(child.Code)
	if body == "" {
		return RTCode{Code: "", Type: CodeE}
	}
	params := w.ctxFnParamsFor(w.Vλl)
	return RTCode{Code: w.createFnInContext(body, child.Type, params, params), Type: CodeE}
}

// ctxFnParamsFor derives the parameter list for a context function whose body was emitted against accessor:
// the emitter's Args plus the walker-allocated loop counters free in it. Same-named params shadow the
// enclosing bindings, so the args list is the params list.
func (w *Walker) ctxFnParamsFor(accessor string) []string {
	params := make([]string, 0, 4)
	for _, arg := range w.Emitter.Args() {
		params = append(params, arg.Name)
	}
	for _, name := range identifiersIn(accessor) {
		if w.isAllocatedLocal(name) && !slices.Contains(params, name) {
			params = append(params, name)
		}
	}
	return params
}

// identifiersIn extracts an accessor expression's JS identifiers in first-appearance order, skipping
// property names. A quoted bracket key can surface as a false candidate; the isAllocatedLocal gate and
// over-passing safety make that a no-op.
func identifiersIn(accessor string) []string {
	var names []string
	seen := map[string]bool{}
	for i := 0; i < len(accessor); {
		ch := accessor[i]
		if isIdentStart(ch) {
			start := i
			for i < len(accessor) && isIdentPart(accessor[i]) {
				i++
			}
			if start > 0 && accessor[start-1] == '.' {
				continue
			}
			name := accessor[start:i]
			if !seen[name] {
				seen[name] = true
				names = append(names, name)
			}
			continue
		}
		i++
	}
	return names
}

func isIdentStart(ch byte) bool {
	return ch == '_' || ch == '$' || (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')
}

func isIdentPart(ch byte) bool {
	return isIdentStart(ch) || (ch >= '0' && ch <= '9')
}

// isAllocatedLocal reports whether name was handed out by nextLocalVar during this walk. Allocation-driven,
// so a user property that merely LOOKS like a counter (`i0` with no `i` allocations) never matches.
func (w *Walker) isAllocatedLocal(name string) bool {
	split := len(name)
	for split > 0 && name[split-1] >= '0' && name[split-1] <= '9' {
		split--
	}
	if split == 0 || split == len(name) {
		return false
	}
	index, err := strconv.Atoi(name[split:])
	if err != nil {
		return false
	}
	return index < w.localVarCounters[name[:split]]
}
