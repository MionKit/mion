package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// A union that declares a base class AND its subclass (`string | BaseErr |
// FatalErr`, mion's `RpcError<'x'> | FatalError<'y'>`): a subclass instance is
// also `instanceof` the base, and the member order is the checker's, not the
// source's, so a structural guess alone could route a FatalErr to the BaseErr
// arm whenever the base comes first. Every flat encoder tries the EXACT
// constructor of every class member first, so each declared class encodes
// under its own index whatever the member order; there is no instanceof arm.
func buildBaseSubclassUnionFixture() protocol.Dump {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	typeProp := &reflection.RunType{ID: "ptb", Kind: reflection.KindProperty, Name: "type", IsSafeName: true, Child: makeRef("str")}
	fatalProp := &reflection.RunType{ID: "ptf", Kind: reflection.KindProperty, Name: "type", IsSafeName: true, Child: makeRef("str")}
	// the base FIRST: the order the checker happened to pick must not matter
	base := &reflection.RunType{ID: "bas", Kind: reflection.KindClass, TypeName: "BaseErr", Children: []*reflection.RunType{makeRef("ptb")}}
	fatal := &reflection.RunType{ID: "fat", Kind: reflection.KindClass, TypeName: "FatalErr", Children: []*reflection.RunType{makeRef("ptf")}}
	union := &reflection.RunType{
		ID:                "uni",
		Kind:              reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("str"), makeRef("bas"), makeRef("fat")},
		SafeUnionChildren: []*reflection.RunType{makeRef("str"), makeRef("bas"), makeRef("fat")},
	}
	return protocol.Dump{RunTypes: []*reflection.RunType{str, typeProp, fatalProp, base, fatal, union}}
}

func TestUnionClassMembers_ExactConstructorOnly(t *testing.T) {
	dump := buildBaseSubclassUnionFixture()
	for _, fam := range []string{"prepareForJson", "prepareForJsonSafe", "stringifyJson", "toBinary"} {
		out := renderModule(t, dump, fam)
		exactBase := strings.Index(out, "v?.constructor === cix_bas.cls")
		exactFatal := strings.Index(out, "v?.constructor === cix_fat.cls")
		if exactBase < 0 || exactFatal < 0 {
			t.Fatalf("[%s] expected an exact-constructor arm for both classes; got:\n%s", fam, out)
		}
		// no instanceof arm: a subclass instance is not the declared class and
		// takes the structural road, so its undeclared keys follow the
		// unknown-keys rules instead of a class-lane side channel
		if strings.Contains(out, "instanceof cix_") {
			t.Errorf("[%s] a class member must not carry an instanceof arm; got:\n%s", fam, out)
		}
		// the exact arms come before the structural fallback of either class
		structural := strings.Index(out, "Eq2V_bas?.fn(v)")
		if structural >= 0 && (exactBase > structural || exactFatal > structural) {
			t.Errorf("[%s] the exact-constructor arms must precede the structural fallback; got:\n%s", fam, out)
		}
	}
}
