package apitypes

import (
	"slices"
	"strings"
	"testing"
)

// assertNeverShips: no import, peer or name of pkg, nor any server-only name, reaches the published package.
func assertNeverShips(t *testing.T, output *Output, pkg string, serverOnly ...string) {
	t.Helper()
	assertLacks(t, strings.Join(mapValues(output.Files), "\n"), append([]string{"'" + pkg, `"` + pkg}, serverOnly...)...)
	if slices.Contains(output.Externals, pkg) {
		t.Errorf("%s must not become a peer, externals %v", pkg, output.Externals)
	}
}

// assertNothingHeavy: no heavy-pkg import, type or peer, and no server-only name.
func assertNothingHeavy(t *testing.T, output *Output, serverOnly ...string) {
	t.Helper()
	assertNeverShips(t, output, "heavy-pkg", append([]string{"HeavyDb", "HeavyClient", "HeavyRow"}, serverOnly...)...)
}

// TestTrim_ServerOnlyMiddlewaresShipNothing: a db client only private and raw middlewares use stays on the server.
func TestTrim_ServerOnlyMiddlewaresShipNothing(t *testing.T) {
	output, input := trimProject(t, map[string]string{
		"index.d.ts": `import type { MiddlewareDef, RawMiddlewareDef, RouteDef, PublicApi, ApiBuildVersion } from '@mionjs/router';
import type { HeavyDb, HeavyClient } from 'heavy-pkg';
import type { IncomingMessage } from 'node:http';
type DbCtx = { db: HeavyDb };
export declare const routes: {
    connect: RawMiddlewareDef<(ctx: DbCtx, req: IncomingMessage, client: HeavyClient) => void>;
    audit: MiddlewareDef<(ctx?: DbCtx) => undefined>;
    get: RouteDef<(ctx: unknown, id: string) => { id: string }>;
};
export declare const api: PublicApi<typeof routes> & ApiBuildVersion<"v1">;
`,
	}, "")
	assertContains(t, output.Files["index.d.ts"], "get: RouteDef")
	assertNothingHeavy(t, output, "DbCtx", "IncomingMessage", "connect:", "audit:")
	assertChecks(t, input, output)
}

// TestTrim_ServerOnlyExportsShipNothing: a db value, a service class and a handler helper beside the API all go,
// whether they name the package by an import, an `import()` type or a namespace import.
func TestTrim_ServerOnlyExportsShipNothing(t *testing.T) {
	output, input := trimProject(t, map[string]string{
		"index.d.ts": `import type { HeavyDb } from 'heavy-pkg';
import type * as Heavy from 'heavy-pkg';
import { UserService } from './service.ts';
export declare const db: HeavyDb;
export declare const client: import("heavy-pkg").HeavyClient;
export declare function loadUser(service: UserService, row: Heavy.HeavyRow): Promise<User>;
export interface User { id: string; name: string }
` + apiOf(`user: import("@mionjs/router").PublicRoute<(id: string) => Promise<User>>;`),
		"service.d.ts": "import type { HeavyDb } from 'heavy-pkg';\nexport declare class UserService {\n    private db;\n    constructor(db: HeavyDb);\n}\n",
	}, "")
	assertContains(t, output.Files["index.d.ts"], "export interface User")
	assertNothingHeavy(t, output, "UserService", "loadUser", "declare const db", "declare const client")
	if _, kept := output.Files["service.d.ts"]; kept {
		t.Errorf("service.d.ts served only a dropped export")
	}
	assertChecks(t, input, output)
}

// TestTrim_BarrelBesideServerOnlyTablesShipsOnlyTheRow: an `export *` barrel over a schema file keeps the row type
// the API returns and drops the tables and db beside it.
func TestTrim_BarrelBesideServerOnlyTablesShipsOnlyTheRow(t *testing.T) {
	output, input := trimProject(t, map[string]string{
		"index.d.ts":  "export * from './schema.ts';\nexport * from './api.ts';\n",
		"api.d.ts":    "import type { UserRow } from './schema.ts';\n" + apiOf(`user: import("@mionjs/router").PublicRoute<(id: string) => Promise<UserRow>>;`),
		"schema.d.ts": "import type { HeavyDb, HeavyRow } from 'heavy-pkg';\nexport type UserRow = { id: string; name: string };\nexport declare const usersTable: HeavyRow;\nexport declare const db: HeavyDb;\n",
	}, "index.d.ts")
	assertContains(t, output.Files["schema.d.ts"], "export type UserRow")
	assertNothingHeavy(t, output, "usersTable", "declare const db")
	assertChecks(t, input, output)
}

// TestTrim_ServerOnlyAugmentationsShipNothing: augmentations of the server-only package, or globals the API never
// reads, in files nothing names, stay on the server.
func TestTrim_ServerOnlyAugmentationsShipNothing(t *testing.T) {
	output, input := trimProject(t, map[string]string{
		"index.d.ts":   apiOf(`get: import("@mionjs/router").PublicRoute<(id: string) => Promise<void>>;`),
		"augment.d.ts": "declare module 'heavy-pkg' {\n    interface HeavyClient { pool: number }\n}\nexport {};\n",
		"globals.d.ts": "import type { HeavyDb } from 'heavy-pkg';\ndeclare global {\n    var serverDb: HeavyDb;\n    interface ServerOnlyGlobal { db: HeavyDb }\n}\nexport {};\n",
	}, "")
	assertNothingHeavy(t, output, "serverDb", "ServerOnlyGlobal")
	for _, gone := range []string{"augment.d.ts", "globals.d.ts"} {
		if _, kept := output.Files[gone]; kept {
			t.Errorf("%s augments only what the API never reads", gone)
		}
	}
	assertChecks(t, input, output)
}

// TestTrim_NamespaceImportShipsOnlyTheMembersRead: `M.User` through `import * as M` keeps User, not the whole file;
// a bare read of M still keeps every export.
func TestTrim_NamespaceImportShipsOnlyTheMembersRead(t *testing.T) {
	models := "import type { HeavyDb } from 'heavy-pkg';\nexport interface User { id: string }\nexport declare const roles: readonly [\"admin\"];\nexport declare class ServerOnly { db: HeavyDb }\n"
	output, input := trimProject(t, map[string]string{
		"index.d.ts":  "import type * as M from './models.ts';\n" + apiOf(`user: import("@mionjs/router").PublicRoute<(role: typeof M.roles) => Promise<M.User>>;`),
		"models.d.ts": models,
	}, "")
	assertContains(t, output.Files["models.d.ts"], "interface User", "roles")
	assertNothingHeavy(t, output, "ServerOnly")
	assertChecks(t, input, output)

	whole, wholeInput := trimProject(t, map[string]string{
		"index.d.ts":  "import type * as M from './models.ts';\n" + apiOf(`all: import("@mionjs/router").PublicRoute<() => Promise<keyof typeof M>>;`),
		"models.d.ts": models,
	}, "")
	assertContains(t, whole.Files["models.d.ts"], "interface User", "roles", "ServerOnly")
	assertChecks(t, wholeInput, whole)
}

// TestTrim_AugmentationsShipOnlyWhatIsRead: a kept file's `declare global` keeps only the members kept code reads,
// and its augmentation of a package nothing kept imports goes.
func TestTrim_AugmentationsShipOnlyWhatIsRead(t *testing.T) {
	output, input := trimProject(t, map[string]string{
		"index.d.ts": "import type { Model } from './model.ts';\n" + apiOf(`get: import("@mionjs/router").PublicRoute<(m: Model, b: Branded) => Promise<void>>;`),
		"model.d.ts": `import type { HeavyDb } from 'heavy-pkg';
export interface Model { id: string }
declare global {
    interface Branded { tag: Tag }
    type Tag = string;
    interface NotRead { db: HeavyDb }
    var serverDb: HeavyDb;
}
declare module 'heavy-pkg' {
    interface HeavyClient { extra: Model }
}
`,
	}, "")
	assertContains(t, output.Files["model.d.ts"], "interface Model", "declare global", "interface Branded", "type Tag")
	assertNothingHeavy(t, output, "NotRead", "serverDb", "declare module")
	assertChecks(t, input, output)
}

// TestTrim_RelativeAugmentationShipsWithItsTarget: a `declare module './model.ts'` member ships with the declaration
// it augments, and goes with it otherwise.
func TestTrim_RelativeAugmentationShipsWithItsTarget(t *testing.T) {
	files := func(api string) map[string]string {
		return map[string]string{
			"index.d.ts":   "import type { Model } from './model.ts';\nexport declare const other: Model;\n" + apiOf(api),
			"model.d.ts":   "export interface Model { id: string }\nexport interface Unread { id: string }\n",
			"augment.d.ts": "import type { HeavyDb } from 'heavy-pkg';\ndeclare module './model.ts' {\n    interface Model { extra: string }\n    interface Unread { db: HeavyDb }\n}\nexport {};\n",
		}
	}
	output, input := trimProject(t, files(`get: import("@mionjs/router").PublicRoute<(m: Model) => Promise<void>>;`), "")
	assertContains(t, output.Files["augment.d.ts"], "interface Model { extra: string }")
	assertNothingHeavy(t, output, "Unread")
	assertChecks(t, input, output)

	unread, _ := trimProject(t, files(`get: import("@mionjs/router").PublicRoute<() => Promise<void>>;`), "")
	for _, gone := range []string{"model.d.ts", "augment.d.ts"} {
		if _, kept := unread.Files[gone]; kept {
			t.Errorf("%s augments only what the API never reads", gone)
		}
	}
}

// TestTrim_SideEffectImportKeepsItsGlobals: `import './globals.ts'` keeps every global it declares, read or not.
func TestTrim_SideEffectImportKeepsItsGlobals(t *testing.T) {
	output, input := trimProject(t, map[string]string{
		"index.d.ts":   "import './globals.ts';\n" + apiOf(`get: import("@mionjs/router").PublicRoute<() => Promise<void>>;`),
		"globals.d.ts": "declare global {\n    interface Unread { x: string }\n}\nexport {};\n",
	}, "")
	assertContains(t, output.Files["globals.d.ts"], "interface Unread")
	assertChecks(t, input, output)
}

// TestTrim_KeepsGlobalsReadThroughAnotherName: `globalThis.counter` reads the global `counter`, and a member merged
// into a library global (`SymbolConstructor`) is read through `Symbol`, so both stay.
func TestTrim_KeepsGlobalsReadThroughAnotherName(t *testing.T) {
	output, input := trimProject(t, map[string]string{
		"index.d.ts": `export interface Model { id: string }
declare global {
    var counter: number;
    interface SymbolConstructor { readonly brand: unique symbol }
    interface NotRead { n: number }
}
export type Branded = { [Symbol.brand]: string; count: typeof globalThis.counter };
` + apiOf(`get: import("@mionjs/router").PublicRoute<(b: Branded, m: Model) => Promise<void>>;`),
	}, "")
	assertContains(t, output.Files["index.d.ts"], "var counter", "interface SymbolConstructor")
	assertLacks(t, output.Files["index.d.ts"], "NotRead")
	assertChecks(t, input, output)
}

// TestTrim_KeepsAnAugmentationOfAPackageReachedThroughAnother: ext-pkg's Box reads ext-dep's Inner, so augmenting
// ext-dep changes a type the API reaches, though no kept code imports ext-dep.
func TestTrim_KeepsAnAugmentationOfAPackageReachedThroughAnother(t *testing.T) {
	project := map[string]string{
		"node_modules/ext-dep/package.json":  `{"name": "ext-dep", "types": "index.d.ts"}`,
		"node_modules/ext-dep/index.d.ts":    "export interface Inner { id: string }\n",
		"node_modules/ext-wrap/package.json": `{"name": "ext-wrap", "types": "index.d.ts"}`,
		"node_modules/ext-wrap/index.d.ts":   "import type { Inner } from 'ext-dep';\nexport interface Wrapped { inner: Inner }\n",
	}
	output, input, err := tryTrimIn(t, map[string]string{
		"index.d.ts": "import type { Wrapped } from 'ext-wrap';\ndeclare module 'ext-dep' {\n    interface Inner { extra: string }\n}\n" +
			apiOf(`get: import("@mionjs/router").PublicRoute<(w: Wrapped) => Promise<void>>;`),
	}, "", project)
	if err != nil {
		t.Fatal(err)
	}
	assertContains(t, output.Files["index.d.ts"], "declare module 'ext-dep'", "extra: string")
	assertChecks(t, input, output)
}
