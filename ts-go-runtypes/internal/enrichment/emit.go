package enrichment

import (
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/jsquote"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// FriendlySkeleton renders ONLY the FriendlyText object-literal skeleton for rt
// (no `export const … =` wrapper, no trailing `;`) — the value the batch/stdout
// `gen` mode returns so the test harness compares against a case's initializer.
func FriendlySkeleton(rt *reflection.RunType, resolve func(id string) *reflection.RunType) string {
	var b strings.Builder
	emitFriendlyNode(&b, newWalkCtx(resolve), rt, 0)
	return b.String()
}

// MockSkeleton renders ONLY the MockData object-literal skeleton for rt.
func MockSkeleton(rt *reflection.RunType, resolve func(id string) *reflection.RunType) string {
	var b strings.Builder
	emitMockNode(&b, newWalkCtx(resolve), rt, 0)
	return b.String()
}

func emitFriendlyNode(b *strings.Builder, ctx *walkCtx, rt *reflection.RunType, depth int) {
	rt = ctx.deref(rt)
	if rt == nil || depth > maxWalkDepth || ctx.seen[rt] {
		b.WriteString(ctx.bareMeta())
		return
	}
	// Named-type-closure interception (EmitClosure only): a child that is another
	// named type becomes a const-var reference, or a leaf for an in-progress
	// back-edge — never an inlined body. The current const's own body returns
	// namedRefInline so it walks normally.
	if ctx.namedRef != nil {
		switch action := ctx.namedRef(rt); action.kind {
		case namedRefReference:
			b.WriteString(action.varName)
			return
		case namedRefBroken:
			b.WriteString(ctx.bareMeta())
			return
		}
	}
	// Structural composite kinds (solution A) — emitted BEFORE the object/leaf
	// arms (most-specific first). Map/Set are KindClass without property
	// children, so they must be caught here ahead of isObjectLike (false for
	// them anyway) and the leaf fallthrough.
	if rt.Kind == reflection.KindTuple {
		ctx.seen[rt] = true
		// A variadic tuple (`[A, ...B[]]`) has a broad `length`, so the Phase-A
		// type treats it as an ARRAY (`rt$items`); a fixed tuple gets `rt$slots`.
		if isVariadicTuple(ctx, rt) {
			b.WriteString("{" + ctx.bareMeta()[1:len(ctx.bareMeta())-1] + ", rt$items: " + ctx.bareMeta() + "}")
		} else {
			b.WriteString("{" + ctx.bareMeta()[1:len(ctx.bareMeta())-1] + ", rt$slots: [")
			for i, slot := range tupleSlots(ctx, rt) {
				if i > 0 {
					b.WriteString(", ")
				}
				emitFriendlyNode(b, ctx, slot, depth+1)
			}
			b.WriteString("]}")
		}
		delete(ctx.seen, rt)
		return
	}
	if isMap(rt) {
		ctx.seen[rt] = true
		keyType, valueType := mapKeyValue(ctx, rt)
		b.WriteString("{" + ctx.bareMeta()[1:len(ctx.bareMeta())-1] + ", rt$keys: ")
		emitFriendlyNode(b, ctx, keyType, depth+1)
		b.WriteString(", rt$values: ")
		emitFriendlyNode(b, ctx, valueType, depth+1)
		b.WriteString("}")
		delete(ctx.seen, rt)
		return
	}
	if isSet(rt) {
		ctx.seen[rt] = true
		b.WriteString("{" + ctx.bareMeta()[1:len(ctx.bareMeta())-1] + ", rt$values: ")
		emitFriendlyNode(b, ctx, setElement(ctx, rt), depth+1)
		b.WriteString("}")
		delete(ctx.seen, rt)
		return
	}
	if isObjectLike(ctx, rt) {
		ctx.seen[rt] = true
		emitFriendlyObject(b, ctx, rt, depth)
		delete(ctx.seen, rt)
		return
	}
	if element := arrayElement(rt); element != nil {
		b.WriteString("{" + ctx.bareMeta()[1:len(ctx.bareMeta())-1] + ", rt$items: ")
		emitFriendlyNode(b, ctx, element, depth+1)
		b.WriteString("}")
		return
	}
	if rt.FormatAnnotation != nil {
		b.WriteString("{rt$label: '', rt$errors: {type: ''")
		for _, key := range formatConstraintKeys(rt.FormatAnnotation) {
			b.WriteString(", ")
			b.WriteString(key)
			b.WriteString(": ")
			writeErrorLeafSkeleton(b, ctx, key)
		}
		b.WriteString("}}")
		return
	}
	b.WriteString(ctx.bareMeta())
}

// writeErrorLeafSkeleton emits one `rt$errors` constraint's blank template leaf:
// a plural OBJECT (one blank arm per source-locale CLDR category) for a
// count-bearing constraint, a plain blank string otherwise. Generator-owned
// plurals: the author only ever fills string leaves, never builds the shape.
func writeErrorLeafSkeleton(b *strings.Builder, ctx *walkCtx, key string) {
	if !CountBearing(key) {
		b.WriteString("''")
		return
	}
	b.WriteString("{")
	for i, arm := range ctx.pluralArms {
		if i > 0 {
			b.WriteString(", ")
		}
		b.WriteString(arm)
		b.WriteString(": ''")
	}
	b.WriteString("}")
}

func emitFriendlyObject(b *strings.Builder, ctx *walkCtx, rt *reflection.RunType, depth int) {
	props := propertyChildren(ctx, rt)
	if len(props) == 0 {
		b.WriteString(ctx.bareMeta())
		return
	}
	inner := strings.Repeat("  ", depth+1)
	b.WriteString("{\n")
	b.WriteString(inner)
	b.WriteString("rt$label: '',\n")
	b.WriteString(inner)
	b.WriteString("rt$errors: {type: ''},\n")
	for _, prop := range props {
		b.WriteString(inner)
		b.WriteString(propKey(prop))
		b.WriteString(": ")
		emitFriendlyNode(b, ctx, prop.Child, depth+1)
		b.WriteString(",\n")
	}
	b.WriteString(strings.Repeat("  ", depth))
	b.WriteString("}")
}

func emitMockNode(b *strings.Builder, ctx *walkCtx, rt *reflection.RunType, depth int) {
	rt = ctx.deref(rt)
	if rt == nil || depth > maxWalkDepth || ctx.seen[rt] {
		b.WriteString("{pool: []}")
		return
	}
	// Named-type-closure interception (EmitClosure only): a child that is another
	// named type becomes a const-var reference, or a leaf for an in-progress
	// back-edge. The mock broken-cycle leaf is `{}` (matches docs).
	if ctx.namedRef != nil {
		switch action := ctx.namedRef(rt); action.kind {
		case namedRefReference:
			b.WriteString(action.varName)
			return
		case namedRefBroken:
			b.WriteString("{pool: []}")
			return
		}
	}
	// Structural composite kinds (solution A) — emitted BEFORE the object/leaf
	// arms. Tuples get a fixed-length `rt$slots` (no `rt$length`); Map/Set get
	// `rt$keys`/`rt$values` (the optional `rt$size` is left for the author to add).
	if rt.Kind == reflection.KindTuple {
		ctx.seen[rt] = true
		// A variadic tuple (`[A, ...B[]]`) has a broad `length`, so the Phase-A
		// type treats it as an ARRAY (`rt$items`/`rt$length`); a fixed tuple gets
		// the fixed-length `rt$slots`.
		if isVariadicTuple(ctx, rt) {
			b.WriteString("{rt$items: {pool: []}, rt$length: [1, 3]}")
		} else {
			b.WriteString("{rt$slots: [")
			for i, slot := range tupleSlots(ctx, rt) {
				if i > 0 {
					b.WriteString(", ")
				}
				emitMockNode(b, ctx, slot, depth+1)
			}
			b.WriteString("]}")
		}
		delete(ctx.seen, rt)
		return
	}
	if isMap(rt) {
		ctx.seen[rt] = true
		keyType, valueType := mapKeyValue(ctx, rt)
		b.WriteString("{rt$keys: ")
		emitMockNode(b, ctx, keyType, depth+1)
		b.WriteString(", rt$values: ")
		emitMockNode(b, ctx, valueType, depth+1)
		b.WriteString("}")
		delete(ctx.seen, rt)
		return
	}
	if isSet(rt) {
		ctx.seen[rt] = true
		b.WriteString("{rt$values: ")
		emitMockNode(b, ctx, setElement(ctx, rt), depth+1)
		b.WriteString("}")
		delete(ctx.seen, rt)
		return
	}
	if isObjectLike(ctx, rt) {
		ctx.seen[rt] = true
		emitMockObject(b, ctx, rt, depth)
		delete(ctx.seen, rt)
		return
	}
	if element := arrayElement(rt); element != nil {
		b.WriteString("{rt$items: ")
		emitMockNode(b, ctx, element, depth+1)
		b.WriteString(", rt$length: [1, 3]}")
		return
	}
	b.WriteString("{pool: []}")
}

func emitMockObject(b *strings.Builder, ctx *walkCtx, rt *reflection.RunType, depth int) {
	props := propertyChildren(ctx, rt)
	if len(props) == 0 {
		b.WriteString("{}")
		return
	}
	inner := strings.Repeat("  ", depth+1)
	b.WriteString("{\n")
	for _, prop := range props {
		b.WriteString(inner)
		b.WriteString(propKey(prop))
		b.WriteString(": ")
		emitMockNode(b, ctx, prop.Child, depth+1)
		b.WriteString(",\n")
	}
	b.WriteString(strings.Repeat("  ", depth))
	b.WriteString("}")
}

// propKey renders a property's object-literal key: a bare identifier when the
// name is dot-access safe, else single-quoted.
func propKey(prop *reflection.RunType) string {
	if prop.IsSafeName {
		return prop.Name
	}
	return jsquote.Single(prop.Name)
}
