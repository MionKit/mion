package typeid_test

import (
	"os"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/protocol"
	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// libArrayJSON renders one lib name as the tsconfig `lib` array. The EMPTY name
// means `lib: []` — a selection that loads no standard library at all, which is
// its own case (CFG002) and cannot be spelled as a name.
func libArrayJSON(lib string) string {
	if lib == "" {
		return "[]"
	}
	return `["` + strings.Join(strings.Split(lib, ","), `","`) + `"]`
}

// The lib set is the whole point of this file, so it is pinned in a real
// tsconfig on disk rather than left to the inferred default (ES2022) — the
// bug this suite guards only exists on lib.esnext, where the iterator
// helpers arrived.
func scanUnderLib(t *testing.T, lib string, code string) (*resolver.Session, protocol.Response) {
	t.Helper()
	return scanUnderLibWith(t, lib, code, nil)
}

// scanUnderLibWith is scanUnderLib plus extra overlay files, keyed by name
// relative to the temp cwd. The names matter to one caller: it stages a file
// called `lib.*.d.ts` to prove a consumer's own file is not mistaken for ours.
func scanUnderLibWith(t *testing.T, lib string, code string, extra map[string]string) (*resolver.Session, protocol.Response) {
	t.Helper()
	return scanUnderLibIn(t, tspath.NormalizePath(t.TempDir()), lib, code, extra)
}

// scanUnderLibIn takes the cwd from the caller, for the one test that must know
// the fixture directory in advance (it stages that directory as the standard
// library).
func scanUnderLibIn(t *testing.T, cwd string, lib string, code string, extra map[string]string) (*resolver.Session, protocol.Response) {
	t.Helper()
	tsconfig := `{"compilerOptions":{"target":"esnext","module":"esnext","moduleResolution":"bundler","strict":true,"lib":` + libArrayJSON(lib) + `}}`
	if err := os.WriteFile(tspath.ResolvePath(cwd, "tsconfig.json"), []byte(tsconfig), 0o644); err != nil {
		t.Fatalf("write tsconfig: %v", err)
	}
	dtsPath := tspath.ResolvePath(cwd, "runtypes.d.ts")
	testPath := tspath.ResolvePath(cwd, "test.ts")
	config, err := program.ParseInferredConfig(cwd, "tsconfig.json")
	if err != nil {
		t.Fatalf("ParseInferredConfig: %v", err)
	}
	overlay := map[string]string{dtsPath: runtypesDTS, testPath: code}
	roots := []string{dtsPath, testPath}
	for name, content := range extra {
		path := tspath.ResolvePath(cwd, name)
		overlay[path] = content
		roots = append(roots, path)
	}
	prog, err := program.NewInferred(program.Options{
		Cwd:            cwd,
		SingleThreaded: true,
		Config:         config,
		Overlay:        overlay,
	}, roots)
	if err != nil {
		t.Fatalf("program.NewInferred: %v", err)
	}
	res, err := resolver.New(prog, resolver.Options{Cwd: cwd, SingleThreaded: true})
	if err != nil {
		t.Fatalf("resolver.New: %v", err)
	}
	t.Cleanup(res.Close)
	response := res.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"test.ts"}})
	if response.Error != "" {
		t.Fatalf("scanFiles: %s", response.Error)
	}
	return res, response
}

// structuralUnderLib is the structural identity of the first site's type — the
// string the wire hash is computed from. Use it for cross-lib comparisons when
// you want the failure message to say WHAT differed: the hash is seven opaque
// characters, the structure spells the shape out.
func structuralUnderLib(t *testing.T, lib string, code string) string {
	t.Helper()
	res, response := scanUnderLib(t, lib, code)
	if len(response.Sites) == 0 {
		codes := make([]string, 0, len(response.Diagnostics))
		for _, diagnostic := range response.Diagnostics {
			codes = append(codes, diagnostic.Code)
		}
		t.Fatalf("lib %s: no sites, diagnostics %v", lib, codes)
	}
	structural := res.Cache().StructuralForHash(response.Sites[0].ID)
	if structural == "" {
		t.Fatalf("lib %s: site id %q is not interned", lib, response.Sites[0].ID)
	}
	return structural
}

// rootUnderLib is scanUnderLib plus the dump lookup rootFor does — the
// projected node behind the first site.
func rootUnderLib(t *testing.T, lib string, code string) *reflection.RunType {
	t.Helper()
	res, response := scanUnderLib(t, lib, code)
	if len(response.Sites) == 0 {
		codes := make([]string, 0, len(response.Diagnostics))
		for _, diagnostic := range response.Diagnostics {
			codes = append(codes, diagnostic.Code)
		}
		t.Fatalf("lib %s: no sites, diagnostics %v", lib, codes)
	}
	for _, node := range res.Dispatch(protocol.Request{Op: protocol.OpDump}).RunTypes {
		if node.ID == response.Sites[0].ID {
			return node
		}
	}
	t.Fatalf("lib %s: root id %q not in dump", lib, response.Sites[0].ID)
	return nil
}

// nodeDTS declares the Node `Buffer` global the way @types/node does — an
// interface extending `Uint8Array`. Declaring it here instead of depending on
// @types/node keeps the suite hermetic; the inheritance is the only part the
// walk cares about.
const nodeBufferDTS = `interface Buffer extends Uint8Array<ArrayBuffer> {
  write(text: string): number;
  toString(encoding?: string): string;
}
`

// TestESNextLib_BufferFieldReflects — a field typed `Buffer` used to halt the
// build on lib.esnext with MKR009 naming `IteratorObject`: `Buffer` is not a
// lib global, so the walk descended into the `Uint8Array` members it inherits,
// and on ESNext those return `IteratorObject`, a self-instantiating generic
// whose structural id never resolves. ES2023 was fine only because its
// iterator methods return the non-self-instantiating `IterableIterator`.
//
// `Buffer` is a typed array at runtime, so it belongs in the non-serialisable
// set beside `Uint8Array`: the projection stops at subKind + classRef and the
// member surface is never walked, on any lib.
func TestESNextLib_BufferFieldReflects(t *testing.T) {
	source := nodeBufferDTS + `import {getRunTypeId} from '@ts-runtypes/core';
export const id = getRunTypeId<{blob: Buffer}>();
`
	esnext := structuralUnderLib(t, "esnext", source)
	es2023 := structuralUnderLib(t, "es2023", source)
	if esnext != es2023 {
		t.Fatalf("a Buffer field must reflect the same under either lib:\n  esnext %s\n  es2023 %s", esnext, es2023)
	}
}

// TestESNextLib_BufferFormEquivalence — the marker coverage rule: the same
// Buffer type reached through the VALUE lands on the static form's entry.
func TestESNextLib_BufferFormEquivalence(t *testing.T) {
	static := rootUnderLib(t, "esnext", nodeBufferDTS+`import {getRunTypeId} from '@ts-runtypes/core';
export const id = getRunTypeId<{blob: Buffer}>();
`)
	reflected := rootUnderLib(t, "esnext", nodeBufferDTS+`import {getRunTypeId} from '@ts-runtypes/core';
declare const row: {blob: Buffer};
export const id = getRunTypeId(row);
`)
	if static.ID != reflected.ID {
		t.Fatalf("getRunTypeId<{blob: Buffer}>() and getRunTypeId(value) must share an id: %q vs %q", static.ID, reflected.ID)
	}
}

// TestESNextLib_BufferIsNonSerializable — Buffer projects ATOMICALLY, exactly
// like the typed array it is. Pinning the subKind (not just "it resolved")
// keeps a future fix from making it resolve by walking the members instead,
// which is what produced the unstable id in the first place.
func TestESNextLib_BufferIsNonSerializable(t *testing.T) {
	root := rootUnderLib(t, "esnext", nodeBufferDTS+`import {getRunTypeId} from '@ts-runtypes/core';
export const id = getRunTypeId<Buffer>();
`)
	if root.SubKind != reflection.SubKindNonSerializable {
		t.Fatalf("Buffer: expected SubKindNonSerializable, got %d", root.SubKind)
	}
	// The classRef names the matched BASE, not `Buffer`: the emitter writes it
	// out as `classType = globalThis.<name>`, and `Uint8Array` exists in every
	// runtime while `globalThis.Buffer` exists only under Node.
	if root.ClassRef == nil || root.ClassRef.Builtin != "Uint8Array" {
		t.Fatalf("Buffer: expected the matched base as its builtin classRef, got %+v", root.ClassRef)
	}
	if len(root.Children) != 0 {
		t.Fatalf("Buffer must project atomically, got %d members", len(root.Children))
	}
}

// TestESNextLib_IteratorObjectsResolve — Buffer is one door into the ESNext
// iterator helpers; these are the others. A subclass of a typed array and an
// explicit iterator field both used to fail with MKR009 on lib.esnext.
//
// They resolve now with no name anywhere: `ArrayIterator`, `MapIterator` and
// `IteratorObject` are declared in the standard library, so the projection
// takes each whole instead of walking into the helpers that never terminate.
// The typed-array subclass is caught by its `ArrayBufferView` member shape. The
// test asserts the projection is ATOMIC, not merely that a site came out, since
// resolving by walking the members is the failure it exists to catch.
func TestESNextLib_IteratorObjectsResolve(t *testing.T) {
	for _, fixture := range []struct {
		label  string
		source string
	}{
		{"a typed-array subclass", `class MyBytes extends Uint8Array {}
export const id = getRunTypeId<{bytes: MyBytes}>();
`},
		{"an ArrayIterator field", `export const id = getRunTypeId<{items: ArrayIterator<number>}>();
`},
		{"a MapIterator field", `export const id = getRunTypeId<{keys: MapIterator<string>}>();
`},
		{"an IteratorObject field", `export const id = getRunTypeId<{walk: IteratorObject<number>}>();
`},
	} {
		res, response := scanUnderLib(t, "esnext", `import {getRunTypeId} from '@ts-runtypes/core';
`+fixture.source)
		if len(response.Sites) != 1 {
			codes := make([]string, 0, len(response.Diagnostics))
			for _, diagnostic := range response.Diagnostics {
				codes = append(codes, diagnostic.Code)
			}
			t.Errorf("%s: expected one site on lib.esnext, got %d with diagnostics %v",
				fixture.label, len(response.Sites), codes)
			continue
		}
		// One property, whose value carries no children of its own: the lib type
		// went in whole. A walked iterator would bring its whole member surface.
		structural := res.Cache().StructuralForHash(response.Sites[0].ID)
		if strings.Count(structural, "32:") != 1 {
			t.Errorf("%s: the lib type must go in whole, got %s", fixture.label, structural)
		}
	}
}

// TestLibMatrix_ReflectionSurvivesEveryLib is the standing guard against lib
// drift, the class of bug this file exists for. The ESNext Buffer failure was
// found by accident on the drizzle road; nothing would have caught it on the
// next TypeScript upgrade either, because no test chose a lib.
//
// The iterator helpers that broke it landed in lib.es2025.iterator.d.ts, which
// lib.esnext includes, so es2024 was fine and es2025 was not. Reflecting the
// same handful of shapes under every lib TypeScript ships costs about two
// seconds and turns the next such change into a failing test instead of a
// consumer build that stops.
//
// A new lib here is not a chore: add it to the list when TypeScript ships one.
func TestLibMatrix_ReflectionSurvivesEveryLib(t *testing.T) {
	libs := []string{"es2020", "es2021", "es2022", "es2023", "es2024", "es2025", "esnext"}
	shapes := []struct {
		label  string
		source string
	}{
		// Binary data, the family the bug lived in.
		{"a Buffer field", nodeBufferDTS + `import {getRunTypeId} from '@ts-runtypes/core';
export const id = getRunTypeId<{blob: Buffer}>();
`},
		{"a Uint8Array field", `import {getRunTypeId} from '@ts-runtypes/core';
export const id = getRunTypeId<{bytes: Uint8Array}>();
`},
		// The builtin collections, whose iterator members are what changed
		// shape across libs in the first place.
		{"Map and Set fields", `import {getRunTypeId} from '@ts-runtypes/core';
export const id = getRunTypeId<{seen: Set<string>; byId: Map<string, number>}>();
`},
		// An ordinary model, the shape a consumer actually reflects.
		{"a plain model", `import {getRunTypeId} from '@ts-runtypes/core';
interface Address {street: string; zip: string}
export const id = getRunTypeId<{id: number; name: string; at: Date; tags: string[]; home: Address}>();
`},
	}
	for _, lib := range libs {
		for _, shape := range shapes {
			_, response := scanUnderLib(t, lib, shape.source)
			if len(response.Sites) != 1 {
				codes := make([]string, 0, len(response.Diagnostics))
				for _, diagnostic := range response.Diagnostics {
					codes = append(codes, diagnostic.Code)
				}
				t.Errorf("lib %s, %s: expected one site, got %d with diagnostics %v",
					lib, shape.label, len(response.Sites), codes)
			}
		}
	}
}

// TestLibMatrix_OneIdAcrossEveryLib — a model whose shape does not depend on the
// standard library must compile to ONE id on every library, structural and wire
// alike. Nothing about `{id: number; blob: Buffer; bytes: Uint8Array; seen:
// Set<string>}` changes between es2020 and esnext, so nothing about its id may.
//
// This is what makes a shared model safe: a backend on `["es2022"]` and a
// frontend on `["es2022","dom"]` describe the same type and get the same answer.
// Ids are NOT scoped to the library, on purpose. See the test below for why
// they do not need to be.
func TestLibMatrix_OneIdAcrossEveryLib(t *testing.T) {
	source := nodeBufferDTS + `import {getRunTypeId} from '@ts-runtypes/core';
export const id = getRunTypeId<{id: number; blob: Buffer; bytes: Uint8Array; seen: Set<string>}>();
`
	var structuralBase, hashBase, baseLib string
	for _, lib := range []string{"es2020", "es2021", "es2022", "es2023", "es2024", "es2025", "esnext"} {
		res, response := scanUnderLib(t, lib, source)
		if len(response.Sites) != 1 {
			t.Fatalf("lib %s: expected one site, got %d", lib, len(response.Sites))
		}
		hash := response.Sites[0].ID
		structural := res.Cache().StructuralForHash(hash)
		if structuralBase == "" {
			structuralBase, hashBase, baseLib = structural, hash, lib
			continue
		}
		if structural != structuralBase {
			t.Errorf("lib %s gives a different structural id than %s:\n  %s\n  %s", lib, baseLib, structural, structuralBase)
		}
		if hash != hashBase {
			t.Errorf("lib %s gives a different wire hash than %s: %s vs %s", lib, baseLib, hash, hashBase)
		}
	}
}

// TestLibMatrix_ALibDifferenceShowsInTheId — the reason ids are not salted with
// the library, stated as a test.
//
// Bare `Uint8Array` is the one case anyone can name where the SAME source text
// means two different types depending on tsconfig: its default argument
// `ArrayBufferLike` is `ArrayBuffer` up to es2016 and `ArrayBuffer |
// SharedArrayBuffer` from es2017. That difference is not hidden, it is written
// into the structural id, because a standard-library type is taken atomically
// WITH its type arguments:
//
//	es2016  30{32:bytes:2004{2004#ArrayBuffer}#Uint8Array}
//	es2017  30{32:bytes:2004{23{2004#ArrayBuffer,2004#SharedArrayBuffer}}#Uint8Array}
//
// So the two libraries already mint different ids and neither can be served the
// other's compiled entry. Adding the library to the hash on top of that would
// only move ids that mean the same thing.
//
// If this test ever fails because the two libraries agree, the structure has
// stopped carrying a real difference and the case for scoping ids by library is
// open again.
func TestLibMatrix_ALibDifferenceShowsInTheId(t *testing.T) {
	source := `import {getRunTypeId} from '@ts-runtypes/core';
export const id = getRunTypeId<{bytes: Uint8Array}>();
`
	before := structuralUnderLib(t, "es2016", source)
	after := structuralUnderLib(t, "es2017", source)
	if before == after {
		t.Fatalf("es2016 and es2017 spell `Uint8Array` differently, so their ids must differ: %s", before)
	}
	if !strings.Contains(after, "SharedArrayBuffer") || strings.Contains(before, "SharedArrayBuffer") {
		t.Errorf("the difference must be the widened ArrayBufferLike argument:\n  es2016 %s\n  es2017 %s", before, after)
	}
}
