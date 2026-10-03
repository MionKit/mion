package apitypes

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// TestTrim_CutsWithTheRealRouter reads @mionjs/router's workspace sources, so a PrivateDef or public method type
// change cannot slip past the stub.
func TestTrim_CutsWithTheRealRouter(t *testing.T) {
	_, self, _, _ := runtime.Caller(0)
	repo := filepath.Join(filepath.Dir(self), "..", "..", "..", "..")
	workspaceModules := filepath.Join(repo, "packages", "private-test-server", "node_modules", "@mionjs")
	if _, err := os.Stat(filepath.Join(workspaceModules, "router")); err != nil {
		t.Skipf("the workspace router is not installed: %v", err)
	}
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "node_modules"), 0o755); err != nil {
		t.Fatal(err)
	}
	for name, target := range map[string]string{"@mionjs": workspaceModules, "@types": filepath.Join(repo, "node_modules", "@types")} {
		if err := os.Symlink(target, filepath.Join(dir, "node_modules", name)); err != nil {
			t.Fatal(err)
		}
	}
	writeFile(t, filepath.Join(dir, "tsconfig.json"), `{"compilerOptions": {"target": "ES2022", "module": "ESNext", "moduleResolution": "bundler", "strict": true,
  "types": ["node"], "customConditions": ["source"], "allowImportingTsExtensions": true}, "include": ["src"]}`)
	writeFile(t, filepath.Join(dir, "src", "placeholder.ts"), "export {};\n")
	declarationDir := filepath.Join(dir, "decl")
	input := Input{Cwd: dir, TsconfigPath: "tsconfig.json", DeclarationDir: declarationDir, Declarations: map[string]string{
		filepath.Join(declarationDir, "index.d.ts"): `import type { PublicApi, ApiBuildVersion, RouteDef, MiddlewareDef, RawMiddlewareDef } from '@mionjs/router';
import type { IncomingMessage } from 'node:http';
import type { Audit } from './audit.ts';
type Ctx = { path: string };
declare const routes: {
    raw: RawMiddlewareDef<(ctx: Ctx, request: IncomingMessage) => void>;
    audit: MiddlewareDef<(ctx: Ctx & { audit: Audit }) => void>;
    check: MiddlewareDef<(ctx: Ctx, token: string) => void>;
    group: {
        priv: MiddlewareDef<(ctx: Ctx) => undefined>;
        get: RouteDef<(ctx: Ctx, id: string) => string>;
    };
};
export declare const api: PublicApi<typeof routes> & ApiBuildVersion<"v1">;
`,
		filepath.Join(declarationDir, "audit.d.ts"): "export declare class Audit {\n    protected entries: string[];\n}\n",
	}}
	output, err := Trim(input)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(output.cutMembers, ",") != "index.d.ts#routes.audit,index.d.ts#routes.group.priv,index.d.ts#routes.raw" {
		t.Errorf("the router's private and raw middlewares must be cut, got %v", output.cutMembers)
	}
	index := output.Files["index.d.ts"]
	assertContains(t, index, "check: MiddlewareDef", "get: RouteDef")
	assertLacks(t, index, "IncomingMessage", "Audit", "RawMiddlewareDef")
	if _, kept := output.Files["audit.d.ts"]; kept || strings.Join(output.Externals, ",") != "@mionjs/router" {
		t.Errorf("audit.d.ts and node:http only served cut members: files %v, externals %v", output.Files, output.Externals)
	}
	assertChecks(t, input, output)
	if full, trimmed := apiTypeText(t, input, input.Declarations, filepath.Join(declarationDir, "index.d.ts")), apiTypeTextOf(t, input, output); full != trimmed {
		t.Errorf("the cut must leave the API type unchanged:\nfull:    %s\ntrimmed: %s", full, trimmed)
	}
}
