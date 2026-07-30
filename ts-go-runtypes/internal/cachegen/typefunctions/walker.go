package typefunctions

import (
	"fmt"
	"slices"
	"strconv"
	"strings"

	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/jsengine"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// StackItem mirrors the reference StackItem (rtFnCompiler.ts:33). One frame
// per RunType the walker is currently inside. Vλl is snapshotted on
// push so popStack can restore the parent's accessor.
//
// ChildAccessor is the JS expression the NEXT pushStack should adopt
// as the child's Vλl. Collection emitters (Array, Object, Tuple, …)
// set it before each CompileChild call so the child frame inherits
// the correct subscript / property expression. Mirrors the
// `getChildVλl()` (rtFnCompiler.ts:734) which queries the parent's
// `useArrayAccessor()` + `getChildLiteral()` to assemble the
// expression — our Go port hands the assembled expression directly.
//
// ChildPathLiteral is the same idea but for validationErrors path tracking:
// the JS expression (string literal or variable reference) the NEXT
// pushed frame contributes to the static access-path array used when
// building a RTValidationError. Symmetric with ChildAccessor — set by the
// parent emit before CompileChild, consumed at pushStack and stored
// on the child frame as PathLiteral. Empty for kinds that don't
// contribute to the path (atomic, tuple wrapper, …).
//
// PathLiteral is the snapshot of the parent's ChildPathLiteral at
// pushStack time. AccessPathLiteral walks every stack frame and joins
// non-empty PathLiterals into a `[seg1, seg2, …]` array literal.
// Mirrors getAccessPath (rtFnCompiler.ts:753) where each
// frame's `getStaticPathLiteral()` or `getChildLiteral()` contributes.
type StackItem struct {
	Vλl              string
	RT               *protocol.RunType
	ChildAccessor    string
	ChildPathLiteral string
	PathLiteral      string
}

// orderedItems maintains insertion order for context items so the
// emitted JS source is deterministic across runs. Mirrors the
// `contextCodeItems = new Map<string, string>()` (rtFnCompiler.ts:96):
// JS Maps preserve insertion order; Go's built-in maps don't, so we
// keep an explicit slice of keys.
type orderedItems struct {
	keys   []string
	values map[string]string
}

// newOrderedItems leaves the map nil — most walkers never register a
// context item, and nil-map reads (has/get/ordered) are valid Go; set()
// allocates lazily on first write.
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

// Walker is the Go-side port of BaseFnCompiler
// (rtFnCompiler.ts:49), minus the per-fn specifics. Walks a RunType
// graph, dispatches each node through the supplied Emitter, reconciles
// child code types with parent expectations, and assembles the final
// closure body.
//
// One Walker per emitted rt function instance. The Walker owns
// traversal state (Stack, Vλl, Code, ContextItems, deps); the Emitter
// owns the per-fn switch and finalize logic. Adding a new fn = one
// new Emitter implementation; the Walker stays untouched.
type Walker struct {
	// RootType is the entry-point RunType for this rt function.
	RootType *protocol.RunType
	// FnName is the inner function name (e.g. "validate_<hash>") that
	// lands in the emitted `function <FnName>(<args>){…}`.
	FnName string
	// RTFnHash is the namespaced cache key (e.g. "validate_abc123",
	// "validationErrors_abc123") the renderer uses as the JS-side cache
	// key. Namespaced so the same runtype ID can have a distinct
	// entry per rt fn (validate + validationErrors + …) without colliding
	// in the global rtFnsCache. Required by EmitDependencyCall to
	// detect self-recursive calls (childID == RTFnHash → emit
	// `<hash>(args)` without the `.fn` indirection, mirroring the
	// `isSelf` branch).
	RTFnHash string
	// InnerPrefix is the namespacing prefix the current emitter uses
	// (e.g. "validate_", "validationErrors_"). Set by the renderer after
	// NewWalker so dispatch can compose namespaced childIDs and the
	// renderer's dep tracking is consistent with the factory keys.
	InnerPrefix string
	// OverrideOpKey is this walker's family op key ("val", "tb", …), used to
	// detect a child node that carries an `overrideX<T>(pureFn)` for THIS
	// family (rt.Overrides[OverrideOpKey] != ""). Such a child must be
	// dependency-called — never inlined — so the parent references the child's
	// cfn-redirect entry instead of inlining the structural body. Empty for
	// walkers whose family is not publicly overridable (internal primitives) or
	// hand-constructed unit-test walkers.
	OverrideOpKey string
	// RefTable resolves KindRef sentinels to their real RunType.
	// Per `internal/protocol/protocol.go`, all Child / Children /
	// Parameters slots in the JSON wire form carry refs
	// (`{kind: -1, id: "<hash>"}`); the consumer side re-knots by
	// indexing into the cache. The walker uses this map at descent
	// time so the per-kind switch always sees the resolved kind.
	// May be nil when the input graph is fully knotted (e.g. unit
	// tests that hand-construct RunType structs with child Kinds
	// already inlined).
	RefTable map[string]*protocol.RunType
	// Emitter supplies the per-fn args, dispatch, and finalize logic.
	Emitter Emitter
	// VariantOptions carries the `ValidateOptions` set (e.g. {"noLiterals":
	// true}) for THIS walker only. The renderer fans the same RunType
	// out across multiple walkers — one plain + one per option-tuple
	// seen at any call site — so each emit produces a distinct cache
	// entry keyed `<tag><variantSuffix>_<id>`. Root-scoped: child
	// compiles dispatch through plain dep calls (`val_<childID>`) so the
	// variant only changes the root's body. Empty when this walker
	// emits the plain entry.
	VariantOptions map[string]bool
	// RejectCircular marks this walker as rendering the armed
	// (`{rejectCircularRefs: true}`) variant of a CircularGuarded family. When
	// set with a non-nil CircularSkeleton, Compile prepends the inline
	// circular-reference guard to the finalized body. Root-scoped like
	// VariantOptions — children render plain, so only the root body carries the
	// guard.
	RejectCircular bool
	// CircularSkeleton is the baked cycle-capable graph the inline guard walks
	// (nil for an acyclic armed type, where no guard is emitted). Set by the
	// renderer alongside RejectCircular.
	CircularSkeleton *CircularSkeleton
	// Vλl is the current value-accessor expression. Recomputed on
	// every pushStack from the live stack of frames. For an atomic
	// root it equals the first arg's Name (e.g. "v"); for a member
	// frame future kinds will extend it (e.g. "v.foo", "v[i0]").
	Vλl string
	// Stack is the live traversal stack. The Walker pushes the root
	// on Compile entry; emitters indirectly push more frames by
	// calling EmitContext.CompileChild.
	Stack []StackItem
	// localVarCounters assigns unique names to each emitter-local
	// variable allocated via EmitContext.NextLocalVar, partitioned
	// by prefix. Mirrors getLocalVarName (rtFnCompiler.ts:236)
	// which keys the counter on (prefix × RT identity) — our flat
	// per-prefix counter is equivalent for the access pattern where
	// each Emit allocates a fixed number of names once.
	localVarCounters map[string]int
	// sjSkipCommas is the stringifyJson "suppress the trailing comma"
	// bit a parent frame sets before each child property emit. Plain
	// per-walk walker state — it must NOT live in ContextItems (every
	// ContextItems VALUE is emitted verbatim as a prologue line, so a
	// flag stored there leaks stray `;`/`1;` statements into factories).
	sjSkipCommas bool
	// suppressInlineReserve tells the binary toBinary scalar arms to emit the
	// RAW inline write WITHOUT its own `Ser.ensureCapacity?.(n)` reserve. A
	// fixed-width array sets it before compiling its element so the loop body
	// stays a tight raw write and the array reserves the whole element block once
	// (container-boundary reservation), then clears it. Plain per-walk walker
	// state for the same reason as sjSkipCommas (never a ContextItems value).
	suppressInlineReserve bool
	// Code is the assembled function body. The Walker stores the
	// most recent root-level emitted code here; Finalize normalises
	// it on exit.
	Code string
	// ContextItems is an ordered set of `const xyz = …;` declarations
	// that WrapClosure emits before the inner function returns.
	ContextItems *orderedItems
	// RTDependencies / PureFnDependencies track which other rt and
	// pure functions this function reaches via dependency calls.
	// PureFnDependencies carries the full (namespace, fnName, filePath)
	// triple for the Go-side integrity check; at emission time the
	// emitter projects each entry to "<namespace>::<fnName>" so the
	// JS wire shape is unchanged.
	RTDependencies     []string
	PureFnDependencies []protocol.PureFnDep
	// JSEngine mirrors RenderOpts.JSEngine — the JS engine the format
	// emitters run pattern checks on (exposed to them via
	// EmitContext.JSEngine). Nil fails pattern checks closed with the
	// FMT004 missing-runtime diagnostic.
	JSEngine jsengine.Engine
	// PatternSampleCount / PatternGenFailures mirror the RenderOpts fields
	// of the same names (exposed via EmitContext) — the pattern emitter's
	// FMT005 lane reads them at emit time.
	PatternSampleCount int
	PatternGenFailures map[string]string
	// CrossFamilyDeps records the cross-family RT lookups this function
	// reaches via registerRTLookup — childIDs whose family-tag prefix
	// differs from this walker's own InnerPrefix (e.g. a prepareForJson /
	// toBinary / validationErrors body referencing `val_<member>` for union
	// member discrimination). Same-family lookups already flow through
	// RTDependencies and are NOT duplicated here. Unlike RTDependencies
	// this list is NOT consumed by emission/topo decisions today — it is
	// captured so a later demand-scoping step can follow the edges to the
	// referenced family. See docs/CROSS-FAMILY-RT-DEPS.md.
	CrossFamilyDeps []string
	// IsUnsupported flips to true the first time compileNode sees a
	// CodeNS sentinel anywhere in the traversal. Once set it stays
	// true — the rest of the compile becomes a no-op (compileNode
	// short-circuits without descending) UNLESS a parent absorbs the
	// unsupported child via AbsorbUnsupported (property/PropertySignature
	// emits are the only positions that absorb). The renderer reads
	// IsUnsupported + UnsupportedLeaf at end-of-walk to decide whether
	// to emit a regular factory or an alwaysThrow entry.
	IsUnsupported bool
	// UnsupportedLeaf points at the RunType whose emit first returned
	// CodeNS. The renderer feeds it to the active emitter's
	// DiagCodeForLeaf to derive the per-family code that goes into the
	// alwaysThrow init() call. First-encounter wins; AbsorbUnsupported
	// clears this slot so a sibling property's own CodeNS can be tracked
	// independently. See docs/UNSUPPORTED-KINDS.md.
	UnsupportedLeaf *protocol.RunType

	// DiagSink is the destination for compile-time diagnostics this
	// walker emits via EmitDiagnostic. Nil when the caller doesn't want
	// diagnostics surfaced (e.g. unit tests that exercise the walker
	// without provenance threading). The renderer sets it from
	// RenderOpts.DiagSink so the dispatcher can collect everything in
	// a single response.Diagnostics slice.
	DiagSink *[]diagnostics.Diagnostic
	// rootProvenance is the list of marker call sites that reference
	// the root RunType being walked. EmitDiagnostic fans out one
	// Diagnostic per site so the user gets one entry per actionable
	// call (per user direction: dedup is one-per-call-site, not
	// one-per-typeid).
	rootProvenance []diagnostics.Site
	// diagSeen prevents a single walk from emitting the same diagnostic
	// code twice — without this, a deep tree with multiple unsupported
	// leaves of the same kind would surface duplicate diagnostics for
	// the same call site.
	diagSeen map[string]bool

	// facts is the per-dispatch memo for the canonical-node subtree
	// predicates (isJsonCompatible / isExtraProof). Nil disables
	// memoization (hand-constructed unit-test walkers). Shared across
	// every family render of one dispatch — the predicates are pure
	// functions of a canonical node's reachable subgraph, independent of
	// emitter and parent (the canonical-node rule).
	facts *FactsTable
	// inlineCtx is reused across every dispatch call: the IsRTInlined
	// predicate completes synchronously before any child dispatch runs,
	// so one instance per walker is safe — only RT is re-pointed per node.
	inlineCtx InlineContext
	// ctxPool recycles EmitContext instances LIFO across dispatch calls.
	// A parent's context stays checked out while its children compile,
	// so a pooled instance can never alias a live frame.
	ctxPool []*EmitContext
	// disableNoopElision turns OFF the dispatch-time noop gate (the
	// NoopTypePredicate check that composes around external children whose
	// entry would be the family identity). Test-only escape hatch: the
	// predicate↔emit agreement harness compiles ground-truth bodies with
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
	factNoopFormatTransform
	factNoopCompactFromJson
	factNoopToBinary
	factNoopHasUnknownKeys
	factNoopCloneExactShape
	factNoopUnknownKeyErrors
	factNoopUnknownKeysToUndefined
	factNoopUnknownKeysToUndefinedWire
	factCount
)

// FactsTable memoizes the canonical-node subtree predicates — one bool
// verdict per (fact, node ID). Only COMPLETED top-level walks are stored
// (an intermediate node's in-walk value can depend on a cycle-back
// assumption for an ancestor still on the stack); a stored verdict is
// context-free because the predicate names the node's full reachable
// set, which is the same no matter which parent asked. Owned by the
// dispatcher (one per dispatch, threaded via RenderOpts.Facts).
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

// Merge folds other's verdicts into table. Used by the parallel render
// path: each family render memoizes predicates in its own shard, and the
// dispatcher merges the shards after the join so the validate render (and
// its collection passes) start from the union. A verdict is a pure
// function of the canonical node, so a key present in both shards always
// carries the same value — the union is conflict-free. Nil-safe on both
// sides.
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

// memberLabel returns a short human-readable identifier for a member-
// shaped RunType (Property / Method / PropertySignature / …). Falls
// back to "<anonymous>" when the runtime carries no Name — defensive
// for the rare anonymous-callable case.
func memberLabel(rt *protocol.RunType) string {
	if rt == nil || rt.Name == "" {
		return "<anonymous>"
	}
	return rt.Name
}

// AbsorbUnsupported clears the unsupported-leaf latch so the walker
// can continue compiling sibling entries. Used by property/
// PropertySignature emits when they choose to drop an unsupported
// child rather than propagate the CodeNS up. After absorption, the
// parent returns plain empty code (CodeS or CodeE) so its own parent's
// chain treats the slot as a no-op. See docs/UNSUPPORTED-KINDS.md
// for the two-rule model.
func (w *Walker) AbsorbUnsupported() {
	w.IsUnsupported = false
	w.UnsupportedLeaf = nil
}

// EmitDiagnostic records a compile-time diagnostic against every call
// site that references the root RunType being walked. No-op when DiagSink
// is unwired, the code has already fired for this walk, or no provenance
// sites are known. `args` are positional substitution values for the
// JS-side catalog template — most sites pass 0 or 1 args (a property name
// or a kind label); pass an empty list for arg-less codes.
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
	if len(w.rootProvenance) == 0 {
		// No call sites known — skip rather than emit a Diagnostic
		// without provenance (would render as filePath="" in the
		// canonical line, useless to the user).
		return
	}
	for _, site := range w.rootProvenance {
		*w.DiagSink = append(*w.DiagSink, diagnostics.New(code, site, args...))
	}
}

// NewWalker primes a Walker for the given RunType + Emitter pair.
// The Vλl starts at the first arg's Name (the base value accessor);
// pushStack will refresh it on every descent.
func NewWalker(rt *protocol.RunType, fnName string, emitter Emitter) *Walker {
	args := emitter.Args()
	if len(args) == 0 {
		panic("typefns: emitter returned empty Args()")
	}
	// fnName is `<innerPrefix><rt.ID>` (e.g. "validate_abc123"); use it
	// directly as the namespaced RTFnHash so the cache key matches
	// the factory registration site. Renderer also sets InnerPrefix
	// explicitly (so dispatch can build namespaced childIDs for
	// non-root nodes too).
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

// nextLocalVar hands out a fresh local-variable name (e.g. "i0",
// "res0", "i1", "res1"). Mirrors getLocalVarName (per-prefix
// counter) — each prefix has its own numbering so a single Emit can
// allocate `i0` + `res0` without the second name colliding with the
// first.
func (w *Walker) nextLocalVar(prefix string) string {
	count := w.localVarCounters[prefix]
	w.localVarCounters[prefix] = count + 1
	return prefix + strconv.Itoa(count)
}

// setChildAccessor records the accessor for the next pushStack. The
// caller is the current top-of-stack emit; the value persists on
// that frame until the next setChildAccessor call (so a parent can
// iterate children, setting the accessor before each CompileChild).
func (w *Walker) setChildAccessor(accessor string) {
	if len(w.Stack) == 0 {
		return
	}
	w.Stack[len(w.Stack)-1].ChildAccessor = accessor
}

// setChildPathLiteral records the path-literal contribution for the
// next pushStack. Symmetric with setChildAccessor — collection
// emitters (Array, Object, Tuple, IndexSignature, …) set it before
// each CompileChild so the child frame's PathLiteral on push reflects
// the property name, tuple index, or loop counter the child sits at
// relative to the parent.
func (w *Walker) setChildPathLiteral(literal string) {
	if len(w.Stack) == 0 {
		return
	}
	w.Stack[len(w.Stack)-1].ChildPathLiteral = literal
}

// accessPath returns the non-empty PathLiteral segments from the
// current stack in push order. Used by typeerrors emitters to build
// the static access-path argument when calling pf_newRunTypeErr.
// Returns the literals as raw JS expressions (e.g. ["'name'", "i0",
// "0"]) so callers can fold in extra trailing segments before joining.
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

// AddPureFnDependency records a (namespace, fnName, filePath) triple
// that the emitted RT function will reach via `utl.getPureFn(<ns>,
// <fn>)`. Idempotent on the full triple.
//
// No source-file walk happens here — recording is O(1) and the deps
// ride the wire (protocol.PureFnDep / entry SoftDeps) for the module
// emitter. At render time the resolver drains a live body's recorded
// deps into its PureFnDepSink and cross-checks each against the
// program-wide registration set: a dep that never registered surfaces
// build-time as PFE9012 (purefunctions.ValidatePureFnDependencies),
// so the missing pure fn no longer waits until `utl.getPureFn` throws
// at runtime.
func (w *Walker) AddPureFnDependency(namespace, fnName, filePath string) {
	for _, dep := range w.PureFnDependencies {
		if dep.Namespace == namespace && dep.FunctionName == fnName && dep.FilePath == filePath {
			return
		}
	}
	w.PureFnDependencies = append(w.PureFnDependencies, protocol.PureFnDep{
		Namespace:    namespace,
		FunctionName: fnName,
		FilePath:     filePath,
	})
}

// UpdateDependencies records childHash as a rt dependency unless it's
// a noop or already tracked. Called from the walker's dispatch site
// whenever a composite emit fires a dependency-call into a non-inlined
// child; the parent's `rtDependencies` slot on the rendered
// RTCompiledFn entry then reflects every nested validator the body
// reaches via `utl.getRT(<hash>)(…)`. Mirrors
// BaseFnCompiler.updateDependencies (rtFnCompiler.ts:222).
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

// recordCrossFamilyDep records childID as a cross-family RT lookup edge,
// deduped, when (and only when) it is cross-family — i.e. childID's
// family-tag prefix differs from this walker's own InnerPrefix. Called from
// registerRTLookup (the single choke point both emitDepCall's same-family
// calls and the union/validationErrors cross-family lookups funnel through), so
// the prefix gate here is what separates the two: same-family lookups stay
// in RTDependencies (recorded via UpdateDependencies), cross-family ones
// land here. The InnerPrefix=="" case (hand-constructed walkers in unit
// tests that never set a prefix) records nothing. Dedup mirrors
// UpdateDependencies. Additive capture only: nothing in the renderer's
// emission/topo path reads this list today. See docs/CROSS-FAMILY-RT-DEPS.md.
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

// Compile walks RootType, drives the Emitter, finalizes, and returns
// the inner function declaration `function <FnName>(<args>){<body>}`
// ready for WrapClosure. isNoop reports whether the body was a noop
// (renderer skips noop factories). isUnsupported reports whether the
// compile reached a kind with no emit implementation — when true,
// the renderer skips this RunType entirely (no factory at all);
// the runtime cache miss is caught by createValidateFn's
// hasRunType-but-no-rt fallback.
//
// Mirrors BaseFnCompiler.compile (rtFnCompiler.ts:279) +
// createRTFunction (rtFnCompiler.ts:175) + getRTFnCode helper
// (createRTFunction.ts:71).
func (w *Walker) Compile() (innerFnDecl string, isNoop bool, isUnsupported bool) {
	w.compileNode(w.RootType, CodeE)
	if w.IsUnsupported {
		return "", false, true
	}
	finalCode, noop := w.Emitter.Finalize(w.Code)
	w.Code = finalCode
	// An armed (rejectCircularRefs) variant over a cycle-capable type prepends
	// the inline circular-reference guard. The guard runs a restricted walk of
	// the value against the baked skeleton and applies the family's reaction
	// (return false / push a `circular` error / throw) before the real body — so
	// the finalized body is never an identity noop.
	if w.RejectCircular && w.CircularSkeleton != nil {
		w.emitCircularGuard()
		noop = false
	}
	innerFnDecl = fmt.Sprintf("function %s(%s){%s}", w.FnName, w.argsList(true), w.Code)
	return innerFnDecl, noop, false
}

// CircularGuardReactor is implemented by the walker-path CircularGuarded
// emitters (validate / validationErrors / toBinary). EmitCircularGuard returns
// the guard statement prepended to the body: it runs `<fcpAlias>(v, <skeletonConst>)`
// and, on a non-null result (a detected cycle), applies the family's policy —
// `return false` (validate), record a `{expected:'circular'}` error and return
// (validationErrors), or throw a CircularReferenceError (encoders). The JSON
// composites don't use the walker; they inline their own guard in
// json_composite.go.
type CircularGuardReactor interface {
	EmitCircularGuard(fcpAlias, skeletonConst string) string
}

// circularGuardContextKey names the closure-hoisted skeleton const shared by the
// guard prologue.
const circularGuardContextKey = "cyP"

// circularPureFnFilePath is the canonical source path rt::findCycle's body
// is registered under (the built-in pure-fn table extracts it from here).
const circularPureFnFilePath = "packages/ts-runtypes/src/runtypes/circular-pure-fns.ts"

// emitCircularGuard hoists the rt::findCycle alias + the baked skeleton
// const into the factory closure and prepends the family's guard statement to
// the body. No-op when the emitter is not a CircularGuardReactor (only the
// guarded families implement it).
func (w *Walker) emitCircularGuard() {
	reactor, ok := w.Emitter.(CircularGuardReactor)
	if !ok {
		return
	}
	ctx := w.getEmitContext(w.Vλl)
	defer w.putEmitContext(ctx)
	fcpAlias := ctx.UsePureFn(corePureFnNamespace, "findCycle", circularPureFnFilePath)
	ctx.SetContextItem(circularGuardContextKey, "const "+circularGuardContextKey+" = "+w.CircularSkeleton.JSLiteral())
	w.Code = reactor.EmitCircularGuard(fcpAlias, circularGuardContextKey) + w.Code
}

// ContextLines returns the `const xyz = …` declarations in insertion
// order, joined with `;\n` so WrapClosure's prologue can embed them
// verbatim. Empty when no emitter has registered any context item
// (the v1 KindString path).
func (w *Walker) ContextLines() string {
	return strings.Join(w.ContextItems.ordered(), ";\n")
}

// compileNode is the recursive entry point. The Walker pushes the
// frame, dispatches through the Emitter, reconciles the result
// against the parent's expected code type, then pops.
//
// KindRef sentinels are transparently resolved against w.RefTable
// before pushStack — the per-kind switch always sees the real
// RunType, never the ref placeholder.
//
// Short-circuits when w.IsUnsupported is already true: the rest of
// the traversal becomes a no-op. Returns CodeNS so any caller in
// the recursion chain (a compound parent's emit calling
// CompileChild) sees the sentinel and propagates it without
// emitting its own code. This is the "don't traverse children of
// an unsupported node" optimization — once one descendant fails,
// no further work happens in the subtree.
func (w *Walker) compileNode(rt *protocol.RunType, expectedCType CodeType) RTCode {
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
		// First unsupported leaf wins — capture the RunType so the
		// renderer can derive a per-family diag code via the active
		// emitter's DiagCodeForLeaf. Latch IsUnsupported so subsequent
		// CompileChild calls short-circuit at the top of this function.
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

// resolveRef dereferences KindRef sentinels via the walker's RefTable.
// Non-ref inputs pass through unchanged. A ref with no matching entry
// in the table returns nil so the caller can short-circuit; this
// scenario indicates a dangling cache reference and is treated as a
// noop here (the caller is responsible for surfacing that as an error
// at a higher level if needed).
func (w *Walker) resolveRef(rt *protocol.RunType) *protocol.RunType {
	if rt == nil || rt.Kind != protocol.KindRef {
		return rt
	}
	if w.RefTable == nil {
		return nil
	}
	return w.RefTable[rt.ID]
}

// dispatch decides between inline emission and a dependency call.
// Mirrors BaseFnCompiler.shouldCallDependency
// (rtFnCompiler.ts:218–221): a dependency call happens only when
// BOTH (a) the predicate says the node is NOT inline-cheap AND
// (b) the walker is past depth 1 — the root always inlines so the
// top-level factory has a body. The dependency branch invokes the
// emitter's EmitDependencyCall, records the child hash on the
// walker's rtDependencies, and returns the call expression. The
// child's compile is deferred until that child gets its own
// top-level render pass.
//
// Conceptually dispatch heads a THREE-tier ladder: tier 1 is the
// external dep call below (`<childID>.fn(accessor)` through the
// registry); tier 2 is the inline splice; tier 3 — an inlined child
// whose CodeS/CodeRB block lands in an expression slot — hoists the
// block into a factory-local context function (`ctxFn<N>(accessor)`,
// see wrapAsCtxFn). Tier 3 physically lives one level up in
// handleCodeInterpolation because it needs the POST-emit CodeType,
// which only exists after Emit returns.
//
// `childIsNoop` is passed as false at the dispatch site — the
// child's noop status isn't known here (the child hasn't been
// compiled yet on this code path). The renderer's later
// dangling-dep cascade in module.go drops any parent whose
// recorded deps don't have a matching emitted factory, so this
// over-recording can't cause runtime breakage.
func (w *Walker) dispatch(rt *protocol.RunType, expectedCType CodeType) RTCode {
	w.inlineCtx.RT = rt
	// inlineWouldCycle is the walker's own cycle breaker: a node whose id is
	// ALREADY on the walk stack must go external no matter what the
	// predicate says, or the inline expansion recurses forever. Needed
	// because IsCircular marks only the serializer's RE-ENTRY node — an
	// anonymous wrapper union (`U | undefined` from an optional `a?: U`
	// property) participates in the cycle UNFLAGGED, and union flattening
	// walks through the flagged node into its members without dispatching
	// it. Under default mode every compound is external so revisits became
	// self-calls; allInternal needs the explicit guard.
	// An overridden child (a node carrying an overrideX<T>(pureFn) for THIS
	// family) MUST go external so the parent references its cfn-redirect entry
	// — inlining would splice the structural body and the override would never
	// run. Forces the dep path AND skips the noop/identity short-circuits below
	// (the override is by definition not the family identity). Root frames
	// (Stack == 1) are never redirected here — an overridden root's entry is
	// substituted upstream in renderEntry.
	overrideChild := len(w.Stack) > 1 && w.OverrideOpKey != "" && rt.Overrides[w.OverrideOpKey] != ""
	shouldDepend := overrideChild || ((!w.Emitter.IsRTInlined(&w.inlineCtx) || w.inlineWouldCycle(rt.ID)) && len(w.Stack) > 1)
	if shouldDepend {
		// If the child kind isn't supported by this emitter, the
		// renderer's outer loop won't emit a factory for it. Emitting
		// a dependency call that references a non-existent factory
		// would cascade-remove the parent at the dangling-dep stage.
		// Treat unsupported non-inlined children as inline-noop
		// (return empty code) so the parent's emit can compose
		// around them — for serializer pairs, this matches the
		// "skip the slot, let identity restore the original" semantic
		// the JS-side value-level primitive fallback (getRTFunction's identity default) already uses for
		// missing entries.
		if !w.Emitter.Supports(rt) {
			return RTCode{Code: "", Type: expectedCType}
		}
		// Noop gate: when the emitter's semantic predicate proves the child's
		// entry would be the family identity (a pure function of the child's
		// type graph, cycle-safe), composing a dep call around it is dead
		// weight: the import, the `utl.getRT` context line, and the per-call
		// indirection all do nothing. Compose around the child exactly like
		// the unsupported case above — empty code, no dep recorded, no import
		// emitted. This is also what collapses circular identity bodies: the
		// cycle re-entry dispatches here, the predicate proves the cycle
		// noop, and the surrounding loop/property code folds away. Gated on
		// NoopComposeAround — NOT the universal NoopTypePredicate — because
		// empty code only composes correctly for value-transform families
		// (stringifyJson needs the child's JSON fragment, fromBinary its byte
		// reads; see the NoopComposeAround doc).
		// Override children skip the noop gate: the override body is the user's
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
		// Namespaced childID — matches the factory registration key
		// (the parent emit looks the child up via utl.getRT(childID)
		// and the JS-side cache stores entries under the namespaced
		// hash). InnerPrefix is empty for hand-constructed walkers
		// (unit tests), in which case childID stays bare.
		childID := w.InnerPrefix + rt.ID
		emitCtx := w.getEmitContext(w.Vλl)
		callCode := w.Emitter.EmitDependencyCall(rt, childID, emitCtx)
		w.putEmitContext(emitCtx)
		// Mirror updateDependencies (rtFnCompiler.ts:222):
		// record the child hash on the walker (dedup is internal).
		// Children the noop gate above proved identity never reach this
		// line; for emitters without a predicate the compiled noop bit
		// isn't known at dispatch time, so false is passed and the dep IS
		// recorded — the reference behaviour for any non-noop child.
		w.UpdateDependencies(childID, false)
		return RTCode{Code: callCode, Type: CodeE}
	}
	emitCtx := w.getEmitContext(w.Vλl)
	result := w.Emitter.Emit(rt, emitCtx, expectedCType)
	w.putEmitContext(emitCtx)
	return result
}

// inlineWouldCycle reports whether id already sits on the walk stack BELOW
// the current frame (compileNode pushes the node before dispatching, so the
// top frame is the node itself). A revisit means inlining would expand the
// cycle forever — dispatch forces the external dependency-call path instead,
// which resolves as a self-call when the revisited node is this walker's own
// root (exactly how default mode breaks every compound cycle).
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

// pushStack snapshots the current Vλl onto a new stack frame.
// getStackVλl computes the descendant accessor from the (pre-push)
// stack; for atomic-root that's just the function's first argument.
// Mirrors rtFnCompiler.ts:148.
func (w *Walker) pushStack(newChild *protocol.RunType) {
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

// popStack mirrors rtFnCompiler.ts:161. Stores the emitted code on
// the Walker (so the root frame's code survives as w.Code at the end)
// and restores Vλl to the parent frame's snapshot.
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

// getStackVλl computes the child accessor for the next pushStack.
// Reads the parent frame's ChildAccessor when set (member kinds —
// array, object, tuple — register it before calling CompileChild),
// otherwise falls back to the parent's own Vλl. With an empty stack
// the function's first arg name is the base accessor. Mirrors
// rtFnCompiler.ts:734 — the parent's `useArrayAccessor()` /
// `getChildVarName()` are folded into the precomputed accessor
// string the parent emit pushes.
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

// argsList renders the function's parameter list. With
// includeDefaults=true the output mirrors getRTFnArgs
// (createRTFunction.ts:79): each parameter is `name` when it has no
// default, or `name=defaultValue` when it does.
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

// handleCodeInterpolation reconciles a child emitter's CodeType with
// the expected parent CodeType. Mirrors rtFnCompiler.ts:452. For an
// atomic root with a JS expression the wrapping logic produces
// `return <expression>`; statement/return-block roots get the
// matching wrap. Non-root branches handle the cross-product of
// parent and child code types so composite emits can compose
// CodeE / CodeS / CodeRB children without surprises.
// Returns the reconciled fragment WITH its post-reconciliation CodeType: a
// block hoisted to a context fn comes back as the CodeE call expression it
// now is. Keeping the child's stale type here is what the old IIFE
// double-wrap guard silently absorbed — a wrapped `ctxFn0(v)` re-entering a
// parent reconciliation as "CodeRB" would re-wrap verbatim and drop the
// value (`function(v){ctxFn0(v)}`, no return).
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

// returnName is the JS identifier to return when a statement-shaped
// body needs an explicit `return …` appended. Delegates to the
// emitter's ReturnName() so per-fn divergence stays inside the per-fn
// file — validate / prepareForJson / format / mock return their first
// arg (`v`), validationErrors returns its accumulator (`er`).
func (w *Walker) returnName() string {
	return w.Emitter.ReturnName()
}

// normaliseWhitespace mirrors rtFnCompiler.ts:417 — collapse runs of
// spaces/tabs to one and collapse repeated `;` to a single `;`.
// Newlines are preserved (template literals in future emitters may
// rely on them being significant).
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

// addFullStop ensures a snippet ends with a `;` so the next statement
// can concatenate without ambiguity. Mirrors rtFnCompiler.ts:395.
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

// createFnInContext registers `const ctxFn<N> = function(<params>){…}` as a
// context line and returns the `ctxFn<N>(<args>)` call expression for the
// parent's expression slot. The factory-LOCAL analogue of registerRTLookup +
// emitDepCall: the block becomes a named closure created ONCE per factory
// materialization instead of an IIFE allocated on every call (the old
// callSelfInvoking wrap, now fully superseded). CodeS bodies get a `return `
// prepended (the call yields the statement's value); CodeRB bodies carry
// their own returns and move verbatim. params/args are positional pairs;
// params deliberately shadow the enclosing bindings by NAME so the body text
// moves unchanged (every outer reference in a moved block is read-only —
// context consts resolve through the closure and are never passed).
func (w *Walker) createFnInContext(body string, codeType CodeType, params, args []string) string {
	name := w.nextLocalVar("ctxFn")
	prefix := ""
	if codeType != CodeRB {
		prefix = "return "
	}
	w.ContextItems.set(name, "const "+name+" = function("+strings.Join(params, ",")+"){"+prefix+body+"}")
	return name + "(" + strings.Join(args, ",") + ")"
}

// wrapAsCtxFn hoists an inline child's statement/return-block into a context
// function and returns the call expression — tier 3 of the dispatch ladder
// (tier 1 = external `<childID>.fn(accessor)` dep call, tier 2 = inline
// splice). Params are the emitter's own Args plus any walker-allocated loop
// counters appearing free in the current accessor; args mirror them by name.
// Over-passing an in-scope name the body never reads is harmless; context
// consts arrive via closure.
func (w *Walker) wrapAsCtxFn(child RTCode) RTCode {
	body := strings.TrimSpace(child.Code)
	if body == "" {
		return RTCode{Code: "", Type: CodeE}
	}
	params := w.ctxFnParamsFor(w.Vλl)
	return RTCode{Code: w.createFnInContext(body, child.Type, params, params), Type: CodeE}
}

// ctxFnParamsFor derives the parameter list for a context function whose
// body was emitted against accessor: the emitter's own Args plus any
// walker-allocated loop counters appearing free in the accessor. Same-named
// params shadow the enclosing bindings, so the args list is the params list.
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

// identifiersIn extracts the JS identifiers of an accessor expression in
// first-appearance order, skipping property names (tokens preceded by a
// `.`). Quoted bracket keys may surface as false candidates; harmless —
// the isAllocatedLocal gate plus over-passing safety make any false
// positive a no-op.
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

// isAllocatedLocal reports whether name was handed out by nextLocalVar
// during this walk: the trailing-digit suffix is split off and the prefix's
// counter consulted — allocation-driven, so a user property that merely
// LOOKS like a counter (`i0` with no `i` allocations) never matches.
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
