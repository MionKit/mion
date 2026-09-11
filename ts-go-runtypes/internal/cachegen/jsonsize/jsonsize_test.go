package jsonsize

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

func stringFmt(params map[string]any) *reflection.RunType {
	return &reflection.RunType{Kind: reflection.KindString, FormatAnnotation: &reflection.FormatAnnotation{Name: "stringFormat", Params: params}}
}

func arrayFmt(child *reflection.RunType, params map[string]any) *reflection.RunType {
	rt := &reflection.RunType{Kind: reflection.KindArray, Child: child}
	if params != nil {
		rt.FormatAnnotation = &reflection.FormatAnnotation{Name: "formattedArray", Params: params}
	}
	return rt
}

func prop(name string, child *reflection.RunType, optional bool) *reflection.RunType {
	return &reflection.RunType{Kind: reflection.KindProperty, Name: name, Child: child, Optional: optional}
}

func object(children ...*reflection.RunType) *reflection.RunType {
	return &reflection.RunType{Kind: reflection.KindObjectLiteral, Children: children}
}

var (
	num         = &reflection.RunType{Kind: reflection.KindNumber}
	boolean     = &reflection.RunType{Kind: reflection.KindBoolean}
	plainString = &reflection.RunType{Kind: reflection.KindString}
	noRefs      = map[string]*reflection.RunType{}
)

func expectBounded(t *testing.T, name string, got Result, want int) {
	t.Helper()
	if !got.Bounded {
		t.Errorf("%s: unbounded (%s), want bounded %d", name, got.UnboundedPath, want)
		return
	}
	if got.Bytes != want {
		t.Errorf("%s: bytes = %d, want %d", name, got.Bytes, want)
	}
}

func expectUnbounded(t *testing.T, name string, got Result, wantPath string) {
	t.Helper()
	if got.Bounded {
		t.Errorf("%s: bounded %d, want unbounded", name, got.Bytes)
		return
	}
	if got.UnboundedPath != wantPath {
		t.Errorf("%s: path = %q, want %q", name, got.UnboundedPath, wantPath)
	}
}

func TestMaxBytes_Scalars(t *testing.T) {
	cases := []struct {
		name string
		rt   *reflection.RunType
		want int
	}{
		{"boolean", boolean, 5},
		{"null", &reflection.RunType{Kind: reflection.KindNull}, 4},
		{"undefined", &reflection.RunType{Kind: reflection.KindUndefined}, 4},
		{"number", num, 24},
		{"date", &reflection.RunType{Kind: reflection.KindClass, SubKind: reflection.SubKindDate}, 32},
		{"string literal", &reflection.RunType{Kind: reflection.KindLiteral, Literal: "a\"b"}, 6},
		{"number literal", &reflection.RunType{Kind: reflection.KindLiteral, Literal: 12.5}, 4},
		{"true literal", &reflection.RunType{Kind: reflection.KindLiteral, Literal: true}, 4},
		{"enum", &reflection.RunType{Kind: reflection.KindEnum, Values: []any{"a", "longer", 3.0}}, 8},
		{"function member", &reflection.RunType{Kind: reflection.KindFunction}, 4},
		{"temporal plain date", &reflection.RunType{Kind: reflection.KindClass, SubKind: reflection.SubKindTemporalPlainDate}, 96},
	}
	for _, tc := range cases {
		expectBounded(t, tc.name, MaxBytes(tc.rt, noRefs), tc.want)
	}
}

func TestMaxBytes_UnboundedLeaves(t *testing.T) {
	cases := []struct {
		name string
		rt   *reflection.RunType
		path string
	}{
		{"plain string", plainString, ": string without maxLength"},
		{"any", &reflection.RunType{Kind: reflection.KindAny}, ": any / unknown / object has no shape"},
		{"regexp", &reflection.RunType{Kind: reflection.KindRegexp}, ": a RegExp source has no length bound"},
		{"bigint", &reflection.RunType{Kind: reflection.KindBigInt}, ": bigint without min and max"},
		{"plain array", arrayFmt(num, nil), ": array without maxItems"},
		{"zoned date time", &reflection.RunType{Kind: reflection.KindClass, SubKind: reflection.SubKindTemporalZonedDateTime}, ": ZonedDateTime carries a time zone name of any length"},
		{"duration", &reflection.RunType{Kind: reflection.KindClass, SubKind: reflection.SubKindTemporalDuration}, ": Duration digits have no bound"},
		{"user class", &reflection.RunType{Kind: reflection.KindClass, Children: []*reflection.RunType{prop("a", num, false)}}, ": a class instance may use a registered serializer"},
	}
	for _, tc := range cases {
		expectUnbounded(t, tc.name, MaxBytes(tc.rt, noRefs), tc.path)
	}
}

func TestMaxBytes_String(t *testing.T) {
	// quotes + 6 bytes per UTF-16 unit
	expectBounded(t, "maxLength 36", MaxBytes(stringFmt(map[string]any{"maxLength": 36.0}), noRefs), 2+6*36)
	expectBounded(t, "length 4", MaxBytes(stringFmt(map[string]any{"length": 4.0, "maxLength": 100.0}), noRefs), 2+6*4)
	expectBounded(t, "maxLength 0", MaxBytes(stringFmt(map[string]any{"maxLength": 0.0}), noRefs), 2)
	// a named format without a length bound is still unbounded
	expectUnbounded(t, "email", MaxBytes(stringFmt(map[string]any{"pattern": "x"}), noRefs), ": string without maxLength")
}

func TestMaxBytes_BigintBounds(t *testing.T) {
	branded := func(params map[string]any) *reflection.RunType {
		return &reflection.RunType{Kind: reflection.KindBigInt, FormatAnnotation: &reflection.FormatAnnotation{Name: "bigintFormat", Params: params}}
	}
	// quotes + sign + the longest bound's digits
	expectBounded(t, "min/max", MaxBytes(branded(map[string]any{"min": "-100n", "max": "99999n"}), noRefs), 2+1+5)
	expectBounded(t, "gt/lt wrapped", MaxBytes(branded(map[string]any{"gt": map[string]any{"val": "0n"}, "lt": "1000000n"}), noRefs), 2+1+7)
	expectUnbounded(t, "only max", MaxBytes(branded(map[string]any{"max": "10n"}), noRefs), ": bigint without min and max")
}

func TestMaxBytes_ArrayAndTuple(t *testing.T) {
	// `[` + 3 × 24 + 2 commas + `]`
	expectBounded(t, "number[] maxItems 3", MaxBytes(arrayFmt(num, map[string]any{"maxItems": 3.0}), noRefs), 2+3*24+2)
	expectBounded(t, "maxItems 0", MaxBytes(arrayFmt(num, map[string]any{"maxItems": 0.0}), noRefs), 2)
	expectBounded(t, "length wins", MaxBytes(arrayFmt(boolean, map[string]any{"length": 2.0, "maxItems": 9.0}), noRefs), 2+2*5+1)
	// a bounded array of an unbounded element reports the element
	expectUnbounded(t, "string[] maxItems 3", MaxBytes(arrayFmt(plainString, map[string]any{"maxItems": 3.0}), noRefs), "[]: string without maxLength")

	member := func(child *reflection.RunType, optional bool) *reflection.RunType {
		return &reflection.RunType{Kind: reflection.KindTupleMember, Child: child, Optional: optional}
	}
	tuple := &reflection.RunType{Kind: reflection.KindTuple, Children: []*reflection.RunType{
		member(stringFmt(map[string]any{"maxLength": 2.0}), false), member(num, true),
	}}
	// `[` + 14 + `,` + 24 + `]`
	expectBounded(t, "tuple", MaxBytes(tuple, noRefs), 2+14+1+24)

	rest := &reflection.RunType{Kind: reflection.KindRest, Child: boolean,
		FormatAnnotation: &reflection.FormatAnnotation{Name: "formattedArray", Params: map[string]any{"maxItems": 2.0}}}
	withRest := &reflection.RunType{Kind: reflection.KindTuple, Children: []*reflection.RunType{member(num, false), rest}}
	// `[` + 24 + `,` + (5 + `,` + 5) + `]`
	expectBounded(t, "tuple with rest", MaxBytes(withRest, noRefs), 2+24+1+5+1+5)
	unboundedRest := &reflection.RunType{Kind: reflection.KindRest, Child: boolean}
	expectUnbounded(t, "unbounded rest", MaxBytes(&reflection.RunType{Kind: reflection.KindTuple, Children: []*reflection.RunType{unboundedRest}}, noRefs), "[0]: array without maxItems")
}

func TestMaxBytes_Object(t *testing.T) {
	item := object(
		prop("id", stringFmt(map[string]any{"maxLength": 36.0}), false),
		prop("qty", num, true),
		&reflection.RunType{Kind: reflection.KindMethod, Name: "fn"},
		&reflection.RunType{Kind: reflection.KindProperty, Name: "s", Child: num, IsStatic: true},
	)
	// `{` + `"id":` + 218 + `,` + `"qty":` + 24 + `}`
	expectBounded(t, "item", MaxBytes(item, noRefs), 1+5+218+1+6+24+1)
	// a key is spelled as its JSON literal, escapes included
	quoted := object(prop(`a"b`, boolean, false))
	expectBounded(t, "escaped key", MaxBytes(quoted, noRefs), 2+7+5)
	// the unbounded path names the member
	nested := object(prop("items", arrayFmt(object(prop("name", plainString, false)), map[string]any{"maxItems": 2.0}), false))
	expectUnbounded(t, "nested", MaxBytes(nested, noRefs), "items[].name: string without maxLength")
	record := object(&reflection.RunType{Kind: reflection.KindIndexSignature, Index: plainString, Child: num})
	expectUnbounded(t, "record", MaxBytes(record, noRefs), "[key]: index signature has no key bound")
}

func TestMaxBytes_Union(t *testing.T) {
	union := &reflection.RunType{Kind: reflection.KindUnion, Children: []*reflection.RunType{boolean, num, &reflection.RunType{Kind: reflection.KindNull}}}
	expectBounded(t, "largest member", MaxBytes(union, noRefs), 24)
	mixed := &reflection.RunType{Kind: reflection.KindUnion, Children: []*reflection.RunType{num, plainString}}
	expectUnbounded(t, "unbounded member", MaxBytes(mixed, noRefs), "|1: string without maxLength")
}

func TestMaxBytes_MapAndSet(t *testing.T) {
	param := func(id string, sub reflection.ReflectionSubKind, child *reflection.RunType) *reflection.RunType {
		return &reflection.RunType{ID: id, Kind: reflection.KindParameter, SubKind: sub, Child: child}
	}
	refs := map[string]*reflection.RunType{
		"k": param("k", reflection.SubKindMapKey, num), "v": param("v", reflection.SubKindMapValue, boolean),
		"i": param("i", reflection.SubKindSetItem, num),
	}
	sized := func(sub reflection.ReflectionSubKind, name string, args ...*reflection.RunType) *reflection.RunType {
		return &reflection.RunType{Kind: reflection.KindClass, SubKind: sub, Arguments: args,
			FormatAnnotation: &reflection.FormatAnnotation{Name: name, Params: map[string]any{"maxSize": 2.0}}}
	}
	mapRT := sized(reflection.SubKindMap, "formattedMap", reflection.NewRef("k"), reflection.NewRef("v"))
	// `[` + 2 × `[24,5]` + `,` + `]`
	expectBounded(t, "sized map", MaxBytes(mapRT, refs), 2+2*(24+5+3)+1)
	setRT := sized(reflection.SubKindSet, "formattedSet", reflection.NewRef("i"))
	expectBounded(t, "sized set", MaxBytes(setRT, refs), 2+2*24+1)
	plainMap := &reflection.RunType{Kind: reflection.KindClass, SubKind: reflection.SubKindMap, Arguments: []*reflection.RunType{reflection.NewRef("k"), reflection.NewRef("v")}}
	expectUnbounded(t, "plain map", MaxBytes(plainMap, refs), ": Map without maxSize")
	plainSet := &reflection.RunType{Kind: reflection.KindClass, SubKind: reflection.SubKindSet, Arguments: []*reflection.RunType{reflection.NewRef("i")}}
	expectUnbounded(t, "plain set", MaxBytes(plainSet, refs), ": Set without maxSize")
}

func TestMaxBytes_RefsMemoAndCycle(t *testing.T) {
	leaf := &reflection.RunType{ID: "leaf", Kind: reflection.KindBoolean}
	pair := &reflection.RunType{ID: "pair", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{
		prop("a", reflection.NewRef("leaf"), false), prop("b", reflection.NewRef("leaf"), false),
	}}
	refs := map[string]*reflection.RunType{"leaf": leaf, "pair": pair}
	expectBounded(t, "refs resolve", MaxBytes(pair, refs), 2+4+5+1+4+5)

	node := &reflection.RunType{ID: "node", Kind: reflection.KindObjectLiteral}
	node.Children = []*reflection.RunType{prop("next", reflection.NewRef("node"), true)}
	expectUnbounded(t, "cycle", MaxBytes(node, map[string]*reflection.RunType{"node": node}), "next: recursive type")
}

func TestMaxBytes_TemplateLiteral(t *testing.T) {
	template := func(placeholders ...map[string]any) *reflection.RunType {
		return &reflection.RunType{Kind: reflection.KindTemplateLiteral, Literal: map[string]any{
			"templateLiteral": map[string]any{"texts": []any{"id-", ""}, "placeholders": toAny(placeholders)},
		}}
	}
	expectBounded(t, "number placeholder", MaxBytes(template(map[string]any{"kind": float64(reflection.KindNumber)}), noRefs), 2+6*(3+24))
	expectUnbounded(t, "string placeholder", MaxBytes(template(map[string]any{"kind": float64(reflection.KindString)}), noRefs), ": template literal with an unbounded placeholder")
}

func toAny(items []map[string]any) []any {
	out := make([]any, len(items))
	for i, item := range items {
		out[i] = item
	}
	return out
}

// TestMaxBytes_VisitsEveryWireSlot — the size walk is a per-kind descent (it
// reads only the slots that reach the wire), so this pins that on a bounded
// graph spanning every compound kind it sizes, it reaches every id-bearing
// node reflection.WalkGraph reaches: a forgotten child slot would leave a
// node unvisited here before it could leave it unsized in a route's limit.
func TestMaxBytes_VisitsEveryWireSlot(t *testing.T) {
	withID := func(id string, rt *reflection.RunType) *reflection.RunType {
		rt.ID = id
		return rt
	}
	param := func(id string, sub reflection.ReflectionSubKind, child *reflection.RunType) *reflection.RunType {
		return &reflection.RunType{ID: id, Kind: reflection.KindParameter, SubKind: sub, Child: child}
	}
	refs := map[string]*reflection.RunType{}
	add := func(rt *reflection.RunType) *reflection.RunType {
		refs[rt.ID] = rt
		return rt
	}
	add(withID("s", stringFmt(map[string]any{"maxLength": 3.0})))
	add(withID("n", &reflection.RunType{Kind: reflection.KindNumber}))
	add(withID("b", &reflection.RunType{Kind: reflection.KindBoolean}))
	add(withID("d", &reflection.RunType{Kind: reflection.KindClass, SubKind: reflection.SubKindDate}))
	add(withID("arr", arrayFmt(reflection.NewRef("s"), map[string]any{"maxItems": 2.0})))
	add(withID("m0", &reflection.RunType{Kind: reflection.KindTupleMember, Child: reflection.NewRef("n")}))
	add(withID("m1", &reflection.RunType{Kind: reflection.KindTupleMember, Child: reflection.NewRef("b")}))
	add(withID("tup", &reflection.RunType{Kind: reflection.KindTuple, Children: []*reflection.RunType{reflection.NewRef("m0"), reflection.NewRef("m1")}}))
	add(withID("u", &reflection.RunType{Kind: reflection.KindUnion, Children: []*reflection.RunType{reflection.NewRef("n"), reflection.NewRef("d")}}))
	add(param("mk", reflection.SubKindMapKey, reflection.NewRef("s")))
	add(param("mv", reflection.SubKindMapValue, reflection.NewRef("tup")))
	add(withID("map", &reflection.RunType{Kind: reflection.KindClass, SubKind: reflection.SubKindMap,
		Arguments:        []*reflection.RunType{reflection.NewRef("mk"), reflection.NewRef("mv")},
		FormatAnnotation: &reflection.FormatAnnotation{Name: "formattedMap", Params: map[string]any{"maxSize": 2.0}}}))
	add(param("si", reflection.SubKindSetItem, reflection.NewRef("u")))
	add(withID("set", &reflection.RunType{Kind: reflection.KindClass, SubKind: reflection.SubKindSet,
		Arguments:        []*reflection.RunType{reflection.NewRef("si")},
		FormatAnnotation: &reflection.FormatAnnotation{Name: "formattedSet", Params: map[string]any{"maxSize": 1.0}}}))
	add(withID("p0", prop("list", reflection.NewRef("arr"), false)))
	add(withID("p1", prop("byKey", reflection.NewRef("map"), true)))
	add(withID("p2", prop("tags", reflection.NewRef("set"), false)))
	root := add(withID("root", object(reflection.NewRef("p0"), reflection.NewRef("p1"), reflection.NewRef("p2"))))

	walker := newWalker(refs)
	if result := walker.walk(root, "", 0); !result.Bounded {
		t.Fatalf("fixture must be bounded, got %s", result.UnboundedPath)
	}
	reflection.WalkGraph(root, refs, func(node *reflection.RunType) reflection.WalkAction {
		if node.ID != "" && !walker.visited[node.ID] {
			t.Errorf("node %q (kind %d) is reachable through a child slot but the size walk never sized it", node.ID, node.Kind)
		}
		return reflection.WalkContinue
	})
}
