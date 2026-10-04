package apitypes

import (
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/checker"
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
	return tryTrimIn(t, files, entry, nil)
}

// tryTrimIn also writes project files beside the declarations, a tsconfig.json among them to replace the default.
func tryTrimIn(t *testing.T, files map[string]string, entry string, project map[string]string) (*Output, Input, error) {
	t.Helper()
	dir := t.TempDir()
	write := func(rel, text string) { writeFile(t, filepath.Join(dir, filepath.FromSlash(rel)), text) }
	write("tsconfig.json", `{"compilerOptions": {"target": "ES2022", "module": "ESNext", "moduleResolution": "bundler", "strict": true, "types": ["node"]}, "include": ["src"]}`)
	write("src/placeholder.ts", "export {};\n")
	write("node_modules/@mionjs/router/package.json", `{"name": "@mionjs/router", "types": "index.d.ts"}`)
	write("node_modules/@mionjs/router/index.d.ts", routerStubDTS)
	write("node_modules/@types/node/package.json", `{"name": "@types/node", "types": "index.d.ts"}`)
	write("node_modules/@types/node/index.d.ts", nodeStubDTS)
	write("node_modules/ext-pkg/package.json", `{"name": "ext-pkg", "types": "index.d.ts"}`)
	write("node_modules/ext-pkg/index.d.ts", "export type Ext = {e: boolean};\nexport type OnlyServer = {s: boolean};\nexport interface Box {a: boolean}\n")
	// A server-only package: nothing from it may reach the published package.
	write("node_modules/heavy-pkg/package.json", `{"name": "heavy-pkg", "types": "index.d.ts"}`)
	write("node_modules/heavy-pkg/index.d.ts", "export declare class HeavyDb { query(sql: string): unknown }\nexport interface HeavyClient { db: HeavyDb }\nexport type HeavyRow = { id: string };\n")
	for rel, text := range project {
		write(rel, text)
	}
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
	problems, version, err := Check(input, output.Files, output.Entry)
	if err != nil {
		t.Fatal(err)
	}
	if len(problems) > 0 {
		t.Fatalf("the trimmed declarations must type-check on their own:\n%s\nfiles: %v", strings.Join(problems, "\n"), output.Files)
	}
	if version != output.BuildVersion {
		t.Fatalf("the trimmed entry must carry the build version %q, got %q", output.BuildVersion, version)
	}
	if err := VerifyIDs(input, output); err != nil {
		t.Fatal(err)
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
	if strings.HasPrefix(index, "\n") {
		t.Errorf("dropping the first statements must leave no blank line at the top:\n%s", index)
	}
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
	if output.uses["index.d.ts#Shared"] != 1 {
		t.Errorf("Shared must have one kept user (api), got %v", output.uses)
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
	if output.uses["shared.d.ts#Shared"] != 1 {
		t.Errorf("Shared must have one kept user (the import binding), got %v", output.uses)
	}
	assertChecks(t, input, output)
}

// TestTrim_PrintsAnExternalTypeTheApiShares: the shared external type is printed under _outside/, so its package is no peer.
func TestTrim_PrintsAnExternalTypeTheApiShares(t *testing.T) {
	output, input := trimProject(t, map[string]string{
		"index.d.ts": `import type { Ext, OnlyServer } from 'ext-pkg';
export declare const routes: { raw: (e: Ext, s: OnlyServer) => void };
` + apiOf(`ext: import("@mionjs/router").PublicRoute<(e: Ext) => Promise<Ext>>;`),
	}, "")
	assertContains(t, output.Files["index.d.ts"], `import("./_outside/ext-pkg.js").Ext`)
	assertLacks(t, output.Files["index.d.ts"], "OnlyServer", "from 'ext-pkg'")
	assertContains(t, output.Files["_outside/ext-pkg.d.ts"], "export type Ext = {e: boolean};")
	assertLacks(t, output.Files["_outside/ext-pkg.d.ts"], "OnlyServer")
	if strings.Join(output.Externals, ",") != "@mionjs/router" {
		t.Errorf("a printed package is no peer, got %v", output.Externals)
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
	if output.uses["index.d.ts#Leaf"] != 1 || output.uses["index.d.ts#Head"] != 1 {
		t.Errorf("Head (api) and Leaf (Head) each need one kept user, got %v", output.uses)
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
	if strings.Join(output.cutMembers, ",") != "index.d.ts#routes.log,index.d.ts#routes.nested.priv,index.d.ts#routes.raw" {
		t.Errorf("cut members %v", output.cutMembers)
	}
	if strings.Join(output.Externals, ",") != "@mionjs/router" {
		t.Errorf("a cut raw middleware's node:http import must leave no peer, got %v", output.Externals)
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
	if len(output.cutMembers) != 0 {
		t.Errorf("nothing public may be cut: %v", output.cutMembers)
	}
	assertChecks(t, input, output)
}

func assertRemoved(t *testing.T, output *Output, keys ...string) {
	t.Helper()
	removed := strings.Join(output.removed, "\n")
	for _, key := range keys {
		if !strings.Contains("\n"+removed+"\n", "\n"+key+"\n") {
			t.Errorf("%s must be removed, removed: %v", key, output.removed)
		}
	}
}

// TestTrim_RefusesAProjectAlias: a `paths` alias or a `#` import into the project cannot resolve once published.
func TestTrim_RefusesAProjectAlias(t *testing.T) {
	project := map[string]string{
		"tsconfig.json": `{"compilerOptions": {"target": "ES2022", "module": "ESNext", "moduleResolution": "bundler", "strict": true, "types": ["node"], "baseUrl": ".", "paths": {"@app/*": ["./src/*"]}}, "include": ["src"]}`,
		"src/models.ts": "export interface Model { id: string }\n",
	}
	files := map[string]string{"index.d.ts": `import type { Model } from '@app/models';
` + apiOf(`get: import("@mionjs/router").PublicRoute<(m: Model) => Promise<void>>;`)}
	if _, _, err := tryTrimIn(t, files, "", project); err == nil || !strings.Contains(err.Error(), `"@app/models"`) {
		t.Fatalf("a paths alias must fail naming it, got %v", err)
	}
	subpath := map[string]string{"index.d.ts": `import type { Model } from '#models';
` + apiOf(`get: import("@mionjs/router").PublicRoute<(m: Model) => Promise<void>>;`)}
	if _, _, err := tryTrim(t, subpath, ""); err == nil || !strings.Contains(err.Error(), `"#models"`) {
		t.Fatalf("a # import must fail naming it, got %v", err)
	}
}

// TestTrim_KeepsOverloadsMergesAndNamespacesWhole: every statement declaring a reached name stays.
func TestTrim_KeepsOverloadsMergesAndNamespacesWhole(t *testing.T) {
	output, input := trimProject(t, map[string]string{
		"index.d.ts": `export interface Shape { kind: string }
export declare namespace Shape {
    interface Extra { size: number }
}
export declare function make(kind: "a"): Shape;
export declare function make(kind: "b"): Shape.Extra;
export declare namespace Tools {
    type Id = string;
}
` + apiOf(`make: import("@mionjs/router").PublicRoute<typeof make>; id: import("@mionjs/router").PublicRoute<(id: Tools.Id) => Promise<void>>;`),
	}, "")
	assertContains(t, output.Files["index.d.ts"], "interface Shape", "namespace Shape", `make(kind: "a")`, `make(kind: "b")`, "namespace Tools")
	assertChecks(t, input, output)
}

// TestTrim_KeepsAFileAModule: a kept file left with no import or export statement still reads as a module.
func TestTrim_KeepsAFileAModule(t *testing.T) {
	output, input := trimProject(t, map[string]string{
		"index.d.ts":   "import type { Model } from './model.ts';\n" + apiOf(`get: import("@mionjs/router").PublicRoute<(m: Model) => Promise<void>>;`),
		"model.d.ts":   "import type { Dropped } from './dropped.ts';\ntype Local = { id: string };\nexport type Model = Local;\nexport declare const unused: Dropped;\n",
		"dropped.d.ts": "export type Dropped = number;\n",
	}, "")
	assertContains(t, output.Files["model.d.ts"], "type Local", "export type Model")
	assertLacks(t, output.Files["model.d.ts"], "Dropped", "unused")
	assertChecks(t, input, output)

	only, onlyInput := trimProject(t, map[string]string{
		"index.d.ts":   "import './globals.ts';\ntype Local = { id: string };\nexport declare const api: { get: import(\"@mionjs/router\").PublicRoute<(l: Local) => Promise<void>> } & import(\"@mionjs/router\").ApiBuildVersion<\"v1\">;\n",
		"globals.d.ts": "export {};\n",
	}, "")
	assertChecks(t, onlyInput, only)
}

// TestTrim_KeepsAugmentationsFromOtherFiles: a global augmentation kept code reads stays; a package's rides its printed type.
func TestTrim_KeepsAugmentationsFromOtherFiles(t *testing.T) {
	output, input := trimProject(t, map[string]string{
		"index.d.ts":     "import type { Box } from 'ext-pkg';\n" + apiOf(`get: import("@mionjs/router").PublicRoute<(e: Box, b: Branded) => Promise<void>>;`),
		"augment.d.ts":   "declare module 'ext-pkg' {\n    interface Box { extra: string }\n}\nexport {};\n",
		"global.d.ts":    "declare global {\n    interface Branded { tag: string }\n}\nexport {};\n",
		"unrelated.d.ts": "declare module 'other-pkg' {\n    interface Other { x: string }\n}\ndeclare global {\n    interface NotRead { y: string }\n}\nexport {};\n",
	}, "")
	if _, kept := output.Files["augment.d.ts"]; kept {
		t.Errorf("an augmentation of a printed package must not ship: the printed type carries its members")
	}
	assertContains(t, output.Files["_outside/ext-pkg.d.ts"], "export type Box = {a: boolean; extra: string};")
	assertContains(t, output.Files["global.d.ts"], "interface Branded")
	if _, kept := output.Files["unrelated.d.ts"]; kept {
		t.Errorf("an augmentation nothing kept reads must go")
	}
	assertChecks(t, input, output)
}

// apiTypeText prints the API export's resolved type in a program over files: equal text, equal ids.
func apiTypeText(t *testing.T, input Input, files map[string]string, entry string) string {
	t.Helper()
	return apiTypeTextBy(t, input, files, entry, func(trimmer *trimmer) func(*checker.Type) string { return trimmer.checker.TypeToString })
}

// apiTypeTextBy is apiTypeText with each member printed by the printer the program's trimmer gives.
func apiTypeTextBy(t *testing.T, input Input, files map[string]string, entry string, printer func(*trimmer) func(*checker.Type) string) string {
	t.Helper()
	trimmer, release, err := newTrimmer(input, files)
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	moduleSymbol := trimmer.checker.GetSymbolAtLocation(trimmer.files[entry].source.AsNode())
	for _, exported := range trimmer.checker.GetExportsOfModule(moduleSymbol) {
		if exported.Name != "api" {
			continue
		}
		return membersText(trimmer, trimmer.exportType(exported), printer(trimmer))
	}
	t.Fatalf("no api export in %s", entry)
	return ""
}

// membersText prints a type's members, nested route groups expanded, the version key named without its position.
func membersText(trimmer *trimmer, apiType *checker.Type, print func(*checker.Type) string) string {
	var members []string
	for _, property := range trimmer.checker.GetPropertiesOfType(apiType) {
		name := property.Name
		if strings.Contains(name, "apiBuildVersion") {
			name = "apiBuildVersion"
		}
		propertyType := trimmer.checker.GetTypeOfSymbol(property)
		text := print(propertyType)
		if strings.HasPrefix(trimmer.checker.TypeToString(propertyType), "PublicApi<") {
			text = "{" + membersText(trimmer, propertyType, print) + "}"
		}
		members = append(members, name+": "+text)
	}
	sort.Strings(members)
	return strings.Join(members, "; ")
}

// routesDTS is a routes object the API names through PublicApi<typeof routes>; middlewareOnly and shared plug in
// the types the raw middleware alone uses and the ones it shares with a public route.
const routesHeader = `import type { MiddlewareDef, RawMiddlewareDef, RouteDef, PublicApi, ApiBuildVersion } from '@mionjs/router';
import type { IncomingMessage } from 'node:http';
import type { Shared, OnlyRaw } from './shared.ts';
import type { Ext, OnlyServer } from 'ext-pkg';
type Ctx = { path: string };
`

// TestTrim_CutKeepsTypesTheRawMiddlewareSharesThroughImports: a type the cut raw middleware shares with a public
// route stays, from the same module, another emitted file or an external package; the rest of its imports go.
func TestTrim_CutKeepsTypesTheRawMiddlewareSharesThroughImports(t *testing.T) {
	files := map[string]string{
		"index.d.ts": routesHeader + `type LocalShared = { n: number };
type LocalOnlyRaw = { x: string };
export declare const routes: {
    raw: RawMiddlewareDef<(ctx: Ctx, req: IncomingMessage, s: Shared, o: OnlyRaw, e: Ext, x: OnlyServer, l: LocalShared, r: LocalOnlyRaw) => void>;
    get: RouteDef<(ctx: Ctx, s: Shared, e: Ext, l: LocalShared) => Shared>;
};
export declare const api: PublicApi<typeof routes> & ApiBuildVersion<"v1">;
`,
		"shared.d.ts": "export type Shared = { n: number };\nexport type OnlyRaw = { x: string };\n",
	}
	output, input := trimProject(t, files, "")
	index := output.Files["index.d.ts"]
	assertContains(t, index, "import type { Shared } from './shared.ts';", `e: import("./_outside/ext-pkg.js").Ext`, "type LocalShared", "get: RouteDef")
	assertLacks(t, index, "OnlyRaw", "OnlyServer", "IncomingMessage", "LocalOnlyRaw", "raw:", "RawMiddlewareDef", "from 'ext-pkg'")
	assertContains(t, output.Files["shared.d.ts"], "export type Shared")
	assertLacks(t, output.Files["shared.d.ts"], "OnlyRaw")
	assertLacks(t, output.Files["_outside/ext-pkg.d.ts"], "OnlyServer")
	if strings.Join(output.Externals, ",") != "@mionjs/router" {
		t.Errorf("the shared external is printed, so no peer but the router, got %v", output.Externals)
	}
	if output.uses["index.d.ts#LocalShared"] != 1 || output.uses["shared.d.ts#Shared"] != 1 {
		t.Errorf("each shared type keeps the one kept user it has left, got %v", output.uses)
	}
	assertChecks(t, input, output)
	if full, trimmed := apiTypeText(t, input, input.Declarations, filepath.Join(input.DeclarationDir, "index.d.ts")), apiTypeTextOf(t, input, output); full != trimmed {
		t.Errorf("the cut must leave the API type unchanged:\nfull:    %s\ntrimmed: %s", full, trimmed)
	}
}

func apiTypeTextOf(t *testing.T, input Input, output *Output) string {
	t.Helper()
	return apiTypeText(t, input, absoluteFiles(input, output.Files), filepath.Join(input.DeclarationDir, filepath.FromSlash(output.Entry)))
}

// absoluteFiles keys output files by absolute path under the declaration dir, as Input.Declarations is.
func absoluteFiles(input Input, files map[string]string) map[string]string {
	out := make(map[string]string, len(files))
	for rel, text := range files {
		out[filepath.Join(input.DeclarationDir, filepath.FromSlash(rel))] = text
	}
	return out
}

// TestTrim_CutsThroughANamedAlias: PublicApi<Routes> over a type alias cuts the alias's members the same way.
func TestTrim_CutsThroughANamedAlias(t *testing.T) {
	output, input := trimProject(t, map[string]string{
		"index.d.ts": routesHeader + `type Routes = {
    raw: RawMiddlewareDef<(ctx: Ctx, req: IncomingMessage) => void>;
    group: { priv: MiddlewareDef<(ctx?: { o: OnlyRaw }) => undefined>; get: RouteDef<(ctx: Ctx, s: Shared) => Shared> };
};
export declare const api: PublicApi<Routes> & ApiBuildVersion<"v1">;
`,
		"shared.d.ts": "export type Shared = { n: number };\nexport type OnlyRaw = { x: string };\n",
	}, "")
	assertLacks(t, output.Files["index.d.ts"], "raw:", "priv:", "IncomingMessage", "OnlyRaw")
	if strings.Join(output.cutMembers, ",") != "index.d.ts#Routes.group.priv,index.d.ts#Routes.raw" {
		t.Errorf("cut members %v", output.cutMembers)
	}
	assertChecks(t, input, output)
	if full, trimmed := apiTypeText(t, input, input.Declarations, filepath.Join(input.DeclarationDir, "index.d.ts")), apiTypeTextOf(t, input, output); full != trimmed {
		t.Errorf("the cut must leave the API type unchanged:\nfull:    %s\ntrimmed: %s", full, trimmed)
	}
}

// TestTrim_RefusesARoutesObjectUsedOutsidePublicApi: cutting it would change the other type, so the build stops.
func TestTrim_RefusesARoutesObjectUsedOutsidePublicApi(t *testing.T) {
	_, _, err := tryTrim(t, map[string]string{
		"index.d.ts": routesHeader + `export declare const routes: {
    raw: RawMiddlewareDef<(ctx: Ctx, req: IncomingMessage) => void>;
    get: RouteDef<(ctx: Ctx, section: keyof typeof routes) => void>;
};
export declare const api: PublicApi<typeof routes> & ApiBuildVersion<"v1">;
`,
		"shared.d.ts": "export type Shared = { n: number };\nexport type OnlyRaw = { x: string };\n",
	}, "")
	if err == nil || !strings.Contains(err.Error(), "routes is used outside PublicApi") {
		t.Fatalf("want routes reading itself refused, got %v", err)
	}
	_, _, err = tryTrim(t, map[string]string{
		"index.d.ts": routesHeader + `type Section = keyof typeof routes;
export declare const routes: {
    raw: RawMiddlewareDef<(ctx: Ctx, req: IncomingMessage) => void>;
    get: RouteDef<(ctx: Ctx, section: Section) => void>;
};
export declare const api: PublicApi<typeof routes> & ApiBuildVersion<"v1">;
`,
		"shared.d.ts": "export type Shared = { n: number };\nexport type OnlyRaw = { x: string };\n",
	}, "")
	if err == nil || !strings.Contains(err.Error(), "routes is used outside PublicApi") {
		t.Fatalf("want routes another kept type reads refused, got %v", err)
	}
}

// TestTrim_LeavesOtherTypesAlone: a member that fits a raw middleware's shape outside any routes is kept.
func TestTrim_LeavesOtherTypesAlone(t *testing.T) {
	output, input := trimProject(t, map[string]string{
		"index.d.ts": `export interface Job { step: { type: 4; handler: (e: string) => void } }
` + apiOf(`run: import("@mionjs/router").PublicRoute<(job: Job) => Promise<void>>;`),
	}, "")
	assertContains(t, output.Files["index.d.ts"], "step: { type: 4;")
	if len(output.cutMembers) != 0 {
		t.Errorf("nothing outside a PublicApi routes object may be cut, got %v", output.cutMembers)
	}
	assertChecks(t, input, output)
}

// TestTrim_AnAugmentationFileNothingImportsLoadsFromTheEntry: a client loads only what the entry reaches.
func TestTrim_AnAugmentationFileNothingImportsLoadsFromTheEntry(t *testing.T) {
	output, input := trimProject(t, map[string]string{
		"index.d.ts":   "import type { Box } from './box.ts';\n" + apiOf(`get: import("@mionjs/router").PublicRoute<(b: Box) => Promise<void>>;`),
		"box.d.ts":     "export interface Box { a: string }\n",
		"augment.d.ts": "declare module './box.ts' {\n    interface Box { extra: number }\n}\nexport {};\n",
	}, "")
	assertContains(t, output.Files["index.d.ts"], `/// <reference path="./augment.d.ts" />`)
	assertChecks(t, input, output)
	assertIDParity(t, input, output)
}
