package apitypes

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// routerStubDTS stands in for @mionjs/router: the definition and public types the trimmer asks the checker about.
const routerStubDTS = `declare const apiBuildVersion: unique symbol;
export type ApiBuildVersion<V extends string> = {readonly [apiBuildVersion]?: V};
export interface RouteDef<H = any> { type: 1; handler: H; options?: {} }
export interface MiddlewareDef<H = any> { type: 2; handler: H; options?: {} }
export interface RawMiddlewareDef<H = any> { type: 4; handler: H; options?: {} }
export interface PrivateMiddlewareDef extends MiddlewareDef { handler: (ctx?: any) => void | never | undefined }
export type PrivateDef = PrivateMiddlewareDef | RawMiddlewareDef;
interface MethodMetadata { id: string }
export interface PublicRoute<H = any, O = any, T = any> extends MethodMetadata { type: 1; handler: H; options: O; middlewareIds: string[] }
export interface PublicMiddleware<H = any, O = any, T = any> extends MethodMetadata { type: 2; handler: H; options: O }
export interface PublicHeadersMiddleware<H = any, O = any, T = any> extends MethodMetadata { type: 3; handler: H; options: O; headerNames: string[] }
export type PublicApi<R> = {
  [K in keyof R as R[K] extends PrivateDef ? never : K]: R[K] extends RouteDef<infer H> ? PublicRoute<H> : R[K] extends MiddlewareDef<infer H> ? PublicMiddleware<H> : PublicApi<R[K]>;
};
`

const nodeStubDTS = `declare module 'node:http' { export interface IncomingMessage { url?: string } }
`

// trimProject lays out the declarations under <tmp>/decl with stub packages beside them and trims them.
func trimProject(t *testing.T, files map[string]string, entry string) (*Output, Input) {
	t.Helper()
	output, input, err := tryTrim(t, files, entry)
	if err != nil {
		t.Fatal(err)
	}
	return output, input
}

func tryTrim(t *testing.T, files map[string]string, entry string) (*Output, Input, error) {
	t.Helper()
	dir := t.TempDir()
	write := func(rel, text string) {
		target := filepath.Join(dir, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(target, []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("tsconfig.json", `{"compilerOptions": {"target": "ES2022", "module": "ESNext", "moduleResolution": "bundler", "strict": true, "types": ["node"]}, "include": ["src"]}`)
	write("src/placeholder.ts", "export {};\n")
	write("node_modules/@mionjs/router/package.json", `{"name": "@mionjs/router", "types": "index.d.ts"}`)
	write("node_modules/@mionjs/router/index.d.ts", routerStubDTS)
	write("node_modules/@types/node/package.json", `{"name": "@types/node", "types": "index.d.ts"}`)
	write("node_modules/@types/node/index.d.ts", nodeStubDTS)
	write("node_modules/ext-pkg/package.json", `{"name": "ext-pkg", "types": "index.d.ts"}`)
	write("node_modules/ext-pkg/index.d.ts", "export type Ext = {e: boolean};\nexport type OnlyServer = {s: boolean};\n")
	declarationDir := filepath.Join(dir, "decl")
	declarations := map[string]string{}
	for rel, text := range files {
		declarations[filepath.Join(declarationDir, filepath.FromSlash(rel))] = text
	}
	input := Input{Cwd: dir, TsconfigPath: "tsconfig.json", DeclarationDir: declarationDir, Declarations: declarations}
	if entry != "" {
		input.Entry = filepath.Join(declarationDir, filepath.FromSlash(entry))
	}
	output, err := Trim(input)
	return output, input, err
}

func assertChecks(t *testing.T, input Input, output *Output) {
	t.Helper()
	problems, err := Check(input, output.Files)
	if err != nil {
		t.Fatal(err)
	}
	if len(problems) > 0 {
		t.Fatalf("the trimmed declarations must type-check on their own:\n%s\nfiles: %v", strings.Join(problems, "\n"), output.Files)
	}
}

func assertContains(t *testing.T, text string, wanted ...string) {
	t.Helper()
	for _, fragment := range wanted {
		if !strings.Contains(text, fragment) {
			t.Errorf("missing %q in:\n%s", fragment, text)
		}
	}
}

func assertLacks(t *testing.T, text string, unwanted ...string) {
	t.Helper()
	for _, fragment := range unwanted {
		if strings.Contains(text, fragment) {
			t.Errorf("unexpected %q in:\n%s", fragment, text)
		}
	}
}

// apiOf writes an expanded API type over the given members, the shape `mion compile` emits.
func apiOf(members string) string {
	return `export declare const api: {` + members + `} & import("@mionjs/router").ApiBuildVersion<"v1">;` + "\n"
}

// TestTrim_DropsWhatTheApiDoesNotReach: other exports, their imports and a file only they use all go.
func TestTrim_DropsWhatTheApiDoesNotReach(t *testing.T) {
	output, input := trimProject(t, map[string]string{
		"index.d.ts": `import type { IncomingMessage } from 'node:http';
import { Db } from './db.ts';
export declare class Product {
    sku: string;
}
export declare const routes: { raw: (req: IncomingMessage) => void };
export declare function startServer(db: Db): void;
` + apiOf(`get: import("@mionjs/router").PublicRoute<(code: string) => Promise<Product>>;`) + "export type Api = typeof api;\n",
		"db.d.ts": "export declare class Db {\n    protected conn: number;\n}\n",
	}, "")
	index := output.Files["index.d.ts"]
	assertContains(t, index, "class Product", "export declare const api", "export type Api = typeof api;", `ApiBuildVersion<"v1">`)
	assertLacks(t, index, "IncomingMessage", "Db", "routes", "startServer")
	if _, kept := output.Files["db.d.ts"]; kept {
		t.Errorf("db.d.ts only served a dropped export, it must go")
	}
	if strings.Join(output.ApiExports, ",") != "Api,api" || output.BuildVersion != "v1" {
		t.Errorf("api exports %v version %q", output.ApiExports, output.BuildVersion)
	}
	if len(output.Externals) != 1 || output.Externals[0] != "@mionjs/router" {
		t.Errorf("externals %v: node:http only served a dropped export", output.Externals)
	}
	assertChecks(t, input, output)
}

// TestTrim_KeepsATypeSharedInTheSameModule: a type both a dropped export and the API use stays, counted once per user.
func TestTrim_KeepsATypeSharedInTheSameModule(t *testing.T) {
	output, input := trimProject(t, map[string]string{
		"index.d.ts": `type Shared = { n: number };
type OnlyDropped = { x: string };
export declare const routes: { raw: (s: Shared, o: OnlyDropped) => void };
` + apiOf(`share: import("@mionjs/router").PublicRoute<(s: Shared) => Promise<Shared>>;`),
	}, "")
	index := output.Files["index.d.ts"]
	assertContains(t, index, "type Shared")
	assertLacks(t, index, "OnlyDropped", "routes")
	if output.Uses["index.d.ts#Shared"] != 1 {
		t.Errorf("Shared must have one kept user (api), got %v", output.Uses)
	}
	assertRemoved(t, output, "index.d.ts#OnlyDropped", "index.d.ts#routes")
	assertChecks(t, input, output)
}

// TestTrim_KeepsATypeSharedThroughAnImport: of one import statement only the binding the API uses stays, and its file.
func TestTrim_KeepsATypeSharedThroughAnImport(t *testing.T) {
	output, input := trimProject(t, map[string]string{
		"index.d.ts": `import type { Shared, OnlyRaw } from './shared.ts';
export declare const routes: { raw: (s: Shared, o: OnlyRaw) => void };
` + apiOf(`share: import("@mionjs/router").PublicRoute<(s: Shared) => Promise<Shared>>;`),
		"shared.d.ts": "export type Shared = { n: number };\nexport type OnlyRaw = { x: string };\n",
	}, "")
	assertContains(t, output.Files["index.d.ts"], "import type { Shared } from './shared.ts';")
	assertLacks(t, output.Files["index.d.ts"], "OnlyRaw")
	assertContains(t, output.Files["shared.d.ts"], "export type Shared")
	assertLacks(t, output.Files["shared.d.ts"], "OnlyRaw")
	if output.Uses["shared.d.ts#Shared"] != 1 {
		t.Errorf("Shared must have one kept user (the import binding), got %v", output.Uses)
	}
	assertChecks(t, input, output)
}

// TestTrim_KeepsAnExternalImportTheApiShares: the shared external binding stays and its package becomes a peer.
func TestTrim_KeepsAnExternalImportTheApiShares(t *testing.T) {
	output, input := trimProject(t, map[string]string{
		"index.d.ts": `import type { Ext, OnlyServer } from 'ext-pkg';
export declare const routes: { raw: (e: Ext, s: OnlyServer) => void };
` + apiOf(`ext: import("@mionjs/router").PublicRoute<(e: Ext) => Promise<Ext>>;`),
	}, "")
	assertContains(t, output.Files["index.d.ts"], "import type { Ext } from 'ext-pkg';")
	assertLacks(t, output.Files["index.d.ts"], "OnlyServer")
	if strings.Join(output.Externals, ",") != "@mionjs/router,ext-pkg" {
		t.Errorf("externals %v", output.Externals)
	}
	assertChecks(t, input, output)
}

// TestTrim_KeepsATypeReachedOnlyThroughASharedType: the cascade keeps a chain while its head is used.
func TestTrim_KeepsATypeReachedOnlyThroughASharedType(t *testing.T) {
	output, input := trimProject(t, map[string]string{
		"index.d.ts": `type Leaf = { n: number };
type Head = { leaf: Leaf };
type DeadLeaf = { x: string };
type DeadHead = { leaf: DeadLeaf; head: Head };
export declare const routes: { raw: (h: DeadHead) => void };
` + apiOf(`head: import("@mionjs/router").PublicRoute<(h: Head) => Promise<void>>;`),
	}, "")
	index := output.Files["index.d.ts"]
	assertContains(t, index, "type Leaf", "type Head")
	assertLacks(t, index, "DeadLeaf", "DeadHead")
	if output.Uses["index.d.ts#Leaf"] != 1 || output.Uses["index.d.ts#Head"] != 1 {
		t.Errorf("Head (api) and Leaf (Head) each need one kept user, got %v", output.Uses)
	}
	assertChecks(t, input, output)
}

// TestTrim_DropsAnUnusedCycle: two types using each other but nothing kept are both dropped.
func TestTrim_DropsAnUnusedCycle(t *testing.T) {
	output, input := trimProject(t, map[string]string{
		"index.d.ts": "interface A { b: B }\ninterface B { a: A }\n" + apiOf(`get: import("@mionjs/router").PublicRoute<() => Promise<void>>;`),
	}, "")
	assertLacks(t, output.Files["index.d.ts"], "interface A", "interface B")
	assertChecks(t, input, output)
}

// TestTrim_FollowsReExportsAndImportTypes: a barrel's `export *`, a named re-export and an `import()` type all resolve.
func TestTrim_FollowsReExportsAndImportTypes(t *testing.T) {
	output, input := trimProject(t, map[string]string{
		"index.d.ts":        "export * from './api.ts';\nexport { Unused } from './unused.ts';\n",
		"api.d.ts":          "import type { Model } from './models/index.ts';\n" + apiOf(`get: import("@mionjs/router").PublicRoute<(m: Model) => Promise<import("./extra.ts").Extra>>;`),
		"models/index.d.ts": "export { Model } from './model.ts';\nexport { Other } from './other.ts';\n",
		"models/model.d.ts": "export interface Model { id: string }\n",
		"models/other.d.ts": "export interface Other { id: number }\n",
		"extra.d.ts":        "export type Extra = { ok: boolean };\nexport type NotThis = number;\n",
		"unused.d.ts":       "export type Unused = string;\n",
	}, "index.d.ts")
	assertContains(t, output.Files["index.d.ts"], "export * from './api.ts';")
	assertLacks(t, output.Files["index.d.ts"], "Unused")
	assertContains(t, output.Files["models/index.d.ts"], "export { Model } from './model.ts';")
	assertLacks(t, output.Files["models/index.d.ts"], "Other")
	assertContains(t, output.Files["extra.d.ts"], "Extra")
	assertLacks(t, output.Files["extra.d.ts"], "NotThis")
	for _, gone := range []string{"models/other.d.ts", "unused.d.ts"} {
		if _, kept := output.Files[gone]; kept {
			t.Errorf("%s must go", gone)
		}
	}
	assertChecks(t, input, output)
}

// TestTrim_KeepsAugmentationsOfAKeptFile: a `declare global` block rides with its kept file, unread by name.
func TestTrim_KeepsAugmentationsOfAKeptFile(t *testing.T) {
	output, input := trimProject(t, map[string]string{
		"index.d.ts": "declare global {\n    interface Brand { tag: string }\n}\n" + apiOf(`get: import("@mionjs/router").PublicRoute<(b: Brand) => Promise<void>>;`),
	}, "")
	assertContains(t, output.Files["index.d.ts"], "declare global", "interface Brand")
	assertChecks(t, input, output)
}

// TestTrim_EntryErrors: no API export, and two files exporting one without --entry.
func TestTrim_EntryErrors(t *testing.T) {
	if _, _, err := tryTrim(t, map[string]string{"index.d.ts": "export declare const notApi: number;\n"}, ""); err == nil || !strings.Contains(err.Error(), "no declaration exports an API") {
		t.Errorf("no API: got %v", err)
	}
	two := map[string]string{"a.d.ts": apiOf(`get: import("@mionjs/router").PublicRoute<() => Promise<void>>;`), "b.d.ts": apiOf(`get: import("@mionjs/router").PublicRoute<() => Promise<void>>;`)}
	if _, _, err := tryTrim(t, two, ""); err == nil || !strings.Contains(err.Error(), "--entry") {
		t.Errorf("two APIs: got %v", err)
	}
	if output, _, err := tryTrim(t, two, "b.d.ts"); err != nil || output.Entry != "b.d.ts" {
		t.Errorf("--entry must pick b.d.ts: %v %v", output, err)
	}
}

// TestTrim_CutsPrivateAndRawMiddlewares: a routes object the API names keeps its routes and public middlewares and
// loses its private and raw ones, nested included, with the types and imports only those used.
func TestTrim_CutsPrivateAndRawMiddlewares(t *testing.T) {
	output, input := trimProject(t, map[string]string{
		"index.d.ts": `import type { MiddlewareDef, RawMiddlewareDef, RouteDef, PublicApi, ApiBuildVersion } from '@mionjs/router';
import type { IncomingMessage } from 'node:http';
import type { Db } from './db.ts';
type Shared = { n: number };
type Ctx = { path: string };
export declare const routes: {
    raw: RawMiddlewareDef<(ctx: Ctx, req: IncomingMessage) => void>;
    log: MiddlewareDef<(ctx: Ctx & { db: Db }) => void>;
    check: MiddlewareDef<(ctx: Ctx, n: number) => void>;
    get: RouteDef<(ctx: Ctx, s: Shared) => Shared>;
    nested: {
        priv: MiddlewareDef<(ctx?: { raw: IncomingMessage }) => undefined>;
        ok: RouteDef<(ctx: Ctx) => Shared>;
    };
};
export declare const api: PublicApi<typeof routes> & ApiBuildVersion<"v1">;
`,
		"db.d.ts": "export declare class Db {\n    protected conn: number;\n}\n",
	}, "")
	index := output.Files["index.d.ts"]
	assertContains(t, index, "check: MiddlewareDef", "get: RouteDef", "ok: RouteDef", "type Shared", "type Ctx")
	assertLacks(t, index, "raw:", "log:", "priv:", "IncomingMessage", "Db", "RawMiddlewareDef")
	if _, kept := output.Files["db.d.ts"]; kept {
		t.Errorf("db.d.ts served only a private middleware")
	}
	if strings.Join(output.CutMembers, ",") != "index.d.ts#routes.log,index.d.ts#routes.nested.priv,index.d.ts#routes.raw" {
		t.Errorf("cut members %v", output.CutMembers)
	}
	assertChecks(t, input, output)
}

// TestTrim_KeepsAPublicMiddlewareWithNoParams: a public middleware whose handler returns void fits PrivateDef too, and must stay.
func TestTrim_KeepsAPublicMiddlewareWithNoParams(t *testing.T) {
	output, input := trimProject(t, map[string]string{
		"index.d.ts": `export declare const holder: { mw: import("@mionjs/router").PublicMiddleware<() => void> };
` + apiOf(`mw: typeof holder.mw;`),
	}, "")
	assertContains(t, output.Files["index.d.ts"], "mw: import(\"@mionjs/router\").PublicMiddleware")
	if len(output.CutMembers) != 0 {
		t.Errorf("nothing public may be cut: %v", output.CutMembers)
	}
	assertChecks(t, input, output)
}

func assertRemoved(t *testing.T, output *Output, keys ...string) {
	t.Helper()
	removed := strings.Join(output.Removed, "\n")
	for _, key := range keys {
		if !strings.Contains("\n"+removed+"\n", "\n"+key+"\n") {
			t.Errorf("%s must be removed, removed: %v", key, output.Removed)
		}
	}
}
