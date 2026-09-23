package enrichment

import (
	"strings"
	"unicode"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// NamedConst is one emitted `export const friendly<Name> / mock<Name>` of a named-type closure, its bodies unwrapped.
// A []NamedConst is in dependency order: a type's const follows every named type it references.
type NamedConst struct {
	// TypeName is the source type name, e.g. "User".
	TypeName string
	// DeclFile is the file the type is DECLARED in, followed through re-exports; empty means the caller falls back to the root.
	// It drives the cross-file mirror split and import emission (see docs/AI_ENRICHMENT.md).
	DeclFile string
	// FriendlyVar / MockVar are the const identifiers, e.g. "friendlyUser".
	FriendlyVar string
	MockVar     string
	// Friendly / Mock are the rendered object-literal bodies.
	Friendly string
	Mock     string
	// TypeID is the `@rtType` id reconcile matches existing against desired consts by, so a var-name swap never mis-pairs.
	TypeID string
	// ChildIDs is the `@rtIds` map, a dotted field path to that child's structural id, which recovers an inline field's
	// identity for rename matching. Empty when the type has no walkable children.
	ChildIDs map[string]string
}

// ClosureOptions configures EmitClosure.
type ClosureOptions struct {
	// TypeName is the root named type, e.g. "User".
	TypeName string
	// Resolve looks up a KindRef sentinel by id; REQUIRED, the closure walk follows refs to detect named-type targets.
	Resolve func(id string) *reflection.RunType
	// DeclFiles maps a named type's ID to its declaration file, built by the bridge from the checker symbol declarations.
	// Optional: a missing entry leaves NamedConst.DeclFile empty and the caller falls back to the root file.
	DeclFiles map[string]string
	// FriendlyErrors is the tsconfig `friendlyErrors` mode; nothing reads it, a scaffold is always one key per failable param.
	FriendlyErrors string
	// SourceLocale selects the CLDR arm set a count-bearing constraint scaffolds; empty means the default 'en'.
	SourceLocale string
}

// emitState tracks a named type: a back-edge onto inProgress breaks the cycle, a reference to done is declared-before-use.
type emitState int

const (
	stateUnvisited emitState = iota
	stateInProgress
	stateDone
)

// closureEmitter emits every named type reachable from the root in dependency order, each named child a const-var reference.
type closureEmitter struct {
	resolve        func(id string) *reflection.RunType
	declFiles      map[string]string    // ID → absolute declaration source file (optional)
	state          map[string]emitState // keyed by named type's RunType.ID
	consts         []NamedConst         // accumulated in topological order
	names          map[string]string    // ID → sanitized base name (e.g. "User"), unique
	usedVar        map[string]bool      // taken sanitized base names, for disambiguation
	sourceLocale   string
	friendlyErrors string // never set nor read; the plural-arm locale is sourceLocale
}

// EmitClosure emits one NamedConst per named type reachable from root, in dependency order, anonymous shapes inlined.
// A cycle breaks at the back-edge into a leaf, never a const reference, so the const graph hits no TDZ self-reference.
// A named root with only anonymous fields yields exactly ONE NamedConst, the degenerate single-const case.
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
	// Seed the root's display name, so a projected TypeName differing through a re-export alias does not rename the const.
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

// emitNamed emits one named type's const, every named type it references first, and returns its `<Name>` base name.
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

// renderBody walks one named type's body with the namedRef hook installed, so a named CHILD becomes a const reference.
// self is the node being emitted and must walk inline, or the body would be a reference to itself.
func (emitter *closureEmitter) renderBody(self *reflection.RunType, friendly bool) string {
	ctx := newWalkCtx(emitter.resolve)
	ctx.setSourceLocale(emitter.sourceLocale)
	// A LATER encounter of self is a genuine back-edge, a self-recursive `next: Node`, and breaks the cycle to a leaf.
	enteredBody := false
	ctx.namedRef = func(rt *reflection.RunType) namedRefAction {
		// rt is already deref'd by the caller; compare by ID, since the root may be a distinct SerializeTopLevel pointer.
		if isSelf(rt, self) {
			if !enteredBody {
				enteredBody = true
				return namedRefAction{kind: namedRefInline}
			}
			return namedRefAction{kind: namedRefBroken}
		}
		if !ownsConst(rt) {
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
			// Emit it first, so the reference is declared-before-use.
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

// childIDsOf computes the `@rtIds` map: every property the const's body owns, at every depth, by dotted path.
// It descends through inline shapes but STOPS at a named-type reference, which owns its own const and its own @rtIds.
// Nil with no entries, so a const with no walkable child omits the marker.
func (emitter *closureEmitter) childIDsOf(self *reflection.RunType) map[string]string {
	out := map[string]string{}
	ctx := newWalkCtx(emitter.resolve)
	// The RAW graph's children are ref sentinels, and the accessors only deref when namedRef is set, hence this no-op hook.
	ctx.namedRef = func(rt *reflection.RunType) namedRefAction { return namedRefAction{kind: namedRefInline} }
	emitter.collectChildIDs(out, ctx, self, "", true, 0)
	if len(out) == 0 {
		return nil
	}
	return out
}

// collectChildIDs is childIDsOf's worker; isSelfBody is true on the root so it always descends, unlike a nested back-edge.
func (emitter *closureEmitter) collectChildIDs(out map[string]string, ctx *walkCtx, rt *reflection.RunType, path string, isSelfBody bool, depth int) {
	rt = ctx.deref(rt)
	if rt == nil || depth > maxWalkDepth {
		return
	}
	// A named node below the root owns its own const and @rtIds, and the caller already recorded its id at this path.
	if !isSelfBody && ownsConst(rt) {
		return
	}

	// No union arm on purpose: the DSL has no key for a union member (packages/run-types/src/enrich/friendlyText.ts),
	// so a union records its own id and nothing below it; a key here would record ids no mirror can name.
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

// recordChild records childPath against the child's ID, then recurses; collectChildIDs stops the recursion at a named child.
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

// joinChildPath appends a segment to a dotted child path, the root path being "".
func joinChildPath(path, segment string) string {
	if path == "" {
		return segment
	}
	return path + "." + segment
}

// ownsConst reports whether a child gets its own shared const: a named type, but never a format alias, whose labels are per field.
func ownsConst(rt *reflection.RunType) bool {
	return rt.TypeName != "" && rt.FormatAnnotation == nil
}

// isSelf reports whether rt is the type whose body is being emitted: same pointer, or the same non-empty structural ID.
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

// baseNameFor returns the memoized, disambiguated base name for an id, assigning one from displayName on first sight.
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

// uniqueName disambiguates against the names already handed out, so two generic instantiations sharing a TypeName differ.
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

// sanitizeIdent turns a type name into a JS identifier fragment, upper-cased first so `friendly<Name>` reads as camelCase.
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

// itoa is a tiny base-10 formatter, avoiding strconv for a 1-3 digit suffix.
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
