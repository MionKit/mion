package typeid_test

import (
	"os"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/protocol"
	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// The lib set is the whole point of this file, so it is pinned in a real
// tsconfig on disk rather than left to the inferred default (ES2022) — the
// bug this suite guards only exists on lib.esnext, where the iterator
// helpers arrived.
func scanUnderLib(t *testing.T, lib string, code string) (*resolver.Session, protocol.Response) {
	t.Helper()
	return scanUnderLibWith(t, lib, code, nil)
}

// scanUnderLibWith is scanUnderLib plus extra overlay files, keyed by name
// relative to the temp cwd. The names matter to one caller: a declaration in a
// file called `lib.*.d.ts` is what the MKR014 path keys on.
func scanUnderLibWith(t *testing.T, lib string, code string, extra map[string]string) (*resolver.Session, protocol.Response) {
	t.Helper()
	return scanUnderLibIn(t, tspath.NormalizePath(t.TempDir()), lib, code, extra)
}

// scanUnderLibIn takes the cwd from the caller, for the one test that must know
// the fixture directory in advance (it stages that directory as the standard
// library so the MKR014 path can be driven).
func scanUnderLibIn(t *testing.T, cwd string, lib string, code string, extra map[string]string) (*resolver.Session, protocol.Response) {
	t.Helper()
	tsconfig := `{"compilerOptions":{"target":"esnext","module":"esnext","moduleResolution":"bundler","strict":true,"lib":["` + lib + `"]}}`
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

// structuralUnderLib is the lib-independent identity of the first site's type.
//
// Cross-lib comparisons MUST use this, never the wire hash: the hash is salted
// with the lib fingerprint on purpose (runtype.Cache.idSalt), so two libs give
// two hashes by construction and comparing them proves nothing. The structural
// id is deliberately left lib-free so a real difference stays visible here, and
// when one shows up the string itself says WHAT differed.
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
// explicit iterator field both used to fail with MKR009 on lib.esnext. They
// resolve because `IteratorObject` and its named siblings joined the
// non-serialisable set, which already held their ES2015 predecessors
// (`Iterator`, `Generator`, `AsyncIterator`) — an iterator has never been data.
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
		_, response := scanUnderLib(t, "esnext", `import {getRunTypeId} from '@ts-runtypes/core';
`+fixture.source)
		if len(response.Sites) != 1 {
			codes := make([]string, 0, len(response.Diagnostics))
			for _, diagnostic := range response.Diagnostics {
				codes = append(codes, diagnostic.Code)
			}
			t.Errorf("%s: expected one site on lib.esnext, got %d with diagnostics %v",
				fixture.label, len(response.Sites), codes)
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

// TestLibMatrix_OneIdAcrossEveryLib — surviving each lib is not enough: the same
// type must reflect to the same STRUCTURAL id under all of them, or the
// projection is reading something the consumer's tsconfig decided rather than
// something their type says.
//
// The WIRE hash deliberately differs per lib (it is salted with the lib
// fingerprint), so this compares the structural id underneath it. That is the
// layer the guarantee lives at: scoping compiled entries is the hash's job,
// staying honest about the shape is the structure's.
func TestLibMatrix_OneIdAcrossEveryLib(t *testing.T) {
	source := nodeBufferDTS + `import {getRunTypeId} from '@ts-runtypes/core';
export const id = getRunTypeId<{id: number; blob: Buffer; bytes: Uint8Array; seen: Set<string>}>();
`
	var baseline, baselineLib string
	for _, lib := range []string{"es2020", "es2021", "es2022", "es2023", "es2024", "es2025", "esnext"} {
		structural := structuralUnderLib(t, lib, source)
		if baseline == "" {
			baseline, baselineLib = structural, lib
			continue
		}
		if structural != baseline {
			t.Errorf("lib %s gives a different structural id than %s:\n  %s\n  %s", lib, baselineLib, structural, baseline)
		}
	}
}

// TestLibMatrix_WireHashIsLibScopedStructureIsNot — the two layers, pinned
// against each other. A model whose shape does not depend on the lib must give
// one STRUCTURAL id everywhere (nothing about it changed) and a DIFFERENT wire
// hash per lib (the salt scoped it).
//
// Both halves matter and they pull in opposite directions. Without the salt, a
// warm cache would serve one lib's compiled entry to another. Without the
// lib-free structure, every lib difference would be invisible by construction
// and the matrix above could never fail.
func TestLibMatrix_WireHashIsLibScopedStructureIsNot(t *testing.T) {
	source := `import {getRunTypeId} from '@ts-runtypes/core';
interface Address {street: string; zip: string}
export const id = getRunTypeId<{id: number; name: string; at: Date; home: Address}>();
`
	structuralByLib := map[string]string{}
	hashByLib := map[string]string{}
	for _, lib := range []string{"es2020", "es2022", "esnext"} {
		res, response := scanUnderLib(t, lib, source)
		if len(response.Sites) != 1 {
			t.Fatalf("lib %s: expected one site, got %d", lib, len(response.Sites))
		}
		hashByLib[lib] = response.Sites[0].ID
		structuralByLib[lib] = res.Cache().StructuralForHash(response.Sites[0].ID)
	}
	for _, lib := range []string{"es2022", "esnext"} {
		if structuralByLib[lib] != structuralByLib["es2020"] {
			t.Errorf("this model's shape does not depend on the lib, so its structure must not either:\n  %s %s\n  es2020 %s",
				lib, structuralByLib[lib], structuralByLib["es2020"])
		}
		if hashByLib[lib] == hashByLib["es2020"] {
			t.Errorf("lib %s shares a wire hash with es2020 (%s) — the salt is not scoping compiled entries", lib, hashByLib[lib])
		}
	}
}
