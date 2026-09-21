// Package typeid computes the structural type id from a tsgo *checker.Type: two structurally-equal types
// (identical kind + identical children, regardless of alias name) produce the same string. Atomic kinds are
// `String(kind)`, collections compose `${kind}{c1,c2,…}`, and cyclic clusters are CANONICALIZED
// (canonicalize.go) so the id depends on the type's bisimulation class alone, never on the walk entry point,
// checker node interning or union member order. The output feeds internal/cachegen/hashid.Dict.Unique,
// which shortens it to the id that travels on the wire.
package typeid

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/bundled"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// Computer is the stateful walker: results memoise on the *checker.Type pointer and stack is the live
// recursion path used for cycle detection.
type Computer struct {
	typeChecker *checker.Checker
	cache       map[*checker.Type]string
	stack       []*checker.Type
	// lowlinks parallels stack: the shallowest stack index any cycle token minted inside frame i targets (own
	// index when none). lowlinks[i] < i means the frame's `$<kind>_<relDepth>` tokens dangle ABOVE it, so its
	// string is meaningful only at this exact stack position and must never enter the pointer cache — a later
	// hit at a different depth would splice in a relative depth baked elsewhere. Frames whose tokens all close
	// at or below themselves are position-independent and cache as before.
	lowlinks []int
	// cycleTargets parallels stack: true when some back-edge minted inside the frame TARGETS it. The lowlink
	// alone cannot mark a direct self-loop's root (the token's target IS the top frame, so nothing lowers); a
	// frame that pops cacheable AND targeted is an SCC root, the trigger for canonicalization.
	cycleTargets []bool
	// pendingMarks parallels stack (len(pending) at push time); pending collects every pointer popped
	// UNCACHEABLE, and the SCC root's pop consumes its segment (pending[mark:]) as the cluster membership.
	// Nested disjoint SCCs consume their own segments first, so marks nest LIFO; a cacheable non-root pop
	// always finds its segment empty (an unconsumed entry would have poisoned this frame's lowlink).
	pendingMarks []int
	pending      []*checker.Type
	// templating, when non-nil, redirects Compute for in-cluster children to slot placeholders
	// (canonicalize.go) — the template-extraction re-walk.
	templating *clusterState
	// alias maps a block's COMPOSITION SPELLING (its template with every slot substituted by the target block's
	// full canonical id — exactly what an acyclic parent pointing into the cluster composes as its dispatch
	// base) to the block's canonical ids. An entry container that sits OUTSIDE the pointer-SCC (the interned
	// `Array<N0>` under `Record<string, N0[]>`) is bisimilar to a cluster block but never triggers
	// canonicalization itself; remapping it at its cacheable pop is what converges the two authoring forms.
	alias map[string]aliasEntry
	// depthExceeded latches when Compute hits maxWalkDepth: a type graph that instantiates a fresh
	// *checker.Type per level (defeating the pointer cycle guard), or a genuinely unbounded one. The walk
	// returns a deterministic sentinel instead of recursing to a fatal stack overflow, and the cache layer
	// reads this flag to raise a diagnostic. Reset per top-level walk via ResetDepthExceeded.
	depthExceeded bool
	// depthCulprit is the cause classified when depthExceeded latches: the name of the type whose
	// instantiations dominate the overflowing path (a SELF-INSTANTIATING GENERIC, surfaced as MKR009), or ""
	// when no single named type dominates (plain too-deep nesting — MKR008).
	depthCulprit string
	// walkOps counts Compute's real expansions since the last ResetDepthExceeded. The depth cap alone cannot
	// bound a graph that mints a fresh *checker.Type per member query at SHALLOW depth (tsgo's error-recovered
	// parse of a truncated source): no pointer repeats, so every subtree re-expands per query — bounded depth,
	// exponential time. maxWalkOps latches the same discard-and-diagnose path as the depth cap.
	walkOps int
	// overrides folds `overrideX<T>(pureFn)` registrations into the structural id. Keyed by a node's BASE
	// structural key (children's overrides already folded, this node's own NOT yet) → family op key → cfn body
	// hash. When a node's base key matches, OverrideStructuralKey's `|cfn:…` suffix is appended, so an
	// overridden type hashes differently from its twin and the override propagates to every containing type.
	// Nil = no folding (the plain id path; unit tests / the early override-collection pass).
	overrides map[string]map[string]string
}

// New returns a fresh Computer bound to the supplied checker.
func New(typeChecker *checker.Checker) *Computer {
	return &Computer{typeChecker: typeChecker, cache: make(map[*checker.Type]string)}
}

// NewWithOverrides returns a Computer that folds the supplied override map (see the `overrides` field) into
// every structural id, once the early override-collection pass has built it.
func NewWithOverrides(typeChecker *checker.Checker, overrides map[string]map[string]string) *Computer {
	return &Computer{typeChecker: typeChecker, cache: make(map[*checker.Type]string), overrides: overrides}
}

// maxWalkDepth caps Computer.Compute's recursion: far above any legitimate structural nesting, yet ~100x
// below the frame count that overflows a 1 GB goroutine stack. Only graphs that TODAY stack-overflow ever
// reach it, so no computable structural id changes.
const maxWalkDepth = 512

// maxWalkOps caps one top-level walk's TOTAL expansions (see walkOps). A legitimate walk expands each
// distinct node once, so only a walk whose pointers never repeat can reach it, and such a walk never
// terminates usefully. A var, not a const, ONLY so the package's own tests can lower it (export_test.go):
// a fresh-minting graph goes DEEP before it goes wide, so maxWalkDepth always latches first and the ops
// branch is otherwise unreachable from a fixture. Nothing in production ever assigns it.
var maxWalkOps = 1_000_000

// depthSentinel is the deterministic string Compute returns at maxWalkDepth. It never ships as a real id —
// the cache layer detects the depthExceeded flag and diagnoses instead — it only has to be stable so
// sink-less walks stay reproducible.
const depthSentinel = "$depth"

// DepthExceeded reports whether any Compute call hit maxWalkDepth since the last ResetDepthExceeded.
func (computer *Computer) DepthExceeded() bool { return computer.depthExceeded }

// DepthCulprit returns the name of the self-instantiating generic dominating the walk when the depth cap
// latched, or "" when the overflow has no single named cause.
func (computer *Computer) DepthCulprit() string { return computer.depthCulprit }

// ResetDepthExceeded clears the depth-cap latch before a fresh top-level walk.
func (computer *Computer) ResetDepthExceeded() {
	computer.depthExceeded = false
	computer.depthCulprit = ""
	computer.walkOps = 0
}

// Compute returns the structural id of tsType. Safe to call repeatedly — results are cached.
func (computer *Computer) Compute(tsType *checker.Type) string {
	if tsType == nil {
		return strconv.Itoa(int(reflection.KindNever))
	}
	// A latched walk is already doomed (its ids are discarded and the site diagnosed as MKR008/MKR009), so
	// composing more text is waste, and on a fresh-type-minting graph EXPONENTIAL waste: unwind immediately.
	if computer.depthExceeded {
		return depthSentinel
	}
	// Template-extraction re-walk (canonicalize.go): ONE check here covers every child-resolution site in
	// dispatch and its helpers.
	if st := computer.templating; st != nil {
		if slot, ok := st.slotOf[tsType]; ok {
			return slotMark(slot)
		}
	}
	// Cycle BEFORE cache: a node can be both cached and on the live stack when a re-entrant walk
	// (BaseStructuralKey at override-stamp time) pushes an already-cached node, and the cached FINAL id must
	// not stand in for the back-edge or the re-entrant walk composes a different base key than the fold pass
	// did. Ordinary walks write the cache only at pop, so the order costs nothing.
	if index := computer.stackIndex(tsType); index >= 0 {
		return computer.cycleRef(tsType, index)
	}
	if cached, ok := computer.cache[tsType]; ok {
		return cached
	}
	// Walk backstop: a graph that mints a FRESH *checker.Type on every member query (lib.esnext's
	// IteratorObject family, a self-instantiating generic, a genuinely unbounded alias) never repeats a
	// pointer, so neither the cache nor stackIndex ever fires. maxWalkDepth caps the live recursion (a deep
	// spiral would overflow the Go stack, which is fatal and uncatchable); maxWalkOps caps total expansions,
	// for a SHALLOW fresh-minting graph that re-expands every subtree per query instead. Both sit after the
	// cheap cache/cycle returns and before the push. The flag is authoritative and the sentinel is never
	// cached: once latched, the entry check above unwinds every remaining Compute immediately.
	computer.walkOps++
	if len(computer.stack) >= maxWalkDepth || computer.walkOps >= maxWalkOps {
		if !computer.depthExceeded {
			computer.depthExceeded = true
			computer.depthCulprit = computer.classifySpiral()
		}
		return depthSentinel
	}
	computer.pushFrame(tsType)
	base := computer.dispatch(tsType)
	cacheable, wasTarget, mark := computer.popFrame()
	if !cacheable {
		// Cycle interior — this raw text is meaningful only at the current stack position and the SCC root's
		// pop discards it. Record the pointer so the root's canonicalization includes it in the cluster. No
		// override fold (doomed text).
		computer.pending = append(computer.pending, tsType)
		return base
	}
	if wasTarget && !computer.depthExceeded {
		// SCC root: the canonical cluster emission replaces the raw entry-dependent unroll, and
		// canonicalizeCluster caches every member.
		return computer.canonicalizeCluster(tsType, mark, base).final
	}
	// Fold this node's own override suffix AFTER dispatch: `base` already carries the children's (composed
	// via their Compute calls) and the override map is keyed by exactly this base key. The alias probe comes
	// first: a node whose base equals a canonical block's composition spelling is bisimilar to that block (an
	// entry container outside the pointer-SCC) and must take the block's id, or bisimilar roots diverge.
	if entry, ok := computer.alias[base]; ok {
		return computer.commitCache(tsType, entry.final)
	}
	return computer.commitCache(tsType, base+computer.overrideSuffix(base))
}

// commitCache writes the pop-time pointer-cache entry and returns id, EXCEPT while the depth latch is set.
// The sentinel is never cached, but an ANCESTOR of the frame that returned it composes it into its own
// text, and the latch clears per top-level walk — so without this gate a later, non-latching walk could
// cache-hit that ancestor and commit a `$depth`-poisoned string as a real id, with no diagnostic. Skipping
// the write is a safe overapproximation: frames popped BEFORE the latch cannot hold the sentinel and only
// lose a cache entry, and a walk that latches is discarded and diagnosed anyway (MKR008 / MKR009).
func (computer *Computer) commitCache(tsType *checker.Type, id string) string {
	if !computer.depthExceeded {
		computer.cache[tsType] = id
	}
	return id
}

func (computer *Computer) stackIndex(tsType *checker.Type) int {
	for i := len(computer.stack) - 1; i >= 0; i-- {
		if computer.stack[i] == tsType {
			return i
		}
	}
	return -1
}

// pushFrame opens a walk frame: every pusher must use it, since a stack-only push desyncs the parallel
// slices and the pop-time propagation would index past their ends.
func (computer *Computer) pushFrame(tsType *checker.Type) {
	computer.stack = append(computer.stack, tsType)
	computer.lowlinks = append(computer.lowlinks, len(computer.stack)-1)
	computer.cycleTargets = append(computer.cycleTargets, false)
	computer.pendingMarks = append(computer.pendingMarks, len(computer.pending))
}

// popFrame closes the top frame. cacheable reports whether the composed string is position-independent
// (every cycle token minted beneath it closed at or below the frame); wasTarget whether some back-edge
// targeted this frame (cacheable && wasTarget = an SCC root, the canonicalization trigger); mark is the
// frame's pending watermark (the root's cluster is pending[mark:]). A still-dangling token propagates into
// the parent frame's lowlink; a frame whose lowlink equals its own index closes here and must NOT
// propagate, since poisoning the parent would needlessly stop it caching.
func (computer *Computer) popFrame() (cacheable bool, wasTarget bool, mark int) {
	top := len(computer.stack) - 1
	low := computer.lowlinks[top]
	wasTarget = computer.cycleTargets[top]
	mark = computer.pendingMarks[top]
	computer.stack = computer.stack[:top]
	computer.lowlinks = computer.lowlinks[:top]
	computer.cycleTargets = computer.cycleTargets[:top]
	computer.pendingMarks = computer.pendingMarks[:top]
	if low >= top {
		return true, wasTarget, mark
	}
	if top > 0 {
		computer.lowlinks[top-1] = min(computer.lowlinks[top-1], low)
	}
	return false, wasTarget, mark
}

// classifySpiral names the depth cap's CAUSE: when instantiations of one named type dominate the
// overflowing stack the graph is a SELF-INSTANTIATING GENERIC — every level is a fresh *checker.Type of
// the same declaration, so the pointer cycle guard can never close — and the diagnostic names the type
// rather than reporting "too deeply nested". Instantiations share their declaration's symbol, so frames
// bucket by symbol pointer (alias symbol preferred: an alias instantiation's own symbol is the anonymous
// literal). Runs once, at latch time, past the cap, so it cannot misclassify a working type.
func (computer *Computer) classifySpiral() string {
	counts := map[*ast.Symbol]int{}
	names := map[*ast.Symbol]string{}
	for _, frame := range computer.stack {
		symbol, name := spiralIdentity(frame)
		if symbol == nil {
			continue
		}
		counts[symbol]++
		names[symbol] = name
	}
	var best *ast.Symbol
	bestCount := 0
	for symbol, count := range counts {
		if count > bestCount {
			best, bestCount = symbol, count
		}
	}
	// A handful of same-symbol frames is normal composition; a dominating symbol on a CAPPED stack is the
	// spiral. 8 sits far above any terminating same-symbol nesting that could share one active path.
	if bestCount >= 8 {
		return names[best]
	}
	return ""
}

// bundledLibPrefix is the directory the bundled tsgo standard library lives in. Membership of that
// directory is the only trustworthy "this is a lib file" test: a basename check alone also matches a
// consumer's own `src/lib.d.ts`, and telling that author "this is not a problem in your code" about a type
// they wrote is worse than saying nothing. A var, not a const, so the package's own tests can stage a lib
// file (export_test.go); nothing in production ever assigns it.
var bundledLibPrefix = tspath.NormalizePath(bundled.LibPath())

// declaringLibFile returns the standard-library file a symbol is declared in, or "" when it is declared
// anywhere else. EVERY declaration must be a lib one: a symbol that merges a lib declaration with a user's
// own augmentation is partly the author's, so it keeps MKR009's actionable advice. Only the basename is
// reported — the absolute path is a bundled tsgo location that means nothing to a consumer.
func declaringLibFile(symbol *ast.Symbol) string {
	if symbol == nil || len(symbol.Declarations) == 0 {
		return ""
	}
	libFile := ""
	for _, declaration := range symbol.Declarations {
		sourceFile := ast.GetSourceFileOfNode(declaration)
		if sourceFile == nil {
			return ""
		}
		fileName := sourceFile.FileName()
		if !strings.HasPrefix(tspath.NormalizePath(fileName), bundledLibPrefix) || !isDefaultLibFileName(fileName) {
			return ""
		}
		if libFile == "" {
			libFile = fileName
			if i := strings.LastIndexAny(fileName, "/\\"); i >= 0 {
				libFile = fileName[i+1:]
			}
		}
	}
	return libFile
}

// spiralIdentity buckets a stack frame for spiral classification: the alias symbol when the type came from
// a named alias instantiation, else the type's own symbol. Internal/anonymous names identify nothing.
func spiralIdentity(tsType *checker.Type) (*ast.Symbol, string) {
	if alias := checker.Type_alias(tsType); alias != nil {
		if symbol := alias.Symbol(); symbol != nil && userVisibleName(symbol.Name) {
			return symbol, symbol.Name
		}
	}
	if symbol := tsType.Symbol(); symbol != nil && userVisibleName(symbol.Name) {
		return symbol, symbol.Name
	}
	return nil, ""
}

// userVisibleName rejects tsgo-internal symbol names (late-bound 0xFE prefix,
// "__type"/"__object" anonymous literals) that would make a useless culprit.
func userVisibleName(name string) bool {
	return name != "" && name[0] != 0xFE && !strings.HasPrefix(name, "__")
}

func (computer *Computer) cycleRef(tsType *checker.Type, index int) string {
	kind := KindOf(computer.typeChecker, tsType)
	// Depth RELATIVE to the cycle target, NOT the absolute stack index: the absolute position depends on where
	// the walk first reaches the recursive type, so a type-first recursive type and an equivalent value-first
	// `Recursive<Body>` used to get different back-edge tokens and thus different ids. Relative depth is a
	// structural quantity, so the two authoring paths converge.
	// The token is BARE — no structural anchor. Raw-walk text containing tokens never survives (the SCC root's
	// pop replaces it with the canonical cluster emission, whose own tokens are relative to the canonical
	// emission stack), and a token is always followed by a composition delimiter (`,` `}` `]` `?` `...` or
	// end), never a digit, so `$30_2` cannot prefix-collide with `$30_21`.
	relDepth := len(computer.stack) - index
	// Every frame between the back-edge and its target composes a string meaningful only at its current stack
	// position — record the escape on the top frame so popFrame keeps those out of the pointer cache, and mark
	// the TARGET frame so its pop triggers canonicalization (the lowlink alone cannot mark a direct self-loop's
	// root). Lives here, not in Compute, so BaseStructuralKey's cycle path registers both too.
	if top := len(computer.lowlinks) - 1; top >= 0 && index < computer.lowlinks[top] {
		computer.lowlinks[top] = index
	}
	computer.cycleTargets[index] = true
	return "$" + strconv.Itoa(int(kind)) + "_" + strconv.Itoa(relDepth)
}

func (computer *Computer) dispatch(tsType *checker.Type) string {
	kind := KindOf(computer.typeChecker, tsType)
	flags := tsType.Flags()

	if flags&checker.TypeFlagsStringLiteral != 0 ||
		flags&checker.TypeFlagsNumberLiteral != 0 ||
		flags&checker.TypeFlagsBooleanLiteral != 0 ||
		flags&checker.TypeFlagsBigIntLiteral != 0 {
		return strconv.Itoa(int(kind)) + ":" + computer.lit(literalString(tsType, computer.typeChecker))
	}

	// Unique symbol literal — also a literal kind in the reflection model,
	// but tsgo's flag is `UniqueESSymbol` not a `*Literal`.
	if flags&checker.TypeFlagsUniqueESSymbol != 0 {
		name := ""
		if symbol := tsType.Symbol(); symbol != nil {
			name = symbol.Name
		}
		return strconv.Itoa(int(kind)) + ":sym:" + computer.lit(name)
	}

	switch kind {
	case reflection.KindAny, reflection.KindUnknown, reflection.KindNever, reflection.KindVoid,
		reflection.KindNull, reflection.KindUndefined,
		reflection.KindString, reflection.KindNumber, reflection.KindBoolean,
		reflection.KindBigInt, reflection.KindSymbol, reflection.KindObject,
		reflection.KindRegexp:
		return strconv.Itoa(int(kind))
	}

	// Enum — a bare `String(kind)` collapses every enum onto one id, so the typeName + sorted member values
	// are appended to keep two declarations apart at the cache level. (The reference runtime gets away with
	// the bare-kind id because each enum is handed a distinct Type object per declaration.)
	if flags&checker.TypeFlagsEnum != 0 || flags&checker.TypeFlagsEnumLike != 0 || flags&checker.TypeFlagsEnumLiteral != 0 {
		return strconv.Itoa(int(reflection.KindEnum)) + ":" + computer.lit(enumDiscriminator(tsType, computer.typeChecker))
	}

	// Template literal — the literal text segments plus the placeholder span ids, so two distinct patterns
	// (`` `api/${number}` `` vs `` `(${number})` ``) don't collide.
	if flags&checker.TypeFlagsTemplateLiteral != 0 {
		tpl := tsType.AsTemplateLiteralType()
		if tpl != nil {
			texts := tpl.Texts()
			spanIDs := computer.childIDs(tpl.Types())
			var b strings.Builder
			b.WriteString(strconv.Itoa(int(reflection.KindTemplateLiteral)))
			b.WriteString(":tl:")
			for i, text := range texts {
				if i > 0 {
					b.WriteByte('|')
				}
				b.WriteString(computer.lit(text))
			}
			b.WriteByte('#')
			for i, id := range spanIDs {
				if i > 0 {
					b.WriteByte(',')
				}
				b.WriteString(id)
			}
			return b.String()
		}
	}

	if flags&checker.TypeFlagsUnion != 0 {
		// Sort member ids so union member ORDER doesn't affect the structural id (objects already sort in
		// memberIDs). This converges a value-first `union([...])` with the written `A | B | …` even when tsgo
		// computes the two in different member orders, and dedups `A | B` with `B | A`. Runtime member precedence
		// is unaffected — it is driven by node.Children downstream (union_safeorder.go), not by this id.
		members := tsType.Distributed()
		unionIDs := computer.childIDs(members)
		return collectionJoined(int(kind), computer.sortedJoin(unionIDs), false)
	}
	if flags&checker.TypeFlagsIntersection != 0 {
		return computer.collapsedIntersectionID(tsType)
	}

	// Object-flavoured: tuple / array / promise / function / class / objectLiteral.
	if flags&checker.TypeFlagsObject != 0 {
		return computer.objectID(tsType)
	}

	return strconv.Itoa(int(kind))
}

// tupleID folds a tuple type's id — a bracket-delimited child list with each element's variadic FLAGS
// (rest / variadic) folded in. Our AOT cache is project-global, so without the flag a rest tuple
// `[number, ...string[]]` and a fixed tuple `[number, string]` both reduce to `Tuple[<number>,<string>]`,
// collide on one cache slot, and the winner gives one of them the wrong validator. Mirrors the flag
// handling in internal/cachegen/runtype/serialize.go:projectTuple.
// Element LABELS fold into the id too (`[s: string]` → `Tuple[s:5]`, unlabeled `[string]` stays
// `Tuple[5]`): canonical nodes are shared singletons and the projected node carries `children[].name`, so
// two same-shape tuples differing only in labels MUST NOT collapse onto one node whose labels come from
// whichever site was interned first. Labeled `Parameters<H>` tuples are exactly how frameworks reflect
// handler param names.
// labelOverride (one entry per element) substitutes the declaration labels — how the lifted `__rtLabels`
// sentinel folds the value-first object form onto the type-first labeled tuple's id. nil reads the
// ElementInfos labels.
func (computer *Computer) tupleID(tsType *checker.Type, labelOverride []string) string {
	typeArguments := computer.typeChecker.GetTypeArguments(tsType)
	elementInfos := tsType.TargetTupleType().ElementInfos()
	ids := make([]string, 0, len(typeArguments))
	for i, typeArgument := range typeArguments {
		optional, rest, variadic := false, false, false
		label := ""
		if i < len(elementInfos) {
			elementFlags := elementInfos[i].TupleElementFlags()
			optional = elementFlags&checker.ElementFlagsOptional != 0
			rest = elementFlags&checker.ElementFlagsRest != 0
			variadic = elementFlags&checker.ElementFlagsVariadic != 0
			label = TupleElementLabel(elementInfos[i])
		}
		if i < len(labelOverride) {
			label = labelOverride[i]
		}
		// Optional tuple slots type as `T | undefined`; strip it so the slot id matches the projected node
		// (serialize.go projectTuple does the same). Tuple slots carry no memberID/optBit, so the `?` suffix is
		// what keeps optionality in the id — otherwise `[T, U?]` and `[T, U]` collide. Rest reuses TS's `...`;
		// variadic keeps a distinct `#variadic` marker since it can't share `...` with rest.
		var child string
		if optional {
			child = computer.optionalChildID(typeArgument) + "?"
		} else {
			child = computer.Compute(typeArgument)
		}
		if rest {
			child += "..."
		}
		if variadic {
			child += "#variadic"
		}
		if label != "" {
			child = computer.lit(label) + ":" + child
		}
		ids = append(ids, child)
	}
	return collectionID(int(reflection.KindTuple), ids, true)
}

func (computer *Computer) objectID(tsType *checker.Type) string {
	if checker.IsTupleType(tsType) {
		return computer.tupleID(tsType, nil)
	}

	// Array. GetTypeArguments only works on TypeReference targets — an array-LIKE mapped hybrid (a mapped
	// type over `T[] & {brand}`) passes IsArrayLikeType with no reference target and would segfault the
	// checker, so gate on the Reference flag and let non-references fall through to the member walks.
	if computer.typeChecker.IsArrayLikeType(tsType) && tsType.ObjectFlags()&checker.ObjectFlagsReference != 0 {
		typeArguments := computer.typeChecker.GetTypeArguments(tsType)
		if len(typeArguments) > 0 {
			child := computer.Compute(typeArguments[0])
			return memberID(int(reflection.KindArray), "0", false, child)
		}
	}

	// Promise and PromiseLike — see reflection.PromiseGlobals.
	if symbol := tsType.Symbol(); symbol != nil && reflection.IsPromiseSymbol(symbol.Name) {
		typeArguments := computer.typeChecker.GetTypeArguments(tsType)
		if len(typeArguments) > 0 {
			child := computer.Compute(typeArguments[0])
			return memberID(int(reflection.KindPromise), "0", false, child)
		}
	}

	// Builtin Temporal types (Temporal.PlainDate, …): their structural id is the SubKind prefix, same scheme
	// as Date. Namespace-qualified detection keeps a user `PlainDate` distinct. Checked before the
	// Date/Map/Set switch since Temporal types are namespace members, not top-level.
	if info, ok := TemporalInfoForType(tsType); ok {
		return strconv.Itoa(int(info.SubKind))
	}

	// Built-in classes — Date / Map / Set — get their own subKind id: the numeric prefix is the SubKind
	// (2001 / 2002 / 2003), not KindClass.
	if symbol := tsType.Symbol(); symbol != nil {
		switch symbol.Name {
		case "Date":
			return strconv.Itoa(int(reflection.SubKindDate))
		case "Map":
			if tsType.ObjectFlags()&checker.ObjectFlagsReference != 0 {
				typeArguments := computer.typeChecker.GetTypeArguments(tsType)
				if len(typeArguments) == 2 {
					return strconv.Itoa(int(reflection.SubKindMap)) + "{" +
						strconv.Itoa(int(reflection.SubKindMapKey)) + ":" + computer.Compute(typeArguments[0]) + "," +
						strconv.Itoa(int(reflection.SubKindMapValue)) + ":" + computer.Compute(typeArguments[1]) + "}"
				}
			}
			return strconv.Itoa(int(reflection.SubKindMap))
		case "Set":
			if tsType.ObjectFlags()&checker.ObjectFlagsReference != 0 {
				typeArguments := computer.typeChecker.GetTypeArguments(tsType)
				if len(typeArguments) == 1 {
					return strconv.Itoa(int(reflection.SubKindSet)) + "{" +
						strconv.Itoa(int(reflection.SubKindSetItem)) + ":" + computer.Compute(typeArguments[0]) + "}"
				}
			}
			return strconv.Itoa(int(reflection.SubKindSet))
		}
	}
	// Non-serialisable globals (Error, WeakMap, typed arrays, …) are tagged with SubKindNonSerializable and
	// use that as their structural prefix, matching the `subKind || kind` rule. Identity is the CONSTRUCTOR
	// NAME (plus any type arguments), never the lib member surface, in lockstep with projectClass: walking
	// the members made the id UNSTABLE — a typed array's `subarray()` returns its own type, and whether the
	// checker hands back the SAME pointer (cycle token) or a fresh instantiation (one more unrolled level)
	// depends on how the type was reached, so `Uint8Array` and `typeof someUint8Array` hashed differently —
	// and it discriminated no better (`Error` and `EvalError` are structurally identical).
	// Matched through NotDataBuiltinOf, so a type qualifies by its own name OR by inheriting from one of the
	// base-set families. The id keeps the TYPE's name, not the matched base's, and the `#name` suffix is what
	// keeps two distinct `Uint8Array` subclasses apart (classRef uses the matched base's name — projectClass).
	if _, ok := NotDataBuiltinOf(computer.typeChecker, tsType); ok {
		id := strconv.Itoa(int(reflection.SubKindNonSerializable))
		if tsType.ObjectFlags()&checker.ObjectFlagsReference != 0 {
			if typeArguments := computer.typeChecker.GetTypeArguments(tsType); len(typeArguments) > 0 {
				// Positional, not sorted — argument ORDER is part of the type.
				id = collectionJoined(int(reflection.SubKindNonSerializable),
					strings.Join(computer.childIDs(typeArguments), ","), false)
			}
		}
		// Same `#name` suffix convention as the class branch below: outside the `{…}` group so it cannot be
		// mistaken for a member.
		name := ""
		if symbol := tsType.Symbol(); symbol != nil {
			name = symbol.Name
		}
		return id + "#" + computer.lit(name)
	}
	if isClass(tsType) {
		// Generic user class — property ids (sorted for determinism) PLUS the class name. Unlike an interface or
		// object literal (pure structural data, name irrelevant), a class routes reconstruction through the
		// name-keyed class-serializer registry, so two structurally-identical classes with different names must
		// NOT share a structural id: they would collapse to one cache entry that bakes in a single name and
		// mis-routes the other's (de)serialization, and in a union both members become one node the `rt$classID`
		// discriminant can't tell apart. Anonymous classes (TS internal symbol name, 0xFE prefix) are never
		// registered, so they keep the nameless structural id.
		ids := computer.memberIDs(tsType, true)
		id := collectionJoined(int(reflection.KindClass), computer.sortedJoin(ids), false)
		// Append the class name OUTSIDE the `{…}` member group: a bare `name:` token inside could collide with a
		// property literally named `name`, and `#` never appears in a member id.
		if symbol := tsType.Symbol(); symbol != nil && symbol.Name != "" && symbol.Name[0] != 0xFE {
			id += "#" + computer.lit(symbol.Name)
		}
		return id
	}

	// Free function — bare callable with no own properties. The full signature shape has to be encoded, or
	// every function in the program would collide on a single structural id (and dedup to one cache entry).
	callSignatures := computer.typeChecker.GetSignaturesOfType(tsType, checker.SignatureKindCall)
	properties := computer.typeChecker.GetPropertiesOfType(tsType)
	if len(callSignatures) > 0 && len(properties) == 0 {
		return computer.signatureID(callSignatures[0], reflection.KindFunction, "")
	}

	ids := computer.memberIDs(tsType, false)
	if len(callSignatures) > 0 {
		for _, signature := range callSignatures {
			ids = append(ids, computer.signatureID(signature, reflection.KindCallSignature, ""))
		}
	}
	return collectionJoined(int(reflection.KindObjectLiteral), computer.sortedJoin(ids), false)
}

// memberIDs returns the member id list UNSORTED — callers compose it through sortedJoin (ordinary walks
// sort immediately, template walks defer to emission; see canonicalize.go).
func (computer *Computer) memberIDs(tsType *checker.Type, asClass bool) []string {
	properties := computer.typeChecker.GetPropertiesOfType(tsType)
	out := make([]string, 0, len(properties))
	for _, propertySymbol := range properties {
		// The format / slot sentinels are never real properties: when an object ∧ sentinel intersection is
		// hashed through the merged property walk they must stay out of the member list (the collapse folds them
		// as a format key / slot fold instead). Mirrors the symbol-aware skip in serialize.go's
		// projectMembersInto, which matches the late-bound `unique symbol` spelling too.
		if IsFormatSentinelPropName(propertySymbol.Name) ||
			IsContainsSentinelPropName(propertySymbol.Name) || IsLabelsSentinelPropName(propertySymbol.Name) {
			continue
		}
		out = append(out, computer.memberID(propertySymbol, asClass))
	}
	for _, indexInfo := range computer.typeChecker.GetIndexInfosOfType(tsType) {
		keyID := computer.Compute(indexInfo.KeyType())
		valueID := computer.Compute(indexInfo.ValueType())
		out = append(out, strconv.Itoa(int(reflection.KindIndexSignature))+":"+keyID+":"+valueID)
	}
	return out
}

func (computer *Computer) memberID(symbol *ast.Symbol, asClass bool) string {
	propertyType := computer.typeChecker.GetTypeOfSymbol(symbol)
	memberName := computer.lit(stableMemberName(symbol.Name))
	// A non-enumerable-guarded member (lib-global-inherited or `@nonEnumerable`) is treated as optional in the
	// projected shape — the wire may omit it — so its `optional` id bit folds the guard in, matching
	// serialize.go's appendProperty. The separate `#ne` bit keeps a guarded-optional member distinct from a
	// plain declared-optional one (enumerability check vs `!== undefined`).
	guarded := IsNonEnumerable(symbol)
	optional := symbol.Flags&ast.SymbolFlagsOptional != 0 || guarded
	// Readonly must be part of the structural id — `{a: string}` and `{readonly a: string}` are different
	// shapes and must not share a cache slot. Mirrors the resolution rule in
	// internal/cachegen/runtype/modifiers.go:applyMemberModifiers — trust CheckFlagsReadonly for
	// mapped/synthetic symbols (the AST declaration would lie), otherwise honor CheckFlags AND the AST
	// modifier together.
	const checkFlagsSynthOrMapped = ast.CheckFlagsMapped | ast.CheckFlagsSyntheticProperty | ast.CheckFlagsSyntheticMethod
	var readonly bool
	if symbol.CheckFlags&checkFlagsSynthOrMapped != 0 {
		readonly = symbol.CheckFlags&ast.CheckFlagsReadonly != 0
	} else {
		if symbol.CheckFlags&ast.CheckFlagsReadonly != 0 {
			readonly = true
		}
		if !readonly {
			for _, declaration := range symbol.Declarations {
				if declaration == nil {
					continue
				}
				if ast.GetCombinedModifierFlags(declaration)&ast.ModifierFlagsReadonly != 0 {
					readonly = true
					break
				}
			}
		}
	}

	// A property whose type is a single-call-signature function with no other members maps to the reflection
	// `method` form.
	if propertyType != nil {
		signatures := computer.typeChecker.GetSignaturesOfType(propertyType, checker.SignatureKindCall)
		if len(signatures) > 0 && len(computer.typeChecker.GetPropertiesOfType(propertyType)) == 0 {
			kind := reflection.KindMethodSignature
			if asClass {
				kind = reflection.KindMethod
			}
			return computer.signatureID(signatures[0], kind, memberName) + optBit(optional) + readonlyBit(readonly) + guardedBit(guarded)
		}
	}

	kind := reflection.KindPropertySignature
	if asClass {
		kind = reflection.KindProperty
	}
	// Optional properties carry `T | undefined` at the symbol-type layer and the `optional` bit IS the
	// "undefined-permitted" signal, so resolve the child WITHOUT undefined: a RECURSIVE optional
	// self/cross-reference then closes on the inner type instead of a wrapping union node, matching the
	// serializer (which projects optional members through the same typeid.ResolveOptionalChild). Otherwise the
	// structural id and the projected node disagree on the optional child's shape, and a recursive optional
	// property's back-edge binds inconsistently between the type-first and value-first paths. The if/else
	// matters: an unconditional walk of the raw wrapper polluted the pointer cache with back-edge depths
	// inflated by the discarded union frame.
	var child string
	if optional {
		child = computer.optionalChildID(propertyType)
	} else {
		child = computer.Compute(propertyType)
	}
	return memberID(int(kind), memberName, optional, child) + readonlyBit(readonly) + guardedBit(guarded)
}

// stableMemberName strips the checker-instance symbol id off a late-bound symbol-keyed member name
// ("\xFE@toPrimitive@5" → "\xFE@toPrimitive") so structural ids never embed which checker (or session)
// materialized the member. Replicated from internal/cachegen/runtype/serialize.go (the typeid subpackage
// can't import its parent without an import cycle) — keep them in sync.
func stableMemberName(name string) string {
	if len(name) < 2 || name[0] != 0xFE || name[1] != '@' {
		return name
	}
	at := strings.LastIndexByte(name, '@')
	if at <= 1 || at == len(name)-1 {
		return name
	}
	for i := at + 1; i < len(name); i++ {
		if name[i] < '0' || name[i] > '9' {
			return name
		}
	}
	return name[:at]
}

func readonlyBit(readonly bool) string {
	if readonly {
		return "#ro"
	}
	return ""
}

// guardedBit folds the non-enumerable-guard flag (IsNonEnumerable) into the structural id so a guarded
// member gets a distinct id from an unguarded twin: the runtime serialization differs (enumerability-gated
// write) and the per-ID noop memo keys on this id. Appended after readonlyBit; `#` never appears in a
// member name, so the suffix can't collide.
func guardedBit(guarded bool) string {
	if guarded {
		return "#ne"
	}
	return ""
}

func (computer *Computer) signatureID(signature *checker.Signature, kind reflection.ReflectionKind, name string) string {
	params := signature.Parameters()
	parts := make([]string, 0, len(params)+1)
	position := 0
	// Param NAMES fold into the id alongside the position (`18{0:a|<child>,…}`): the projected parameter nodes
	// carry `name` and canonical nodes are shared singletons, so two same-shape signatures differing only in
	// param names must not collapse onto one node whose names come from whichever site was interned first
	// (same rule as tuple labels above). Positions stay in the id, so the naming is additive; params are
	// behaviour-neutral (notSupported) but their names are graph DATA.
	// A trailing FIXED rest-tuple param (`(...args: [a: A, b: B])`, the shape a value-first
	// `func({params: [a: A, b: B], ret: R})` brands) is expanded into positional element params carrying the
	// tuple LABELS as their names; the `__rtLabels` carrier expands the same way with the lifted labels. So
	// both value-first spellings match the written `(a: A, b: B)`. An UNLABELED value-first tuple expands with
	// empty names and matches only other unlabeled forms — sound, just less dedup.
	for i, paramSymbol := range params {
		paramType := computer.typeChecker.GetTypeOfSymbol(paramSymbol)
		if i == len(params)-1 && isRestParam(paramSymbol) {
			restTuple, labelOverride := paramType, []string(nil)
			if !checker.IsTupleType(restTuple) {
				if carrierTuple, labels, ok := SplitLabeledTupleIntersection(computer.typeChecker, paramType); ok {
					restTuple, labelOverride = carrierTuple, labels
				}
			}
			if checker.IsTupleType(restTuple) {
				if elements, ok := computer.fixedTupleParamElements(restTuple, labelOverride); ok {
					for _, element := range elements {
						parts = append(parts, memberID(int(reflection.KindParameter), paramNameSlot(position, computer.lit(element.label)), false, element.id))
						position++
					}
					continue
				}
			}
		}
		optional := paramSymbol.Flags&ast.SymbolFlagsOptional != 0
		// Optional params type as `T | undefined`; strip it so the param id matches the projected node
		// (serialize.go projectSignatureInto does the same).
		var child string
		if optional {
			child = computer.optionalChildID(paramType)
		} else {
			child = computer.Compute(paramType)
		}
		if isRestParam(paramSymbol) {
			child += "..."
		}
		parts = append(parts, memberID(int(reflection.KindParameter), paramNameSlot(position, computer.lit(paramSymbol.Name)), optional, child))
		position++
	}
	parts = append(parts, "->"+computer.Compute(computer.typeChecker.GetReturnTypeOfSignature(signature)))
	body := "{" + strings.Join(parts, ",") + "}"
	if name != "" {
		return strconv.Itoa(int(kind)) + name + body
	}
	return strconv.Itoa(int(kind)) + body
}

// paramNameSlot renders a signature parameter's member-name slot: the position, plus `:<name>` when the
// parameter has a declared name. Position stays first so unlabeled value-first expansions keep their
// historical `18{0|…}` shape and ordering is explicit in the id.
func paramNameSlot(position int, name string) string {
	if name == "" {
		return strconv.Itoa(position)
	}
	return strconv.Itoa(position) + ":" + name
}

// tupleParamElement is one expanded rest-tuple parameter: the element's type id plus its tuple LABEL
// (empty when unlabeled), which becomes the expanded param's name.
type tupleParamElement struct {
	id    string
	label string
}

// fixedTupleParamElements returns the element type ids + labels of tupleType when it is a FIXED tuple (no
// rest / variadic element), for expanding a trailing rest-tuple parameter into positional params. ok=false
// for a tuple carrying a variadic-ish element (a genuine variadic signature), which is kept as a single
// `...` entry instead. labelOverride (the lifted `__rtLabels` sentinel, one entry per element) substitutes
// the declaration labels; nil reads the ElementInfos labels.
func (computer *Computer) fixedTupleParamElements(tupleType *checker.Type, labelOverride []string) ([]tupleParamElement, bool) {
	typeArguments := computer.typeChecker.GetTypeArguments(tupleType)
	elementInfos := tupleType.TargetTupleType().ElementInfos()
	elements := make([]tupleParamElement, 0, len(typeArguments))
	for i, typeArgument := range typeArguments {
		label := ""
		if i < len(elementInfos) {
			flags := elementInfos[i].TupleElementFlags()
			if flags&checker.ElementFlagsRest != 0 || flags&checker.ElementFlagsVariadic != 0 {
				return nil, false
			}
			label = TupleElementLabel(elementInfos[i])
		}
		if i < len(labelOverride) {
			label = labelOverride[i]
		}
		elements = append(elements, tupleParamElement{id: computer.Compute(typeArgument), label: label})
	}
	return elements, true
}

// TupleElementLabel extracts a tuple element's declared label (`[s: string]` → "s"), or "" when unlabeled.
// The label lives on the labeled Parameter / NamedTupleMember AST node's inner binding name — mirrors
// serialize.go:projectTuple and the tsgo checker's getTupleElementLabel. Exported for the serialize side's
// rest-tuple parameter expansion, whose label reads must match this fold exactly.
func TupleElementLabel(info checker.TupleElementInfo) string {
	labelDecl := info.LabeledDeclaration()
	if labelDecl == nil {
		return ""
	}
	nameNode := labelDecl.Name()
	if nameNode == nil {
		return ""
	}
	return nameNode.Text()
}

// NonEnumerableTagName is the JSDoc tag (`@nonEnumerable`) a user writes to mark a property whose runtime
// own-descriptor is non-enumerable — the type-aware bridge for a descriptor TS can't express (it models
// only readonly / `?`). Exported so the resolver's syntactic NE001 lint walk matches the exact tag this
// predicate reads.
const NonEnumerableTagName = "nonEnumerable"

// IsNonEnumerable reports whether a class/interface member symbol must have its by-name serialization
// gated by a runtime own-enumerability check (`Object.prototype.propertyIsEnumerable.call(v, 'k')`). Two
// cases, and BOTH require the member to be OPTIONAL in its declared type:
//
//  1. it is INHERITED from a default-lib GLOBAL type (every declaration sits inside an `interface`/`class`
//     in a `lib.*.d.ts`). Its runtime descriptor is non-enumerable (Error's `stack?` / `cause?`), so
//     materializing it by name would put data on the wire that native `JSON.stringify` omits — for a user
//     error class that means server stack traces leak by default. A subclass that REDECLARES it as its own
//     data prop (a declaration OUTSIDE a lib file) owns it and is not guarded.
//  2. it is tagged `@nonEnumerable` in JSDoc. A required tagged member is NOT guarded (the tag is ignored)
//     and the `NE001` lint rule tells the user to make it optional.
//
// The shared OPTIONAL requirement gives the invariant GUARDED ⇒ OPTIONAL-in-type, which makes `DataOnly<T>`
// sound by construction: a REQUIRED global-inherited member (Error's `name` / `message`) is always
// serialized, so the decoder's return type never over-promises a prop the wire can omit. Exported because
// the projection (serialize.go / modifiers.go) and the structural id (memberID above) MUST apply the same
// predicate or id and projection drift.
func IsNonEnumerable(symbol *ast.Symbol) bool {
	if symbol == nil {
		return false
	}
	if !isOptionalSymbol(symbol) {
		return false
	}
	return isDefaultLibGlobalMember(symbol) || hasNonEnumerableTag(symbol)
}

// isOptionalSymbol reports whether a property symbol is optional (`?`) in its declared type — the same flag
// serialize.go / memberID read for the `optional` bit. Guarding is gated on it so the guard never makes a
// REQUIRED prop absent from the wire (which would break DataOnly<T>).
func isOptionalSymbol(symbol *ast.Symbol) bool {
	return symbol.Flags&ast.SymbolFlagsOptional != 0
}

// isDefaultLibGlobalMember reports whether EVERY declaration of the member sits inside an interface or
// class declaration in a default lib file — i.e. the member is inherited from a global built-in and
// carries that type's runtime (non-enumerable) descriptor. A single declaration outside the lib (a user
// redeclaration) disqualifies it, so the class keeps ownership.
func isDefaultLibGlobalMember(symbol *ast.Symbol) bool {
	if len(symbol.Declarations) == 0 {
		return false
	}
	for _, declaration := range symbol.Declarations {
		if declaration == nil || declaration.Parent == nil {
			return false
		}
		parentKind := declaration.Parent.Kind
		if parentKind != ast.KindInterfaceDeclaration && parentKind != ast.KindClassDeclaration {
			return false
		}
		sourceFile := ast.GetSourceFileOfNode(declaration)
		if sourceFile == nil || !isDefaultLibFileName(sourceFile.FileName()) {
			return false
		}
	}
	return true
}

// hasNonEnumerableTag reports whether any declaration of the member carries a `@nonEnumerable` JSDoc tag.
// Custom tags parse as JSDocUnknownTag, so the match is on the bare tag name (no leading `@`), the same
// read the tsgolint no_deprecated rule uses.
func hasNonEnumerableTag(symbol *ast.Symbol) bool {
	for _, declaration := range symbol.Declarations {
		if declaration == nil {
			continue
		}
		for _, jsdoc := range declaration.JSDoc(nil) {
			tags := jsdoc.AsJSDoc().Tags
			if tags == nil {
				continue
			}
			for _, tag := range tags.Nodes {
				if !ast.IsJSDocUnknownTag(tag) {
					continue
				}
				tagName := tag.TagName()
				if tagName != nil && tagName.Text() == NonEnumerableTagName {
					return true
				}
			}
		}
	}
	return false
}

// isDefaultLibFileName reports whether a file name is a TypeScript default lib
// (`lib.es5.d.ts`, `lib.es2022.error.d.ts`, …) by its basename shape.
func isDefaultLibFileName(fileName string) bool {
	base := fileName
	if i := strings.LastIndexAny(base, "/\\"); i >= 0 {
		base = base[i+1:]
	}
	return strings.HasPrefix(base, "lib.") && strings.HasSuffix(base, ".d.ts")
}

// isRestParam reports whether a parameter symbol's declaration carries `...`. Replicated from
// internal/cachegen/runtype/modifiers.go (the typeid subpackage can't import its parent without a cycle).
func isRestParam(symbol *ast.Symbol) bool {
	declaration := symbol.ValueDeclaration
	if declaration == nil && len(symbol.Declarations) > 0 {
		declaration = symbol.Declarations[0]
	}
	if declaration == nil || declaration.Kind != ast.KindParameter {
		return false
	}
	return declaration.AsParameterDeclaration().DotDotDotToken != nil
}

func (computer *Computer) childIDs(types []*checker.Type) []string {
	out := make([]string, len(types))
	for i, tsType := range types {
		out[i] = computer.Compute(tsType)
	}
	return out
}

// OptionalChild is the resolved shape of an optional member's child type once the redundant `undefined` is
// removed. Exactly one field is set: Type when the child resolves to a single checker type (the common
// case — `T | undefined` → T), Members when the survivors form a genuine multi-member union with no single
// checker type to hand back (notably `T | null | undefined`, which must keep `null`) and the caller
// synthesizes a union node / structural id from them.
type OptionalChild struct {
	Type    *checker.Type
	Members []*checker.Type
}

// ResolveOptionalChild strips the redundant `undefined` an optional member's type carries (the member's
// `optional` bit already signals absence), restores a de-normalized boolean (`true | false`) back to the
// `boolean` atomic, and PRESERVES every other member — including `null`, so `x?: string | null` stays
// `string | null` and the `null | undefined` shape of `x?: null` collapses to the lone `null`. It never
// returns a type that still carries `undefined`.
// A `getTypeWithFacts(t, checker.TypeFactsNEUndefined)` shim export would collapse this whole function to
// a single checker call — exactly what the checker uses for optional-property narrowing — but the tsgolint
// shim does not expose that method today.
func ResolveOptionalChild(typeChecker *checker.Checker, childType *checker.Type) OptionalChild {
	if childType == nil || childType.Flags()&checker.TypeFlagsUnion == 0 {
		return OptionalChild{Type: childType}
	}
	parts := childType.Distributed()
	survivors := make([]*checker.Type, 0, len(parts))
	hasUndefined := false
	hasNull := false
	for _, part := range parts {
		if part.Flags()&checker.TypeFlagsUndefined != 0 {
			hasUndefined = true
			continue
		}
		if part.Flags()&checker.TypeFlagsNull != 0 {
			hasNull = true
		}
		survivors = append(survivors, part)
	}
	// No `undefined` to strip, or nothing survives (an `undefined`-only optional) — leave the type untouched.
	if !hasUndefined || len(survivors) == 0 {
		return OptionalChild{Type: childType}
	}
	if len(survivors) == 1 {
		return OptionalChild{Type: survivors[0]}
	}
	// No `null` present: GetNonNullableType strips exactly `undefined` here (there is no null to lose) and
	// re-normalizes `true | false` back to the boolean atomic.
	if !hasNull {
		return OptionalChild{Type: checker.Checker_GetNonNullableType(typeChecker, childType)}
	}
	// `null` present: keep it, collapse a `{true, false}` pair back to boolean, and synthesize a union from
	// the survivors (no single checker type expresses `T | null` without a constructor the shim doesn't have).
	members := collapseBooleanPair(typeChecker, survivors)
	if len(members) == 1 {
		return OptionalChild{Type: members[0]}
	}
	return OptionalChild{Members: members}
}

// collapseBooleanPair replaces a `{true, false}` boolean-literal pair among the members with the single
// `boolean` atomic. A union holds at most one of each boolean literal, so exactly two means the whole
// boolean.
func collapseBooleanPair(typeChecker *checker.Checker, members []*checker.Type) []*checker.Type {
	boolLiterals := 0
	for _, member := range members {
		if member.Flags()&checker.TypeFlagsBooleanLiteral != 0 {
			boolLiterals++
		}
	}
	if boolLiterals != 2 {
		return members
	}
	out := make([]*checker.Type, 0, len(members)-1)
	for _, member := range members {
		if member.Flags()&checker.TypeFlagsBooleanLiteral != 0 {
			continue
		}
		out = append(out, member)
	}
	return append(out, checker.Checker_booleanType(typeChecker))
}

// SyntheticUnionStructural returns the structural id of a union synthesized from an explicit member list —
// an optional child that keeps `null` after `undefined` is stripped. Mirrors the union case in dispatch
// (sorted member ids) so a synthesized union and a real one with the same members converge on one id.
func SyntheticUnionStructural(computer *Computer, members []*checker.Type) string {
	ids := computer.childIDs(members)
	return collectionJoined(int(reflection.KindUnion), computer.sortedJoin(ids), false)
}

// optionalChildID returns the structural id of an optional member's child with the redundant `undefined`
// stripped. Mirrors serialize.go's serializeOptionalChild so the structural id and the projected node
// agree on the child's shape (the recursion-safety contract described on memberID).
func (computer *Computer) optionalChildID(childType *checker.Type) string {
	child := ResolveOptionalChild(computer.typeChecker, childType)
	if child.Members == nil {
		return computer.Compute(child.Type)
	}
	return SyntheticUnionStructural(computer, child.Members)
}

// helpers — pure functions, no Computer state

// KindOf returns the ReflectionKind that best classifies a tsgo type. Exported because the serializer
// needs the same classification logic to produce the reflection.RunType.
func KindOf(typeChecker *checker.Checker, tsType *checker.Type) reflection.ReflectionKind {
	if tsType == nil {
		return reflection.KindNever
	}
	flags := tsType.Flags()
	switch {
	case flags&checker.TypeFlagsAny != 0:
		return reflection.KindAny
	case flags&checker.TypeFlagsUnknown != 0:
		return reflection.KindUnknown
	case flags&checker.TypeFlagsNever != 0:
		return reflection.KindNever
	case flags&checker.TypeFlagsVoid != 0:
		return reflection.KindVoid
	case flags&checker.TypeFlagsUndefined != 0:
		return reflection.KindUndefined
	case flags&checker.TypeFlagsNull != 0:
		return reflection.KindNull
	case flags&checker.TypeFlagsStringLiteral != 0,
		flags&checker.TypeFlagsNumberLiteral != 0,
		flags&checker.TypeFlagsBooleanLiteral != 0,
		flags&checker.TypeFlagsBigIntLiteral != 0,
		flags&checker.TypeFlagsUniqueESSymbol != 0:
		return reflection.KindLiteral
	case flags&checker.TypeFlagsString != 0:
		return reflection.KindString
	case flags&checker.TypeFlagsNumber != 0:
		return reflection.KindNumber
	case flags&checker.TypeFlagsBoolean != 0:
		return reflection.KindBoolean
	case flags&checker.TypeFlagsBigInt != 0:
		return reflection.KindBigInt
	case flags&checker.TypeFlagsESSymbol != 0:
		return reflection.KindSymbol
	case flags&checker.TypeFlagsEnum != 0,
		flags&checker.TypeFlagsEnumLike != 0,
		flags&checker.TypeFlagsEnumLiteral != 0:
		return reflection.KindEnum
	case flags&checker.TypeFlagsTemplateLiteral != 0:
		return reflection.KindTemplateLiteral
	case flags&checker.TypeFlagsUnion != 0:
		return reflection.KindUnion
	case flags&checker.TypeFlagsIntersection != 0:
		return reflection.KindIntersection
	case flags&checker.TypeFlagsNonPrimitive != 0:
		return reflection.KindObject
	case flags&checker.TypeFlagsObject != 0:
		return objectKind(typeChecker, tsType)
	}
	return reflection.KindUnknown
}

func objectKind(typeChecker *checker.Checker, tsType *checker.Type) reflection.ReflectionKind {
	if checker.IsTupleType(tsType) {
		return reflection.KindTuple
	}
	if typeChecker.IsArrayLikeType(tsType) {
		return reflection.KindArray
	}
	// tsgo reports builtin Temporal types (namespace-member interfaces) as object literals; we treat them as
	// classes (atomic builtins).
	if _, ok := TemporalInfoForType(tsType); ok {
		return reflection.KindClass
	}
	if symbol := tsType.Symbol(); symbol != nil {
		if reflection.IsPromiseSymbol(symbol.Name) {
			return reflection.KindPromise
		}
		switch symbol.Name {
		case "RegExp":
			return reflection.KindRegexp
		case "Date", "Map", "Set":
			// Built-in interfaces from lib.d.ts that we treat as classes.
			return reflection.KindClass
		}
	}
	if isClass(tsType) {
		return reflection.KindClass
	}
	if len(typeChecker.GetSignaturesOfType(tsType, checker.SignatureKindCall)) > 0 &&
		len(typeChecker.GetPropertiesOfType(tsType)) == 0 {
		return reflection.KindFunction
	}
	return reflection.KindObjectLiteral
}

func isClass(tsType *checker.Type) bool {
	flags := tsType.ObjectFlags()
	if flags&checker.ObjectFlagsClass != 0 {
		return true
	}
	if flags&checker.ObjectFlagsReference != 0 {
		if target := tsType.Target(); target != nil && target.ObjectFlags()&checker.ObjectFlagsClass != 0 {
			return true
		}
	}
	return false
}

// collectionID composes a structural id with the given numeric prefix. It takes a bare int because the
// prefix may be either a ReflectionKind or a ReflectionSubKind, per the `subKind || kind` rule.
func collectionID(prefix int, children []string, brackets bool) string {
	return collectionJoined(prefix, strings.Join(children, ","), brackets)
}

// collectionJoined is collectionID over an already-joined child list — the form the content-sorted
// composites use so sortedJoin can defer their ordering to canonical emission in template mode.
func collectionJoined(prefix int, joined string, brackets bool) string {
	if brackets {
		return strconv.Itoa(prefix) + "[" + joined + "]"
	}
	return strconv.Itoa(prefix) + "{" + joined + "}"
}

func memberID(prefix int, name string, optional bool, child string) string {
	return strconv.Itoa(prefix) + ":" + name + optBit(optional) + ":" + child
}

func optBit(optional bool) string {
	if optional {
		return "?"
	}
	return ""
}

// enumDiscriminator returns "<typeName>:<member1=value1>,…" (members sorted by name) so two enums with
// different shapes get different structural ids. Literal values are read directly because TypeToString
// collapses both a numeric `0` and a string `"red"` to the alias name `Color.Red`.
func enumDiscriminator(tsType *checker.Type, typeChecker *checker.Checker) string {
	name := ""
	if symbol := tsType.Symbol(); symbol != nil {
		name = symbol.Name
	}
	parts := []string{name}
	if symbol := tsType.Symbol(); symbol != nil && symbol.Exports != nil {
		members := make([]string, 0, len(symbol.Exports))
		for memberName, memberSymbol := range symbol.Exports {
			if memberSymbol == nil || memberSymbol.ValueDeclaration == nil {
				continue
			}
			value := "?"
			if memberType := typeChecker.GetTypeOfSymbol(memberSymbol); memberType != nil {
				if memberType.Flags()&checker.TypeFlagsLiteral != 0 {
					value = stringifyLiteralValue(memberType.AsLiteralType().Value())
				} else {
					value = typeChecker.TypeToString(memberType)
				}
			}
			members = append(members, memberName+"="+value)
		}
		sort.Strings(members)
		parts = append(parts, members...)
	}
	return strings.Join(parts, ",")
}

// stringifyLiteralValue gives a canonical form for a reflection literal value (string / number / bigint /
// bool), for structural id composition.
func stringifyLiteralValue(value any) string {
	switch typed := value.(type) {
	case string:
		return strconv.Quote(typed)
	case bool:
		if typed {
			return "true"
		}
		return "false"
	default:
		return fmt.Sprintf("%v", value)
	}
}

func literalString(tsType *checker.Type, typeChecker *checker.Checker) string {
	flags := tsType.Flags()
	if flags&checker.TypeFlagsBooleanLiteral != 0 {
		return typeChecker.TypeToString(tsType)
	}
	if flags&checker.TypeFlagsStringLiteral != 0 {
		if value, ok := tsType.AsLiteralType().Value().(string); ok {
			return value
		}
	}
	// A numeric / bigint ENUM member's TypeToString is the member NAME ("Color.Red"), not its value — read the
	// underlying value so it shares the structural id of the equivalent plain literal (both validate the same
	// number) and the value-first `RT.enum(MyEnum)` and `RT.enum({record})` forms converge. (String enum
	// members already returned above; the serialize-side projector strips the name the same way.)
	if flags&checker.TypeFlagsEnumLiteral != 0 {
		if value := tsType.AsLiteralType().Value(); value != nil {
			return fmt.Sprintf("%v", value)
		}
	}
	// Fall through: TypeToString gives a stable canonical form for number, bigint and any other literal.
	return typeChecker.TypeToString(tsType)
}

// TemporalInfoForType returns the reflection.TemporalInfo for a *checker.Type that resolves to a builtin
// Temporal type (e.g. `Temporal.PlainDate`), or ok=false otherwise. Detection is namespace-qualified: the
// symbol's name must match a registry entry AND its parent must be the `Temporal` namespace, so a user type
// named `PlainDate` never matches. Shared by the serialize-side projector and the structural-id computer.
func TemporalInfoForType(tsType *checker.Type) (reflection.TemporalInfo, bool) {
	if tsType == nil {
		return reflection.TemporalInfo{}, false
	}
	symbol := tsType.Symbol()
	if symbol == nil || symbol.Parent == nil || symbol.Parent.Name != reflection.TemporalNamespace {
		return reflection.TemporalInfo{}, false
	}
	return reflection.TemporalInfoByName(symbol.Name)
}
