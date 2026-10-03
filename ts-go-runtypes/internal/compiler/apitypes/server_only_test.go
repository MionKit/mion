package apitypes

import (
	"strings"
	"testing"
)

// heavyProject adds a server-only package beside the stubs; nothing from it may reach the published package.
var heavyProject = map[string]string{
	"node_modules/heavy-pkg/package.json": `{"name": "heavy-pkg", "types": "index.d.ts"}`,
	"node_modules/heavy-pkg/index.d.ts":   "export declare class HeavyDb { query(sql: string): unknown }\nexport interface HeavyClient { db: HeavyDb }\nexport type HeavyRow = { id: string };\n",
}

func trimServerOnly(t *testing.T, files map[string]string, entry string) (*Output, Input) {
	t.Helper()
	output, input, err := tryTrimIn(t, files, entry, heavyProject)
	if err != nil {
		t.Fatal(err)
	}
	return output, input
}

// assertNothingHeavy: no heavy-pkg import, type or peer, and no server-only name.
func assertNothingHeavy(t *testing.T, output *Output, serverOnly ...string) {
	t.Helper()
	published := strings.Join(mapValues(output.Files), "\n")
	assertLacks(t, published, append([]string{"heavy-pkg", "HeavyDb", "HeavyClient", "HeavyRow"}, serverOnly...)...)
	for _, external := range output.Externals {
		if external == "heavy-pkg" {
			t.Errorf("heavy-pkg must not become a peer, externals %v", output.Externals)
		}
	}
}

// TestTrim_ServerOnlyMiddlewaresShipNothing: a db client only private and raw middlewares use stays on the server.
func TestTrim_ServerOnlyMiddlewaresShipNothing(t *testing.T) {
	output, input := trimServerOnly(t, map[string]string{
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
	output, input := trimServerOnly(t, map[string]string{
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
	output, input := trimServerOnly(t, map[string]string{
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
	output, input := trimServerOnly(t, map[string]string{
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
	output, input := trimServerOnly(t, map[string]string{
		"index.d.ts":  "import type * as M from './models.ts';\n" + apiOf(`user: import("@mionjs/router").PublicRoute<(role: typeof M.roles) => Promise<M.User>>;`),
		"models.d.ts": models,
	}, "")
	assertContains(t, output.Files["models.d.ts"], "interface User", "roles")
	assertNothingHeavy(t, output, "ServerOnly")
	assertChecks(t, input, output)

	whole, wholeInput := trimServerOnly(t, map[string]string{
		"index.d.ts":  "import type * as M from './models.ts';\n" + apiOf(`all: import("@mionjs/router").PublicRoute<() => Promise<keyof typeof M>>;`),
		"models.d.ts": models,
	}, "")
	assertContains(t, whole.Files["models.d.ts"], "interface User", "roles", "ServerOnly")
	assertChecks(t, wholeInput, whole)
}

// TestTrim_AugmentationsShipOnlyWhatIsRead: a kept file's `declare global` keeps only the members kept code reads,
// and its augmentation of a package nothing kept imports goes.
func TestTrim_AugmentationsShipOnlyWhatIsRead(t *testing.T) {
	output, input := trimServerOnly(t, map[string]string{
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
