package apitypes

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/runtype/typeid"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
)

// clientPackage is the name the parity client installs the types package under.
const clientPackage = "@acme/api-types"

// assertIDParity installs the package alone into a fresh client and compares each API member's id with the server's.
// The client gets the mion packages and the tsconfig libraries it lists, never the server's other dependencies.
func assertIDParity(t *testing.T, input Input, output *Output, clientTypes ...string) {
	t.Helper()
	server := serverMemberIDs(t, input, output.ApiExports)
	client, problems := clientMemberIDs(t, input, output, clientTypes)
	if len(problems) > 0 {
		t.Fatalf("the client does not type-check with the package alone:\n%s\nfiles: %v", strings.Join(problems, "\n"), output.Files)
	}
	if server != client {
		t.Errorf("a client computes other ids than the server\nserver: %s\nclient: %s\nfiles: %v", server, client, output.Files)
	}
}

func serverMemberIDs(t *testing.T, input Input, apiExports []string) string {
	t.Helper()
	trimmer, release, err := newTrimmer(input, input.Declarations)
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	entry, _, _, err := trimmer.findEntry(input.Entry)
	if err != nil {
		t.Fatal(err)
	}
	return trimmer.apiMemberIDs(entry, apiExports)
}

// clientMemberIDs also returns the client's type errors, which an import of a package it lacks raises.
func clientMemberIDs(t *testing.T, input Input, output *Output, clientTypes []string) (string, []string) {
	t.Helper()
	dir := t.TempDir()
	packageDir := filepath.Join(dir, "node_modules", filepath.FromSlash(clientPackage))
	for rel, text := range output.Files {
		writeFile(t, filepath.Join(packageDir, filepath.FromSlash(rel)), text)
	}
	writeFile(t, filepath.Join(packageDir, "package.json"), `{"name": "`+clientPackage+`", "types": "`+output.Entry+`"}`)
	serverModules := filepath.Join(input.Cwd, "node_modules")
	for _, scope := range []string{"@mionjs", "@types"} {
		entries, _ := os.ReadDir(filepath.Join(serverModules, scope))
		for _, entry := range entries {
			target, err := filepath.EvalSymlinks(filepath.Join(serverModules, scope, entry.Name()))
			if err != nil {
				t.Fatal(err)
			}
			link := filepath.Join(dir, "node_modules", scope, entry.Name())
			if err := os.MkdirAll(filepath.Dir(link), 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.Symlink(target, link); err != nil {
				t.Fatal(err)
			}
		}
	}
	if clientTypes == nil {
		clientTypes = []string{}
	}
	config, _ := json.Marshal(map[string]any{
		"compilerOptions": map[string]any{"target": "ES2022", "module": "ESNext", "moduleResolution": "bundler", "strict": true, "types": clientTypes, "skipLibCheck": false, "noEmit": true},
		"include":         []string{"client.ts"},
	})
	writeFile(t, filepath.Join(dir, "tsconfig.json"), string(config))
	writeFile(t, filepath.Join(dir, "client.ts"), "import type * as api from '"+clientPackage+"';\nexport type Api = typeof api;\n")
	prog, err := program.New(program.Options{Cwd: dir, TsconfigPath: filepath.Join(dir, "tsconfig.json")})
	if err != nil {
		t.Fatal(err)
	}
	typeChecker, release := prog.TS.GetTypeChecker(context.Background())
	defer release()
	var problems []string
	for _, sourceFile := range prog.TS.GetSourceFiles() {
		for _, diagnostic := range prog.TS.GetSemanticDiagnostics(context.Background(), sourceFile) {
			if diagnostic.Category().Name() == "error" {
				problems = append(problems, sourceFile.FileName()+": "+diagnostic.String())
			}
		}
	}
	entry := prog.SourceFile(filepath.Join(packageDir, filepath.FromSlash(output.Entry)))
	if entry == nil {
		entry = prog.SourceFile(tspathResolve(packageDir, output.Entry))
	}
	if entry == nil {
		t.Fatalf("the client program does not load the package entry %s", output.Entry)
	}
	computer := typeid.New(typeChecker).SetEnvironment(prog.EnvironmentFile)
	return exportedMemberIDs(typeChecker, typeChecker.GetSymbolAtLocation(entry.AsNode()), computer, output.ApiExports), problems
}

func tspathResolve(dir, rel string) string {
	resolved, err := filepath.EvalSymlinks(filepath.Join(dir, filepath.FromSlash(rel)))
	if err != nil {
		return ""
	}
	return resolved
}
