package enrichment

import (
	"strings"
	"unicode"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// NamedConst is one emitted `export const friendly<Name> / mock<Name>` of a
// named-type closure. Friendly and Mock are the rendered object-literal bodies
// (no `export const … =` wrapper); the CLI wraps them with the const + type
// annotation. Order in a []NamedConst slice is dependency (topological) order —
// a type's const follows every named type it references.
type NamedConst struct {
	// TypeName is the source type name, e.g. "User".
	TypeName string
	// DeclFile is the absolute path of the source file the type is DECLARED in
	// (followed through re-exports to the original). Empty when it could not be
	// resolved — callers fall back to the root file. Drives the cross-file mirror
	// split + import emission (see docs/AI_ENRICHMENT.md → Named-type-driven emission).
	DeclFile string
	// FriendlyVar / MockVar are the const identifiers, e.g. "friendlyUser".
	FriendlyVar string
	MockVar     string
	// Friendly / Mock are the rendered object-literal bodies.
	Friendly string
	Mock     string
	// TypeID is this named type's structural id (RunType.ID) — the `@rtType` id
	// the reconcile (gen --update) matches existing↔desired consts by, so a
	// positional var-name swap (friendlyBox vs friendlyBox2) never mis-pairs.
	TypeID string
	// ChildIDs maps a dotted field path (e.g. "address.street") to that child
	// type's structural id — the `@rtIds` map the reconcile uses to recover a
	// primitive/inline field's identity for rename matching. Empty when the type
	// has no walkable children.
	ChildIDs map[string]string
}

// ClosureOptions configures EmitClosure.
type ClosureOptions struct {
	// TypeName is the root named type, e.g. "User".
	TypeName string
	// Resolve looks up a KindRef sentinel's canonical node by id (cache.NodeByID);
	// REQUIRED — the closure walk follows refs to detect named-type targets.
	Resolve func(id string) *reflection.RunType
	// DeclFiles maps a named type's RunType.ID to the absolute path of its
	// declaration source file. Optional: when nil (or a type is absent) the
	// emitted NamedConst's DeclFile is left empty and the caller falls back to the
	// root file. Built by the bridge from the checker symbol declarations.
	DeclFiles map[string]string
	// FriendlyErrors picks the `rt$errors` mode new nodes scaffold (tsconfig
	// `friendlyErrors`): "" / "perConstraint" → one key per failable format
	// param; "default" → the exclusive `{rt$default: ''}` catch-all.
	FriendlyErrors string
	// SourceLocale is the language the FriendlyText source maps are authored in
	// (tsconfig `i18n.sourceLocale`); it selects the CLDR arm set count-bearing
	// `rt$errors` constraints scaffold. Empty means the default ('en').
	SourceLocale string
}

// emitState tracks a named type through the closure emit: unvisited → inProgress
// (its body is being emitted; a back-edge here breaks the cycle) → done (its
// const is emitted; a reference here is safe — declared before use).
type emitState int

const (
	stateUnvisited emitState = iota
	stateInProgress
	stateDone
)

// closureEmitter drives the named-type-closure walk: emit every named type
// reachable from the root in dependency (topological) order, with each named-typed
// child rendered as a const-var reference (or a broken-cycle leaf for a back-edge)
// instead of an inlined body.
type closureEmitter struct {
	resolve        func(id string) *reflection.RunType
	declFiles      map[string]string    // ID → absolute declaration source file (optional)
	state          map[string]emitState // keyed by named type's RunType.ID
	consts         []NamedConst         // accumulated in topological order
	names          map[string]string    // ID → sanitized base name (e.g. "User"), unique
	usedVar        map[string]bool      // taken sanitized base names, for disambiguation
	sourceLocale   string
	friendlyErrors string // plural-arm locale for friendly scaffolds
}

// EmitClosure walks the named-type closure rooted at a NAMED type and emits one
// NamedConst per reachable named type, in dependency (topological) order. A field
// whose type is another NAMED type is emitted as a reference to that type's const
// var (friendly<Name> / mock<Name>); anonymous/inline shapes are inlined into the
// parent const via the existing emitFriendlyNode/emitMockNode arms. Cycles break
// at the back-edge: a reference to an in-progress named type becomes a leaf node
// (friendly `{rt$label: ”}`, mock `{}`), never a const reference, so the emitted
// const graph never hits a TDZ self-reference.
//
// A named root whose fields are all anonymous yields exactly ONE NamedConst whose
// bodies equal FriendlySkeleton/MockSkeleton's — the single-const path is the
// degenerate case.
func EmitClosure(root *reflection.RunType, opts ClosureOptions) []NamedConst {
	if root == nil {
		return nil
	}
	emitter := &closureEmitter{
		resolve:      opts.Resolve,
		declFiles:    opts.DeclFiles,
		state:        map[string]emitState{},
		names:        map[string]string{},
		usedVar:      map[string]bool{},
		sourceLocale: opts.SourceLocale,
	}
	// Seed the root's display name so its const uses the caller-supplied TypeName
	// even if the projected node's TypeName differs (re-export aliases etc.).
	rootName := opts.TypeName
	if rootName == "" {
		rootName = root.TypeName
	}
	if root.ID != "" {
		emitter.names[root.ID] = emitter.uniqueName(sanitizeIdent(rootName))
	}
	emitter.emitNamed(root, rootName)
	return emitter.consts
}

// emitNamed emits the const for one named type (if not already emitted), having
// first emitted every named type it references. Returns the type's base name (the
// `<Name>` in friendly<Name> / mock<Name>).
func (emitter *closureEmitter) emitNamed(named *reflection.RunType, displayName string) string {
	id := named.ID
	baseName := emitter.baseNameFor(id, displayName)
	if id != "" && emitter.state[id] == stateDone {
		return baseName
	}
	if id != "" {
		emitter.state[id] = stateInProgress
	}

	friendlyBody := emitter.renderBody(named, true)
	mockBody := emitter.renderBody(named, false)
	childIDs := emitter.childIDsOf(named)

	if id != "" {
		emitter.state[id] = stateDone
	}
	emitter.consts = append(emitter.consts, NamedConst{
		TypeName:    displayName,
		DeclFile:    emitter.declFiles[id],
		FriendlyVar: "friendly" + baseName,
		MockVar:     "mock" + baseName,
		Friendly:    friendlyBody,
		Mock:        mockBody,
		TypeID:      id,
		ChildIDs:    childIDs,
	})
	return baseName
}

// renderBody walks the body of one named type with the existing emit arms, but
// installs the namedRef hook so a named-typed CHILD becomes a const reference (or
// a broken-cycle leaf) rather than an inlined body. self is the named node whose
// body we are emitting — it must walk inline (otherwise the body would be a
// reference to itself).
func (emitter *closureEmitter) renderBody(self *reflection.RunType, friendly bool) string {
	ctx := newWalkCtx(emitter.resolve)
	ctx.setSourceLocale(emitter.sourceLocale)
	// The body's ROOT node (self, first encounter) must walk inline — otherwise the
	// const body would be a reference to itself. enteredBody flips on that first
	// encounter; a LATER encounter of self is a genuine back-edge (e.g. a
	// self-recursive `next: Node`) and breaks the cycle to a leaf.
	enteredBody := false
	ctx.namedRef = func(rt *reflection.RunType) namedRefAction {
		// rt is already deref'd by the caller (emitFriendlyNode/emitMockNode call
		// deref before the hook). Compare by ID, not pointer — a back-edge resolves
		// through NodeByID and the root may be a distinct SerializeTopLevel pointer.
		if isSelf(rt, self) {
			if !enteredBody {
				enteredBody = true
				return namedRefAction{kind: namedRefInline}
			}
			return namedRefAction{kind: namedRefBroken}
		}
		if rt.TypeName == "" {
			return namedRefAction{kind: namedRefInline}
		}
		switch emitter.stateOf(rt.ID) {
		case stateInProgress:
			return namedRefAction{kind: namedRefBroken}
		case stateDone:
			prefix := "mock"
			if friendly {
				prefix = "friendly"
			}
			return namedRefAction{kind: namedRefReference, varName: prefix + emitter.baseNameFor(rt.ID, rt.TypeName)}
		default:
			// Not yet emitted: emit it first (recursively, with its own friendly +
			// mock consts) so the reference is declared-before-use, then reference.
			baseName := emitter.emitNamed(rt, rt.TypeName)
			prefix := "mock"
			if friendly {
				prefix = "friendly"
			}
			return namedRefAction{kind: namedRefReference, varName: prefix + baseName}
		}
	}
	var b strings.Builder
	if friendly {
		emitFriendlyNode(&b, ctx, self, 0)
	} else {
		emitMockNode(&b, ctx, self, 0)
	}
	return b.String()
}

// childIDsOf computes the `@rtIds` map for one named type: a dotted-field-path
// → child-type structural-id entry for every property the const's body owns, at
// every depth. It descends through INLINE objects/arrays/tuples/maps (whose
// shapes live in this const's body) but STOPS at a named-type reference (it
// records the reference's id at its path, but the named type owns its own const
// + its own @rtIds, so we don't recurse into it). Returns nil when there are no
// entries (so an emitter with no walkable children omits the marker).
//
// self walks inline (it is the body being emitted); a later encounter of self
// is a back-edge — recorded as a leaf id, not recursed (matches renderBody).
func (emitter *closureEmitter) childIDsOf(self *reflection.RunType) map[string]string {
	out := map[string]string{}
	ctx := newWalkCtx(emitter.resolve)
	// The closure walks the RAW graph, where a parent's Children/Arguments ride as
	// ref sentinels. propertyChildren / tupleSlots / argumentChild only deref those
	// when ctx.namedRef is set, so install a no-op inline hook to enable dereffing
	// (we never actually want a reference action here — this walk records ids, it
	// does not emit bodies).
	ctx.namedRef = func(rt *reflection.RunType) namedRefAction { return namedRefAction{kind: namedRefInline} }
	emitter.collectChildIDs(out, ctx, self, "", true, 0)
	if len(out) == 0 {
		return nil
	}
	return out
}

// collectChildIDs is the recursive worker for childIDsOf. isSelfBody is true on
// the first (root) node so it always descends; a nested encounter of self is a
// broken back-edge (recorded, not recursed).
func (emitter *closureEmitter) collectChildIDs(out map[string]string, ctx *walkCtx, rt *reflection.RunType, path string, isSelfBody bool, depth int) {
	rt = ctx.deref(rt)
	if rt == nil || depth > maxWalkDepth {
		return
	}
	// Stop at a named-type node below the root: it owns its own const + @rtIds (a
	// self back-edge stops here too — it is named). The caller already recorded
	// its id at this path. isSelfBody is true only for this const's own root, so
	// the root always descends.
	if !isSelfBody && rt.TypeName != "" {
		return
	}

	// No union arm, on purpose: the FriendlyText / MockData DSL has no key
	// for a union member (packages/run-types/src/enrich/friendlyText.ts,
	// object-member unions are out of scope), so a union records its own id
	// at this path and nothing below it. The mirror emitter stops at the same
	// place; adding a key here would record ids no mirror can name.
	switch {
	case rt.Kind == reflection.KindTuple:
		for i, slot := range tupleSlots(ctx, rt) {
			emitter.recordChild(out, ctx, slot, joinChildPath(path, "rt$slots."+itoa(i)), depth)
		}
	case isMap(rt):
		keyType, valueType := mapKeyValue(ctx, rt)
		emitter.recordChild(out, ctx, keyType, joinChildPath(path, "rt$keys"), depth)
		emitter.recordChild(out, ctx, valueType, joinChildPath(path, "rt$values"), depth)
	case isSet(rt):
		emitter.recordChild(out, ctx, setElement(ctx, rt), joinChildPath(path, "rt$values"), depth)
	case isObjectLike(ctx, rt):
		for _, prop := range propertyChildren(ctx, rt) {
			emitter.recordChild(out, ctx, prop.Child, joinChildPath(path, prop.Name), depth)
		}
	default:
		if element := arrayElement(rt); element != nil {
			emitter.recordChild(out, ctx, element, joinChildPath(path, "rt$items"), depth)
		}
	}
}

// recordChild records childPath → childType.ID, then recurses into it (the
// recursion itself stops at a named-type child via collectChildIDs's guard).
func (emitter *closureEmitter) recordChild(out map[string]string, ctx *walkCtx, childType *reflection.RunType, childPath string, depth int) {
	resolved := ctx.deref(childType)
	if resolved == nil {
		return
	}
	if resolved.ID != "" {
		out[childPath] = resolved.ID
	}
	emitter.collectChildIDs(out, ctx, resolved, childPath, false, depth+1)
}

// joinChildPath appends a segment to a dotted child path (root path is "").
func joinChildPath(path, segment string) string {
	if path == "" {
		return segment
	}
	return path + "." + segment
}

// isSelf reports whether rt is the named type whose body is currently being
// emitted: same pointer, or (the robust case) same non-empty structural ID.
func isSelf(rt, self *reflection.RunType) bool {
	if rt == self {
		return true
	}
	return self.ID != "" && rt.ID == self.ID
}

func (emitter *closureEmitter) stateOf(id string) emitState {
	if id == "" {
		return stateUnvisited
	}
	return emitter.state[id]
}

// baseNameFor returns the (memoized, disambiguated) base name for a named type's
// id, assigning one from displayName on first sight.
func (emitter *closureEmitter) baseNameFor(id, displayName string) string {
	if id != "" {
		if name, ok := emitter.names[id]; ok {
			return name
		}
	}
	name := emitter.uniqueName(sanitizeIdent(displayName))
	if id != "" {
		emitter.names[id] = name
	}
	return name
}

// uniqueName disambiguates a base name against the names already handed out so
// two distinct named types (e.g. generic instantiations sharing a TypeName)
// don't collide on the same const identifier.
func (emitter *closureEmitter) uniqueName(name string) string {
	if name == "" {
		name = "Type"
	}
	candidate := name
	for i := 2; emitter.usedVar[candidate]; i++ {
		candidate = name + itoa(i)
	}
	emitter.usedVar[candidate] = true
	return candidate
}

// sanitizeIdent turns a type name into a valid JS identifier fragment suitable for
// `friendly<Name>` / `mock<Name>`: keep ASCII letters/digits/`_`/`$`, drop the
// rest, upper-case the first rune so the concatenation reads as camelCase.
func sanitizeIdent(name string) string {
	var b strings.Builder
	for _, r := range name {
		switch {
		case r == '_' || r == '$':
			b.WriteRune(r)
		case unicode.IsLetter(r) && r < unicode.MaxASCII:
			b.WriteRune(r)
		case unicode.IsDigit(r) && r < unicode.MaxASCII && b.Len() > 0:
			b.WriteRune(r)
		}
	}
	out := b.String()
	if out == "" {
		return ""
	}
	runes := []rune(out)
	runes[0] = unicode.ToUpper(runes[0])
	return string(runes)
}

// itoa is a tiny base-10 formatter (avoids pulling strconv for a 1-3 digit suffix).
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var digits []byte
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	return string(digits)
}
