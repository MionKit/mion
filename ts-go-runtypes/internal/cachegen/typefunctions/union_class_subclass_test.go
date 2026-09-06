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
// source's, so instance identity alone routes a FatalErr to the BaseErr arm
// whenever the base comes first. Every flat encoder must try the EXACT
// constructor of every class member before any `instanceof` arm, so each
// declared class encodes under its own index whatever the member order.
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

func TestUnionClassMembers_ExactConstructorBeforeInstanceof(t *testing.T) {
	dump := buildBaseSubclassUnionFixture()
	for _, fam := range []string{"prepareForJson", "prepareForJsonSafe", "stringifyJson", "toBinary"} {
		out := renderModule(t, dump, fam)
		exactBase := strings.Index(out, "v?.constructor === cix_bas.cls")
		exactFatal := strings.Index(out, "v?.constructor === cix_fat.cls")
		instanceBase := strings.Index(out, "v instanceof cix_bas.cls")
		instanceFatal := strings.Index(out, "v instanceof cix_fat.cls")
		if exactBase < 0 || exactFatal < 0 || instanceBase < 0 || instanceFatal < 0 {
			t.Fatalf("[%s] expected an exact-constructor arm AND an instanceof arm for both classes; got:\n%s", fam, out)
		}
		// both exact arms come before the first instanceof arm, so a FatalErr never
		// falls into BaseErr's instanceof arm just because BaseErr is listed first
		if exactFatal > instanceBase || exactBase > instanceBase {
			t.Errorf("[%s] the exact-constructor arms must precede every instanceof arm; got:\n%s", fam, out)
		}
		if instanceBase > instanceFatal {
			t.Errorf("[%s] within the instanceof pass the member order is kept; got:\n%s", fam, out)
		}
	}
}
