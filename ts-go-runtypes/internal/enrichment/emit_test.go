package enrichment

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// prop builds a property-signature member named name with value type child.
func prop(name string, child *reflection.RunType) *reflection.RunType {
	return &reflection.RunType{Kind: reflection.KindPropertySignature, Name: name, IsSafeName: true, Child: child}
}

func leaf(kind reflection.ReflectionKind) *reflection.RunType {
	return &reflection.RunType{Kind: kind}
}

// fmtLeaf builds a format-branded leaf (string/number) with a FormatAnnotation.
func fmtLeaf(kind reflection.ReflectionKind, name string, params map[string]any) *reflection.RunType {
	return &reflection.RunType{Kind: kind, FormatAnnotation: &reflection.FormatAnnotation{Name: name, Params: params}}
}

// userFixture mirrors:
//
//	interface User {
//	  name: FormatString<{minLength:2; maxLength:60}>;
//	  age: FormatNumber<{min:0; max:120}>;
//	  isActive: boolean;
//	  tags: string[];
//	  profile: { email: FormatEmail; score: FormatNumber<{min:0; max:100}> };
//	}
func userFixture() *reflection.RunType {
	return &reflection.RunType{
		ID: "user", Kind: reflection.KindObjectLiteral, TypeName: "User",
		Children: []*reflection.RunType{
			prop("name", fmtLeaf(reflection.KindString, "stringFormat", map[string]any{"minLength": 2, "maxLength": 60})),
			prop("age", fmtLeaf(reflection.KindNumber, "numberFormat", map[string]any{"min": 0, "max": 120})),
			prop("isActive", leaf(reflection.KindBoolean)),
			prop("tags", &reflection.RunType{ID: "tags", Kind: reflection.KindArray, Child: leaf(reflection.KindString)}),
			prop("profile", &reflection.RunType{
				ID: "profile", Kind: reflection.KindObjectLiteral,
				Children: []*reflection.RunType{
					prop("email", fmtLeaf(reflection.KindString, "email", nil)),
					prop("score", fmtLeaf(reflection.KindNumber, "numberFormat", map[string]any{"min": 0, "max": 100})),
				},
			}),
		},
	}
}

func TestFriendlySkeleton(t *testing.T) {
	got := FriendlySkeleton(userFixture(), nil)
	// Count-bearing constraints (minLength/maxLength/min/max) scaffold a plural
	// OBJECT with the source locale's arms (default en: one/other); the rest
	// stay plain strings.
	want := `{
  rt$label: '',
  rt$errors: {type: ''},
  name: {rt$label: '', rt$errors: {type: '', maxLength: {one: '', other: ''}, minLength: {one: '', other: ''}}},
  age: {rt$label: '', rt$errors: {type: '', max: {one: '', other: ''}, min: {one: '', other: ''}}},
  isActive: {rt$label: '', rt$errors: {type: ''}},
  tags: {rt$label: '', rt$errors: {type: ''}, rt$items: {rt$label: '', rt$errors: {type: ''}}},
  profile: {
    rt$label: '',
    rt$errors: {type: ''},
    email: {rt$label: '', rt$errors: {type: ''}},
    score: {rt$label: '', rt$errors: {type: '', max: {one: '', other: ''}, min: {one: '', other: ''}}},
  },
}`
	if got != want {
		t.Errorf("FriendlySkeleton mismatch:\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}

// TestEmitFriendly_SourceLocaleArms: the plural arm set follows the source
// locale — Polish scaffolds one/few/many/other, Japanese other-only, an
// unknown locale all six.
func TestEmitFriendly_SourceLocaleArms(t *testing.T) {
	fixture := &reflection.RunType{
		ID: "box", Kind: reflection.KindObjectLiteral, TypeName: "Box",
		Children: []*reflection.RunType{
			prop("name", fmtLeaf(reflection.KindString, "stringFormat", map[string]any{"minLength": 2})),
		},
	}
	tests := []struct {
		locale string
		want   string
	}{
		{"pl", "minLength: {one: '', few: '', many: '', other: ''}"},
		{"ja", "minLength: {other: ''}"},
		{"pt-BR", "minLength: {one: '', many: '', other: ''}"},
		{"xx", "minLength: {zero: '', one: '', two: '', few: '', many: '', other: ''}"},
	}
	for _, test := range tests {
		t.Run(test.locale, func(t *testing.T) {
			ctx := newWalkCtx(nil)
			ctx.setSourceLocale(test.locale)
			var b strings.Builder
			emitFriendlyNode(&b, ctx, fixture, 0)
			if got := b.String(); !strings.Contains(got, test.want) {
				t.Errorf("friendly skeleton (%s) missing %q:\n%s", test.locale, test.want, got)
			}
		})
	}
}

func TestMockSkeleton(t *testing.T) {
	got := MockSkeleton(userFixture(), nil)
	want := `{
  name: {pool: []},
  age: {pool: []},
  isActive: {pool: []},
  tags: {rt$items: {pool: []}, rt$length: [1, 3]},
  profile: {
    email: {pool: []},
    score: {pool: []},
  },
}`
	if got != want {
		t.Errorf("MockSkeleton mismatch:\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}

// tupleMember wraps a slot type in a KindTupleMember node (the shape the tuple
// walker reads via member.Child).
func tupleMember(child *reflection.RunType) *reflection.RunType {
	return &reflection.RunType{Kind: reflection.KindTupleMember, Child: child}
}

// mapArg / setArg wrap a type in the synthetic KindParameter slot the Map/Set
// projection stores in rt.Arguments (the underlying type rides on .Child).
func mapArg(subKind reflection.ReflectionSubKind, child *reflection.RunType) *reflection.RunType {
	return &reflection.RunType{Kind: reflection.KindParameter, SubKind: subKind, Child: child}
}

// tupleFixture mirrors `[string, number]`.
func tupleFixture() *reflection.RunType {
	return &reflection.RunType{
		ID: "tuple", Kind: reflection.KindTuple,
		Children: []*reflection.RunType{
			tupleMember(leaf(reflection.KindString)),
			tupleMember(leaf(reflection.KindNumber)),
		},
	}
}

// mapFixture mirrors `Map<string, number>`.
func mapFixture() *reflection.RunType {
	return &reflection.RunType{
		ID: "map", Kind: reflection.KindClass, SubKind: reflection.SubKindMap, TypeName: "Map",
		Arguments: []*reflection.RunType{
			mapArg(reflection.SubKindMapKey, leaf(reflection.KindString)),
			mapArg(reflection.SubKindMapValue, leaf(reflection.KindNumber)),
		},
	}
}

// setFixture mirrors `Set<string>`.
func setFixture() *reflection.RunType {
	return &reflection.RunType{
		ID: "set", Kind: reflection.KindClass, SubKind: reflection.SubKindSet, TypeName: "Set",
		Arguments: []*reflection.RunType{
			mapArg(reflection.SubKindSetItem, leaf(reflection.KindString)),
		},
	}
}

// TestEmitFriendlyTuple pins the structural `rt$slots` shape (solution A).
func TestEmitFriendlyTuple(t *testing.T) {
	got := FriendlySkeleton(tupleFixture(), nil)
	want := "{rt$label: '', rt$errors: {type: ''}, rt$slots: [{rt$label: '', rt$errors: {type: ''}}, {rt$label: '', rt$errors: {type: ''}}]}"
	if got != want {
		t.Errorf("FriendlySkeleton(tuple) mismatch:\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}

// TestEmitMockTuple pins the structural `rt$slots` shape (fixed length, no rt$length).
func TestEmitMockTuple(t *testing.T) {
	got := MockSkeleton(tupleFixture(), nil)
	want := "{rt$slots: [{pool: []}, {pool: []}]}"
	if got != want {
		t.Errorf("MockSkeleton(tuple) mismatch:\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}

// TestEmitMockEmptyTuple confirms an empty tuple yields an empty rt$slots array.
func TestEmitMockEmptyTuple(t *testing.T) {
	empty := &reflection.RunType{ID: "empty", Kind: reflection.KindTuple}
	got := MockSkeleton(empty, nil)
	if got != "{rt$slots: []}" {
		t.Errorf("MockSkeleton(empty tuple) = %q, want %q", got, "{rt$slots: []}")
	}
}

// TestEmitVariadicTuple confirms a rest/variadic tuple (`[number, ...string[]]`)
// routes through the ARRAY shape (rt$items/rt$length), matching the Phase-A type's
// `number extends T['length']` branch — NOT the fixed `rt$slots`.
func TestEmitVariadicTuple(t *testing.T) {
	rest := &reflection.RunType{Kind: reflection.KindTupleMember, Flags: []string{"rest"}, Child: leaf(reflection.KindString)}
	tuple := &reflection.RunType{
		ID: "vtuple", Kind: reflection.KindTuple,
		Children: []*reflection.RunType{tupleMember(leaf(reflection.KindNumber)), rest},
	}
	gotFriendly := FriendlySkeleton(tuple, nil)
	if gotFriendly != "{rt$label: '', rt$errors: {type: ''}, rt$items: {rt$label: '', rt$errors: {type: ''}}}" {
		t.Errorf("FriendlySkeleton(variadic tuple) = %q", gotFriendly)
	}
	gotMock := MockSkeleton(tuple, nil)
	if gotMock != "{rt$items: {pool: []}, rt$length: [1, 3]}" {
		t.Errorf("MockSkeleton(variadic tuple) = %q", gotMock)
	}
}

// TestEmitFriendlyMap pins the structural `rt$keys`/`rt$values` shape.
func TestEmitFriendlyMap(t *testing.T) {
	got := FriendlySkeleton(mapFixture(), nil)
	want := "{rt$label: '', rt$errors: {type: ''}, rt$keys: {rt$label: '', rt$errors: {type: ''}}, rt$values: {rt$label: '', rt$errors: {type: ''}}}"
	if got != want {
		t.Errorf("FriendlySkeleton(map) mismatch:\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}

// TestEmitMockMap pins the structural `rt$keys`/`rt$values` shape (no rt$size emitted).
func TestEmitMockMap(t *testing.T) {
	got := MockSkeleton(mapFixture(), nil)
	want := "{rt$keys: {pool: []}, rt$values: {pool: []}}"
	if got != want {
		t.Errorf("MockSkeleton(map) mismatch:\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}

// TestEmitSet pins the structural `rt$values` shape for both emitters.
func TestEmitSet(t *testing.T) {
	gotFriendly := FriendlySkeleton(setFixture(), nil)
	wantFriendly := "{rt$label: '', rt$errors: {type: ''}, rt$values: {rt$label: '', rt$errors: {type: ''}}}"
	if gotFriendly != wantFriendly {
		t.Errorf("FriendlySkeleton(set) mismatch:\n--- got ---\n%s\n--- want ---\n%s", gotFriendly, wantFriendly)
	}
	gotMock := MockSkeleton(setFixture(), nil)
	wantMock := "{rt$values: {pool: []}}"
	if gotMock != wantMock {
		t.Errorf("MockSkeleton(set) mismatch:\n--- got ---\n%s\n--- want ---\n%s", gotMock, wantMock)
	}
}

// TestEmitFriendlyCyclic confirms the seen-guard breaks a self-referential graph
// instead of recursing forever.
func TestEmitFriendlyCyclic(t *testing.T) {
	node := &reflection.RunType{ID: "node", Kind: reflection.KindObjectLiteral, TypeName: "Node"}
	node.Children = []*reflection.RunType{
		prop("value", leaf(reflection.KindString)),
		prop("next", node), // self-reference
	}
	got := FriendlySkeleton(node, nil)
	if got == "" || len(got) > 4096 {
		t.Fatalf("expected a bounded non-empty emit for a cyclic type, got %d bytes", len(got))
	}
}
