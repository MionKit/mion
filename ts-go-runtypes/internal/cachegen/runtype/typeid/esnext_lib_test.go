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
	cwd := tspath.NormalizePath(t.TempDir())
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
	prog, err := program.NewInferred(program.Options{
		Cwd:            cwd,
		SingleThreaded: true,
		Config:         config,
		Overlay:        map[string]string{dtsPath: runtypesDTS, testPath: code},
	}, []string{dtsPath, testPath})
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
	esnext := rootUnderLib(t, "esnext", source)
	es2023 := rootUnderLib(t, "es2023", source)
	if esnext.ID != es2023.ID {
		t.Fatalf("a Buffer field must reflect the same under either lib: esnext %q vs es2023 %q", esnext.ID, es2023.ID)
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
	if root.ClassRef == nil || root.ClassRef.Builtin != "Buffer" {
		t.Fatalf("Buffer: expected a builtin classRef, got %+v", root.ClassRef)
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
