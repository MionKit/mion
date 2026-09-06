package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// A union that declares a base class AND its subclass (`string | BaseErr |
// FatalErr`, mion's `RpcError<'x'> | FatalError<'y'>`). Two things keep the
// dispatch sound. Every flat encoder tries the EXACT constructor of every
// class member first, so a registered class encodes under its own index
// whatever the member order, and there is no instanceof arm. For the
// structural fallback (an unregistered class) the arms follow the union's
// SAFE order (SafeUnionChildren, computed by cachegen/runtype/union_safeorder.go:
// superset shapes first), never the checker's Children order, so a subclass
// instance lands on the subclass arm even when the checker listed the base
// first.
func buildBaseSubclassUnionFixture() protocol.Dump {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	typeProp := &reflection.RunType{ID: "ptb", Kind: reflection.KindProperty, Name: "type", IsSafeName: true, Child: makeRef("str")}
	fatalProp := &reflection.RunType{ID: "ptf", Kind: reflection.KindProperty, Name: "type", IsSafeName: true, Child: makeRef("str")}
	scopeProp := &reflection.RunType{ID: "pts", Kind: reflection.KindProperty, Name: "scope", IsSafeName: true, Child: makeRef("str")}
	// the base FIRST: the order the checker happened to pick must not matter
	base := &reflection.RunType{ID: "bas", Kind: reflection.KindClass, TypeName: "BaseErr", Children: []*reflection.RunType{makeRef("ptb")}}
	// the subclass declares one field more, so its shape is the more specific one
	fatal := &reflection.RunType{ID: "fat", Kind: reflection.KindClass, TypeName: "FatalErr", Children: []*reflection.RunType{makeRef("ptf"), makeRef("pts")}}
	union := &reflection.RunType{
		ID:   "uni",
		Kind: reflection.KindUnion,
		// the checker listed the base first; the safe order puts the more specific
		// subclass ahead of it, and that is the order the encoders must follow
		Children:          []*reflection.RunType{makeRef("str"), makeRef("bas"), makeRef("fat")},
		SafeUnionChildren: []*reflection.RunType{makeRef("str"), makeRef("fat"), makeRef("bas")},
	}
	return protocol.Dump{RunTypes: []*reflection.RunType{str, typeProp, fatalProp, scopeProp, base, fatal, union}}
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
		structuralBase := strings.Index(out, "Eq2V_bas?.fn(v)")
		structuralFatal := strings.Index(out, "Eq2V_fat?.fn(v)")
		if structuralBase < 0 || structuralFatal < 0 {
			t.Fatalf("[%s] expected a structural arm for both classes; got:\n%s", fam, out)
		}
		if exactBase > structuralBase || exactFatal > structuralBase || exactBase > structuralFatal || exactFatal > structuralFatal {
			t.Errorf("[%s] the exact-constructor arms must precede the structural fallback; got:\n%s", fam, out)
		}
		// the structural fallback follows the SAFE order (subclass first), not the
		// checker's: a base's guard accepts the subclass's extra key, the reverse
		// does not hold, so an unregistered subclass instance must land on the
		// subclass arm
		if structuralFatal > structuralBase {
			t.Errorf("[%s] the structural arms must follow SafeUnionChildren (the subclass first); got:\n%s", fam, out)
		}
	}
}
