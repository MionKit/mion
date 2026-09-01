// Package enrich is the Go-side, build-time-only codegen + analysis for the
// AI-enrichment artifacts FriendlyText<T> and MockData<T> (see
// docs/AI_ENRICHMENT.md). It is deliberately SEPARATE from the existing
// resolver/typefns/emitter pipeline: it consumes the shared data model
// (reflection.RunType) as a library and adds nothing to the hot scan/render path.
//
// Every walker here follows the repo's emitter convention — a single switch over
// reflection.ReflectionKind, where the per-node output depends on the current node
// (the same shape as compiled/runtype/serialize.go and the typefns families):
//
//   - emit.go     — walks a RunType to EMIT a `.rt.ts` FriendlyText/MockData
//     skeleton (the `gen` command's codegen).
//   - validate.go — (paired walk, added later) checks an authored literal against
//     the RunType and yields Findings (the `check` command).
//
// Nothing here is wired into the Vite build; the commands are out-of-band CLI
// modes (driven by argv), so the resolver process that the plugin spawns is
// untouched and still emits no `.rt.ts`.
package enrichment

import (
	"sort"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment/cldr"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// maxWalkDepth bounds recursion so a pathological / mis-resolved graph cannot
// spin forever. Real data shapes are far shallower; the per-node `seen` guard
// handles genuine cycles, this is the backstop.
const maxWalkDepth = 64

// walkCtx threads the bits a kind-switch walk needs: ref resolution (canonical
// nodes ride as `{kind:-1, id}` sentinels and must be looked up in the type
// table) and a cycle guard keyed by node identity. A nil Resolve means the graph
// is fully inlined (the unit-test shape); the CLI bridge supplies a table lookup.
type walkCtx struct {
	resolve func(id string) *reflection.RunType
	seen    map[*reflection.RunType]bool
	// namedRef is the named-type-closure hook (set only by EmitClosure). When a
	// node derefs to a NAMED type that is NOT the body currently being emitted, it
	// returns the action the emitter should take instead of walking the body: a
	// const-var reference, or a broken-cycle leaf. nil ⇒ inline everything (the
	// single-const path and the unit-test shape).
	namedRef func(rt *reflection.RunType) namedRefAction
	// pluralArms are the CLDR plural categories a COUNT-BEARING `rt$errors`
	// constraint scaffolds arms for — the source locale's category set (default:
	// English `one`/`other`). Non-count-bearing constraints stay plain strings.
	pluralArms []string
}

// namedRefAction tells a node walker how to handle a child that is a reference to
// another named type. Zero value (kind == namedRefInline) ⇒ walk the body inline.
type namedRefAction struct {
	kind    namedRefKind
	varName string // the const var name to emit, for namedRefReference
}

type namedRefKind int

const (
	namedRefInline    namedRefKind = iota // not a named ref (or the current body) — walk inline
	namedRefReference                     // a forward/back ref to a fully-emitted named const — emit the var
	namedRefBroken                        // a back-edge to an in-progress named type — emit a leaf
)

func newWalkCtx(resolve func(id string) *reflection.RunType) *walkCtx {
	return &walkCtx{resolve: resolve, seen: map[*reflection.RunType]bool{}, pluralArms: cldr.Categories("en")}
}

// bareMeta is the meta skeleton for a node with no format constraints.
// Scaffolds are always per-constraint; the authored `rt$default` catch-all
// remains a valid hand-written shape the reconcile preserves.
func (ctx *walkCtx) bareMeta() string {
	return "{rt$label: '', rt$errors: {type: ''}}"
}

// setSourceLocale swaps the ctx's plural-arm set to locale's CLDR categories —
// the `i18n.sourceLocale` knob threading into every friendly scaffold.
func (ctx *walkCtx) setSourceLocale(locale string) {
	if strings.TrimSpace(locale) != "" {
		ctx.pluralArms = cldr.Categories(locale)
	}
}

// deref follows a KindRef sentinel to its canonical node when a resolver is
// available; otherwise (or when the id is unknown) it returns the node as-is.
func (ctx *walkCtx) deref(rt *reflection.RunType) *reflection.RunType {
	if rt == nil || rt.Kind != reflection.KindRef || ctx.resolve == nil {
		return rt
	}
	if resolved := ctx.resolve(rt.ID); resolved != nil {
		return resolved
	}
	return rt
}

// propertyChildren returns the data-bearing object members of rt (Property /
// PropertySignature), skipping methods, index signatures, call signatures, and
// any node the emitters treat as non-data. Order is declaration order.
//
// In the EmitClosure walk (ctx.namedRef set), a parent's Children ride as
// `{kind:-1, id}` ref sentinels and must be deref'd before their Kind is
// inspected, so each child is resolved first. The single-const inlined path
// (ctx.namedRef nil) does NOT deref: its children are already canonical clones,
// AND a deep back-edge there deliberately surfaces as a ref child — leaving it a
// ref makes propertyChildren return empty, which is how that path breaks a cycle
// to a leaf object. Dereffing on the inlined path would over-expand the cycle.
func propertyChildren(ctx *walkCtx, rt *reflection.RunType) []*reflection.RunType {
	derefChildren := ctx != nil && ctx.namedRef != nil
	out := make([]*reflection.RunType, 0, len(rt.Children))
	for _, child := range rt.Children {
		if derefChildren {
			child = ctx.deref(child)
		}
		if child == nil || child.NotSupported {
			continue
		}
		switch child.Kind {
		case reflection.KindProperty, reflection.KindPropertySignature:
			out = append(out, child)
		}
	}
	return out
}

// isObjectLike reports whether rt should be walked as a record of named fields:
// object literals, interfaces, intersections, and USER classes (which carry
// property children). Builtin classes (Date/Map/Set/RegExp/Temporal) have a
// SubKind and no property members, so they fall through to leaf handling.
//
// The KindClass arm reuses propertyChildren, so it derefs ref children only on
// the closure walk (ctx.namedRef set) — matching the inlined-vs-raw split above.
func isObjectLike(ctx *walkCtx, rt *reflection.RunType) bool {
	switch rt.Kind {
	case reflection.KindObjectLiteral, reflection.KindIntersection:
		return true
	case reflection.KindClass:
		return len(propertyChildren(ctx, rt)) > 0
	default:
		return false
	}
}

// arrayElement returns the element node for an array (or nil if absent).
func arrayElement(rt *reflection.RunType) *reflection.RunType {
	if rt.Kind == reflection.KindArray {
		return rt.Child
	}
	return nil
}

// isMap / isSet report whether rt is a builtin Map / Set class (KindClass +
// the registry subKind). The structural-node arms run BEFORE isObjectLike so a
// Map/Set never falls through to the object/leaf arms.
func isMap(rt *reflection.RunType) bool {
	return rt.Kind == reflection.KindClass && rt.SubKind == reflection.SubKindMap
}

func isSet(rt *reflection.RunType) bool {
	return rt.Kind == reflection.KindClass && rt.SubKind == reflection.SubKindSet
}

// tupleSlots returns the per-slot value nodes of a tuple: each KindTupleMember
// child's `.Child` (the slot type). Non-tuple-member children are skipped.
// Order is declaration order; an empty tuple yields an empty slice.
func tupleSlots(ctx *walkCtx, rt *reflection.RunType) []*reflection.RunType {
	out := make([]*reflection.RunType, 0, len(rt.Children))
	for _, member := range rt.Children {
		member = ctx.deref(member)
		if member == nil {
			continue
		}
		out = append(out, member.Child)
	}
	return out
}

// isVariadicTuple reports whether the tuple carries a rest / variadic member
// (`[A, ...B[]]`). Such a tuple has a broad `length: number`, so the
// FriendlyText / MockData mapped types route it through the ARRAY branch
// (`number extends T['length']`), NOT the fixed `rt$slots` branch. The emitter
// mirrors that: a variadic tuple emits the array shape (`rt$items`/`rt$length`) so
// the skeleton stays assignable to the Phase-A type. A member is flagged "rest"
// or "variadic" by the serializer (serialize.go projectTuple).
func isVariadicTuple(ctx *walkCtx, rt *reflection.RunType) bool {
	for _, member := range rt.Children {
		member = ctx.deref(member)
		if member == nil {
			continue
		}
		for _, flag := range member.Flags {
			if flag == "rest" || flag == "variadic" {
				return true
			}
		}
	}
	return false
}

// mapKeyValue returns the (key, value) slot nodes of a Map<K,V>. The wire stores
// them as KindParameter wrappers in rt.Arguments (Arguments[0]=key wrapper,
// Arguments[1]=value wrapper); the underlying type rides on each wrapper's
// `.Child`. Wrappers are ref sentinels (Arguments isn't inlined by the bridge),
// so deref each before reading its Child. Either may be nil for a malformed node.
func mapKeyValue(ctx *walkCtx, rt *reflection.RunType) (keyType, valueType *reflection.RunType) {
	keyType = argumentChild(ctx, rt, 0)
	valueType = argumentChild(ctx, rt, 1)
	return keyType, valueType
}

// setElement returns the element slot node of a Set<U> — Arguments[0]'s
// KindParameter wrapper's `.Child`. Nil for a malformed node.
func setElement(ctx *walkCtx, rt *reflection.RunType) *reflection.RunType {
	return argumentChild(ctx, rt, 0)
}

// argumentChild derefs rt.Arguments[index] (a KindParameter wrapper ref) and
// returns its `.Child` (the wrapped type). Nil when the slot is absent.
func argumentChild(ctx *walkCtx, rt *reflection.RunType, index int) *reflection.RunType {
	if index < 0 || index >= len(rt.Arguments) {
		return nil
	}
	wrapper := ctx.deref(rt.Arguments[index])
	if wrapper == nil {
		return nil
	}
	return wrapper.Child
}

// formatConstraintKeys returns the candidate failed-constraint keys for a
// format-carrying node — the param names the type declares (minLength, max,
// pattern, version, …), sorted for deterministic output. These are exactly the
// `rt$errors` template keys the renderer can match (the (format.name,
// formatPath-tail) discriminator). Non-failing params (presentation metadata,
// mock pools, transformers — see nonFailingParams) are excluded. Always-present
// base failure `type` is added by the caller.
func formatConstraintKeys(fa *reflection.FormatAnnotation) []string {
	if fa == nil || len(fa.Params) == 0 {
		return nil
	}
	keys := make([]string, 0, len(fa.Params))
	for key := range fa.Params {
		if nonFailingParams[key] {
			continue
		}
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

// nonFailingParams are format params that carry NO failable constraint:
// presentation metadata (isCurrency), the mock pool (mockSamples) and the
// value rewrite block (transform). They never become `rt$errors` template
// keys, so the scaffold skips them and FT003 rejects them. MIRROR of the
// TS-side `NonFailingParams` union in packages/run-types/src/enrich/friendlyText.ts
// — the single sync point of the precise-typing design.
var nonFailingParams = map[string]bool{
	"isCurrency":  true,
	"mockSamples": true,
	"transform":   true,
}
