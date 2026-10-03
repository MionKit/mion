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
