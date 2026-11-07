package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// splitIndexSigObject builds `{[k: string]: S; [k: number]: N}`, as the resolver splits `Record<string | number, T>`.
func splitIndexSigObject(numberValue string) []*reflection.RunType {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	big := &reflection.RunType{ID: "big", Kind: reflection.KindBigInt}
	strKey := &reflection.RunType{ID: "sk", Kind: reflection.KindString}
	numKey := &reflection.RunType{ID: "nk", Kind: reflection.KindNumber}
	strSig := &reflection.RunType{ID: "sSig", Kind: reflection.KindIndexSignature, Index: makeRef("sk"), Child: makeRef("str")}
	numSig := &reflection.RunType{ID: "nSig", Kind: reflection.KindIndexSignature, Index: makeRef("nk"), Child: makeRef(numberValue)}
	obj := &reflection.RunType{ID: "obj", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("sSig"), makeRef("nSig")}}
	return []*reflection.RunType{str, big, strKey, numKey, strSig, numSig, obj}
}

// count counts `needle` in the object entry's code string (the init line carries the code twice).
func count(t *testing.T, runTypes []*reflection.RunType, family, needle string) (int, string) {
	entry := familyEntry(t, runTypes, family, "obj")
	code, _, _ := strings.Cut(entry, ",function g_")
	return strings.Count(code, needle), entry
}

// A second signature with the same value type swept every key again: values written, checked and reported twice.
func TestRepeatedIndexSignatureSweepsOnce(t *testing.T) {
	runTypes := splitIndexSigObject("str")
	for _, fam := range []string{"prepareForJsonClone", "compactForJson"} {
		if got, out := count(t, runTypes, fam, "_r[k0] = "); got != 1 {
			t.Errorf("[%s] want one write per key, got %d:\n%s", fam, got, out)
		}
	}
	for _, fam := range []string{"validate", "validationErrors"} {
		if got, out := count(t, runTypes, fam, "for (const "); got != 1 {
			t.Errorf("[%s] want one for-in sweep, got %d:\n%s", fam, got, out)
		}
	}
}

func TestIndexSignaturesWithDifferentValuesBothSweep(t *testing.T) {
	runTypes := splitIndexSigObject("big")
	for _, fam := range []string{"validate", "validationErrors"} {
		if got, out := count(t, runTypes, fam, "for (const "); got != 2 {
			t.Errorf("[%s] want both sweeps, got %d:\n%s", fam, got, out)
		}
	}
	out := familyEntry(t, runTypes, "prepareForJsonClone", "obj")
	if !strings.Contains(out, ".toString()") {
		t.Errorf("clone must keep the bigint signature's transform:\n%s", out)
	}
}
