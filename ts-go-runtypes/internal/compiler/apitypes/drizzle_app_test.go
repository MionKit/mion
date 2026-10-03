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

// TestTrim_DrizzleExampleAppSlimRoutesShipNoDrizzle: routes built on the slim packages ship no drizzle-orm at all,
// though the same files hold the drizzle tables and db clients that serve them.
func TestTrim_DrizzleExampleAppSlimRoutesShipNoDrizzle(t *testing.T) {
	output := trimDrizzleExampleApp(t, slimApiTS)
	assertLacks(t, strings.Join(mapValues(output.Files), "\n"), "drizzle-orm/", `"drizzle-orm"`, `'drizzle-orm'`, "startApp", "fakeDriver", "usersDb", "declare const db")
	for _, external := range output.Externals {
		if external == "drizzle-orm" {
			t.Errorf("drizzle-orm must not become a peer, externals %v", output.Externals)
		}
	}
}

// TestTrim_DrizzleExampleAppReachesDrizzleOnlyThroughItsPlainDrizzleRoutes: the whole app trims, type-checks and keeps
// its build version; drizzle-orm is reached only by the routes that return types of plain drizzle tables.
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
	assertLacks(t, strings.Join(mapValues(output.Files), "\n"), "startApp", "fakeDriver", "drizzle-orm/mysql-proxy", "drizzle-orm/pg-proxy", "drizzle-orm/sqlite-proxy", "Relations<")
}

// trimDrizzleExampleApp copies the reference app's server, adds apiText as the API entry, then compiles and trims it,
// checking the result type-checks alone and carries the server manifest's build version.
func trimDrizzleExampleApp(t *testing.T, apiText string) *Output {
	t.Helper()
	_, self, _, _ := runtime.Caller(0)
	repo := filepath.Join(filepath.Dir(self), "..", "..", "..", "..")
	app := filepath.Join(repo, "packages", "private-drizzle-example-app")
	appModules := filepath.Join(app, "node_modules", "@mionjs")
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
	// The server half only: the client is a separate program.
	for _, part := range []string{"server", "db"} {
		copyTree(t, filepath.Join(app, "src", part), filepath.Join(dir, "src", part))
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
	writeFile(t, filepath.Join(dir, "package.json"), `{"name": "@acme/drizzle-app", "version": "1.0.0", "type": "module"}`)
	writeFile(t, filepath.Join(dir, "tsconfig.json"), `{"compilerOptions": {"target": "ES2023", "module": "ESNext", "moduleResolution": "bundler",
  "strict": true, "skipLibCheck": true, "lib": ["ES2023", "DOM"], "types": ["node"], "customConditions": ["source"],
  "rootDir": "src", "outDir": "dist", "allowImportingTsExtensions": true, "rewriteRelativeImportExtensions": true}, "include": ["src"]}`)

	declarationDir := filepath.Join(dir, ".mion-api-types")
	compiled, err := batchcompile.Run(batchcompile.Options{Cwd: dir, TsconfigPath: "tsconfig.json", GenDir: filepath.Join(t.TempDir(), "gen"), DeclarationsOnly: true, DeclarationDir: declarationDir})
	if err != nil {
		t.Fatal(err)
	}
	assertContains(t, strings.Join(mapValues(compiled.Declarations), "\n"), "drizzle-orm/", "usersDb", "declare const db")

	input := Input{Cwd: dir, TsconfigPath: "tsconfig.json", DeclarationDir: declarationDir, Declarations: compiled.Declarations,
		Entry: filepath.Join(declarationDir, "server", "api.d.ts")}
	output, err := Trim(input)
	if err != nil {
		t.Fatal(err)
	}
	assertChecks(t, input, output)
	manifest, err := apimeta.ReadManifest(filepath.Join(compiled.GenDir, constants.ApiModuleDir, constants.ApiManifestFile))
	if err != nil {
		t.Fatal(err)
	}
	if manifest.BuildVersion != output.BuildVersion {
		t.Errorf("the trimmed API carries build version %q, the server manifest %q", output.BuildVersion, manifest.BuildVersion)
	}
	return output
}

func copyTree(t *testing.T, from, to string) {
	t.Helper()
	err := filepath.WalkDir(from, func(path string, entry os.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return err
		}
		rel, _ := filepath.Rel(from, path)
		text, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		writeFile(t, filepath.Join(to, rel), string(text))
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
