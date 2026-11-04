package resolver_test

import (
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// generateProgramHash builds a fresh on-disk project session, as each Vitest run spawns one, and returns its hash.
func generateProgramHash(t *testing.T, dir, tsconfig string) string {
	t.Helper()
	writeDisk(t, tspath.ResolvePath(dir, "tsconfig.json"), tsconfig)
	prog, err := program.New(program.Options{Cwd: dir, TsconfigPath: "tsconfig.json", SingleThreaded: true})
	if err != nil {
		t.Fatalf("program.New: %v", err)
	}
	session, err := resolver.New(prog, resolver.Options{Cwd: dir, TsconfigPath: "tsconfig.json", SingleThreaded: true})
	if err != nil {
		t.Fatalf("resolver.New: %v", err)
	}
	t.Cleanup(session.Close)
	resp := session.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if resp.Error != "" {
		t.Fatalf("generate: %s", resp.Error)
	}
	if resp.ProgramHash == "" {
		t.Fatal("generate returned no programHash")
	}
	return resp.ProgramHash
}

// The hash is a host's cache key for a site file's rewrite: equal for an unchanged project, new when the program's
// file list (tsconfig include), any file's text or the tsconfig changes, though the site file's own text did not.
func TestGenerate_ProgramHashFollowsTheProgram(t *testing.T) {
	dir := tspath.NormalizePath(t.TempDir())
	for rel, content := range realMarkerOverlay(t) {
		writeDisk(t, tspath.ResolvePath(dir, rel), content)
	}
	writeDisk(t, tspath.ResolvePath(dir, "src/types.ts"), "export type User = {name: string};\n")
	site := `import {getRunTypeId} from '@mionjs/run-types';
import type {User} from '../src/types';
export const idStatic = getRunTypeId<User>();
const sample: User = {name: 'Ada'};
export const idReflected = getRunTypeId(sample);
`
	writeDisk(t, tspath.ResolvePath(dir, "tests/site.ts"), site)
	const options = `"compilerOptions": {"strict": true, "noEmit": true, "types": []}`
	srcOnly := `{` + options + `, "include": ["src"]}`
	withTests := `{` + options + `, "include": ["src", "tests"]}`

	base := generateProgramHash(t, dir, srcOnly)
	if again := generateProgramHash(t, dir, srcOnly); again != base {
		t.Fatalf("unchanged project hashed differently: %s vs %s", base, again)
	}
	included := generateProgramHash(t, dir, withTests)
	if included == base {
		t.Fatal("adding tests/ to include left the hash unchanged")
	}
	if reformatted := generateProgramHash(t, dir, `{`+options+`, "include": ["src", "tests"] }`); reformatted == included {
		t.Fatal("a tsconfig text change left the hash unchanged")
	}
	writeDisk(t, tspath.ResolvePath(dir, "src/types.ts"), "export type User = {name: string; age: number};\n")
	if edited := generateProgramHash(t, dir, withTests); edited == included {
		t.Fatal("a type edit in another file left the hash unchanged")
	}
	// An option inherited from an extended config reaches the hash through the resolved options.
	writeDisk(t, tspath.ResolvePath(dir, "base.json"), `{"compilerOptions": {"exactOptionalPropertyTypes": false}}`)
	extending := `{"extends": "./base.json", ` + options + `, "include": ["src", "tests"]}`
	before := generateProgramHash(t, dir, extending)
	writeDisk(t, tspath.ResolvePath(dir, "base.json"), `{"compilerOptions": {"exactOptionalPropertyTypes": true}}`)
	if after := generateProgramHash(t, dir, extending); after == before {
		t.Fatal("an option change in an extended config left the hash unchanged")
	}
}
