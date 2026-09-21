package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// An optional property whose value kind has no binary emit is ABSORBED
// (propertyChildFailed returns false for it), leaving the compiled child empty
// on both wire sides. Nothing guards that empty body, so these tests pin what
// it emits: the presence bit is still reserved and set, and neither side moves
// the byte cursor, so the optionals after it keep their masks.

// buildAbsorbedOptionalFixture builds `{a?: X; b?: string; c?: number}` where
// X is a type parameter — a kind no binary emitter handles and
// isStrippedUnionMember does not treat as stripped, so `a` is absorbed.
func buildAbsorbedOptionalFixture() protocol.Dump {
	typeParam := &reflection.RunType{ID: "tpx", Kind: reflection.KindTypeParameter, Name: "X"}
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	num := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	propA := &reflection.RunType{ID: "pa", Kind: reflection.KindPropertySignature, Name: "a", IsSafeName: true, Optional: true, Child: makeRef("tpx")}
	propB := &reflection.RunType{ID: "pb", Kind: reflection.KindPropertySignature, Name: "b", IsSafeName: true, Optional: true, Child: makeRef("str")}
	propC := &reflection.RunType{ID: "pc", Kind: reflection.KindPropertySignature, Name: "c", IsSafeName: true, Optional: true, Child: makeRef("num")}
	obj := &reflection.RunType{
		ID: "obj", Kind: reflection.KindObjectLiteral,
		Children: []*reflection.RunType{makeRef("pa"), makeRef("pb"), makeRef("pc")},
	}
	return protocol.Dump{RunTypes: []*reflection.RunType{typeParam, str, num, propA, propB, propC, obj}}
}

func TestFromBinary_AbsorbedOptionalEmitsEmptyBitBody(t *testing.T) {
	out := renderModule(t, buildAbsorbedOptionalFixture(), "fromBinary")

	// Bit 0 is read and its body is empty: no read, no cursor move.
	if !strings.Contains(out, "if ((Des.view.getUint8(bmI0 + 0) & 1)) {}") {
		t.Errorf("expected an empty-bodied bit-0 check for the absorbed optional; got:\n%s", out)
	}
	// The absorbed member must not shift the ones after it.
	if !strings.Contains(out, "if ((Des.view.getUint8(bmI0 + 0) & 2)) {ret.b = Des.desString();}") {
		t.Errorf("expected `b` to decode under bit 1 (mask 2); got:\n%s", out)
	}
	if !strings.Contains(out, "if ((Des.view.getUint8(bmI0 + 0) & 4)) {ret.c = ") {
		t.Errorf("expected `c` to decode under bit 2 (mask 4); got:\n%s", out)
	}
	// One bitmap byte, read once before the checks.
	if !strings.Contains(out, "const bmI0 = Des.index++;") {
		t.Errorf("expected a single-byte bitmap read; got:\n%s", out)
	}
	if strings.Contains(out, "ret.a") {
		t.Errorf("the absorbed property must not appear in the decoded object; got:\n%s", out)
	}
}

func TestToBinary_AbsorbedOptionalWritesBitOnly(t *testing.T) {
	out := renderModule(t, buildAbsorbedOptionalFixture(), "toBinary")

	// The decoder's empty body is only safe because the encoder writes the bit
	// and nothing else for the same member.
	if !strings.Contains(out, "if (v.a !== undefined) {Ser.setBitMask(bmI0, 0)}") {
		t.Errorf("expected bit 0 set with no value write for the absorbed optional; got:\n%s", out)
	}
	if !strings.Contains(out, "if (v.b !== undefined) {Ser.serString(v.b);Ser.setBitMask(bmI0, 1)}") {
		t.Errorf("expected `b` to write its value then bit 1; got:\n%s", out)
	}
	if !strings.Contains(out, "Ser.setBitMask(bmI0, 2)") {
		t.Errorf("expected `c` to write bit 2; got:\n%s", out)
	}
}
