// One case per rule the arm applies, each spelled out as the source it is given
// and the source it must produce. Table-driven and inline rather than golden
// files on disk: every case here is a handful of lines, and the point of reading
// one is to see the BEFORE and the AFTER together.
//
// The drizzle modules are stubbed in the overlay. The arm resolves an import's
// origin through the checker, so `drizzle-orm/pg-core` has to resolve to
// something — but nothing here reads a drizzle TYPE, so a declaration file
// naming the exports is enough. That is also what keeps these tests fast and
// independent of which drizzle version is installed.
package drizzlemigrate_test

import (
	"sort"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/drizzlemigrate"
	"github.com/mionkit/ts-runtypes/internal/jsengine"
)

// stubModules are the drizzle packages the fixtures import from. Only the names
// matter: the arm asks the checker WHERE a binding came from, never what it is.
func stubModules() map[string]string {
	pgExports := []string{
		"pgTable", "pgTableCreator", "pgSchema", "pgView", "pgMaterializedView", "pgEnum", "pgPolicy", "pgRole", "pgSequence",
		"integer", "serial", "text", "uuid", "timestamp", "foreignKey", "index", "uniqueIndex", "unique", "check", "primaryKey",
		// Not migrated: these must stay on drizzle.
		"alias", "getTableConfig", "getViewConfig", "except",
	}
	rootExports := []string{"sql", "eq", "and", "relations", "getTableName"}
	declare := func(names []string) string {
		var out strings.Builder
		for _, name := range names {
			out.WriteString("export declare const " + name + ": any;\n")
		}
		return out.String()
	}
	return map[string]string{
		"node_modules/drizzle-orm/package.json":         `{"name":"drizzle-orm","version":"0.45.2","types":"./index.d.ts"}`,
		"node_modules/drizzle-orm/index.d.ts":           declare(rootExports),
		"node_modules/drizzle-orm/pg-core/package.json": `{"name":"drizzle-orm-pg-core","types":"./index.d.ts"}`,
		"node_modules/drizzle-orm/pg-core/index.d.ts":   declare(pgExports),
	}
}

// migrate runs the arm over one main.ts and returns the rewritten source plus
// its diagnostics.
func migrate(t testing.TB, source string) (string, []drizzlemigrate.Diagnostic) {
	t.Helper()
	cwd := tspath.NormalizePath(t.TempDir())
	overlay := map[string]string{}
	for rel, content := range stubModules() {
		overlay[tspath.ResolvePath(cwd, rel)] = content
	}
	main := tspath.ResolvePath(cwd, "main.ts")
	overlay[main] = source
	names := make([]string, 0, len(overlay))
	for name := range overlay {
		if strings.HasSuffix(name, ".ts") {
			names = append(names, name)
		}
	}
	sort.Strings(names)
	prog, progErr := program.NewInferred(program.Options{Cwd: cwd, Overlay: overlay, SingleThreaded: true}, names)
	if progErr != nil {
		t.Fatalf("build program: %v", progErr)
	}
	session, resolverErr := resolver.New(prog, resolver.Options{Cwd: cwd, SingleThreaded: true, JSEngine: jsengine.NewSidecar("")})
	if resolverErr != nil {
		t.Fatalf("build resolver: %v", resolverErr)
	}
	defer session.Close()
	result, migrateErr := drizzlemigrate.MigrateFile(prog, session.Checker(), main, drizzlemigrate.Options{})
	if migrateErr != nil {
		t.Fatalf("migrate: %v", migrateErr)
	}
	return result.Output, result.Diags
}

func assertOutput(t *testing.T, source, want string) {
	t.Helper()
	got, diags := migrate(t, source)
	for _, diagnostic := range diags {
		if diagnostic.Severity == drizzlemigrate.SeverityError {
			t.Fatalf("unexpected refusal: %s", diagnostic.Describe())
		}
	}
	if strings.TrimSpace(got) != strings.TrimSpace(want) {
		t.Fatalf("output mismatch\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}

func TestSplitsATableAndItsImports(t *testing.T) {
	assertOutput(t, `import {getTableConfig, pgTable, text, uuid} from 'drizzle-orm/pg-core';

const users = pgTable('users', {id: uuid('id').primaryKey(), name: text('name').notNull()});
getTableConfig(users);
`, `import {getTableConfig} from 'drizzle-orm/pg-core';
import {pgTable, text, uuid} from '@mionjs/drizzle-orm-pg-core';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';

const users$table = pgTable('users', {id: uuid('id').primaryKey(), name: text('name').notNull()});
const users = toDrizzle(users$table);
getTableConfig(users);
`)
}

func TestKeepsTheExportAndTheTableCallByteForByte(t *testing.T) {
	// The chain and the formatting inside the call survive untouched: the arm
	// rewrites, it never re-prints.
	assertOutput(t, `import {pgTable, uuid} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
}).enableRLS();
`, `import {pgTable, uuid} from '@mionjs/drizzle-orm-pg-core';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';

export const users$table = pgTable('users', {
  id: uuid('id').primaryKey(),
}).enableRLS();
export const users = toDrizzle(users$table);
`)
}

func TestReferencesInsideARecorderCallUseTheRecorder(t *testing.T) {
	// foreignColumns must be OUR column, so the reference flips; the query below
	// must be drizzle's table, so it does not.
	assertOutput(t, `import {foreignKey, pgTable, uuid} from 'drizzle-orm/pg-core';
import {eq} from 'drizzle-orm';

const users = pgTable('users', {id: uuid('id').primaryKey()});
const posts = pgTable('posts', {authorId: uuid('author_id')}, (t) => [
  foreignKey({columns: [t.authorId], foreignColumns: [users.id]}),
]);
eq(users.id, 'x');
`, `import {eq} from 'drizzle-orm';
import {foreignKey, pgTable, uuid} from '@mionjs/drizzle-orm-pg-core';
import {cols} from '@mionjs/drizzle-orm';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';

const users$table = pgTable('users', {id: uuid('id').primaryKey()});
const users = toDrizzle(users$table);
const posts$table = pgTable('posts', {authorId: uuid('author_id')}, (t) => [
  foreignKey({columns: [t.authorId], foreignColumns: [cols(users$table).id]}),
]);
const posts = toDrizzle(posts$table);
eq(users.id, 'x');
`)
}

func TestSqlIsImportedTwiceWhenBothSidesUseIt(t *testing.T) {
	// drizzle's sql builds the query; ours records the default. One name, two
	// bindings, and only the recorder one is rewritten.
	assertOutput(t, `import {pgTable, timestamp} from 'drizzle-orm/pg-core';
import {sql} from 'drizzle-orm';

const docs = pgTable('docs', {at: timestamp('at').default(sql`+"`now()`"+`)});
sql`+"`select 1`"+`;
`, `import {sql} from 'drizzle-orm';
import {sql as rtSql} from '@mionjs/drizzle-orm';
import {pgTable, timestamp} from '@mionjs/drizzle-orm-pg-core';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';

const docs$table = pgTable('docs', {at: timestamp('at').default(rtSql`+"`now()`"+`)});
const docs = toDrizzle(docs$table);
sql`+"`select 1`"+`;
`)
}

func TestABarrierKeepsADrizzleOperatorsArgumentOnDrizzle(t *testing.T) {
	// eq() did not migrate, so the column it is handed has to stay drizzle's,
	// even though the whole expression sits inside a recorder call.
	assertOutput(t, `import {integer, pgTable, pgView, text} from 'drizzle-orm/pg-core';
import {eq, sql} from 'drizzle-orm';

const users = pgTable('users', {id: integer('id'), name: text('name')});
const named = pgView('named', {name: text('name').notNull()}).as(sql`+"`select name from ${users} where ${eq(users.id, 1)}`"+`);
`, `import {eq} from 'drizzle-orm';
import {sql as rtSql} from '@mionjs/drizzle-orm';
import {integer, pgTable, pgView, text} from '@mionjs/drizzle-orm-pg-core';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';

const users$table = pgTable('users', {id: integer('id'), name: text('name')});
const users = toDrizzle(users$table);
const named$view = pgView('named', {name: text('name').notNull()}).as(rtSql`+"`select name from ${users$table} where ${eq(users.id, 1)}`"+`);
const named = toDrizzle(named$view);
`)
}

func TestASchemaSplitsAndItsTablesHangOffTheRecorder(t *testing.T) {
	assertOutput(t, `import {integer, pgSchema} from 'drizzle-orm/pg-core';

const app = pgSchema('app');
const users = app.table('users', {id: integer('id').primaryKey()});
`, `import {integer, pgSchema} from '@mionjs/drizzle-orm-pg-core';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';

const app$schema = pgSchema('app');
const app = toDrizzle(app$schema);
const users$table = app$schema.table('users', {id: integer('id').primaryKey()});
const users = toDrizzle(users$table);
`)
}

func TestATableFactoryIsNotSplitButItsTablesAre(t *testing.T) {
	// `const pgTable = pgTableCreator(...)` SHADOWS the import, which is why
	// recognition is by symbol and not by name.
	assertOutput(t, `import {pgTableCreator, serial} from 'drizzle-orm/pg-core';

const pgTable = pgTableCreator((name) => `+"`pre_${name}`"+`);
const users = pgTable('users', {id: serial('id').primaryKey()});
`, `import {pgTableCreator, serial} from '@mionjs/drizzle-orm-pg-core';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';

const pgTable = pgTableCreator((name) => `+"`pre_${name}`"+`);
const users$table = pgTable('users', {id: serial('id').primaryKey()});
const users = toDrizzle(users$table);
`)
}

func TestAnAliasedImportKeepsItsLocalName(t *testing.T) {
	// pg-common.ts really does import `uuid` twice, once plain and once as
	// pgUuid, so each BINDING is decided on its own.
	assertOutput(t, `import {pgTable, uuid, uuid as pgUuid} from 'drizzle-orm/pg-core';

const users = pgTable('users', {id: pgUuid('id').primaryKey(), other: uuid('other')});
`, `import {pgTable, uuid, uuid as pgUuid} from '@mionjs/drizzle-orm-pg-core';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';

const users$table = pgTable('users', {id: pgUuid('id').primaryKey(), other: uuid('other')});
const users = toDrizzle(users$table);
`)
}

func TestALazyIndexDeclaredAfterItsTableStillRecords(t *testing.T) {
	// mysql-common.ts declares the index AFTER the table and hands it to a lazy
	// extraConfig, so the index's own initializer is a recorder region too.
	//
	// An index SPLITS like a table, and for the same reason: the table's replay
	// needs the recorder while drizzle's query side takes its own IndexBuilder
	// for a `.useIndex(idx)` hint. One binding cannot be both.
	assertOutput(t, `import {index, integer, pgTable} from 'drizzle-orm/pg-core';

const users = pgTable('users', {name: integer('name')}, () => [nameIndex]);
const nameIndex = index('name_idx').on(users.name);
`, `import {index, integer, pgTable} from '@mionjs/drizzle-orm-pg-core';
import {cols} from '@mionjs/drizzle-orm';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';

const users$table = pgTable('users', {name: integer('name')}, () => [name$index]);
const users = toDrizzle(users$table);
const name$index = index('name_idx').on(cols(users$table).name);
const nameIndex = toDrizzle(name$index);
`)
}

func TestTheSameRecorderNameIsReusedInSeparateScopes(t *testing.T) {
	// Two `const users` in two blocks are two scopes, so both take `users$table`.
	// Claiming the name file-wide would run out of suffixes: drizzle's suites
	// declare `const users` in twenty different test bodies.
	assertOutput(t, `import {integer, pgTable} from 'drizzle-orm/pg-core';

function first() {
  const users = pgTable('users', {id: integer('id')});
  return users;
}
function second() {
  const users = pgTable('users', {id: integer('id')});
  return users;
}
`, `import {integer, pgTable} from '@mionjs/drizzle-orm-pg-core';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';

function first() {
  const users$table = pgTable('users', {id: integer('id')});
  const users = toDrizzle(users$table);
  return users;
}
function second() {
  const users$table = pgTable('users', {id: integer('id')});
  const users = toDrizzle(users$table);
  return users;
}
`)
}

// ── refusals: each leaves the file valid drizzle ─────────────────────────────

func assertRefusal(t *testing.T, source, code, mustContain string) {
	t.Helper()
	got, diags := migrate(t, source)
	found := false
	for _, diagnostic := range diags {
		if diagnostic.Code == code && diagnostic.Severity == drizzlemigrate.SeverityError {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected a %s refusal, got %v", code, diags)
	}
	if !strings.Contains(got, mustContain) {
		t.Fatalf("the refused declaration must be left as written; %q is not in:\n%s", mustContain, got)
	}
}

func TestRefusesAQueryBuilderView(t *testing.T) {
	// A one-argument view takes its columns from drizzle's select typing, the
	// exact generic chain the slim packages remove. It stays drizzle, and so
	// does the pgView binding it needs.
	assertRefusal(t, `import {integer, pgTable, pgView} from 'drizzle-orm/pg-core';

const users = pgTable('users', {id: integer('id')});
const named = pgView('named').as((qb) => qb.select().from(users));
`, drizzlemigrate.CodeQueryBuilderView, "const named = pgView('named').as((qb) => qb.select().from(users));")
}

func TestTranslatesANamespaceImport(t *testing.T) {
	// Half of that namespace's members move and half do not, and one alias
	// cannot be both — so the file gets a SECOND namespace. drizzle's own object
	// keeps the members that stayed (getTableConfig), ours carries the rest.
	assertOutput(t, `import * as Driz from 'drizzle-orm/pg-core';

const users = Driz.pgTable('users', {id: Driz.integer('id')});
Driz.getTableConfig(users);
`, `import * as Driz from 'drizzle-orm/pg-core';
import * as rtDriz from '@mionjs/drizzle-orm-pg-core';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';

const users$table = rtDriz.pgTable('users', {id: rtDriz.integer('id')});
const users = toDrizzle(users$table);
Driz.getTableConfig(users);
`)
}

func TestTranslatingTwiceChangesNothing(t *testing.T) {
	// Idempotence. A migration tool gets run again — on a re-clone, on a branch,
	// by someone who is not sure whether it ran — and the second run must be a
	// no-op. Nothing in drizzle's own suites can exercise this: it needs the
	// tool's OWN output as input.
	once, _ := migrate(t, `import {integer, pgTable} from 'drizzle-orm/pg-core';

const users = pgTable('users', {id: integer('id')});
`)
	twice, diags := migrate(t, once)
	for _, diagnostic := range diags {
		if diagnostic.Severity == drizzlemigrate.SeverityError {
			t.Fatalf("second pass refused something: %s", diagnostic.Describe())
		}
	}
	if twice != once {
		t.Fatalf("translating twice must be a no-op\n--- first ---\n%s\n--- second ---\n%s", once, twice)
	}
}

func TestRefusesAMultiDeclaratorStatement(t *testing.T) {
	// `const a = …, b = …` has no clean place to put the drizzle half of either.
	assertRefusal(t, `import {integer, pgTable} from 'drizzle-orm/pg-core';

const users = pgTable('users', {id: integer('id')}), posts = pgTable('posts', {id: integer('id')});
`, drizzlemigrate.CodeUnsupportedHead, "const users = pgTable('users', {id: integer('id')}), posts =")
}

func TestLeavesAFileWithNoDrizzleImportsAlone(t *testing.T) {
	source := "export const answer = 42;\n"
	got, diags := migrate(t, source)
	if got != source || len(diags) != 0 {
		t.Fatalf("expected an untouched file with no diagnostics, got %q / %v", got, diags)
	}
}

func TestReportsWhichMigratedExportsWereUsed(t *testing.T) {
	// The lane's coverage gate crosses this against the manifests, so an entry
	// that never reached a recorder has to be absent rather than assumed.
	cwd := tspath.NormalizePath(t.TempDir())
	overlay := map[string]string{}
	for rel, content := range stubModules() {
		overlay[tspath.ResolvePath(cwd, rel)] = content
	}
	main := tspath.ResolvePath(cwd, "main.ts")
	overlay[main] = `import {getTableConfig, integer, pgTable} from 'drizzle-orm/pg-core';

const users = pgTable('users', {id: integer('id')});
getTableConfig(users);
`
	prog, progErr := program.NewInferred(program.Options{Cwd: cwd, Overlay: overlay, SingleThreaded: true}, []string{main})
	if progErr != nil {
		t.Fatalf("build program: %v", progErr)
	}
	session, resolverErr := resolver.New(prog, resolver.Options{Cwd: cwd, SingleThreaded: true, JSEngine: jsengine.NewSidecar("")})
	if resolverErr != nil {
		t.Fatalf("build resolver: %v", resolverErr)
	}
	defer session.Close()
	result, migrateErr := drizzlemigrate.MigrateFile(prog, session.Checker(), main, drizzlemigrate.Options{})
	if migrateErr != nil {
		t.Fatalf("migrate: %v", migrateErr)
	}
	used := strings.Join(result.Used["pg"], ",")
	if used != "integer,pgTable" {
		t.Fatalf("expected the two migrated exports that reached a recorder, got %q", used)
	}
}

// TestEveryMigratedExportIsClassified is the gate on the arm's own vocabulary.
// Which exports declare a splittable handle is a JUDGEMENT the manifests cannot
// make (an index splits so a query can still reach drizzle's builder; a foreign
// key never needs to), so the arm writes it down. What must never happen is a
// drizzle upgrade adding an export that nobody classified: the arm would treat
// it as ordinary code and silently leave it on drizzle.
//
// The embedded import map is the source of what exists, so this test grows with
// every republished map, not with anyone remembering to update a list.
func TestEveryMigratedExportIsClassified(t *testing.T) {
	importMap, mapErr := drizzlemigrate.LoadImportMap()
	if mapErr != nil {
		t.Fatalf("load import map: %v", mapErr)
	}
	var unclassified []string
	for _, rule := range importMap.Modules {
		columns := map[string]bool{}
		for _, name := range rule.Columns {
			columns[name] = true
		}
		for _, name := range rule.Migrated {
			// A column builder is never a declaration of its own, and the
			// manifest already says which exports are columns, so the gate asks
			// about the rest — no list of sixty column names to keep.
			if columns[name] || drizzlemigrate.IsClassified(name) {
				continue
			}
			unclassified = append(unclassified, rule.From+"."+name)
		}
	}
	if len(unclassified) > 0 {
		t.Fatalf("%d migrated export(s) no bucket in recognize.go classifies:\n  %s\n\n"+
			"Each one needs a decision: declKinds (it declares a handle worth splitting), tableCreators "+
			"(it builds a table factory), or notDeclarable (its value only lives inside another call) with the reason. "+
			"The manifests' `handles` field says what each one returns.",
			len(unclassified), strings.Join(unclassified, "\n  "))
	}
}
