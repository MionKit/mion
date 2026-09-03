package typefunctions

import (
	"testing"

	// Registers the numeric format emitters, so the int8 case below resolves
	// its packed width the way the real emit pass does.
	_ "github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats/all"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// minWireBytes is the lower bound the decoder's count guard multiplies a
// wire count by, so it must never OVER-estimate (that would refuse a valid
// wire) and should be as tight as the layout allows (a loose bound is a
// weaker guard). Every kind is pinned here against the binary_to layout.
func position(value int) *int {
	return &value
}

func minBytesFixture(t *testing.T) (*EmitContext, map[string]*reflection.RunType) {
	t.Helper()
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	num := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	boolT := &reflection.RunType{ID: "bool", Kind: reflection.KindBoolean}
	big := &reflection.RunType{ID: "big", Kind: reflection.KindBigInt}
	nul := &reflection.RunType{ID: "nul", Kind: reflection.KindNull}
	lit := &reflection.RunType{ID: "lit", Kind: reflection.KindLiteral, Literal: "a"}
	re := &reflection.RunType{ID: "re", Kind: reflection.KindRegexp}
	enum := &reflection.RunType{ID: "enum", Kind: reflection.KindEnum}
	anyT := &reflection.RunType{ID: "any", Kind: reflection.KindAny}
	fn := &reflection.RunType{ID: "fn", Kind: reflection.KindFunction}
	date := &reflection.RunType{ID: "date", Kind: reflection.KindClass, SubKind: reflection.SubKindDate}
	mapT := &reflection.RunType{ID: "map", Kind: reflection.KindClass, SubKind: reflection.SubKindMap}
	instant := &reflection.RunType{ID: "instant", Kind: reflection.KindClass, SubKind: reflection.SubKindTemporalInstant}
	plainDate := &reflection.RunType{ID: "plainDate", Kind: reflection.KindClass, SubKind: reflection.SubKindTemporalPlainDate}
	int8 := &reflection.RunType{ID: "int8", Kind: reflection.KindNumber, FormatAnnotation: &reflection.FormatAnnotation{Name: "numberFormat", Params: map[string]any{"integer": true, "min": float64(-128), "max": float64(127)}}}

	arrStr := &reflection.RunType{ID: "arrStr", Kind: reflection.KindArray, Child: makeRef("str")}
	arrLit := &reflection.RunType{ID: "arrLit", Kind: reflection.KindArray, Child: makeRef("lit")}
	union := &reflection.RunType{ID: "union", Kind: reflection.KindUnion, Children: []*reflection.RunType{makeRef("str"), makeRef("num")}}

	propNum := &reflection.RunType{ID: "pNum", Kind: reflection.KindProperty, Name: "n", IsSafeName: true, Child: makeRef("num")}
	propStr := &reflection.RunType{ID: "pStr", Kind: reflection.KindProperty, Name: "s", IsSafeName: true, Child: makeRef("str")}
	propOpt := &reflection.RunType{ID: "pOpt", Kind: reflection.KindProperty, Name: "o", IsSafeName: true, Optional: true, Child: makeRef("str")}
	propFn := &reflection.RunType{ID: "pFn", Kind: reflection.KindProperty, Name: "f", IsSafeName: true, Child: makeRef("fn")}
	obj := &reflection.RunType{ID: "obj", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pNum"), makeRef("pStr"), makeRef("pOpt"), makeRef("pFn")}}
	empty := &reflection.RunType{ID: "empty", Kind: reflection.KindObjectLiteral}
	idx := &reflection.RunType{ID: "idx", Kind: reflection.KindIndexSignature, Child: makeRef("num"), Index: makeRef("str")}
	rec := &reflection.RunType{ID: "rec", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("idx")}}

	tm1 := &reflection.RunType{ID: "tm1", Kind: reflection.KindTupleMember, Position: position(0), Child: makeRef("num")}
	tm2 := &reflection.RunType{ID: "tm2", Kind: reflection.KindTupleMember, Position: position(1), Optional: true, Child: makeRef("str")}
	rest := &reflection.RunType{ID: "rest", Kind: reflection.KindRest, Child: makeRef("str")}
	tm3 := &reflection.RunType{ID: "tm3", Kind: reflection.KindTupleMember, Position: position(2), Child: makeRef("rest")}
	tuple := &reflection.RunType{ID: "tuple", Kind: reflection.KindTuple, Children: []*reflection.RunType{makeRef("tm1"), makeRef("tm2"), makeRef("tm3")}}

	propSelf := &reflection.RunType{ID: "pSelf", Kind: reflection.KindProperty, Name: "next", IsSafeName: true, Child: makeRef("circ")}
	circ := &reflection.RunType{ID: "circ", Kind: reflection.KindObjectLiteral, IsCircular: true, Children: []*reflection.RunType{makeRef("pNum"), makeRef("pSelf")}}

	all := []*reflection.RunType{str, num, boolT, big, nul, lit, re, enum, anyT, fn, date, mapT, instant, plainDate, int8, arrStr, arrLit, union, propNum, propStr, propOpt, propFn, obj, empty, idx, rec, tm1, tm2, rest, tm3, tuple, propSelf, circ}
	refTable := make(map[string]*reflection.RunType, len(all))
	byID := make(map[string]*reflection.RunType, len(all))
	for _, rt := range all {
		refTable[rt.ID] = rt
		byID[rt.ID] = rt
	}
	return &EmitContext{walker: &Walker{RefTable: refTable}}, byID
}

func TestMinWireBytes_PerKind(t *testing.T) {
	ctx, types := minBytesFixture(t)
	cases := map[string]int{
		"str":       1,  // varint length
		"num":       8,  // float64
		"int8":      1,  // packed integer format
		"bool":      1,  // one byte
		"big":       1,  // decimal string
		"nul":       1,  // sentinel byte
		"lit":       0,  // nothing on the wire
		"re":        0,  // never on the wire (not data)
		"enum":      5,  // uint32 tag + at least a byte
		"any":       1,  // JSON string
		"fn":        0,  // never on the wire
		"date":      8,  // float64 epoch
		"map":       1,  // varint count
		"instant":   12, // int64 + int32
		"plainDate": 1,  // calendar discriminator byte
		"arrStr":    1,  // varint count
		"arrLit":    1,  // varint count
		"union":     1,  // discriminator byte
		"obj":       10, // num 8 + str 1 + one bitmap byte for the optional; fn drops
		"empty":     0,  // zero bytes: the reader's ceiling applies
		"rec":       4,  // uint32 entry count
		"tuple":     10, // num 8 + optional bitmap 1 + rest count 1
		"circ":      8,  // num 8 + the self-ref counts 0 (never over-estimate)
	}
	for id, want := range cases {
		if got := minWireBytes(types[id], ctx); got != want {
			t.Errorf("minWireBytes(%s) = %d, want %d", id, got, want)
		}
	}
}

func TestMinWireBytes_RefResolves(t *testing.T) {
	ctx, _ := minBytesFixture(t)
	if got := minWireBytes(makeRef("num"), ctx); got != 8 {
		t.Errorf("a ref to number = %d, want 8", got)
	}
	if got := minWireBytes(makeRef("missing"), ctx); got != 0 {
		t.Errorf("an unresolvable ref = %d, want 0 (never over-estimate)", got)
	}
}
