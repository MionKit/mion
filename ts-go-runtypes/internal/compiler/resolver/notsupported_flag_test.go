package resolver_test

import (
	"testing"

	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// NotSupported reflection-flag tests. The serializer KEEPS non-data members
// (method signatures, symbols, …) in the reflected tree; PopulateFamily flags
// exactly those nodes with NotSupported at cache-exit. The data members and
// the non-data node's OWN children stay unflagged — only the node itself
// carries the flag. The type-function emitters are unchanged: they still drop
// these members at compile time; this is the
// reflection annotation only.
//
// Paired *_Static / *_Reflect per the marker test coverage rule (CLAUDE.md),
// sharing one assertion helper.

const notSupportedMixed = `interface Mixed { a: string; greet(name: string): string; sym: symbol; }`

func TestNotSupportedFlag_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
` + notSupportedMixed + `
getRunTypeId<Mixed>();
`
	r, root := resolveInline(t, code)
	assertNotSupportedFlag(t, r, root)
}

func TestNotSupportedFlag_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
` + notSupportedMixed + `
declare const value: Mixed;
getRunTypeId(value);
`
	r, root := resolveInline(t, code)
	assertNotSupportedFlag(t, r, root)
}

func assertNotSupportedFlag(t *testing.T, r *resolver.Session, root *reflection.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != reflection.KindObjectLiteral {
		t.Fatalf("expected KindObjectLiteral root, got %+v", root)
	}
	if root.NotSupported {
		t.Fatalf("object literal root must not be notSupported")
	}

	// Data property: kept and NOT flagged; its string child unflagged too.
	a := findMember(types, root, "a")
	if a == nil {
		t.Fatalf("missing data property 'a'; children=%+v", root.Children)
	}
	if a.NotSupported {
		t.Fatalf("data property 'a' must not be notSupported, got %+v", a)
	}
	if at := deref(types, a.Child); at == nil || at.Kind != reflection.KindString || at.NotSupported {
		t.Fatalf("a.child expected an unflagged KindString, got %+v", at)
	}

	// Non-data method: KEPT in the tree (not dropped) AND flagged notSupported.
	greet := findMember(types, root, "greet")
	if greet == nil {
		t.Fatalf("non-data method 'greet' must be KEPT in the reflected tree, not dropped; children=%+v", root.Children)
	}
	if greet.Kind != reflection.KindMethodSignature {
		t.Fatalf("greet expected KindMethodSignature, got kind=%d", greet.Kind)
	}
	if !greet.NotSupported {
		t.Fatalf("non-data method 'greet' must be flagged notSupported, got %+v", greet)
	}
	// Only the method node is flagged — its own param + return children are not.
	for _, paramRef := range greet.Parameters {
		if param := deref(types, paramRef); param != nil && param.NotSupported {
			t.Fatalf("method parameter must NOT be flagged (only the node itself), got %+v", param)
		}
	}
	if ret := deref(types, greet.Return); ret != nil && ret.NotSupported {
		t.Fatalf("method return must NOT be flagged (only the node itself), got %+v", ret)
	}

	// Symbol member: the symbol leaf is kept in the tree and flagged wherever
	// it sits (reached via the 'sym' property's child).
	var symbolNode *reflection.RunType
	for _, node := range types {
		if node != nil && node.Kind == reflection.KindSymbol {
			symbolNode = node
			break
		}
	}
	if symbolNode == nil {
		t.Fatalf("symbol member must be KEPT in the reflected tree as a KindSymbol node")
	}
	if !symbolNode.NotSupported {
		t.Fatalf("KindSymbol node must be flagged notSupported, got %+v", symbolNode)
	}
}
