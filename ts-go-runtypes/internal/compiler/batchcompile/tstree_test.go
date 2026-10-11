package batchcompile

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
)

// TestCompile_TsModeWritesATypeScriptTree: emitMode ts writes every source under rootDir to outDir as TypeScript, the
// call sites rewritten to import the typed cache modules by `.ts` path, and no JavaScript at all.
func TestCompile_TsModeWritesATypeScriptTree(t *testing.T) {
	tmp := t.TempDir()
	writeFile(t, filepath.Join(tmp, "tsconfig.json"), tsconfigJSON)
	writeFile(t, filepath.Join(tmp, "src", "runtypes.d.ts"), runtypesDTS)
	writeFile(t, filepath.Join(tmp, "src", "foo.ts"), fooTS)
	writeFile(t, filepath.Join(tmp, "src", "nested", "plain.ts"), "export const answer: number = 42;\n")

	result, err := Run(Options{
		Cwd:          tmp,
		TsconfigPath: "tsconfig.json",
		GenDir:       filepath.Join(tmp, ".mion"),
		ResolverOpts: resolver.Options{Cwd: tmp, EmitMode: constants.EmitTS, ModuleMode: constants.ModuleModeDefault,
			InlineMode: constants.InlineModeDefault, CacheDir: filepath.Join(tmp, ".cache")},
	})
	if err != nil {
		t.Fatalf("compile: %v", err)
	}
	for _, diag := range result.Diagnostics {
		t.Errorf("diagnostic: %+v", diag)
	}
	foo, err := os.ReadFile(filepath.Join(tmp, "dist", "foo.ts"))
	if err != nil {
		t.Fatalf("read foo.ts: %v", err)
	}
	if !strings.Contains(string(foo), "from '../.mion/types/") || !strings.Contains(string(foo), ".ts';") || strings.Contains(string(foo), "rtmod:") {
		t.Errorf("foo.ts should import its modules by relative .ts path:\n%s", foo)
	}
	if !strings.Contains(string(foo), "type User = {id: number; name: string};") {
		t.Errorf("foo.ts lost its types:\n%s", foo)
	}
	if plain, _ := os.ReadFile(filepath.Join(tmp, "dist", "nested", "plain.ts")); string(plain) != "export const answer: number = 42;\n" {
		t.Errorf("an unrewritten source should copy verbatim, got %q", plain)
	}
	filepath.WalkDir(filepath.Join(tmp, "dist"), func(path string, entry os.DirEntry, _ error) error {
		if strings.HasSuffix(path, ".js") || strings.HasSuffix(path, ".map") {
			t.Errorf("ts mode wrote JavaScript: %s", path)
		}
		return nil
	})
	if len(result.EmittedFiles) != 3 {
		t.Errorf("EmittedFiles = %v, want the three sources", result.EmittedFiles)
	}
}

func TestCompile_TsModeNeedsAnOutDir(t *testing.T) {
	tmp := t.TempDir()
	writeFile(t, filepath.Join(tmp, "tsconfig.json"), strings.Replace(tsconfigJSON, `"outDir": "dist",`, "", 1))
	writeFile(t, filepath.Join(tmp, "src", "runtypes.d.ts"), runtypesDTS)
	writeFile(t, filepath.Join(tmp, "src", "foo.ts"), fooTS)
	_, err := Run(Options{Cwd: tmp, TsconfigPath: "tsconfig.json", GenDir: filepath.Join(tmp, ".mion"),
		ResolverOpts: resolver.Options{Cwd: tmp, EmitMode: constants.EmitTS, ModuleMode: constants.ModuleModeDefault,
			InlineMode: constants.InlineModeDefault}})
	if err == nil || !strings.Contains(err.Error(), "outDir") {
		t.Errorf("err = %v, want the missing-outDir refusal", err)
	}
	if source, _ := os.ReadFile(filepath.Join(tmp, "src", "foo.ts")); string(source) != fooTS {
		t.Error("a source was overwritten")
	}
}

// TestCompile_TsModeRefusesAnOutDirThatIsTheSourceRoot: found by review, outDir == rootDir overwrote each source with
// its rewritten text (a `files` list escapes tsc's outDir exclude). The refusal comes before generate, so a refused run writes no cache either.
func TestCompile_TsModeRefusesAnOutDirThatIsTheSourceRoot(t *testing.T) {
	tmp := t.TempDir()
	writeFile(t, filepath.Join(tmp, "tsconfig.json"), strings.NewReplacer(`"outDir": "dist",`, `"outDir": "src",`,
		`"include": ["src"]`, `"files": ["src/runtypes.d.ts", "src/foo.ts"]`).Replace(tsconfigJSON))
	writeFile(t, filepath.Join(tmp, "src", "runtypes.d.ts"), runtypesDTS)
	writeFile(t, filepath.Join(tmp, "src", "foo.ts"), fooTS)
	genDir := filepath.Join(tmp, ".mion")
	_, err := Run(Options{Cwd: tmp, TsconfigPath: "tsconfig.json", GenDir: genDir,
		ResolverOpts: resolver.Options{Cwd: tmp, EmitMode: constants.EmitTS, ModuleMode: constants.ModuleModeDefault,
			InlineMode: constants.InlineModeDefault}})
	if err == nil || !strings.Contains(err.Error(), "source root") {
		t.Errorf("err = %v, want the outDir-is-the-source-root refusal", err)
	}
	if source, _ := os.ReadFile(filepath.Join(tmp, "src", "foo.ts")); string(source) != fooTS {
		t.Error("a source was overwritten")
	}
	if _, statErr := os.Stat(genDir); !os.IsNotExist(statErr) {
		t.Errorf("a refused run generated %s", genDir)
	}
}
