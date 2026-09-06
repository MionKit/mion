package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// A registered class value may carry own fields beyond the ones its type
// declares (a subclass instance returned where the base is declared: it is
// `instanceof` the base, so it rides the base's arm). Every encoder that
// builds a NEW value for the class must carry those fields along; the
// decoders read them back. Only the positional compact family, which has no
// slot for a named field, keeps the declared positions alone.
func buildRegisteredClassDump() protocol.Dump {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	typeProp := &reflection.RunType{ID: "ptb", Kind: reflection.KindProperty, Name: "type", IsSafeName: true, Child: makeRef("str")}
	base := &reflection.RunType{ID: "bas", Kind: reflection.KindClass, TypeName: "BaseErr", Children: []*reflection.RunType{makeRef("ptb")}}
	return protocol.Dump{RunTypes: []*reflection.RunType{str, typeProp, base}}
}

func TestClassSerializer_ExtrasRideEveryNamedEncoder(t *testing.T) {
	dump := buildRegisteredClassDump()
	cases := map[string]string{
		"prepareForJsonSafe": "utl.withOwnExtras((function(v){",
		"stringifyJson":      "utl.jsonWithOwnExtras((function(v){",
	}
	for fam, want := range cases {
		out := renderModule(t, dump, fam)
		if !strings.Contains(out, "utl.ownExtras(v, k_bas)") || !strings.Contains(out, want) {
			t.Errorf("[%s] expected the registered-class extras branch (`%s`); got:\n%s", fam, want, out)
		}
		// the branch sits after the custom-serialize branch and before the structural body
		if strings.Index(out, ".serialize(v)") > strings.Index(out, "utl.ownExtras(v, k_bas)") {
			t.Errorf("[%s] a custom serialize must win over the extras branch; got:\n%s", fam, out)
		}
	}
}

func TestClassSerializer_CompactStaysPositional(t *testing.T) {
	out := renderModule(t, buildRegisteredClassDump(), "compactForJson")
	if strings.Contains(out, "ownExtras") {
		t.Errorf("compact encodes declared positions only, no extras branch expected; got:\n%s", out)
	}
}

func TestClassSerializer_BinaryTagAndExtrasFrame(t *testing.T) {
	dump := buildRegisteredClassDump()
	to := renderModule(t, dump, "toBinary")
	for _, want := range []string{
		"const ex_bas = utl.ownExtras(v, k_bas)",
		".setUint8(Ser.index++, 1)",
		".setUint8(Ser.index++, 0)",
		"Ser.serString(JSON.stringify(ex_bas))",
	} {
		if !strings.Contains(to, want) {
			t.Errorf("[toBinary] expected `%s`; got:\n%s", want, to)
		}
	}
	// the custom serialize frame stays untagged: the decoder picks it by `cs.serialize`
	if strings.Contains(to[:strings.Index(to, "else if (cs_bas)")], "setUint8") {
		t.Errorf("[toBinary] the custom serialize frame must not carry the tag byte; got:\n%s", to)
	}
	from := renderModule(t, dump, "fromBinary")
	for _, want := range []string{
		"const tg_bas = Des.view.getUint8(Des.index++)",
		"if (tg_bas === 1) ret = utl.withOwnExtras(ret, JSON.parse(Des.desString()), k_bas)",
		"ret = utl.deserializeClass(cs_bas, ret, k_bas)",
	} {
		if !strings.Contains(from, want) {
			t.Errorf("[fromBinary] expected `%s`; got:\n%s", want, from)
		}
	}
}
