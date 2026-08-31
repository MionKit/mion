package typeid_test

import (
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/protocol"
	"github.com/mionkit/ts-runtypes/internal/reflection"
)

const runtypesDTS = `declare module '@mionjs/run-types' {
  export type InjectRunTypeId<T> = string & {readonly __rtInjectRunTypeIdBrand?: T};
  export function getRunTypeId<T>(value?: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
}
`

// inlineResolver builds an in-memory program around the supplied snippet
// and returns a resolver ready for OpScanFiles / OpDump.
func inlineResolver(t *testing.T, code string) *resolver.Session {
	t.Helper()
	cwd := tspath.NormalizePath(t.TempDir())
	dtsPath := tspath.ResolvePath(cwd, "runtypes.d.ts")
	testPath := tspath.ResolvePath(cwd, "test.ts")
	overlay := map[string]string{
		dtsPath:  runtypesDTS,
		testPath: code,
	}
	prog, err := program.NewInferred(program.Options{
		Cwd:            cwd,
		SingleThreaded: true,
		Overlay:        overlay,
	}, []string{dtsPath, testPath})
	if err != nil {
		t.Fatalf("program.NewInferred: %v", err)
	}
	res, err := resolver.New(prog, resolver.Options{Cwd: cwd, SingleThreaded: true})
	if err != nil {
		t.Fatalf("resolver.New: %v", err)
	}
	t.Cleanup(res.Close)
	return res
}

// rootFor scans test.ts and returns the RunType node for the first
// (and only) call site.
func rootFor(t *testing.T, code string) (*resolver.Session, *reflection.RunType) {
	t.Helper()
	res := inlineResolver(t, code)
	scanResp := res.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"test.ts"}})
	if scanResp.Error != "" {
		t.Fatalf("scanFiles: %s", scanResp.Error)
	}
	if len(scanResp.Sites) == 0 {
		t.Fatalf("scanFiles returned no sites")
	}
	dump := res.Dispatch(protocol.Request{Op: protocol.OpDump}).RunTypes
	for _, node := range dump {
		if node.ID == scanResp.Sites[0].ID {
			return res, node
		}
	}
	t.Fatalf("root id %q not in dump", scanResp.Sites[0].ID)
	return nil, nil
}

// TestStructural_DateAndMapShareNothing — Date and Map<string, number>
// must produce different cache entries (different SubKind, different
// structural id, different hash).
func TestStructural_DateAndMapShareNothing(t *testing.T) {
	_, dateNode := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<Date>();
`)
	_, mapNode := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<Map<string, number>>();
`)
	if dateNode.ID == mapNode.ID {
		t.Fatalf("expected Date and Map to have distinct ids, both got %q", dateNode.ID)
	}
	if dateNode.SubKind != reflection.SubKindDate {
		t.Fatalf("Date: expected SubKindDate, got %d", dateNode.SubKind)
	}
	if mapNode.SubKind != reflection.SubKindMap {
		t.Fatalf("Map: expected SubKindMap, got %d", mapNode.SubKind)
	}
}

// TestStructural_NonSerializableNotDeduplicatedWithObjectLiteral —
// `Error` (now a non-serialisable class) and a hand-rolled `{message:
// string; name: string}` object literal carry different shapes and
// MUST NOT collapse to the same cache id. Regression test for the
// `subKind || kind` prefix rule.
func TestStructural_NonSerializableNotDeduplicatedWithObjectLiteral(t *testing.T) {
	_, errorNode := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<Error>();
`)
	_, plainNode := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
type ErrorShape = {message: string; name: string};
getRunTypeId<ErrorShape>();
`)
	if errorNode.ID == plainNode.ID {
		t.Fatalf("non-serializable Error must not share id with a plain object literal of same shape")
	}
	if errorNode.SubKind != reflection.SubKindNonSerializable {
		t.Fatalf("Error: expected SubKindNonSerializable, got %d", errorNode.SubKind)
	}
}

// TestStructural_MapDistinctElementTypes — two Map instantiations with
// different value types must NOT collapse, because the SubKindMapValue
// child's structural id differs.
func TestStructural_MapDistinctElementTypes(t *testing.T) {
	_, mapStringNumber := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<Map<string, number>>();
`)
	_, mapStringString := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<Map<string, string>>();
`)
	if mapStringNumber.ID == mapStringString.ID {
		t.Fatalf("Map<string,number> must not share id with Map<string,string>")
	}
}

// TestStructural_TupleRestNotDeduplicatedWithFixed — a rest tuple
// `[number, ...string[]]` and a fixed tuple `[number, string]` reduce to the
// same element TYPE list, but the rest flag makes them different shapes (the
// tail absorbs zero-or-more trailing strings, so `[3]` is valid for the rest
// tuple but not the fixed one). The reference RT-compiles per call so the two never
// share a runtime Type; our AOT cache is project-global, so without folding
// the element flags into the id they collapse to one entry and the
// nondeterministically-chosen winner gives one of them the wrong validator.
func TestStructural_TupleRestNotDeduplicatedWithFixed(t *testing.T) {
	_, restNode := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<[number, ...string[]]>();
`)
	_, fixedNode := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<[number, string]>();
`)
	if restNode.ID == fixedNode.ID {
		t.Fatalf("rest tuple [number, ...string[]] must not share id with fixed [number, string], both got %q", restNode.ID)
	}
}

// TestStructural_ObjectPropertyOrderIndependent — two object types with the SAME
// properties declared in a DIFFERENT order must produce the SAME structural id.
// Object members are sorted by name before hashing (memberIDs → sort.Strings in
// typeid.go), so declaration order is irrelevant: `{a; b; c}` ≡ `{c; a; b}`, at
// the top level and at every nesting level. The negative control confirms the
// equality is not vacuous — a different property SET must still produce a
// different id.
func TestStructural_ObjectPropertyOrderIndependent(t *testing.T) {
	_, ordered := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
type T = {alpha: string; beta: number; nested: {x: string; y: number}};
getRunTypeId<T>();
`)
	_, reordered := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
type T = {nested: {y: number; x: string}; beta: number; alpha: string};
getRunTypeId<T>();
`)
	if ordered.ID != reordered.ID {
		t.Fatalf("object property order must not affect the structural id: {alpha,beta,nested}=%q vs reordered=%q", ordered.ID, reordered.ID)
	}

	// Negative control: a genuinely different property set (nested `z` instead of
	// `y`) must NOT share the id — proves the equality above isn't vacuous.
	_, different := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
type T = {alpha: string; beta: number; nested: {x: string; z: number}};
getRunTypeId<T>();
`)
	if ordered.ID == different.ID {
		t.Fatalf("object id must depend on the property SET — nested {x,y} vs {x,z} should differ, both got %q", ordered.ID)
	}
}

// TestStructural_HashIdLooksLikeIdentifier sanity-checks that the
// subKind-tagged nodes still get short, identifier-safe hash ids the
// emitter can use verbatim as JS const names.
func TestStructural_HashIdLooksLikeIdentifier(t *testing.T) {
	_, mapNode := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<Map<string, number>>();
`)
	if mapNode.ID == "" || strings.ContainsAny(mapNode.ID, "{}[]:") {
		t.Fatalf("hash id %q is not identifier-safe", mapNode.ID)
	}
}

// TestStructural_NonSerializableStableAcrossSpellings — a non-serialisable
// global's id is its CONSTRUCTOR, so every spelling of the same type shares
// one cache entry. The id used to be built from the lib member surface
// instead, and a typed array's `subarray()` returns its own type: whether the
// checker handed the walk the SAME type pointer (a cycle token) or a fresh
// instantiation (one more unrolled level) depended on how the type was
// reached, so these four spellings produced two different ids.
func TestStructural_NonSerializableStableAcrossSpellings(t *testing.T) {
	_, bare := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<Uint8Array>();
`)
	_, viaTypeof := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
declare const bytes: Uint8Array;
getRunTypeId<typeof bytes>();
`)
	_, explicitArgs := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<Uint8Array<ArrayBuffer | SharedArrayBuffer>>();
`)
	_, inAnAlias := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
type Bytes = Uint8Array;
getRunTypeId<Bytes>();
`)
	for _, spelled := range []struct {
		label string
		node  *reflection.RunType
	}{{"typeof a variable", viaTypeof}, {"explicit default arguments", explicitArgs}, {"through an alias", inAnAlias}} {
		if spelled.node.ID != bare.ID {
			t.Errorf("Uint8Array spelled %s must share the bare id: %q vs %q", spelled.label, spelled.node.ID, bare.ID)
		}
	}
	if bare.SubKind != reflection.SubKindNonSerializable {
		t.Fatalf("Uint8Array: expected SubKindNonSerializable, got %d", bare.SubKind)
	}
}

// TestStructural_NonSerializableFormEquivalence — the reflection call shape
// reaches the type through the VALUE, the one spelling most likely to hand
// the walk a differently-interned checker type. It must land on the same
// entry as the static form (marker coverage rule: paired call shapes, and
// this is the suite's hash-equivalence pin for the non-serialisable set).
func TestStructural_NonSerializableFormEquivalence(t *testing.T) {
	_, static := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<Uint8Array>();
`)
	_, reflected := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
const bytes: Uint8Array = new Uint8Array(4);
getRunTypeId(bytes);
`)
	if static.ID != reflected.ID {
		t.Fatalf("getRunTypeId<Uint8Array>() and getRunTypeId(value) must share an id: %q vs %q", static.ID, reflected.ID)
	}
}

// TestStructural_NonSerializableDistinctByName — dropping the member walk
// must not blur the set together. `Error` and `EvalError` are structurally
// identical interfaces, so the member walk actually gave them ONE shared id;
// keying on the constructor name is what tells them apart.
func TestStructural_NonSerializableDistinctByName(t *testing.T) {
	ids := map[string]string{}
	for _, typeName := range []string{"Error", "EvalError", "TypeError", "Uint8Array", "Int8Array", "DataView", "ArrayBuffer"} {
		_, node := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<`+typeName+`>();
`)
		for otherName, otherID := range ids {
			if otherID == node.ID {
				t.Errorf("%s and %s must not share a cache entry, both got %q", typeName, otherName, node.ID)
			}
		}
		ids[typeName] = node.ID
	}
}

// TestStructural_NonSerializableDistinctByArguments — type arguments stay in
// the id, in lockstep with projectClass (which keeps them in Arguments). The
// converter reads those arguments back out of the cached node to print the
// escape, so two instantiations sharing an entry would print one's arguments
// for the other. Joined POSITIONALLY, not sorted, so swapping two arguments
// changes the id.
func TestStructural_NonSerializableDistinctByArguments(t *testing.T) {
	idFor := func(typeText string) string {
		_, node := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<`+typeText+`>();
`)
		return node.ID
	}
	if idFor("Uint8Array<ArrayBuffer>") == idFor("Uint8Array<SharedArrayBuffer>") {
		t.Errorf("a typed array's buffer argument must reach the id")
	}
	if idFor("Generator<string, number>") == idFor("Generator<number, string>") {
		t.Errorf("type arguments are positional — swapping them must change the id")
	}
}
