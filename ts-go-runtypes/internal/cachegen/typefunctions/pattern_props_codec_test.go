package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// patternPropsDump builds `{name: string} & patternProperties {'^d_': bigint}`:
// a declared member next to a pattern-keyed value that needs a transform on
// every road (bigint has no JSON form and a distinct binary layout).
func patternPropsDump() protocol.Dump {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	big := &reflection.RunType{ID: "big", Kind: reflection.KindBigInt}
	name := &reflection.RunType{ID: "pn", Kind: reflection.KindPropertySignature, Name: "name", IsSafeName: true, Child: makeRef("str")}
	outer := &reflection.RunType{ID: "outer", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pn")}}
	outer.PatternProps = []*reflection.PatternPropCheck{{Source: "^d_", Key: makeRef("str"), Value: makeRef("big")}}
	return protocol.Dump{RunTypes: []*reflection.RunType{str, big, name, outer}}
}

// A patternProperties value is data the codecs must carry: every road walks
// the matching keys (one hoisted regex per sweep), transforms the value the
// way an index-signature value is transformed, and the entry is a real
// function rather than the noop short form. validate keeps its own pattern
// check; this pins that the codecs no longer ignore the slot.
func TestPatternProps_EveryCodecWalksTheMatchingKeys(t *testing.T) {
	dump := patternPropsDump()
	regex := `new RegExp("^d_")`
	for _, fam := range []string{"prepareForJson", "prepareForJsonSafe", "stringifyJson", "restoreFromJson", "compactForJson", "compactFromJson", "cloneExactShape", "toBinary", "fromBinary"} {
		out := renderModule(t, dump, fam)
		// The binary decoder reads the count the encoder wrote, so it filters
		// nothing itself: its evidence is the key read of the pattern block.
		if fam == "fromBinary" {
			if !strings.Contains(out, "desSafePropName()") {
				t.Errorf("[fromBinary] the pattern block must read its keys back; got:\n%s", out)
			}
		} else if !strings.Contains(out, regex) {
			t.Errorf("[%s] the pattern-keyed sweep must hoist its key regex; got:\n%s", fam, out)
		}
		if strings.Contains(out, "_outer','objectLiteral',,true") {
			t.Errorf("[%s] an object with a transforming pattern value is not a noop; got:\n%s", fam, out)
		}
	}
	// The decode roads carry the prototype-name refusal on the pattern sweep too.
	for _, fam := range []string{"restoreFromJson", "compactFromJson"} {
		out := renderModule(t, dump, fam)
		if !strings.Contains(out, UnsafeKeyMessage) {
			t.Errorf("[%s] the pattern-keyed decode sweep must refuse prototype-named keys; got:\n%s", fam, out)
		}
	}
}

// A pattern value that needs no transform leaves the encode roads noop (the
// key match filters nothing worth doing) while the decode roads still ship
// their key loop for the refusal, exactly like a plain index signature.
func TestPatternProps_NoopValueMatchesIndexSignatureVerdicts(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	num := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	outer := &reflection.RunType{ID: "outer", Kind: reflection.KindObjectLiteral}
	outer.PatternProps = []*reflection.PatternPropCheck{{Source: "^n_", Key: makeRef("str"), Value: makeRef("num")}}
	dump := protocol.Dump{RunTypes: []*reflection.RunType{str, num, outer}}
	if out := renderModule(t, dump, "prepareForJson"); !strings.Contains(out, "_outer','objectLiteral',,true") {
		t.Errorf("[prepareForJson] a number-valued pattern rebuilds nothing on encode; got:\n%s", out)
	}
	if out := renderModule(t, dump, "restoreFromJson"); strings.Contains(out, "_outer','objectLiteral',,true") || !strings.Contains(out, UnsafeKeyMessage) {
		t.Errorf("[restoreFromJson] the pattern sweep ships its refusal and the entry is live; got:\n%s", out)
	}
}
