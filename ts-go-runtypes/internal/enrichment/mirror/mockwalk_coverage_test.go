package mirror

import (
	"strconv"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// mockWalkRows gives every kind a row (nil: never a field value); a new kind fails the coverage test until it has one.
// A slot the scaffold writes but the check skips fails the coverage test too.
var mockWalkRows = map[reflection.ReflectionKind]func(child *reflection.RunType) *reflection.RunType{
	reflection.KindObjectLiteral: func(child *reflection.RunType) *reflection.RunType {
		return &reflection.RunType{Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{prop("a", child)}}
	},
	reflection.KindIntersection: func(child *reflection.RunType) *reflection.RunType {
		return &reflection.RunType{Kind: reflection.KindIntersection, Children: []*reflection.RunType{prop("a", child)}}
	},
	reflection.KindClass: func(child *reflection.RunType) *reflection.RunType {
		return &reflection.RunType{Kind: reflection.KindClass, Children: []*reflection.RunType{prop("a", child)}}
	},
	reflection.KindArray: func(child *reflection.RunType) *reflection.RunType {
		return &reflection.RunType{Kind: reflection.KindArray, Child: child}
	},
	reflection.KindTuple: func(child *reflection.RunType) *reflection.RunType {
		return &reflection.RunType{Kind: reflection.KindTuple, Children: []*reflection.RunType{
			{Kind: reflection.KindTupleMember, Child: child}, {Kind: reflection.KindTupleMember, Child: child},
		}}
	},
	// Leaves: the scaffold writes one `{pool: []}` and the check reads its generator.
	reflection.KindAny: leafRow, reflection.KindUnknown: leafRow, reflection.KindNever: leafRow, reflection.KindVoid: leafRow,
	reflection.KindObject: leafRow, reflection.KindString: leafRow, reflection.KindNumber: leafRow,
	reflection.KindBoolean: leafRow, reflection.KindSymbol: leafRow, reflection.KindBigInt: leafRow,
	reflection.KindNull: leafRow, reflection.KindUndefined: leafRow, reflection.KindRegexp: leafRow,
	reflection.KindLiteral: leafRow, reflection.KindTemplateLiteral: leafRow, reflection.KindFunction: leafRow,
	reflection.KindPromise: leafRow, reflection.KindEnum: leafRow, reflection.KindUnion: leafRow,
	// Never a field value on their own: members, parameters and signatures live inside the kinds above.
	reflection.KindProperty: nil, reflection.KindMethod: nil, reflection.KindParameter: nil,
	reflection.KindTypeParameter: nil, reflection.KindTupleMember: nil, reflection.KindEnumMember: nil,
	reflection.KindRest: nil, reflection.KindIndexSignature: nil, reflection.KindPropertySignature: nil,
	reflection.KindMethodSignature: nil, reflection.KindInfer: nil, reflection.KindCallSignature: nil,
}

func leafRow(*reflection.RunType) *reflection.RunType { return nil }

func prop(name string, child *reflection.RunType) *reflection.RunType {
	return &reflection.RunType{Kind: reflection.KindPropertySignature, Name: name, IsSafeName: true, Child: child}
}

func TestMockWalk_EveryKindHasARow(t *testing.T) {
	for kind := reflection.KindNever; kind < 256; kind++ {
		if reflection.FamilyOf(kind) == reflection.FamilyUnknown {
			continue
		}
		if _, ok := mockWalkRows[kind]; !ok {
			t.Errorf("kind %d has no row in mockWalkRows: say how the MockData scaffold and check treat it", kind)
		}
	}
}

func TestMockWalk_CheckReachesEveryScaffoldedLeaf(t *testing.T) {
	valueSet := &reflection.RunType{Kind: reflection.KindString, FormatAnnotation: &reflection.FormatAnnotation{
		Name: "stringFormat", Params: map[string]any{"allowedValues": map[string]any{"val": []any{"Lee"}}},
	}}
	param := func(child *reflection.RunType) *reflection.RunType {
		return &reflection.RunType{Kind: reflection.KindParameter, Child: child}
	}
	values := map[string]*reflection.RunType{
		"map": {Kind: reflection.KindClass, SubKind: reflection.SubKindMap, Arguments: []*reflection.RunType{param(valueSet), param(valueSet)}},
		"set": {Kind: reflection.KindClass, SubKind: reflection.SubKindSet, Arguments: []*reflection.RunType{param(valueSet)}},
	}
	for kind, row := range mockWalkRows {
		if row == nil {
			continue
		}
		value := row(valueSet)
		switch {
		case value != nil:
		case kind == reflection.KindString:
			value = valueSet // a plain string takes any generator, the value-set one takes none
		default:
			value = &reflection.RunType{Kind: kind}
		}
		values["kind "+strconv.Itoa(int(kind))] = value
	}
	for name, value := range values {
		t.Run(name, func(t *testing.T) {
			skeleton := enrichment.MockSkeleton(value, nil)
			leaves := strings.Count(skeleton, "{pool: []}")
			filled := strings.ReplaceAll(skeleton, "{pool: []}", "{pool: [], generator: 'lastName'}")
			view := parseDesiredObject(filled)
			if view == nil || leaves == 0 {
				t.Fatalf("scaffold %q has no leaf to check", skeleton)
			}
			findings := enrichment.CheckMock(value, NewASTLiteralView(view.node), nil)
			if len(findings) != leaves {
				t.Fatalf("scaffold %q has %d leaves, the check reported %d: %v", skeleton, leaves, len(findings), findings)
			}
		})
	}
}
