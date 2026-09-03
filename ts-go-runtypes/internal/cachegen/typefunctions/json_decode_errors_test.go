package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// The JSON restore arms throw on a wire value that is not the form the
// encoder writes, with the message hoisted ONCE into the factory prologue
// (json_decode_errors.go). Pins the prologue line, the guard shape of every
// arm, and that the prepare side keeps its pass-through loop.
func buildDecodeErrorFixture() []*reflection.RunType {
	date := &reflection.RunType{ID: "dat", Kind: reflection.KindClass, SubKind: reflection.SubKindDate}
	bigint := &reflection.RunType{ID: "big", Kind: reflection.KindBigInt}
	mapT := &reflection.RunType{ID: "mp", Kind: reflection.KindClass, SubKind: reflection.SubKindMap}
	setT := &reflection.RunType{ID: "st", Kind: reflection.KindClass, SubKind: reflection.SubKindSet}
	instant := &reflection.RunType{ID: "ins", Kind: reflection.KindClass, SubKind: reflection.SubKindTemporalInstant}
	arrDate := &reflection.RunType{ID: "arr", Kind: reflection.KindArray, Child: makeRef("dat")}

	propA := &reflection.RunType{ID: "pa", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("dat")}
	propB := &reflection.RunType{ID: "pb", Kind: reflection.KindProperty, Name: "b", IsSafeName: true, Child: makeRef("big")}
	propC := &reflection.RunType{ID: "pc", Kind: reflection.KindProperty, Name: "c", IsSafeName: true, Child: makeRef("mp")}
	propD := &reflection.RunType{ID: "pd", Kind: reflection.KindProperty, Name: "d", IsSafeName: true, Child: makeRef("st")}
	propE := &reflection.RunType{ID: "pe", Kind: reflection.KindProperty, Name: "e", IsSafeName: true, Child: makeRef("ins")}
	propF := &reflection.RunType{ID: "pf", Kind: reflection.KindProperty, Name: "f", IsSafeName: true, Child: makeRef("arr")}
	obj := &reflection.RunType{
		ID: "obj", Kind: reflection.KindObjectLiteral,
		Children: []*reflection.RunType{makeRef("pa"), makeRef("pb"), makeRef("pc"), makeRef("pd"), makeRef("pe"), makeRef("pf")},
	}
	return []*reflection.RunType{date, bigint, mapT, setT, instant, arrDate, propA, propB, propC, propD, propE, propF, obj}
}

func TestRestoreFromJson_WrongWireFormThrowsHoistedMessage(t *testing.T) {
	out := renderModuleDefault(t, protocol.Dump{RunTypes: buildDecodeErrorFixture()}, "restoreFromJson")

	for _, want := range []string{
		"const jdDateErr = ",
		"Can not json decode Date: expected an ISO date string or a Date",
		"const jdBigintErr = ",
		"Can not json decode bigint: expected a decimal string, a whole number or a bigint",
		"const jdMapErr = ",
		"Can not json decode Map: expected an array of entries or a Map",
		"const jdSetErr = ",
		"Can not json decode Set: expected an array or a Set",
		"const jdTemporalInstantErr = ",
		"Can not json decode Temporal.Instant: expected an ISO string or a Temporal.Instant",
		"const jdArrayErr = ",
		"Can not json decode array: expected an array",
		// the arms: transform on the wire form, throw on the cold branch
		"{v.a = new Date(v.a)} else if (!(v.a instanceof Date)) {throw new Error(jdDateErr)}",
		"{v.b = BigInt(v.b)} else if (!(typeof v.b === \\'bigint\\')) {throw new Error(jdBigintErr)}",
		"if (Array.isArray(v.c)) {v.c = new Map(v.c)} else if (!(v.c instanceof Map)) {throw new Error(jdMapErr)}",
		"if (Array.isArray(v.d)) {v.d = new Set(v.d)} else if (!(v.d instanceof Set)) {throw new Error(jdSetErr)}",
		"{v.e = Temporal.Instant.from(v.e)} else if (!(v.e instanceof Temporal.Instant)) {throw new Error(jdTemporalInstantErr)}",
		"else {throw new Error(jdArrayErr)}",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("expected %q in the restore module; got:\n%s", want, out)
		}
	}
	// One prologue const per factory per message, however many arms share it:
	// the object factory has two Date arms (`a` and the `f` elements).
	objEntry := out[strings.Index(out, "init('X13R_obj'"):]
	if next := strings.Index(objEntry[1:], "init('"); next >= 0 {
		objEntry = objEntry[:next+1]
	}
	if got := strings.Count(objEntry, "const jdDateErr = "); got != 1 {
		t.Errorf("expected exactly one hoisted jdDateErr in the object factory, got %d:\n%s", got, objEntry)
	}
}

func TestCompactFromJson_NonArrayObjectWireThrows(t *testing.T) {
	out := renderModuleDefault(t, protocol.Dump{RunTypes: buildDecodeErrorFixture()}, "compactFromJson")
	for _, want := range []string{
		"Can not json decode object: expected a positional array or an object",
		"else if (typeof v !== \\'object\\' || v === null) {throw new Error(jdObjectErr)}",
		"instanceof Date)) {throw new Error(jdDateErr)}",
		"else {throw new Error(jdArrayErr)}",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("expected %q in the compact restore module; got:\n%s", want, out)
		}
	}
}

func TestPrepareForJson_ArrayLoopStaysPassThrough(t *testing.T) {
	out := renderModuleDefault(t, protocol.Dump{RunTypes: buildDecodeErrorFixture()}, "prepareForJson")
	if strings.Contains(out, "Can not json decode") {
		t.Errorf("the encode side must not carry decode messages; got:\n%s", out)
	}
}

func TestIdentifierOf(t *testing.T) {
	for in, want := range map[string]string{"Temporal.PlainDate": "TemporalPlainDate", "bigint": "Bigint", "Map": "Map", "array": "Array"} {
		if got := identifierOf(in); got != want {
			t.Errorf("identifierOf(%q) = %q, want %q", in, got, want)
		}
	}
}
