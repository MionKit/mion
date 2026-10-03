package apitypes

import (
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/apimeta"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/batchcompile"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
)

// drizzleSchemaTS mixes the slim models with server-only drizzle values in one file, as an app does.
const drizzleSchemaTS = `import * as DZ from '@mionjs/drizzle-orm-pg-core';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';
import {drizzle} from 'drizzle-orm/pg-proxy';
import {relations} from 'drizzle-orm';

export const users = DZ.pgTable('users', {
    id: DZ.uuid('id', {defaultRandom: true, primaryKey: true}),
    name: DZ.varchar('name', {length: 100, notNull: true}),
});
export const posts = DZ.pgTable('posts', {
    id: DZ.uuid('id', {defaultRandom: true, primaryKey: true}),
    authorId: DZ.uuid('author_id', {notNull: true}),
    title: DZ.varchar('title', {length: 200, notNull: true}),
});
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export const usersDb = toDrizzle(users);
export const postsDb = toDrizzle(posts);
export const usersRelations = relations(usersDb, ({many}) => ({posts: many(postsDb)}));
export const db = drizzle(async () => ({rows: []}), {schema: {users: usersDb, posts: postsDb, usersRelations}});
`

const drizzleRoutesTS = `import {createMionRouter} from '@mionjs/router';
import {db, type NewUser, type User} from './schema.ts';

const mion = createMionRouter();
export const api = mion.initRoutes({
    users: {
        create: mion.route(async (_ctx, user: NewUser): Promise<User> => {
            await db.select().from(db._.fullSchema.users);
            return {id: 'x', name: user.name};
        }),
    },
});
`

// TestTrim_ShipsSlimDrizzleTypesNeverDrizzle runs on the real workspace packages, not stubs like the other trim tests.
func TestTrim_ShipsSlimDrizzleTypesNeverDrizzle(t *testing.T) {
	dir, _ := drizzleWorkspace(t)
	writeFile(t, filepath.Join(dir, "src", "schema.ts"), drizzleSchemaTS)
	writeFile(t, filepath.Join(dir, "src", "index.ts"), drizzleRoutesTS)
	output, input, compiled := compileAndTrim(t, dir, "")
	assertContains(t, strings.Join(mapValues(compiled.Declarations), "\n"), `import("drizzle-orm")`, "ToDrizzleTable", "usersDb", "usersRelations", "PgRemoteDatabase")

	assertContains(t, strings.Join(mapValues(output.Files), "\n"), "export type User", "export type NewUser", "export declare const users")
	assertNeverShips(t, output, "drizzle-orm", "ToDrizzleTable", "PgRemoteDatabase", "usersDb", "postsDb", "usersRelations", "declare const db", "posts")
	assertChecks(t, input, output)
}

// slimApiTS serves the reference app's routes built on the slim packages; only compiled, never run.
const slimApiTS = `import {mionFetchMetadata} from '@mionjs/router/middlewares';
import {mion} from './mion.ts';
import {pgBuildersRoutes} from './pg.builders.routes.ts';
import {pgTypesRoutes} from './pg.types.routes.ts';
import {mysqlBuildersRoutes} from './mysql.builders.routes.ts';
import {mysqlTypesRoutes} from './mysql.types.routes.ts';
import {sqliteBuildersRoutes} from './sqlite.builders.routes.ts';
import {sqliteTypesRoutes} from './sqlite.types.routes.ts';

export const api = mion.initRoutes({
  mionFetchMetadata,
  pg: {types: pgTypesRoutes, builders: pgBuildersRoutes},
  mysql: {types: mysqlTypesRoutes, builders: mysqlBuildersRoutes},
  sqlite: {types: sqliteTypesRoutes, builders: sqliteBuildersRoutes},
});
`

// fullApiTS serves every route of the reference app, the plain drizzle ones included.
const fullApiTS = `import {mion} from './mion.ts';
import {routes} from './app.ts';

export const api = mion.initRoutes(routes);
`

// TestTrim_DrizzleExampleAppSlimRoutesShipNoDrizzle: though the same files hold the drizzle tables and db clients.
func TestTrim_DrizzleExampleAppSlimRoutesShipNoDrizzle(t *testing.T) {
	output := trimDrizzleExampleApp(t, slimApiTS)
	assertNeverShips(t, output, "drizzle-orm", "usersDb", "declare const db")
}

// TestTrim_DrizzleExampleAppReachesDrizzleOnlyThroughItsPlainDrizzleRoutes: the whole app as one API.
func TestTrim_DrizzleExampleAppReachesDrizzleOnlyThroughItsPlainDrizzleRoutes(t *testing.T) {
	output := trimDrizzleExampleApp(t, fullApiTS)
	var importing []string
	for rel, text := range output.Files {
		if strings.Contains(text, `"drizzle-orm`) || strings.Contains(text, `'drizzle-orm`) {
			importing = append(importing, rel)
		}
	}
	sort.Strings(importing)
	if strings.Join(importing, ",") != "db/mysql.drizzle.d.ts,db/pg.drizzle.d.ts,db/sqlite.drizzle.d.ts" {
		t.Errorf("only the plain drizzle tables may reach drizzle-orm, got %v", importing)
	}
	assertLacks(t, strings.Join(mapValues(output.Files), "\n"), "drizzle-orm/mysql-proxy", "drizzle-orm/pg-proxy", "drizzle-orm/sqlite-proxy", "Relations<")
}

// trimDrizzleExampleApp trims the reference app's server with apiText as its API entry.
func trimDrizzleExampleApp(t *testing.T, apiText string) *Output {
	t.Helper()
	dir, repo := drizzleWorkspace(t)
	app := filepath.Join(repo, "packages", "private-drizzle-example-app")
	// The server half only: the client is a separate program.
	for _, part := range []string{"server", "db"} {
		if err := os.CopyFS(filepath.Join(dir, "src", part), os.DirFS(filepath.Join(app, "src", part))); err != nil {
			t.Fatal(err)
		}
	}
	appFile := filepath.Join(dir, "src", "server", "app.ts")
	appText, err := os.ReadFile(appFile)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(appText), "\nconst routes = {") {
		t.Fatalf("the reference app no longer declares `const routes = {` in src/server/app.ts: update this test")
	}
	// Without app.ts, its own initRoutes would be the manifest's API instead of apiText's.
	if strings.Contains(apiText, "./app.ts") {
		writeFile(t, appFile, strings.Replace(string(appText), "\nconst routes = {", "\nexport const routes = {", 1))
	} else if err := os.Remove(appFile); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(dir, "src", "server", "api.ts"), apiText)

	output, input, compiled := compileAndTrim(t, dir, filepath.Join("server", "api.d.ts"))
	assertContains(t, strings.Join(mapValues(compiled.Declarations), "\n"), "drizzle-orm/", "usersDb", "declare const db")
	assertChecks(t, input, output)
	manifest, err := apimeta.ReadManifest(filepath.Join(compiled.GenDir, constants.ApiModuleDir, constants.ApiManifestFile))
	if err != nil {
		t.Fatal(err)
	}
	if manifest.BuildVersion != output.BuildVersion {
		t.Errorf("the trimmed API carries build version %q, the server manifest %q", output.BuildVersion, manifest.BuildVersion)
	}
	assertLacks(t, strings.Join(mapValues(output.Files), "\n"), "startApp", "fakeDriver")
	return output
}

// drizzleWorkspace is a temp project linking the workspace's real drizzle and mion packages.
func drizzleWorkspace(t *testing.T) (dir, repo string) {
	t.Helper()
	_, self, _, _ := runtime.Caller(0)
	repo = filepath.Join(filepath.Dir(self), "..", "..", "..", "..")
	appModules := filepath.Join(repo, "packages", "private-drizzle-example-app", "node_modules", "@mionjs")
	realDrizzle := filepath.Join(repo, "node_modules", "drizzle-orm")
	for _, required := range []string{filepath.Join(appModules, "drizzle-orm-pg-core"), filepath.Join(appModules, "router"), realDrizzle} {
		if _, err := os.Stat(required); err != nil {
			t.Skipf("the workspace drizzle packages are not installed: %v", err)
		}
	}
	dir = t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "node_modules"), 0o755); err != nil {
		t.Fatal(err)
	}
	for name, target := range map[string]string{"@mionjs": appModules, "drizzle-orm": realDrizzle, "@types": filepath.Join(repo, "node_modules", "@types")} {
		if err := os.Symlink(target, filepath.Join(dir, "node_modules", name)); err != nil {
			t.Fatal(err)
		}
	}
	writeFile(t, filepath.Join(dir, "package.json"), `{"name": "@acme/drizzle-api", "version": "1.0.0", "type": "module"}`)
	writeFile(t, filepath.Join(dir, "tsconfig.json"), `{"compilerOptions": {"target": "ES2023", "module": "ESNext", "moduleResolution": "bundler",
  "strict": true, "noImplicitAny": false, "skipLibCheck": true, "lib": ["ES2023", "DOM"], "types": ["node"], "customConditions": ["source"],
  "rootDir": "src", "outDir": "dist", "allowImportingTsExtensions": true, "rewriteRelativeImportExtensions": true}, "include": ["src"]}`)
	return dir, repo
}

// compileAndTrim emits and trims as `mion api-types` does; entry is under the declaration dir, "" to find it.
func compileAndTrim(t *testing.T, dir, entry string) (*Output, Input, *batchcompile.Result) {
	t.Helper()
	declarationDir := filepath.Join(dir, ".mion-api-types")
	compiled, err := batchcompile.Run(batchcompile.Options{Cwd: dir, TsconfigPath: "tsconfig.json", GenDir: filepath.Join(t.TempDir(), "gen"), DeclarationsOnly: true, DeclarationDir: declarationDir})
	if err != nil {
		t.Fatal(err)
	}
	input := Input{Cwd: dir, TsconfigPath: "tsconfig.json", DeclarationDir: declarationDir, Declarations: compiled.Declarations}
	if entry != "" {
		input.Entry = filepath.Join(declarationDir, entry)
	}
	output, err := Trim(input)
	if err != nil {
		t.Fatal(err)
	}
	return output, input, compiled
}

func mapValues(files map[string]string) []string {
	out := make([]string, 0, len(files))
	for _, text := range files {
		out = append(out, text)
	}
	return out
}
