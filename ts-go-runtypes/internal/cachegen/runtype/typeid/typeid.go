// Package typeid computes the structural type id directly from a tsgo
// *checker.Type. The output mirrors `_createTypeId` in
// (ref: packages/run-types/src/lib/typeId.ts) so two structurally-equal types
// (identical kind + identical children, regardless of alias name) produce the
// same string. Atomic kinds are just `String(kind)`; collections compose
// `${kind}{c1,c2,…}`; cyclic clusters are CANONICALIZED (canonicalize.go):
// partition refinement over per-member templates yields the bisimulation
// quotient, and each block's id is a deterministic rooted unroll whose
// back-edges are bare `$<kind>_<relDepth>` tokens relative to the emission
// stack — so the id is a function of the type's bisimulation class alone,
// independent of walk entry point, checker node interning, and union member
// order.
//
// Output is fed into `internal/cachegen/hashid.Dict.Unique` to produce the short hash
// id that travels on the wire.
package typeid

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// Computer is the stateful walker. Memoises results on *checker.Type pointer
// to avoid re-walking. Stack tracks the active recursion path for cycle
// detection (mirrors the `checkCircularAndGetRefId` algorithm).
type Computer struct {
	typeChecker *checker.Checker
	cache       map[*checker.Type]string
	stack       []*checker.Type
	// lowlinks parallels stack: lowlinks[i] is the shallowest stack index any
	// cycle token minted inside frame i's open interval targets (own index when
	// none). A frame that pops with lowlinks[i] < i composed a string whose
	// back-edge tokens dangle ABOVE it — the `$<kind>_<relDepth>` depths are
	// meaningful only at this exact stack position, so the string must never
	// enter the pointer cache: a later cache hit at a different depth would
	// splice a relative depth baked elsewhere (the interned-vs-cloned shared
	// recursive container divergence). Frames whose tokens all close at or
	// below themselves are position-independent and cache as before.
	lowlinks []int
	// cycleTargets parallels stack: true when some back-edge minted inside the
	// frame's open interval TARGETS it. The lowlink alone cannot mark a direct
	// self-loop's root (the token's target IS the top frame, so no lowering
	// happens), and a frame that pops cacheable AND targeted is an SCC root —
	// the trigger for canonicalization.
	cycleTargets []bool
	// pendingMarks parallels stack: len(pending) at push time. pending collects
	// every pointer popped UNCACHEABLE (a cycle-interior node); the SCC root's
	// pop consumes its segment (pending[mark:]) as the cluster membership.
	// Nested disjoint SCCs consume their own segments first, so marks nest
	// LIFO; a cacheable non-root pop always finds its segment empty (an
	// unconsumed entry would have poisoned this frame's lowlink).
	pendingMarks []int
	pending      []*checker.Type
	// templating, when non-nil, redirects Compute for in-cluster children to
	// slot placeholders (canonicalize.go) — the template-extraction re-walk.
	templating *clusterState
	// alias maps a block's COMPOSITION SPELLING (its template with every slot
	// substituted by the target block's full canonical id — exactly what an
	// acyclic parent pointing into the cluster composes as its dispatch base)
	// to the block's canonical ids. An entry container that sits OUTSIDE the
	// pointer-SCC (the interned `Array<N0>` under `Record<string, N0[]>`) is
	// bisimilar to a cluster block but never triggers canonicalization itself;
	// the alias probe at its cacheable pop remaps it, which is what makes the
	// two authoring forms of such roots converge.
	alias map[string]aliasEntry
	// depthExceeded latches when Compute hits maxWalkDepth on this computer's
	// stack — a type graph that instantiates a fresh *checker.Type per level
	// (defeating the pointer cycle guard) or is genuinely unbounded. The walk
	// returns a deterministic sentinel instead of recursing to a fatal stack
	// overflow; the cache layer reads this flag to raise a diagnostic. Reset per
	// top-level walk via ResetDepthExceeded.
	depthExceeded bool
	// depthCulprit is the cause classified when depthExceeded latches: the name
	// of the type whose instantiations dominate the overflowing walk path (a
	// SELF-INSTANTIATING GENERIC — surfaced as MKR009 naming the type), or ""
	// when no single named type dominates (plain too-deep nesting — MKR008).
	depthCulprit string
	// overrides folds `overrideX<T>(pureFn)` registrations into the structural
	// id. Keyed by a node's BASE structural key (children's overrides already
	// folded, this node's own NOT yet) → family op key → cfn body hash. When a
	// node's base key matches, OverrideStructuralKey's `|cfn:…` suffix is
	// appended, so an overridden type hashes differently from its twin and the
	// override propagates to every containing type. Nil = no folding (the plain
	// id path; unit tests / the early override-collection pass).
	overrides map[string]map[string]string
}

// New returns a fresh Computer bound to the supplied checker.
func New(typeChecker *checker.Checker) *Computer {
	return &Computer{typeChecker: typeChecker, cache: make(map[*checker.Type]string)}
}

// NewWithOverrides returns a Computer that folds the supplied override map (see
// the `overrides` field) into every structural id. Used by the main resolver
// pass once the early override-collection pass has built the map.
func NewWithOverrides(typeChecker *checker.Checker, overrides map[string]map[string]string) *Computer {
	return &Computer{typeChecker: typeChecker, cache: make(map[*checker.Type]string), overrides: overrides}
}

// maxWalkDepth caps Computer.Compute's recursion. Set generously in the
// "hundreds" — far above any legitimate structural nesting (real types rarely
// exceed a few dozen levels), yet ~100x below the frame count that overflows a
// 1 GB goroutine stack. Only graphs that TODAY stack-overflow ever reach it, so
// no computable structural id changes.
const maxWalkDepth = 512

// depthSentinel is the deterministic string Compute returns at maxWalkDepth. It
// never ships as a real id: the cache layer detects the depthExceeded flag and
// raises a diagnostic instead of committing a node. The value only needs to be
// stable so sink-less walks stay reproducible.
const depthSentinel = "$depth"

// DepthExceeded reports whether any Compute call on this computer hit
// maxWalkDepth since the last ResetDepthExceeded.
func (computer *Computer) DepthExceeded() bool { return computer.depthExceeded }

// DepthCulprit returns the cause classified when the depth cap latched: the
// name of the self-instantiating generic dominating the walk path, or "" when
// the overflow has no single named cause.
func (computer *Computer) DepthCulprit() string { return computer.depthCulprit }

// ResetDepthExceeded clears the depth-cap latch before a fresh top-level walk.
func (computer *Computer) ResetDepthExceeded() {
	computer.depthExceeded = false
	computer.depthCulprit = ""
}

// Compute returns the structural id of tsType. Safe to call repeatedly with
// the same Computer — results are cached.
func (computer *Computer) Compute(tsType *checker.Type) string {
	if tsType == nil {
		return strconv.Itoa(int(protocol.KindNever))
	}
	// Template-extraction re-walk (canonicalize.go): an in-cluster child
	// resolves to a slot placeholder instead of text, so ONE check here covers
	// every child-resolution site in dispatch and its helpers.
	if st := computer.templating; st != nil {
		if slot, ok := st.slotOf[tsType]; ok {
			return slotMark(slot)
		}
	}
	// Cycle first, cache second: a node can be BOTH cached and on the live
	// stack when a completed walk cached it and a later re-entrant walk
	// (BaseStructuralKey at override-stamp time) pushes it again — the cached
	// FINAL id must not stand in for the back-edge, or the re-entrant walk
	// composes a different base key than the fold pass did. On ordinary walks a
	// node is never both (the cache is written only at pop), so the order costs
	// nothing.
	if index := computer.stackIndex(tsType); index >= 0 {
		return computer.cycleRef(tsType, index)
	}
	if cached, ok := computer.cache[tsType]; ok {
		return cached
	}
	// Depth backstop: a graph that instantiates a FRESH *checker.Type on every
	// member query (lib.esnext's IteratorObject family; a self-instantiating
	// generic; a genuinely unbounded alias) never repeats a pointer, so neither
	// the cache nor stackIndex ever fires and the recursion would overflow the Go
	// stack (fatal, uncatchable). len(stack) is the live recursion depth, so cap
	// it here — after the cheap cache/cycle returns, before the push. The flag is
	// authoritative; the sentinel only keeps sink-less walks deterministic, and is
	// deliberately NOT cached so the same pointer reached at a shallower depth
	// elsewhere can still compute a real id.
	if len(computer.stack) >= maxWalkDepth {
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
		// Cycle interior — this raw text is only meaningful at the current
		// stack position; it composes into text that the SCC root's pop
		// discards. Record the pointer so the root's canonicalization includes
		// it in the cluster. No override fold (doomed text).
		computer.pending = append(computer.pending, tsType)
		return base
	}
	if wasTarget && !computer.depthExceeded {
		// SCC root: replace the raw entry-dependent unroll with the canonical
		// cluster emission; canonicalizeCluster caches every member.
		return computer.canonicalizeCluster(tsType, mark, base).final
	}
	// Fold this node's own override suffix AFTER dispatch: `base` already has
	// children's suffixes (composed via their Compute calls), and the override
	// map is keyed by exactly this base key. The alias probe first: a node whose
	// base equals a canonical block's composition spelling is bisimilar to that
	// block (an entry container outside the pointer-SCC) and must take the
	// block's id, or bisimilar roots composed through it would diverge.
	if entry, ok := computer.alias[base]; ok {
		computer.cache[tsType] = entry.final
		return entry.final
	}
	id := base + computer.overrideSuffix(base)
	computer.cache[tsType] = id
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

// pushFrame opens a walk frame: all parallel slices move together (every
// pusher must use this — a stack-only push desyncs the others and the
// pop-time propagation would index past their ends).
func (computer *Computer) pushFrame(tsType *checker.Type) {
	computer.stack = append(computer.stack, tsType)
	computer.lowlinks = append(computer.lowlinks, len(computer.stack)-1)
	computer.cycleTargets = append(computer.cycleTargets, false)
	computer.pendingMarks = append(computer.pendingMarks, len(computer.pending))
}

// popFrame closes the top frame. cacheable reports whether the composed
// string is position-independent (every cycle token minted beneath it closed
// at or below the frame itself); wasTarget whether some back-edge targeted
// this frame (cacheable && wasTarget = an SCC root, the canonicalization
// trigger); mark is the frame's pending watermark (the root's cluster is
// pending[mark:]). When a token still dangles above, the escape propagates
// into the parent frame's lowlink; a frame whose lowlink equals its own index
// is a self-contained cycle root and must NOT propagate (its string closes
// here — poisoning the parent would needlessly stop it caching).
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

// classifySpiral names the depth cap's CAUSE: when instantiations of one named
// type dominate the overflowing stack, the graph is a SELF-INSTANTIATING
// GENERIC — every level is a fresh *checker.Type of the same declaration (e.g.
// a generic method returning a fresh instantiation of its own container), so
// the pointer cycle guard can never close — and the diagnostic should name the
// type rather than report "too deeply nested". Instantiations share their
// declaration's symbol, so frames bucket by symbol pointer (alias symbol
// preferred: an alias instantiation's own symbol is the anonymous literal).
// Runs once, at latch time, on a stack already past the cap — legitimate types
// never reach it, so the heuristic cannot misclassify a working type.
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
	// A handful of same-symbol frames is normal composition; a dominating symbol
	// on a CAPPED stack is the spiral. 8 sits far above any terminating
	// same-symbol nesting that could share one active path below the cap.
	if bestCount >= 8 {
		return names[best]
	}
	return ""
}

// spiralIdentity buckets a stack frame for spiral classification: the alias
// symbol when the type came from a named alias instantiation, else the type's
// own (declaration) symbol. Internal/anonymous names identify nothing.
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
	// Depth RELATIVE to the cycle target (frames from the target down to this
	// back-edge), NOT the absolute stack index. The absolute position depends on
	// the session walk order (where the recursive type is first reached), so a
	// type-first recursive type and an equivalent value-first `Recursive<Body>`
	// (distinct *checker.Type pointers first reached at different depths) used to
	// get different back-edge tokens and thus different ids. Relative depth is a
	// structural quantity, so the two authoring paths converge.
	//
	// The token is BARE — no structural anchor. Raw-walk text containing tokens
	// never survives: it is discarded when the SCC root's pop replaces it with
	// the canonical cluster emission (canonicalize.go), whose own tokens are
	// depth-relative within the canonical emission stack and need no anchor
	// either (the quotient already separates distinct shapes). A token is always
	// followed by a composition delimiter (`,` `}` `]` `?` `...` or end), never
	// a digit, so `$30_2` cannot prefix-collide with `$30_21`.
	relDepth := len(computer.stack) - index
	// Every frame between the back-edge and its target composes a string that is
	// only meaningful at its current stack position — record the escape on the
	// top frame so popFrame keeps those strings out of the pointer cache, and
	// mark the TARGET frame so its pop triggers canonicalization (the lowlink
	// alone cannot mark a direct self-loop's root: the target IS the top frame,
	// so no lowering happens). Lives here (not in Compute) so BaseStructuralKey's
	// cycle path registers both too.
	if top := len(computer.lowlinks) - 1; top >= 0 && index < computer.lowlinks[top] {
		computer.lowlinks[top] = index
	}
	computer.cycleTargets[index] = true
	return "$" + strconv.Itoa(int(kind)) + "_" + strconv.Itoa(relDepth)
}

func (computer *Computer) dispatch(tsType *checker.Type) string {
	kind := KindOf(computer.typeChecker, tsType)
	flags := tsType.Flags()

	// Literal kinds carry the literal value directly.
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

	// Atomic primitives — id is just the kind number.
	switch kind {
	case protocol.KindAny, protocol.KindUnknown, protocol.KindNever, protocol.KindVoid,
		protocol.KindNull, protocol.KindUndefined,
		protocol.KindString, protocol.KindNumber, protocol.KindBoolean,
		protocol.KindBigInt, protocol.KindSymbol, protocol.KindObject,
		protocol.KindRegexp:
		return strconv.Itoa(int(kind))
	}

	// Enum — the reference algorithm uses just `String(kind)` for enums, but
	// that causes all enums to collapse to the same id. We disambiguate by
	// appending the typeName + sorted member values so two different enum
	// declarations don't dedup at the cache level. (The reference gets away
	// with the bare-kind id because each enum is handed a distinct Type object
	// per declaration at runtime — we have to dedup ourselves.)
	if flags&checker.TypeFlagsEnum != 0 || flags&checker.TypeFlagsEnumLike != 0 || flags&checker.TypeFlagsEnumLiteral != 0 {
		return strconv.Itoa(int(protocol.KindEnum)) + ":" + computer.lit(enumDiscriminator(tsType, computer.typeChecker))
	}

	// Template literal — id captures the literal text segments + the
	// placeholder span ids so two distinct patterns
	// (`` `api/${number}` `` vs `` `(${number})` ``) don't collide.
	if flags&checker.TypeFlagsTemplateLiteral != 0 {
		tpl := tsType.AsTemplateLiteralType()
		if tpl != nil {
			texts := tpl.Texts()
			spanIDs := computer.childIDs(tpl.Types())
			var b strings.Builder
			b.WriteString(strconv.Itoa(int(protocol.KindTemplateLiteral)))
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

	// Union / intersection — composition of distributed members.
	if flags&checker.TypeFlagsUnion != 0 {
		// Sort member ids so union member ORDER doesn't affect the structural id (a
		// union is order-independent; objects already sort their members in
		// memberIDs). This converges a value-first `union([...])` with the written
		// `A | B | …` even when tsgo computes the two in different member orders, and
		// dedups `A | B` with `B | A`. Runtime member precedence is unaffected — it's
		// driven by node.Children downstream (union_safeorder.go), not by this id.
		unionIDs := computer.childIDs(tsType.Distributed())
		return collectionJoined(int(kind), computer.sortedJoin(unionIDs), false)
	}
	if flags&checker.TypeFlagsIntersection != 0 {
		return computer.collapsedIntersectionID(tsType)
	}

	// Object-flavoured: tuple / array / promise / function / class / objectLiteral.
	if flags&checker.TypeFlagsObject != 0 {
		return computer.objectID(tsType)
	}

	// Fallback — kind only.
	return strconv.Itoa(int(kind))
}

func (computer *Computer) objectID(tsType *checker.Type) string {
	if checker.IsTupleType(tsType) {
		// Tuple — bracket-delimited child list per the reference algorithm, with
		// each element's variadic FLAGS (rest / variadic) folded into the id.
		// The reference RT-compiles per call so a rest tail and a fixed slot
		// never share a runtime Type; our AOT cache is project-global, so
		// without the flag a rest tuple `[number, ...string[]]` and a fixed
		// tuple `[number, string]` both reduce to `Tuple[<number>,<string>]`,
		// collide on a single cache slot, and the (nondeterministically chosen)
		// winner gives one of them the wrong validator. Mirrors the flag
		// handling in internal/cachegen/runtype/serialize.go:projectTuple.
		//
		// Element LABELS fold into the id too (`[s: string]` → `Tuple[s:5]`,
		// unlabeled `[string]` stays `Tuple[5]`): canonical nodes are shared
		// singletons and the projected node carries `children[].name`, so two
		// same-shape tuples differing only in labels MUST NOT collapse — the
		// first-interned site's labels would win for both (scan-order
		// nondeterminism; the mion route-param-names bug). This is the
		// canonical-node rule applied to identity: label data lives on the
		// node, so the label is part of what the node IS. Labeled `Parameters<H>`
		// tuples are exactly how frameworks reflect handler param names.
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
				label = tupleElementLabel(elementInfos[i])
			}
			// Optional tuple slots type as `T | undefined`; strip it so the slot id
			// matches the projected node (serialize.go projectTuple does the same).
			// Tuple slots carry no memberID/optBit (unlike object props / params), so
			// the `?` suffix keeps optionality in the id — otherwise `[T, U?]` and
			// `[T, U]` collide (the `|undefined` used to encode it implicitly, before
			// the strip). Rest reuses TS's `...`; variadic keeps a distinct
			// `#variadic` marker since it can't share `...` with rest.
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
		return collectionID(int(protocol.KindTuple), ids, true)
	}

	// Array.
	if computer.typeChecker.IsArrayLikeType(tsType) {
		typeArguments := computer.typeChecker.GetTypeArguments(tsType)
		if len(typeArguments) > 0 {
			child := computer.Compute(typeArguments[0])
			return memberID(int(protocol.KindArray), "0", false, child)
		}
	}

	// Promise.
	if symbol := tsType.Symbol(); symbol != nil && symbol.Name == "Promise" {
		typeArguments := computer.typeChecker.GetTypeArguments(tsType)
		if len(typeArguments) > 0 {
			child := computer.Compute(typeArguments[0])
			return memberID(int(protocol.KindPromise), "0", false, child)
		}
	}

	// Builtin Temporal types (Temporal.PlainDate, …): their structural id is
	// the SubKind prefix, same scheme as Date. Namespace-qualified detection
	// keeps a user `PlainDate` distinct. Checked before the Date/Map/Set
	// switch since Temporal types are namespace members, not top-level.
	if info, ok := TemporalInfoForType(tsType); ok {
		return strconv.Itoa(int(info.SubKind))
	}

	// Built-in classes — Date / Map / Set — get their own subKind id, exactly
	// as `computeClassTypeId` does (ref: lib/typeId.ts:149). The numeric
	// prefix is the SubKind (2001 / 2002 / 2003), not KindClass.
	if symbol := tsType.Symbol(); symbol != nil {
		switch symbol.Name {
		case "Date":
			return strconv.Itoa(int(protocol.SubKindDate))
		case "Map":
			if tsType.ObjectFlags()&checker.ObjectFlagsReference != 0 {
				typeArguments := computer.typeChecker.GetTypeArguments(tsType)
				if len(typeArguments) == 2 {
					return strconv.Itoa(int(protocol.SubKindMap)) + "{" +
						strconv.Itoa(int(protocol.SubKindMapKey)) + ":" + computer.Compute(typeArguments[0]) + "," +
						strconv.Itoa(int(protocol.SubKindMapValue)) + ":" + computer.Compute(typeArguments[1]) + "}"
				}
			}
			return strconv.Itoa(int(protocol.SubKindMap))
		case "Set":
			if tsType.ObjectFlags()&checker.ObjectFlagsReference != 0 {
				typeArguments := computer.typeChecker.GetTypeArguments(tsType)
				if len(typeArguments) == 1 {
					return strconv.Itoa(int(protocol.SubKindSet)) + "{" +
						strconv.Itoa(int(protocol.SubKindSetItem)) + ":" + computer.Compute(typeArguments[0]) + "}"
				}
			}
			return strconv.Itoa(int(protocol.SubKindSet))
		}
	}
	// Non-serialisable globals (Error, WeakMap, typed arrays, …) are tagged
	// with SubKindNonSerializable and use that as their structural prefix —
	// matches the `subKind || kind` rule.
	if symbol := tsType.Symbol(); symbol != nil && protocol.IsNonSerializableSymbol(symbol.Name) {
		ids := computer.memberIDs(tsType, true)
		return collectionJoined(int(protocol.SubKindNonSerializable), computer.sortedJoin(ids), false)
	}
	if isClass(tsType) {
		// Generic user class — composition of property ids (sorted for
		// determinism), PLUS the class name. Unlike an interface / object
		// literal (pure structural data, name irrelevant), a class routes
		// reconstruction through the name-keyed class-serializer registry
		// (`utl.getClassSerializer(name)`). Two structurally-identical classes
		// with different names (`class A {x:number}` vs `class B {x:number}`)
		// must therefore NOT share a structural id, or they collapse to one
		// cache entry that bakes in a single name and mis-routes the other's
		// (de)serialization — and, in a union, both members become one node so
		// the `rt$classID` discriminant can't tell them apart. Anonymous classes
		// (TS internal symbol name, 0xFE prefix — same test as `userClassName`)
		// are never registered, so they keep the nameless structural id.
		ids := computer.memberIDs(tsType, true)
		id := collectionJoined(int(protocol.KindClass), computer.sortedJoin(ids), false)
		// Append the class name as an unambiguous suffix outside the `{…}`
		// member group (a bare `name:` token inside could collide with a
		// property literally named `name`). `#` never appears in a member id.
		if symbol := tsType.Symbol(); symbol != nil && symbol.Name != "" && symbol.Name[0] != 0xFE {
			id += "#" + computer.lit(symbol.Name)
		}
		return id
	}

	// Free function — bare callable with no own properties. Encode the
	// full signature shape; otherwise every function in the program would
	// collide on a single structural id (which deduped to one cache entry).
	callSignatures := computer.typeChecker.GetSignaturesOfType(tsType, checker.SignatureKindCall)
	properties := computer.typeChecker.GetPropertiesOfType(tsType)
	if len(callSignatures) > 0 && len(properties) == 0 {
		return computer.signatureID(callSignatures[0], protocol.KindFunction, "")
	}

	// objectLiteral — composition of property ids, sorted by name for stability.
	ids := computer.memberIDs(tsType, false)
	if len(callSignatures) > 0 {
		// Embed call signatures alongside members.
		for _, signature := range callSignatures {
			ids = append(ids, computer.signatureID(signature, protocol.KindCallSignature, ""))
		}
	}
	return collectionJoined(int(protocol.KindObjectLiteral), computer.sortedJoin(ids), false)
}

// memberIDs returns the member id list UNSORTED — callers compose it through
// sortedJoin (ordinary walks sort immediately, template walks defer to
// emission; see canonicalize.go).
func (computer *Computer) memberIDs(tsType *checker.Type, asClass bool) []string {
	properties := computer.typeChecker.GetPropertiesOfType(tsType)
	out := make([]string, 0, len(properties))
	for _, propertySymbol := range properties {
		out = append(out, computer.memberID(propertySymbol, asClass))
	}
	for _, indexInfo := range computer.typeChecker.GetIndexInfosOfType(tsType) {
		keyID := computer.Compute(indexInfo.KeyType())
		valueID := computer.Compute(indexInfo.ValueType())
		out = append(out, strconv.Itoa(int(protocol.KindIndexSignature))+":"+keyID+":"+valueID)
	}
	return out
}

func (computer *Computer) memberID(symbol *ast.Symbol, asClass bool) string {
	propertyType := computer.typeChecker.GetTypeOfSymbol(symbol)
	memberName := computer.lit(stableMemberName(symbol.Name))
	// A non-enumerable-guarded member (lib-global-inherited or `@nonEnumerable`)
	// is treated as optional in the projected shape — the wire may omit it — so
	// its `optional` id bit folds the guard in, matching the projection
	// (serialize.go appendProperty). The separate `#ne` bit below keeps a
	// guarded-optional member distinct from a plain declared-optional one (they
	// emit different presence checks: enumerability vs `!== undefined`).
	guarded := IsNonEnumerable(symbol)
	optional := symbol.Flags&ast.SymbolFlagsOptional != 0 || guarded
	// Readonly must be part of the structural id — `{a: string}` and
	// `{readonly a: string}` are different shapes and must not share
	// a cache slot. Mirrors the resolution rule in
	// internal/serialize/modifiers.go:applyMemberModifiers — trust
	// CheckFlagsReadonly for mapped/synthetic symbols (since the AST
	// declaration would lie); otherwise honor CheckFlags AND the AST
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

	// Method vs property: a property whose type is a single-call-signature
	// function with no other members maps to the reflection `method` form.
	if propertyType != nil {
		signatures := computer.typeChecker.GetSignaturesOfType(propertyType, checker.SignatureKindCall)
		if len(signatures) > 0 && len(computer.typeChecker.GetPropertiesOfType(propertyType)) == 0 {
			kind := protocol.KindMethodSignature
			if asClass {
				kind = protocol.KindMethod
			}
			return computer.signatureID(signatures[0], kind, memberName) + optBit(optional) + readonlyBit(readonly) + guardedBit(guarded)
		}
	}

	kind := protocol.KindPropertySignature
	if asClass {
		kind = protocol.KindProperty
	}
	// Optional properties carry `T | undefined` at the symbol-type layer; the
	// `optional` bit IS the "undefined-permitted" signal, so the union wrapper is
	// redundant. Resolve the child WITHOUT undefined before computing its id so a
	// RECURSIVE optional self/cross-reference closes on the inner type — not on a
	// wrapping union node — matching the serializer (serialize.go projects optional
	// members through the same typeid.ResolveOptionalChild). Without this the
	// structural id and the projected runtype node disagree on the optional child's
	// shape, and a recursive optional property's cycle back-edge binds inconsistently
	// ($23 `T | undefined` wrapper vs $30 object) between the type-first and
	// value-first authoring paths. The if/else (matching the tuple and signature
	// paths) matters: an unconditional walk of the raw `T | undefined` wrapper
	// used to pollute the pointer cache with back-edge depths inflated by the
	// discarded union frame.
	var child string
	if optional {
		child = computer.optionalChildID(propertyType)
	} else {
		child = computer.Compute(propertyType)
	}
	return memberID(int(kind), memberName, optional, child) + readonlyBit(readonly) + guardedBit(guarded)
}

// stableMemberName strips the checker-instance symbol id off a late-bound
// symbol-keyed member name ("\xFE@toPrimitive@5" → "\xFE@toPrimitive") so
// structural ids never embed which checker (or which session) materialized
// the member. Replicated from internal/cachegen/runtype/serialize.go (the
// typeid subpackage can't import its parent without an import cycle) —
// keep them in sync.
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

// guardedBit folds the non-enumerable-guard flag (IsNonEnumerable) into the
// structural id so a guarded member gets a distinct id from an unguarded twin
// — the runtime serialization differs (enumerability-gated write) and the
// per-ID noop memo keys on this id. Appended after readonlyBit; `#` never
// appears in a member name, so the suffix can't collide.
func guardedBit(guarded bool) string {
	if guarded {
		return "#ne"
	}
	return ""
}

func (computer *Computer) signatureID(signature *checker.Signature, kind protocol.ReflectionKind, name string) string {
	params := signature.Parameters()
	parts := make([]string, 0, len(params)+1)
	position := 0
	// Param NAMES fold into the id alongside the position (`18{0:a|<child>,…}`):
	// the projected parameter nodes carry `name`, and canonical nodes are shared
	// singletons — two same-shape signatures differing only in param names must
	// not collapse onto one node or the first-interned site's names win for both
	// (scan-order nondeterminism — same rule as tuple labels above). Positions
	// stay in the id so the naming is additive; params are behaviour-neutral
	// (notSupported) but their names are graph DATA.
	// A trailing FIXED rest-tuple param (`(...args: [a: A, b: B])`, the shape a
	// value-first `func([a: A, b: B], R)` brands) is expanded into positional
	// element params carrying the tuple LABELS as their names, so a labeled
	// value-first tuple still matches the equivalent written `(a: A, b: B)`.
	// An UNLABELED value-first tuple expands with empty names and so matches
	// only other unlabeled forms — sound, just less dedup. (The method/property
	// NAME — separate from param names — is preserved via the `name` argument
	// below.)
	for i, paramSymbol := range params {
		paramType := computer.typeChecker.GetTypeOfSymbol(paramSymbol)
		if i == len(params)-1 && isRestParam(paramSymbol) && checker.IsTupleType(paramType) {
			if elements, ok := computer.fixedTupleParamElements(paramType); ok {
				for _, element := range elements {
					parts = append(parts, memberID(int(protocol.KindParameter), paramNameSlot(position, computer.lit(element.label)), false, element.id))
					position++
				}
				continue
			}
		}
		optional := paramSymbol.Flags&ast.SymbolFlagsOptional != 0
		// Optional params type as `T | undefined`; strip it so the param id matches
		// the projected node (serialize.go projectSignature does the same).
		var child string
		if optional {
			child = computer.optionalChildID(paramType)
		} else {
			child = computer.Compute(paramType)
		}
		if isRestParam(paramSymbol) {
			child += "..."
		}
		parts = append(parts, memberID(int(protocol.KindParameter), paramNameSlot(position, computer.lit(paramSymbol.Name)), optional, child))
		position++
	}
	parts = append(parts, "->"+computer.Compute(computer.typeChecker.GetReturnTypeOfSignature(signature)))
	body := "{" + strings.Join(parts, ",") + "}"
	if name != "" {
		return strconv.Itoa(int(kind)) + name + body
	}
	return strconv.Itoa(int(kind)) + body
}

// paramNameSlot renders a signature parameter's member-name slot: the position,
// plus `:<name>` when the parameter has a declared name. Position stays first so
// unlabeled value-first expansions keep their historical `18{0|…}` shape and
// ordering is explicit in the id.
func paramNameSlot(position int, name string) string {
	if name == "" {
		return strconv.Itoa(position)
	}
	return strconv.Itoa(position) + ":" + name
}

// tupleParamElement is one expanded rest-tuple parameter: the element's type id
// plus its tuple LABEL (empty when unlabeled), which becomes the expanded
// param's name so labeled value-first tuples match written named signatures.
type tupleParamElement struct {
	id    string
	label string
}

// fixedTupleParamElements returns the element type ids + labels of tupleType
// when it is a FIXED tuple (no rest / variadic element). Used to expand a
// trailing rest-tuple parameter into positional params. Returns ok=false for a
// tuple carrying a variadic-ish element (a genuine variadic signature), which
// is kept as a single `...` entry instead.
func (computer *Computer) fixedTupleParamElements(tupleType *checker.Type) ([]tupleParamElement, bool) {
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
			label = tupleElementLabel(elementInfos[i])
		}
		elements = append(elements, tupleParamElement{id: computer.Compute(typeArgument), label: label})
	}
	return elements, true
}

// tupleElementLabel extracts a tuple element's declared label (`[s: string]` →
// "s"), or "" when unlabeled. The label lives on the labeled Parameter /
// NamedTupleMember AST node's inner binding name — mirrors
// serialize.go:projectTuple and the tsgo checker's getTupleElementLabel.
func tupleElementLabel(info checker.TupleElementInfo) string {
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

// NonEnumerableTagName is the JSDoc tag (`@nonEnumerable`) a user writes to
// mark a property whose runtime own-descriptor is non-enumerable — the
// type-aware bridge for a descriptor TS can't express (it models only
// readonly / `?`). Exported so the resolver's syntactic NE001 lint walk matches
// the exact tag this predicate reads.
const NonEnumerableTagName = "nonEnumerable"

// IsNonEnumerable reports whether a class/interface member symbol must have
// its by-name serialization gated by a runtime own-enumerability check
// (`Object.prototype.propertyIsEnumerable.call(v, 'k')`). Two id-relevant
// cases:
//
//  1. the member is INHERITED from a default-lib GLOBAL type AND is OPTIONAL in
//     its declared type — every declaration sits inside an `interface`/`class`
//     in a `lib.*.d.ts` file, and it carries `?`. Its runtime descriptor is
//     non-enumerable (Error's `stack?` / `cause?`), so materializing it by name
//     (`v.stack`) would put data on the wire that native `JSON.stringify` omits
//     — for a user error class that means server stack traces (absolute paths +
//     call frames) leak by default. A subclass that REDECLARES the member as its
//     own data prop (a declaration OUTSIDE a lib file) owns it and is not
//     guarded.
//
//     The OPTIONAL requirement is deliberate: guarding is DataOnly-safe only
//     when the type already permits the member's absence. A REQUIRED
//     global-inherited member (Error's `name` / `message`) is therefore NOT
//     guarded — it is always serialized, keeping the error envelope on the wire
//     and keeping `DataOnly<T>` accurate (a guarded-but-required member would
//     make the decoder's return type over-promise a prop the wire can omit).
//
//  2. the member is tagged `@nonEnumerable` in JSDoc AND is optional. A required
//     tagged member is NOT guarded (the tag is ignored, the member serializes
//     unconditionally) and the `NE001` lint rule tells the user to make it
//     optional — a required guard would break DataOnly the same way.
//
// The OPTIONAL requirement applies to BOTH arms, so the invariant holds:
// GUARDED ⇒ OPTIONAL-in-type. That makes `DataOnly<T>` sound by construction —
// a guarded member is always something the type already permits to be absent,
// so the decoder's return type never over-promises. A guarded member is also
// marked OPTIONAL in the projected shape (already true here), so validators and
// the presence path accept its absence. Exported because the projection
// (serialize.go / modifiers.go) and the structural id (memberID above) MUST
// apply the same predicate or id and projection drift.
func IsNonEnumerable(symbol *ast.Symbol) bool {
	if symbol == nil {
		return false
	}
	if !isOptionalSymbol(symbol) {
		return false
	}
	return isDefaultLibGlobalMember(symbol) || hasNonEnumerableTag(symbol)
}

// isOptionalSymbol reports whether a property symbol is optional (`?`) in its
// declared type — the same flag serialize.go / memberID read for the `optional`
// bit. Guarding a global-inherited member is gated on this so the guard never
// makes a REQUIRED prop absent from the wire (which would break DataOnly<T>).
func isOptionalSymbol(symbol *ast.Symbol) bool {
	return symbol.Flags&ast.SymbolFlagsOptional != 0
}

// isDefaultLibGlobalMember reports whether EVERY declaration of the member
// sits inside an interface or class declaration in a default lib file — i.e.
// the member is inherited from a global built-in type and carries that type's
// runtime (non-enumerable) descriptor. A single declaration outside the lib
// (a user redeclaration) disqualifies it, so the class keeps ownership.
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

// hasNonEnumerableTag reports whether any declaration of the member carries a
// `@nonEnumerable` JSDoc tag. Custom tags parse as JSDocUnknownTag; we match
// on the bare tag name (no leading `@`). Mirrors the JSDoc-tag read the
// tsgolint no_deprecated rule uses.
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

// isRestParam reports whether a parameter symbol's declaration carries `...`.
// Replicated from internal/cachegen/runtype/modifiers.go (the typeid subpackage
// can't import its parent without an import cycle).
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

// OptionalChild is the resolved shape of an optional member's child type once
// the redundant `undefined` is removed. Exactly one field is set:
//   - Type: the child resolves to a single checker type (the common case —
//     `T | undefined` → T, `boolean | undefined` → boolean, `null | undefined` → null).
//   - Members: the survivors form a genuine multi-member union with no single
//     checker type we can hand back (notably `T | null | undefined`, which must
//     keep `null` but drop `undefined`); the caller synthesizes a union node /
//     structural id from these members.
type OptionalChild struct {
	Type    *checker.Type
	Members []*checker.Type
}

// ResolveOptionalChild strips the redundant `undefined` an optional member's type
// carries (the member's `optional` bit already signals absence), restores a
// de-normalized boolean (`true | false`) back to the `boolean` atomic, and
// PRESERVES every other member — including `null` (so `x?: string | null` stays
// `string | null`, and the `null | undefined` shape of `x?: null` collapses to the
// lone `null`). It never returns a type that still carries `undefined`.
//
// NOTE: a `getTypeWithFacts(t, checker.TypeFactsNEUndefined)` shim export would
// collapse this whole function to a single checker call — that is exactly what the
// checker uses for optional-property narrowing — but the tsgolint shim does not
// expose that method today, so we strip / restore-boolean / preserve-null here.
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
	// No `undefined` to strip, or nothing survives (an `undefined`-only optional) —
	// leave the type untouched.
	if !hasUndefined || len(survivors) == 0 {
		return OptionalChild{Type: childType}
	}
	if len(survivors) == 1 {
		return OptionalChild{Type: survivors[0]}
	}
	// No `null` present: GetNonNullableType strips exactly `undefined` here (there is
	// no null to lose) and re-normalizes `true | false` back to the boolean atomic.
	if !hasNull {
		return OptionalChild{Type: checker.Checker_GetNonNullableType(typeChecker, childType)}
	}
	// `null` present: keep it, collapse a `{true, false}` pair back to boolean, and
	// synthesize a union from the survivors (no single checker type expresses
	// `T | null` without a union constructor the shim doesn't expose).
	members := collapseBooleanPair(typeChecker, survivors)
	if len(members) == 1 {
		return OptionalChild{Type: members[0]}
	}
	return OptionalChild{Members: members}
}

// collapseBooleanPair replaces a `{true, false}` boolean-literal pair among the
// members with the single `boolean` atomic. A union holds at most one of each
// boolean literal, so exactly two boolean-literal members means the whole boolean.
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

// SyntheticUnionStructural returns the structural id of a union synthesized from
// an explicit member list — used for an optional child that keeps `null` after
// `undefined` is stripped. Mirrors the union case in dispatch (sorted member ids)
// so a synthesized union and a real one with the same members converge on one id.
func SyntheticUnionStructural(computer *Computer, members []*checker.Type) string {
	ids := computer.childIDs(members)
	return collectionJoined(int(protocol.KindUnion), computer.sortedJoin(ids), false)
}

// optionalChildID returns the structural id of an optional member's child, with
// the redundant `undefined` stripped. Mirrors serialize.go's serializeOptionalChild
// so the structural id and the projected node agree on the child's shape (the
// recursion-safety contract described on memberID).
func (computer *Computer) optionalChildID(childType *checker.Type) string {
	child := ResolveOptionalChild(computer.typeChecker, childType)
	if child.Members == nil {
		return computer.Compute(child.Type)
	}
	return SyntheticUnionStructural(computer, child.Members)
}

// ---------------------------------------------------------------------------
// helpers — pure functions, no Computer state
// ---------------------------------------------------------------------------

// KindOf returns the ReflectionKind that best classifies a tsgo type.
// Exported because the serializer needs the same classification logic to
// produce the protocol.RunType.
func KindOf(typeChecker *checker.Checker, tsType *checker.Type) protocol.ReflectionKind {
	if tsType == nil {
		return protocol.KindNever
	}
	flags := tsType.Flags()
	switch {
	case flags&checker.TypeFlagsAny != 0:
		return protocol.KindAny
	case flags&checker.TypeFlagsUnknown != 0:
		return protocol.KindUnknown
	case flags&checker.TypeFlagsNever != 0:
		return protocol.KindNever
	case flags&checker.TypeFlagsVoid != 0:
		return protocol.KindVoid
	case flags&checker.TypeFlagsUndefined != 0:
		return protocol.KindUndefined
	case flags&checker.TypeFlagsNull != 0:
		return protocol.KindNull
	case flags&checker.TypeFlagsStringLiteral != 0,
		flags&checker.TypeFlagsNumberLiteral != 0,
		flags&checker.TypeFlagsBooleanLiteral != 0,
		flags&checker.TypeFlagsBigIntLiteral != 0,
		flags&checker.TypeFlagsUniqueESSymbol != 0:
		return protocol.KindLiteral
	case flags&checker.TypeFlagsString != 0:
		return protocol.KindString
	case flags&checker.TypeFlagsNumber != 0:
		return protocol.KindNumber
	case flags&checker.TypeFlagsBoolean != 0:
		return protocol.KindBoolean
	case flags&checker.TypeFlagsBigInt != 0:
		return protocol.KindBigInt
	case flags&checker.TypeFlagsESSymbol != 0:
		return protocol.KindSymbol
	case flags&checker.TypeFlagsEnum != 0,
		flags&checker.TypeFlagsEnumLike != 0,
		flags&checker.TypeFlagsEnumLiteral != 0:
		return protocol.KindEnum
	case flags&checker.TypeFlagsTemplateLiteral != 0:
		return protocol.KindTemplateLiteral
	case flags&checker.TypeFlagsUnion != 0:
		return protocol.KindUnion
	case flags&checker.TypeFlagsIntersection != 0:
		return protocol.KindIntersection
	case flags&checker.TypeFlagsNonPrimitive != 0:
		return protocol.KindObject
	case flags&checker.TypeFlagsObject != 0:
		return objectKind(typeChecker, tsType)
	}
	return protocol.KindUnknown
}

func objectKind(typeChecker *checker.Checker, tsType *checker.Type) protocol.ReflectionKind {
	if checker.IsTupleType(tsType) {
		return protocol.KindTuple
	}
	if typeChecker.IsArrayLikeType(tsType) {
		return protocol.KindArray
	}
	// Builtin Temporal types are namespace-member interfaces tsgo reports as
	// object literals; standard, we treat them as classes (atomic builtins).
	if _, ok := TemporalInfoForType(tsType); ok {
		return protocol.KindClass
	}
	if symbol := tsType.Symbol(); symbol != nil {
		switch symbol.Name {
		case "Promise":
			return protocol.KindPromise
		case "RegExp":
			return protocol.KindRegexp
		case "Date", "Map", "Set":
			// Built-in interfaces from lib.d.ts that we treat as classes
			// (dispatched through initClassRunType in createRunType.ts).
			return protocol.KindClass
		}
	}
	if isClass(tsType) {
		return protocol.KindClass
	}
	// Free callable with no own properties → reflection function kind.
	if len(typeChecker.GetSignaturesOfType(tsType, checker.SignatureKindCall)) > 0 &&
		len(typeChecker.GetPropertiesOfType(tsType)) == 0 {
		return protocol.KindFunction
	}
	return protocol.KindObjectLiteral
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

// collectionID composes a structural id with the given numeric prefix.
// Accepts a bare int because the prefix may be either a ReflectionKind
// (e.g. KindTuple) or a ReflectionSubKind (e.g. SubKindNonSerializable)
// per the `subKind || kind` rule.
func collectionID(prefix int, children []string, brackets bool) string {
	return collectionJoined(prefix, strings.Join(children, ","), brackets)
}

// collectionJoined is collectionID over an already-joined child list — the
// form the content-sorted composites use so sortedJoin can defer their
// ordering to canonical emission in template mode.
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

// enumDiscriminator returns "<typeName>:<member1=value1>,…" (members sorted
// by name) so two enums with different shapes get different structural ids.
// Reads literal values directly to avoid TypeToString collapsing both
// numeric `0` and string `"red"` to the alias name `Color.Red`.
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

// stringifyLiteralValue gives a canonical form for a reflection literal value
// (string / number / bigint / bool). Used for structural id composition.
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
	// A numeric / bigint ENUM member's TypeToString is the member NAME
	// ("Color.Red"), not its value — read the underlying value so it shares the
	// structural id of the equivalent plain literal (both validate the same
	// number) and the value-first `RT.enum(MyEnum)` and `RT.enum({record})` forms
	// converge. (String enum members already returned above; the serialize-side
	// projector strips the name the same way — keep them in sync.)
	if flags&checker.TypeFlagsEnumLiteral != 0 {
		if value := tsType.AsLiteralType().Value(); value != nil {
			return fmt.Sprintf("%v", value)
		}
	}
	// Fall through: TypeToString gives a stable canonical form for
	// number, bigint, and any other literal value.
	return typeChecker.TypeToString(tsType)
}

// TemporalInfoForType returns the protocol.TemporalInfo for a *checker.Type
// that resolves to a builtin Temporal type (e.g. `Temporal.PlainDate`), or
// ok=false otherwise. Detection is namespace-qualified: the type's symbol
// name must match a registry entry AND the symbol's parent must be the
// `Temporal` namespace — so a user type named `PlainDate` (no Temporal
// parent) never matches. Shared by the serialize-side projector and the
// structural-id computer so both agree on what a Temporal type is.
func TemporalInfoForType(tsType *checker.Type) (protocol.TemporalInfo, bool) {
	if tsType == nil {
		return protocol.TemporalInfo{}, false
	}
	symbol := tsType.Symbol()
	if symbol == nil || symbol.Parent == nil || symbol.Parent.Name != protocol.TemporalNamespace {
		return protocol.TemporalInfo{}, false
	}
	return protocol.TemporalInfoByName(symbol.Name)
}
