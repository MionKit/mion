package apitypes

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/batchcompile"
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
	_, self, _, _ := runtime.Caller(0)
	repo := filepath.Join(filepath.Dir(self), "..", "..", "..", "..")
	appModules := filepath.Join(repo, "packages", "private-drizzle-example-app", "node_modules", "@mionjs")
	realDrizzle := filepath.Join(repo, "node_modules", "drizzle-orm")
	for _, required := range []string{filepath.Join(appModules, "drizzle-orm-pg-core"), filepath.Join(appModules, "router"), realDrizzle} {
		if _, err := os.Stat(required); err != nil {
			t.Skipf("the workspace drizzle packages are not installed: %v", err)
		}
	}
	dir := t.TempDir()
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
  "strict": true, "noImplicitAny": false, "skipLibCheck": true, "types": ["node"], "customConditions": ["source"],
  "rootDir": "src", "outDir": "dist", "allowImportingTsExtensions": true, "rewriteRelativeImportExtensions": true}, "include": ["src"]}`)
	writeFile(t, filepath.Join(dir, "src", "schema.ts"), drizzleSchemaTS)
	writeFile(t, filepath.Join(dir, "src", "index.ts"), drizzleRoutesTS)

	declarationDir := filepath.Join(dir, ".mion-api-types")
	compiled, err := batchcompile.Run(batchcompile.Options{Cwd: dir, TsconfigPath: "tsconfig.json", GenDir: filepath.Join(t.TempDir(), "gen"), DeclarationsOnly: true, DeclarationDir: declarationDir})
	if err != nil {
		t.Fatal(err)
	}
	emitted := strings.Join(mapValues(compiled.Declarations), "\n")
	assertContains(t, emitted, `import("drizzle-orm")`, "ToDrizzleTable", "usersDb", "usersRelations", "PgRemoteDatabase")

	input := Input{Cwd: dir, TsconfigPath: "tsconfig.json", DeclarationDir: declarationDir, Declarations: compiled.Declarations}
	output, err := Trim(input)
	if err != nil {
		t.Fatal(err)
	}
	published := strings.Join(mapValues(output.Files), "\n")
	assertContains(t, published, "export type User", "export type NewUser", "export declare const users")
	assertLacks(t, published, `'drizzle-orm`, `"drizzle-orm`, "ToDrizzleTable", "PgRemoteDatabase", "usersDb", "postsDb", "usersRelations", "declare const db", "posts")
	for _, external := range output.Externals {
		if external == "drizzle-orm" {
			t.Errorf("drizzle-orm must not become a peer, externals %v", output.Externals)
		}
	}
	assertChecks(t, input, output)
}

func mapValues(files map[string]string) []string {
	out := make([]string, 0, len(files))
	for _, text := range files {
		out = append(out, text)
	}
	return out
}
