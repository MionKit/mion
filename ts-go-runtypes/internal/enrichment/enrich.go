// Package enrichment is the build-time codegen and analysis behind FriendlyText<T> and MockData<T>, see docs/AI_ENRICHMENT.md.
// Deliberately separate from the resolver / typefns / emitter pipeline: it consumes reflection.RunType as a library and
// adds nothing to the hot scan/render path.
// Every walker is one switch over reflection.ReflectionKind, as cachegen/runtype/serialize.go is.
package enrichment

import (
	"sort"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment/cldr"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// maxWalkDepth is the backstop against a pathological or mis-resolved graph; genuine cycles are the `seen` guard's job.
const maxWalkDepth = 64

// walkCtx threads ref resolution, a canonical node riding as a `{kind:-1, id}` sentinel, and a cycle guard by identity.
// A nil resolve means a fully inlined graph, the unit-test shape; the CLI bridge supplies a table lookup.
type walkCtx struct {
	resolve func(id string) *reflection.RunType
	seen    map[*reflection.RunType]bool
	// namedRef is the closure hook EmitClosure sets: for a NAMED type other than the body being emitted it returns the
	// action to take instead of walking that body. Nil inlines everything, the single-const path and the unit-test shape.
	namedRef func(rt *reflection.RunType) namedRefAction
	// pluralArms are the source locale's CLDR categories, the arms a COUNT-BEARING `rt$errors` constraint scaffolds.
	pluralArms []string
}

// namedRefAction tells a walker how to handle a child referencing another named type; the zero value walks it inline.
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
// Scaffolds are always per-constraint, but the hand-written `rt$default` catch-all stays valid and reconcile preserves it.
func (ctx *walkCtx) bareMeta() string {
	return "{rt$label: '', rt$errors: {type: ''}}"
}

// setSourceLocale swaps the plural-arm set to locale's CLDR categories, the `i18n.sourceLocale` knob reaching every scaffold.
func (ctx *walkCtx) setSourceLocale(locale string) {
	if strings.TrimSpace(locale) != "" {
		ctx.pluralArms = cldr.Categories(locale)
	}
}

// deref follows a KindRef sentinel to its canonical node, returning the node as-is with no resolver or an unknown id.
func (ctx *walkCtx) deref(rt *reflection.RunType) *reflection.RunType {
	if rt == nil || rt.Kind != reflection.KindRef || ctx.resolve == nil {
		return rt
	}
	if resolved := ctx.resolve(rt.ID); resolved != nil {
		return resolved
	}
	return rt
}

// propertyChildren returns the data-bearing object members of rt in declaration order, skipping methods and signatures.
// On the closure walk children are ref sentinels and must be deref'd before their Kind is read.
// The inlined path must NOT deref: a deep back-edge stays a ref child, returns empty here and so breaks the cycle.
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

// isObjectLike reports whether rt is walked as a record of named fields; a builtin class carries no property member,
// so Date/Map/Set/RegExp/Temporal fall through to leaf handling.
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

// arrayElement returns the element node of an array, nil when absent.
func arrayElement(rt *reflection.RunType) *reflection.RunType {
	if rt.Kind == reflection.KindArray {
		return rt.Child
	}
	return nil
}

// isMap / isSet run BEFORE isObjectLike in every walk, so a Map or Set never falls through to the object / leaf arms.
func isMap(rt *reflection.RunType) bool {
	return rt.Kind == reflection.KindClass && rt.SubKind == reflection.SubKindMap
}

func isSet(rt *reflection.RunType) bool {
	return rt.Kind == reflection.KindClass && rt.SubKind == reflection.SubKindSet
}

// tupleSlots returns a tuple's per-slot value nodes in declaration order, each KindTupleMember child's `.Child`.
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

// isVariadicTuple reports whether the tuple carries a rest member, which gives it a broad `length: number`.
// The mapped types then route it through the ARRAY branch, so the emitter must emit the array shape to stay assignable.
// The "rest" / "variadic" flag is written by the serializer (serialize.go projectTuple).
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

// mapKeyValue returns the key and value slot nodes of a Map<K,V>, either nil for a malformed node.
// The wire stores them as KindParameter wrappers in rt.Arguments, and the bridge does not inline Arguments, so each is a ref.
func mapKeyValue(ctx *walkCtx, rt *reflection.RunType) (keyType, valueType *reflection.RunType) {
	keyType = argumentChild(ctx, rt, 0)
	valueType = argumentChild(ctx, rt, 1)
	return keyType, valueType
}

// setElement returns the element slot node of a Set<U>, nil for a malformed node.
func setElement(ctx *walkCtx, rt *reflection.RunType) *reflection.RunType {
	return argumentChild(ctx, rt, 0)
}

// argumentChild derefs the KindParameter wrapper at rt.Arguments[index] and returns the wrapped type, nil when absent.
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

// formatConstraintKeys returns a format node's candidate failed-constraint keys, sorted for deterministic output.
// These are exactly the `rt$errors` template keys the renderer can match; the base `type` failure is added by the caller.
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

// nonFailingParams are format params carrying NO failable constraint, so the scaffold skips them and FT003 rejects them.
// MIRROR of the `NonFailingParams` union in packages/run-types/src/enrich/friendlyText.ts, the one sync point.
var nonFailingParams = map[string]bool{
	"isCurrency":  true,
	"mockSamples": true,
	"transform":   true,
}
