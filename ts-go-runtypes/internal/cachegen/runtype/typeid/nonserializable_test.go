package typeid_test

import (
	"slices"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/cachegen/runtype/typeid"
	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// The non-serialisable set matches two ways, and the split is the design:
// binary and iterator types qualify through their BASE (whatever the lib calls
// the descendant), errors and weak collections only by their own name. These
// tests pin both halves, because getting either one wrong is silent — the type
// still resolves, it is just classified as the wrong kind of value.

// TestNonSerializable_BaseMatchNeedsNoName — the point of the base rule, which
// covers the BINARY family only (see NonSerializableBaseGlobals for why the
// iterator family is matched by name instead). None of these names appear in
// any list, and all of them must be recognised through what they extend.
func TestNonSerializable_BaseMatchNeedsNoName(t *testing.T) {
	for _, fixture := range []struct {
		label   string
		source  string
		builtin string
	}{
		{"Node's Buffer", nodeBufferDTS + `import {getRunTypeId} from '@ts-runtypes/core';
export const id = getRunTypeId<Buffer>();
`, "Uint8Array"},
		{"a user typed-array subclass", `import {getRunTypeId} from '@ts-runtypes/core';
class MyBytes extends Uint8Array {}
export const id = getRunTypeId<MyBytes>();
`, "Uint8Array"},
		{"a deeper typed-array subclass", `import {getRunTypeId} from '@ts-runtypes/core';
class MyBytes extends Uint8Array {}
class TaggedBytes extends MyBytes {}
export const id = getRunTypeId<TaggedBytes>();
`, "Uint8Array"},
	} {
		root := rootUnderLib(t, "esnext", fixture.source)
		if root.SubKind != reflection.SubKindNonSerializable {
			t.Errorf("%s: expected SubKindNonSerializable, got %d", fixture.label, root.SubKind)
			continue
		}
		// The classRef must name a REAL global — the emitter writes
		// `classType = globalThis.<this>`, so a subclass's own name would be
		// undefined at runtime.
		if root.ClassRef == nil || root.ClassRef.Builtin != fixture.builtin {
			t.Errorf("%s: expected builtin %q, got %+v", fixture.label, fixture.builtin, root.ClassRef)
		}
	}
}

// TestNonSerializable_ErrorSubclassStaysAClass is the guard that shaped the
// split. `class RpcError extends Error` is real, serialisable model data that
// mion round-trips through registerClassSerializer. If inheriting from `Error`
// made a type non-serialisable, every such class would silently stop being
// data — a far worse break than the one the base rule fixes.
func TestNonSerializable_ErrorSubclassStaysAClass(t *testing.T) {
	root := rootUnderLib(t, "esnext", `import {getRunTypeId} from '@ts-runtypes/core';
class RpcError extends Error {
  constructor(readonly statusCode: number, message: string) {super(message);}
}
export const id = getRunTypeId<RpcError>();
`)
	if root.SubKind == reflection.SubKindNonSerializable {
		t.Fatal("a class extending Error must stay a normal class, not become non-serialisable")
	}
	if root.ClassRef == nil || root.ClassRef.Name != "RpcError" {
		t.Fatalf("expected a name-keyed classRef for RpcError, got %+v", root.ClassRef)
	}
}

// TestNonSerializable_MapIsNotAWeakMap — the other reason WeakMap/WeakSet are
// exact-only: a real Map is structurally assignable to a WeakMap, so a rule
// looser than exact naming would wrongly strip Map and Set.
func TestNonSerializable_MapIsNotAWeakMap(t *testing.T) {
	root := rootUnderLib(t, "esnext", `import {getRunTypeId} from '@ts-runtypes/core';
export const id = getRunTypeId<Map<string, number>>();
`)
	if root.SubKind != reflection.SubKindMap {
		t.Fatalf("Map must stay a Map, got subKind %d", root.SubKind)
	}
}

// TestNonSerializable_SubclassesKeepDistinctIds — the classRef collapses onto
// the shared base, but the ID must not: two subclasses are two types, and one
// shared cache entry would print one's arguments for the other.
func TestNonSerializable_SubclassesKeepDistinctIds(t *testing.T) {
	first := rootUnderLib(t, "esnext", `import {getRunTypeId} from '@ts-runtypes/core';
class Alpha extends Uint8Array {}
export const id = getRunTypeId<Alpha>();
`)
	second := rootUnderLib(t, "esnext", `import {getRunTypeId} from '@ts-runtypes/core';
class Beta extends Uint8Array {}
export const id = getRunTypeId<Beta>();
`)
	if first.ID == second.ID {
		t.Fatalf("two Uint8Array subclasses must not share a cache entry, both got %q", first.ID)
	}
}

// TestNonSerializable_FormEquivalence — marker coverage rule: a base-matched
// type reached through the VALUE lands on the static form's entry.
func TestNonSerializable_FormEquivalence(t *testing.T) {
	static := rootUnderLib(t, "esnext", nodeBufferDTS+`import {getRunTypeId} from '@ts-runtypes/core';
export const id = getRunTypeId<{blob: Buffer}>();
`)
	reflected := rootUnderLib(t, "esnext", nodeBufferDTS+`import {getRunTypeId} from '@ts-runtypes/core';
declare const row: {blob: Buffer};
export const id = getRunTypeId(row);
`)
	if static.ID != reflected.ID {
		t.Fatalf("static and value-first forms must share an id: %q vs %q", static.ID, reflected.ID)
	}
}

// TestPromiseLikeResolvesLikePromise — `Promise` matched by name and
// `PromiseLike` did not, so a PromiseLike field was walked as an ordinary
// interface and its `then<U, V>(): PromiseLike<U | V>` re-instantiated itself
// at every level, halting the build. Both are thenables, both project to
// KindPromise, and every emitter strips them (a promise is not data).
func TestPromiseLikeResolvesLikePromise(t *testing.T) {
	for _, spelling := range []string{"Promise<string>", "PromiseLike<string>"} {
		root := rootUnderLib(t, "esnext", `import {getRunTypeId} from '@ts-runtypes/core';
export const id = getRunTypeId<{a: number; p: `+spelling+`}>();
`)
		if len(root.Children) != 2 {
			t.Fatalf("%s: expected both properties projected, got %d", spelling, len(root.Children))
		}
	}
}

// TestPromiseLike_FormEquivalence — marker coverage rule, paired call shapes.
func TestPromiseLike_FormEquivalence(t *testing.T) {
	static := rootUnderLib(t, "esnext", `import {getRunTypeId} from '@ts-runtypes/core';
export const id = getRunTypeId<{p: PromiseLike<string>}>();
`)
	reflected := rootUnderLib(t, "esnext", `import {getRunTypeId} from '@ts-runtypes/core';
declare const row: {p: PromiseLike<string>};
export const id = getRunTypeId(row);
`)
	if static.ID != reflected.ID {
		t.Fatalf("static and value-first forms must share an id: %q vs %q", static.ID, reflected.ID)
	}
}

// TestNonSerializable_LibCulpritGetsItsOwnDiagnostic — the honest-message half.
// MKR009 ends with "Reflect a monomorphic shape instead", which the author can
// act on for their own type and cannot for a standard-library one. When the
// spiralling type is declared in the standard library the diagnostic is MKR014
// instead, which names the lib file and says the gap is ours.
//
// The fixture directory is STAGED as the lib directory, because no lib type
// shipping today still reaches the backstop — that is what the coverage in this
// PR accomplished. MKR014 exists for the next lib edition that opens a new one,
// so proving it works means staging one rather than waiting for a regression.
func TestNonSerializable_LibCulpritGetsItsOwnDiagnostic(t *testing.T) {
	cwd := tspath.NormalizePath(t.TempDir())
	defer typeid.SetBundledLibPrefixForTest(cwd)()

	_, response := scanUnderLibIn(t, cwd, "esnext", `import {getRunTypeId} from '@ts-runtypes/core';
export const id = getRunTypeId<{feed: LibSpiral<string>}>();
`, map[string]string{
		"lib.fixture.iterator.d.ts": `interface LibSpiral<T> {
  chain<U>(fn: (value: T) => U): LibSpiral<U>;
}
`,
	})
	if len(response.Sites) != 0 {
		t.Fatalf("the spiral must be refused, got %d sites", len(response.Sites))
	}
	codes := make([]string, 0, len(response.Diagnostics))
	for _, diagnostic := range response.Diagnostics {
		codes = append(codes, diagnostic.Code)
	}
	if slices.Contains(codes, "MKR009") {
		t.Fatalf("a library culprit must not get MKR009's rewrite-your-type advice, got %v", codes)
	}
	var found bool
	for _, diagnostic := range response.Diagnostics {
		if diagnostic.Code != "MKR014" {
			continue
		}
		found = true
		// Args are (culprit, lib file) — a useful report needs both.
		if len(diagnostic.Args) != 2 {
			t.Errorf("MKR014 must name the culprit and its lib file, got %v", diagnostic.Args)
			continue
		}
		if diagnostic.Args[0] != "LibSpiral" || diagnostic.Args[1] != "lib.fixture.iterator.d.ts" {
			t.Errorf("MKR014 must name the culprit and its lib file, got %v", diagnostic.Args)
		}
	}
	if !found {
		t.Fatalf("expected MKR014 for a library culprit, got %v", codes)
	}
}

// TestNonSerializable_UserLibDtsIsNotOurGap — the regression pin for how MKR014
// used to misfire. A basename test alone (`lib.` + `.d.ts`) also matches a
// consumer's own `src/lib.d.ts`, and telling that author "this is not a problem
// in your code" about a type they wrote is worse than saying nothing. Only a
// declaration inside the bundled standard library counts.
func TestNonSerializable_UserLibDtsIsNotOurGap(t *testing.T) {
	_, response := scanUnderLibWith(t, "esnext", `import {getRunTypeId} from '@ts-runtypes/core';
export const id = getRunTypeId<{feed: MySpiral<string>}>();
`, map[string]string{
		"lib.d.ts": `interface MySpiral<T> {chain<U>(fn: (value: T) => U): MySpiral<U>;}` + "\n",
	})
	codes := make([]string, 0, len(response.Diagnostics))
	for _, diagnostic := range response.Diagnostics {
		codes = append(codes, diagnostic.Code)
	}
	if slices.Contains(codes, "MKR014") {
		t.Fatalf("a type the author declared is never our gap, however the file is named: got %v", codes)
	}
	if !slices.Contains(codes, "MKR009") {
		t.Fatalf("expected MKR009's actionable advice for the author's own type, got %v", codes)
	}
}

// TestNonSerializable_IteratorSubclassKeepsItsData — the regression pin for the
// base rule's one real over-reach. Extending `Uint8Array` says the value IS
// binary data; extending `Iterator` is just how a data type becomes iterable.
// Base-matching the iterator family silently stripped such a type's own fields.
func TestNonSerializable_IteratorSubclassKeepsItsData(t *testing.T) {
	root := rootUnderLib(t, "esnext", `import {getRunTypeId} from '@ts-runtypes/core';
interface PagedCursor<T> extends Iterator<T> {total: number; pageSize: number}
export const id = getRunTypeId<PagedCursor<string>>();
`)
	if root.SubKind == reflection.SubKindNonSerializable {
		t.Fatal("a user type that merely extends Iterator must keep being data")
	}
	if len(root.Children) == 0 {
		t.Fatal("its own properties must survive the projection")
	}
}

// TestNonSerializable_OwnTypeKeepsMKR009 — the other side of the split: a
// self-instantiating generic the author actually wrote still gets MKR009, whose
// advice they can act on.
func TestNonSerializable_OwnTypeKeepsMKR009(t *testing.T) {
	_, response := scanUnderLib(t, "esnext", `import {getRunTypeId} from '@ts-runtypes/core';
interface Iter<T> {map<U>(fn: (x: T) => U): Iter<U>}
export const id = getRunTypeId<Iter<string>>();
`)
	codes := make([]string, 0, len(response.Diagnostics))
	for _, diagnostic := range response.Diagnostics {
		codes = append(codes, diagnostic.Code)
	}
	if !slices.Contains(codes, "MKR009") {
		t.Fatalf("a type the author wrote must keep MKR009, got %v", codes)
	}
	if slices.Contains(codes, "MKR014") {
		t.Fatal("MKR014 is for library types only")
	}
}
