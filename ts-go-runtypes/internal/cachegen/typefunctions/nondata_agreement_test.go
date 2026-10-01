package typefunctions

import (
	"fmt"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// Every family that throws on non-data agrees with reflection.NonDataOf at the root: a non-data root throws its own
// code, a data root never falls to TFN001. A kind reflection.FamilyOf maps fails here until kindRoot has its row.
// Roots only: TestNestedDiagCorpus_CoversEveryNonDataKind already makes every non-data kind run at every member position.

// kindRoot builds a minimal root of one kind; a nil builder marks a kind that is only ever a member, never a root.
var kindRoot = map[reflection.ReflectionKind]func() []*reflection.RunType{
	reflection.KindNever:     bareRoot(reflection.KindNever),
	reflection.KindAny:       bareRoot(reflection.KindAny),
	reflection.KindUnknown:   bareRoot(reflection.KindUnknown),
	reflection.KindVoid:      bareRoot(reflection.KindVoid),
	reflection.KindObject:    bareRoot(reflection.KindObject),
	reflection.KindString:    bareRoot(reflection.KindString),
	reflection.KindNumber:    bareRoot(reflection.KindNumber),
	reflection.KindBoolean:   bareRoot(reflection.KindBoolean),
	reflection.KindSymbol:    bareRoot(reflection.KindSymbol),
	reflection.KindBigInt:    bareRoot(reflection.KindBigInt),
	reflection.KindNull:      bareRoot(reflection.KindNull),
	reflection.KindUndefined: bareRoot(reflection.KindUndefined),
	reflection.KindRegexp:    bareRoot(reflection.KindRegexp),
	reflection.KindLiteral: func() []*reflection.RunType {
		return []*reflection.RunType{{ID: "root", Kind: reflection.KindLiteral, Literal: "a"}}
	},
	reflection.KindTemplateLiteral: bareRoot(reflection.KindTemplateLiteral),
	reflection.KindProperty:        nil,
	reflection.KindMethod:          bareRoot(reflection.KindMethod),
	reflection.KindFunction:        bareRoot(reflection.KindFunction),
	reflection.KindParameter:       nil,
	reflection.KindPromise:         wrapRoot(reflection.KindPromise),
	reflection.KindClass:           bareRoot(reflection.KindClass),
	reflection.KindEnum:            bareRoot(reflection.KindEnum),
	reflection.KindUnion:           listRoot(reflection.KindUnion),
	reflection.KindIntersection:    listRoot(reflection.KindIntersection),
	reflection.KindArray:           wrapRoot(reflection.KindArray),
	reflection.KindTuple: func() []*reflection.RunType {
		return []*reflection.RunType{mkStr(), {ID: "slot", Kind: reflection.KindTupleMember, Child: makeRef("str")}, {ID: "root", Kind: reflection.KindTuple, Children: []*reflection.RunType{makeRef("slot")}}}
	},
	reflection.KindTupleMember: nil,
	reflection.KindEnumMember:  nil,
	reflection.KindRest:        nil,
	reflection.KindObjectLiteral: func() []*reflection.RunType {
		return []*reflection.RunType{mkStr(), {ID: "prop", Kind: reflection.KindPropertySignature, Name: "a", IsSafeName: true, Child: makeRef("str")}, {ID: "root", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("prop")}}}
	},
	reflection.KindIndexSignature:    nil,
	reflection.KindPropertySignature: nil,
	reflection.KindMethodSignature:   bareRoot(reflection.KindMethodSignature),
	reflection.KindCallSignature:     bareRoot(reflection.KindCallSignature),
}

// shapeRoots are the non-data shapes a kind alone does not tell apart.
var shapeRoots = map[string]func() []*reflection.RunType{
	"unique symbol": func() []*reflection.RunType {
		return []*reflection.RunType{{ID: "root", Kind: reflection.KindLiteral, Flags: []string{"symbol"}}}
	},
	"callable interface": func() []*reflection.RunType { return callableInterface("root", true) },
	"typed array": func() []*reflection.RunType {
		return []*reflection.RunType{{ID: "root", Kind: reflection.KindClass, SubKind: reflection.SubKindNonSerializable, TypeName: "Uint8Array"}}
	},
	"Date": func() []*reflection.RunType {
		return []*reflection.RunType{{ID: "root", Kind: reflection.KindClass, SubKind: reflection.SubKindDate}}
	},
	"URL": func() []*reflection.RunType {
		return []*reflection.RunType{{ID: "root", Kind: reflection.KindClass, SubKind: reflection.SubKindUrl}}
	},
}

func bareRoot(kind reflection.ReflectionKind) func() []*reflection.RunType {
	return func() []*reflection.RunType { return []*reflection.RunType{{ID: "root", Kind: kind}} }
}

func wrapRoot(kind reflection.ReflectionKind) func() []*reflection.RunType {
	return func() []*reflection.RunType {
		return []*reflection.RunType{mkStr(), {ID: "root", Kind: kind, Child: makeRef("str")}}
	}
}

func listRoot(kind reflection.ReflectionKind) func() []*reflection.RunType {
	return func() []*reflection.RunType {
		return []*reflection.RunType{mkStr(), {ID: "root", Kind: kind, Children: []*reflection.RunType{makeRef("str")}}}
	}
}

// ownNonDataRule names the families that answer a non-data class on purpose instead of throwing.
func ownNonDataRule(emitter Emitter, nonData reflection.NonData) bool {
	switch emitter.(type) {
	case RemoveUnknownKeysEmitter:
		// Copies an immutable value as is; shares or refuses the rest under its sharedValues rules.
		return true
	case ValidateEmitter, ValidationErrorsEmitter, ValidateStrictEmitter, ValidationErrorsStrictEmitter, ValidateUnionKeysEmitter, ValidationErrorsUnionKeysEmitter:
		// `never` compiles to a check that always fails, which is what the type asks for.
		return nonData == reflection.NonDataNever
	}
	return false
}

func TestNonDataAgreement_EveryKindHasARow(t *testing.T) {
	for kind := reflection.KindNever; kind < 256; kind++ {
		if reflection.FamilyOf(kind) == reflection.FamilyUnknown {
			continue
		}
		if _, ok := kindRoot[kind]; !ok {
			t.Errorf("kind %d has no row in kindRoot: say whether it can be a root and build one", kind)
		}
	}
}

func TestNonDataAgreement_RootThrowsWithItsOwnCode(t *testing.T) {
	roots := map[string]func() []*reflection.RunType{}
	for kind, build := range kindRoot {
		if build != nil {
			roots[fmt.Sprintf("kind %d", kind)] = build
		}
	}
	for name, build := range shapeRoots {
		roots[name] = build
	}
	for _, spec := range Families {
		provider, ok := spec.Emitter.(LeafDiagCodeProvider)
		if !ok {
			continue
		}
		for name, build := range roots {
			nodes := build()
			root := nodes[len(nodes)-1]
			refTable := map[string]*reflection.RunType{}
			for _, node := range nodes {
				refTable[node.ID] = node
			}
			resolve := func(ref *reflection.RunType) *reflection.RunType { return refTable[ref.ID] }
			nonData := reflection.NonDataOf(root, resolve)
			out, _ := renderWithDiag(t, protocol.Dump{RunTypes: nodes}, spec.Key, "root")
			throwsInternal := strings.Contains(out, "'["+diagnostics.CodeUnsupportedLeafNoCode+"] ")
			if throwsInternal {
				t.Errorf("[%s] %s falls to %s: the family has no code for it", spec.Key, name, diagnostics.CodeUnsupportedLeafNoCode)
			}
			if nonData == reflection.Data || ownNonDataRule(spec.Emitter, nonData) {
				continue
			}
			code := provider.DiagCodeForLeaf(root, resolve)
			if code == "" {
				t.Errorf("[%s] %s is non-data (class %d) and the family has no root code for it", spec.Key, name, nonData)
				continue
			}
			if !strings.Contains(out, "'["+code+"] ") {
				t.Errorf("[%s] %s is non-data (class %d) and must throw with %s; got:\n%s", spec.Key, name, nonData, code, out)
			}
		}
	}
}
