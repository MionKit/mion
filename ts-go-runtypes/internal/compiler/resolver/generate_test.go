package resolver_test

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// setupGen builds a session PINNED to genDir as its output root (the spawn-time
// `serve --gen-dir` posture) with files-mode import relativization on — the
// bundler plugin's configuration. The root is session config rather than a
// request field, so a test that needs several roots builds several sessions,
// which is exactly what production does: one spawn, one dir.
func setupGen(t testing.TB, sources map[string]string, genDir string) *resolver.Session {
	t.Helper()
	return setupInlineWith(t, sources, func(programOpts *program.Options, resolverOpts *resolver.Options) {
		programOpts.SingleThreaded = true
		resolverOpts.SingleThreaded = true
		resolverOpts.GenDir = genDir
		resolverOpts.TransformRelative = true
	})
}

// TestGenerate_WritesModulesToDisk verifies OpGenerate writes every entry
// module the session knows to <genDir>/types/<basename>.js (with inter-module
// imports relativized so no rtmod: specifier survives on disk) and returns
// the live manifest.
func TestGenerate_WritesModulesToDisk(t *testing.T) {
	const src = `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<{a: number; b: string}>();
`
	outDir := t.TempDir()
	r := setupGen(t, map[string]string{"a.ts": src}, outDir)

	// The authoritative module set is whatever OpDump renders for the session.
	dump := r.Dispatch(protocol.Request{Op: protocol.OpDump})
	if dump.Error != "" {
		t.Fatalf("dump: %s", dump.Error)
	}
	if len(dump.EntryModules) == 0 {
		t.Fatal("dump produced no entry modules to generate")
	}

	gen := r.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}

	// Every module OpDump knows must exist on disk with identical content.
	for basename := range dump.EntryModules {
		modulePath := filepath.Join(outDir, "types", filepath.FromSlash(basename)+".js")
		got, err := os.ReadFile(modulePath)
		if err != nil {
			t.Fatalf("module %q not written to disk: %v", basename, err)
		}
		if strings.Contains(string(got), "rtmod:/") {
			t.Fatalf("module %q still carries a rtmod: import on disk:\n%s", basename, got)
		}
	}

	// The manifest lists exactly the rendered module basenames.
	if len(gen.Generated) != len(dump.EntryModules) {
		t.Fatalf("manifest has %d entries, expected %d", len(gen.Generated), len(dump.EntryModules))
	}
	for _, basename := range gen.Generated {
		if _, ok := dump.EntryModules[basename]; !ok {
			t.Fatalf("manifest lists module %q that OpDump does not know", basename)
		}
	}
}

// TestGenerate_InfersOutDir verifies that an empty OutDir is not an error:
// the resolver infers <srcDir>/__runtypes from the program and echoes the
// resolved absolute path so the dependency-free plugin can adopt it. The
// inline program's files all sit under the temp cwd, so the inferred srcDir
// is that cwd and modules land under <cwd>/__runtypes/types.
func TestGenerate_InfersOutDir(t *testing.T) {
	const src = `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<{a: number}>();
`
	r := setupInline(t, map[string]string{"a.ts": src})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if resp.Error != "" {
		t.Fatalf("OpGenerate with empty OutDir should infer a dir, got error: %s", resp.Error)
	}
	if resp.OutDir == "" {
		t.Fatal("OpGenerate did not echo the inferred OutDir")
	}
	if filepath.Base(resp.OutDir) != "__runtypes" {
		t.Fatalf("inferred OutDir %q does not end in /__runtypes", resp.OutDir)
	}
	// The inferred dir must actually hold the generated modules.
	if len(resp.Generated) == 0 {
		t.Fatal("inferred-dir generate produced no modules")
	}
	first := filepath.Join(resp.OutDir, "types", filepath.FromSlash(resp.Generated[0])+".js")
	if _, err := os.Stat(first); err != nil {
		t.Fatalf("module %q not written under inferred dir: %v", resp.Generated[0], err)
	}
}

// TestGenerate_RefusesOutDirInUse pins the collision guard: pointing the output
// dir at a directory that already holds non-RunTypes content (a hand-authored
// source folder) must abort with an actionable error naming the foreign entry,
// instead of scattering generated modules over the user's files. A dir holding
// only the recognized RunTypes members (types/, enriched/, VCS markers) is
// still accepted.
func TestGenerate_RefusesOutDirInUse(t *testing.T) {
	const src = `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<{a: number}>();
`
	sources := map[string]string{"a.ts": src}

	// Collision case: a pre-existing dir with a hand-authored source file.
	inUse := t.TempDir()
	if err := os.WriteFile(filepath.Join(inUse, "entryTuple.ts"), []byte("export const x = 1;\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	resp := setupGen(t, sources, inUse).Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if resp.Error == "" {
		t.Fatal("expected OpGenerate to refuse an output dir already in use, got no error")
	}
	if !strings.Contains(resp.Error, "entryTuple.ts") || !strings.Contains(resp.Error, "refusing") {
		t.Fatalf("error should name the foreign entry and explain the refusal, got: %s", resp.Error)
	}

	// Accepted: a dir containing only recognized RunTypes members.
	okDir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(okDir, "enriched"), 0o755); err != nil {
		t.Fatal(err)
	}
	if resp := setupGen(t, sources, okDir).Dispatch(protocol.Request{Op: protocol.OpGenerate}); resp.Error != "" {
		t.Fatalf("a RunTypes-only output dir (enriched/ present) must be accepted, got: %s", resp.Error)
	}

	// Accepted: recognized members alongside harmless OS noise (Finder / Explorer
	// cruft) — a stray .DS_Store / ._sibling / Thumbs.db must never crash a build.
	noiseDir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(noiseDir, "enriched"), 0o755); err != nil {
		t.Fatal(err)
	}
	for _, junk := range []string{".DS_Store", "._enriched", "Thumbs.db"} {
		if err := os.WriteFile(filepath.Join(noiseDir, junk), []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if resp := setupGen(t, sources, noiseDir).Dispatch(protocol.Request{Op: protocol.OpGenerate}); resp.Error != "" {
		t.Fatalf("OS-noise files must be tolerated, got: %s", resp.Error)
	}

	// Adopted: our OWN previous run — a second generate into a dir we already
	// wrote (it now carries the types/ marker) must not be mistaken for foreign.
	prev := t.TempDir()
	prevSession := setupGen(t, sources, prev)
	if first := prevSession.Dispatch(protocol.Request{Op: protocol.OpGenerate}); first.Error != "" {
		t.Fatalf("first generate into a fresh dir should succeed: %s", first.Error)
	}
	if second := prevSession.Dispatch(protocol.Request{Op: protocol.OpGenerate}); second.Error != "" {
		t.Fatalf("a second generate into our own previous-run dir must be adopted, got: %s", second.Error)
	}

	// Refused: an extraneous FOLDER at the root (a real source or sub-project dir)
	// — anything beyond types/ / enriched/ + VCS markers is treated as not ours.
	extraneousDir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(extraneousDir, "models"), 0o755); err != nil {
		t.Fatal(err)
	}
	if resp := setupGen(t, sources, extraneousDir).Dispatch(protocol.Request{Op: protocol.OpGenerate}); resp.Error == "" {
		t.Fatal("expected refusal of an output dir holding an extraneous folder, got no error")
	}

	// Refused: a regular FILE named like a managed subdir (`types`) — it slips
	// past the name-only allow-list but isn't a directory, so the guard must
	// reject it up front with an actionable message instead of failing later
	// at MkdirAll with an opaque OS error.
	fileNamedTypes := t.TempDir()
	if err := os.WriteFile(filepath.Join(fileNamedTypes, "types"), []byte("not a dir\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if resp := setupGen(t, sources, fileNamedTypes).Dispatch(protocol.Request{Op: protocol.OpGenerate}); resp.Error == "" {
		t.Fatal("expected refusal of an output dir holding a file named `types`, got no error")
	} else if !strings.Contains(resp.Error, "not a directory") {
		t.Fatalf("error should explain `types` is not a directory, got: %s", resp.Error)
	}
}

// TestGenerateTransformConsistency_Reflection pins the files-mode invariant:
// every relative import the transform injects must resolve to a module that
// generate actually wrote to disk. Reflection (getRunTypeId) exercises the
// per-root facade path; a mismatch here is exactly the "Could not resolve" the
// bundler hits.
func TestGenerateTransformConsistency_Reflection(t *testing.T) {
	const src = `import {getRunTypeId} from '@mionjs/run-types';
interface MapThing { mapProp: string }
export const id = getRunTypeId<MapThing>();
`
	outDir := t.TempDir()
	r := setupGen(t, map[string]string{"a.ts": src}, outDir)
	if gen := r.Dispatch(protocol.Request{Op: protocol.OpGenerate}); gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	tr := r.Dispatch(protocol.Request{Op: protocol.OpTransform, Files: []string{"a.ts"}})
	if tr.Error != "" {
		t.Fatalf("transform: %s", tr.Error)
	}
	code := tr.Transformed["a.ts"].Code
	cwd := r.Program.TS.GetCurrentDirectory() // a.ts lives at <cwd>/a.ts
	relImport := regexp.MustCompile(`from '(\.\.?/[^']+)'`)
	matches := relImport.FindAllStringSubmatch(code, -1)
	if len(matches) == 0 {
		t.Fatalf("transform injected no relative imports:\n%s", code)
	}
	for _, m := range matches {
		target := filepath.Join(cwd, filepath.FromSlash(m[1]))
		if _, err := os.Stat(target); err != nil {
			t.Fatalf("transform injected %q -> %q which generate did NOT write: %v", m[1], target, err)
		}
	}
}

// TestTransform_FilesModeInjectsRelativeImports verifies that a session with
// TransformRelative set has OpTransform's injected import block point at
// relative on-disk module paths (under <genDir>/types) instead of rtmod:
// specifiers.
func TestTransform_FilesModeInjectsRelativeImports(t *testing.T) {
	const src = `import {createValidateFn} from '@mionjs/run-types';
interface Thing { id: string }
export const isThing = createValidateFn<Thing>();
`
	r := setupGen(t, map[string]string{"a.ts": src}, "__runtypes")
	resp := r.Dispatch(protocol.Request{Op: protocol.OpTransform, Files: []string{"a.ts"}})
	if resp.Error != "" {
		t.Fatalf("transform: %s", resp.Error)
	}
	out := resp.Transformed["a.ts"].Code
	if out == "" {
		t.Fatal("transform produced no code")
	}
	if strings.Contains(out, "rtmod:/") {
		t.Fatalf("files-mode transform still injects rtmod: imports:\n%s", out)
	}
	if !strings.Contains(out, "from './__runtypes/types/") {
		t.Fatalf("expected a relative ./__runtypes/types/ import:\n%s", out)
	}
}
