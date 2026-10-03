package program

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
)

// Real files on disk: only there is a dependency flagged an external library, whose `/// <reference types>` still counts.

func environmentProject(t *testing.T, types string, files map[string]string) map[string]bool {
	t.Helper()
	// The project sits behind a symlinked dir on every OS (macOS's own temp dir is one), and tsgo reports resolved paths.
	tempDir, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	realDir := filepath.Join(tempDir, "real")
	linkDir := filepath.Join(tempDir, "link")
	writeConfigFile(t, filepath.Join(realDir, "tsconfig.json"),
		`{"compilerOptions":{"module":"esnext","moduleResolution":"bundler","strict":true`+types+`},"include":["src"]}`)
	for name, content := range files {
		writeConfigFile(t, filepath.Join(realDir, name), content)
	}
	if err := os.Symlink(realDir, linkDir); err != nil {
		t.Fatal(err)
	}
	prog, err := New(Options{Cwd: linkDir, TsconfigPath: "tsconfig.json", SingleThreaded: true})
	if err != nil {
		t.Fatal(err)
	}
	resolvedPrefix := tspath.NormalizePath(realDir) + "/"
	environment := map[string]bool{}
	for _, file := range prog.TS.SourceFiles() {
		if name := strings.TrimPrefix(file.FileName(), resolvedPrefix); strings.HasPrefix(name, "node_modules/") {
			environment[name] = prog.EnvironmentFile(file)
		}
	}
	return environment
}

const (
	handlesDTS   = "interface RuntimeHandle {close(): void}\n"
	webLibDTS    = "/// <reference types=\"handles\" />\nexport declare function serve(): void;\n"
	webLibImport = "import {serve} from 'web-lib';\nserve();\n"
)

func TestEnvironment_DependencyReferenceTypes(t *testing.T) {
	environment := environmentProject(t, `,"types":[]`, map[string]string{
		"node_modules/web-lib/package.json":      `{"name":"web-lib","types":"index.d.ts"}`,
		"node_modules/web-lib/index.d.ts":        webLibDTS,
		"node_modules/@types/handles/index.d.ts": handlesDTS,
		"src/a.ts":                               webLibImport,
	})
	if !environment["node_modules/@types/handles/index.d.ts"] {
		t.Errorf("a dependency's `/// <reference types>` loads its target as environment: %v", environment)
	}
	if environment["node_modules/web-lib/index.d.ts"] {
		t.Errorf("a library the code imports is never environment: %v", environment)
	}
}

func TestEnvironment_TypesListAndReferencePath(t *testing.T) {
	environment := environmentProject(t, `,"types":["runtime"]`, map[string]string{
		"node_modules/@types/runtime/index.d.ts":   "/// <reference path=\"./globals.d.ts\" />\n",
		"node_modules/@types/runtime/globals.d.ts": handlesDTS,
		"src/a.ts": "export const a = 1;\n",
	})
	for _, name := range []string{"node_modules/@types/runtime/index.d.ts", "node_modules/@types/runtime/globals.d.ts"} {
		if !environment[name] {
			t.Errorf("%s is loaded by the `types` list or its `/// <reference path>`: %v", name, environment)
		}
	}
}

func TestEnvironment_ImportedPackageNotInTypes(t *testing.T) {
	environment := environmentProject(t, "", map[string]string{
		"node_modules/web-lib/package.json": `{"name":"web-lib","types":"index.d.ts"}`,
		"node_modules/web-lib/index.d.ts":   "export declare function serve(): void;\ndeclare global {interface WebGlobal {close(): void}}\n",
		"src/a.ts":                          webLibImport,
	})
	if environment["node_modules/web-lib/index.d.ts"] {
		t.Errorf("an imported package with no `types` entry and no reference is not environment: %v", environment)
	}
}
