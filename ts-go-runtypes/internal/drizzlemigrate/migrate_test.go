// One inline case per rule, BEFORE and AFTER side by side, run per dialect unless its name says `only …:`. The drizzle
// modules are stubs naming their exports: the arm only asks where a binding came from, so the tests stay fast and
// independent of the installed drizzle version.
package drizzlemigrate_test

import (
	"sort"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/drizzlemigrate"
	"github.com/mionkit/mion/ts-go-runtypes/internal/jsengine"
)

// migrateDialect is one dialect: its {{placeholder}} spellings and the names its stub module declares.
type migrateDialect struct {
	name    string
	fill    map[string]string
	exports []string
}

// Not migrated, in every stub: these must stay on drizzle.
var stayOnDrizzle = []string{"alias", "getTableConfig", "getViewConfig", "except"}

var migrateDialects = []migrateDialect{
	{name: "pg", fill: map[string]string{
		"mod": "drizzle-orm/pg-core", "slim": "@mionjs/drizzle-orm-pg-core",
		"table": "pgTable", "creator": "pgTableCreator", "schema": "pgSchema", "view": "pgView",
		"int": "integer", "text": "text", "str": "varchar", "AnyColumn": "AnyPgColumn",
	}, exports: []string{
		"pgTable", "pgTableCreator", "pgSchema", "pgView", "pgMaterializedView", "pgEnum", "pgPolicy", "pgRole", "pgSequence",
		"integer", "serial", "text", "varchar", "uuid", "timestamp", "jsonb", "foreignKey", "index", "uniqueIndex", "unique", "check", "primaryKey",
	}},
	{name: "mysql", fill: map[string]string{
		"mod": "drizzle-orm/mysql-core", "slim": "@mionjs/drizzle-orm-mysql-core",
		"table": "mysqlTable", "creator": "mysqlTableCreator", "schema": "mysqlSchema", "view": "mysqlView",
		"int": "int", "text": "text", "str": "varchar", "AnyColumn": "AnyMySqlColumn",
	}, exports: []string{
		"mysqlTable", "mysqlTableCreator", "mysqlSchema", "mysqlView", "mysqlEnum",
		"int", "serial", "text", "varchar", "timestamp", "json", "foreignKey", "index", "uniqueIndex", "unique", "check", "primaryKey",
	}},
	{name: "sqlite", fill: map[string]string{
		"mod": "drizzle-orm/sqlite-core", "slim": "@mionjs/drizzle-orm-sqlite-core",
		"table": "sqliteTable", "creator": "sqliteTableCreator", "schema": "", "view": "sqliteView",
		"int": "integer", "text": "text", "str": "text", "AnyColumn": "AnySQLiteColumn",
	}, exports: []string{
		"sqliteTable", "sqliteTableCreator", "sqliteView", "view",
		"integer", "int", "text", "blob", "real", "foreignKey", "index", "uniqueIndex", "unique", "check", "primaryKey",
	}},
}

// src spells a case's template in this dialect.
func (dialect migrateDialect) src(template string) string {
	pairs := make([]string, 0, 2*len(dialect.fill))
	for key, value := range dialect.fill {
		pairs = append(pairs, "{{"+key+"}}", value)
	}
	return strings.NewReplacer(pairs...).Replace(template)
}

// eachDialect runs body once per dialect of the list, narrowed by an `only a, b:` prefix on name.
func eachDialect(t *testing.T, name string, body func(t *testing.T, dialect migrateDialect)) {
	t.Helper()
	only := map[string]bool{}
	if rest, ok := strings.CutPrefix(name, "only "); ok {
		list, _, found := strings.Cut(rest, ":")
		if !found {
			t.Fatalf("case %q: an `only` case names its dialects before a colon", name)
		}
		for _, dialectName := range strings.Split(list, ",") {
			only[strings.TrimSpace(dialectName)] = true
		}
	}
	t.Run(name, func(t *testing.T) {
		ran := 0
		for _, dialect := range migrateDialects {
			if len(only) > 0 && !only[dialect.name] {
				continue
			}
			ran++
			t.Run(dialect.name, func(t *testing.T) { body(t, dialect) })
		}
		if ran == 0 || (len(only) > 0 && ran != len(only)) {
			t.Fatalf("case %q names a dialect the list does not have", name)
		}
	})
}

// stubModules are the drizzle packages the fixtures import from. Only the names
// matter: the arm asks the checker WHERE a binding came from, never what it is.
func stubModules() map[string]string {
	declare := func(names []string) string {
		var out strings.Builder
		for _, name := range names {
			out.WriteString("export declare const " + name + ": any;\n")
		}
		return out.String()
	}
	files := map[string]string{
		"node_modules/drizzle-orm/package.json": `{"name":"drizzle-orm","version":"0.45.2","types":"./index.d.ts"}`,
		"node_modules/drizzle-orm/index.d.ts":   declare([]string{"sql", "eq", "and", "relations", "getTableName"}),
	}
	for _, dialect := range migrateDialects {
		dir := "node_modules/" + dialect.fill["mod"] + "/"
		files[dir+"package.json"] = `{"name":"` + strings.ReplaceAll(dialect.fill["mod"], "/", "-") + `","types":"./index.d.ts"}`
		files[dir+"index.d.ts"] = declare(append(append([]string{}, dialect.exports...), stayOnDrizzle...)) +
			"export type " + dialect.fill["AnyColumn"] + " = any;\n"
	}
	return files
}

// migrateFile runs the arm over one main.ts.
func migrateFile(t testing.TB, source string) *drizzlemigrate.FileResult {
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
	return result
}

// migrate returns the rewritten source plus its diagnostics.
func migrate(t testing.TB, source string) (string, []drizzlemigrate.Diagnostic) {
	t.Helper()
	result := migrateFile(t, source)
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

// assertCase spells a case's before and after in the dialect and compares them.
func assertCase(t *testing.T, dialect migrateDialect, source, want string) {
	t.Helper()
	assertOutput(t, dialect.src(source), sortSlimImports(dialect.src(want)))
}

// sortSlimImports sorts slim import bindings by imported name, as the arm renders them, so templates stay dialect-neutral.
func sortSlimImports(text string) string {
	lines := strings.Split(text, "\n")
	for index, line := range lines {
		rest, isImport := strings.CutPrefix(line, "import {")
		bindings, module, found := strings.Cut(rest, "} from '@mionjs/drizzle-orm-")
		if !isImport || !found || strings.HasSuffix(module, "/drizzle';") {
			continue
		}
		parts := strings.Split(bindings, ", ")
		importedName := func(part string) string {
			name, _, _ := strings.Cut(strings.TrimPrefix(part, "type "), " as ")
			return name
		}
		sort.SliceStable(parts, func(left, right int) bool { return importedName(parts[left]) < importedName(parts[right]) })
		lines[index] = "import {" + strings.Join(parts, ", ") + "} from '@mionjs/drizzle-orm-" + module
	}
	return strings.Join(lines, "\n")
}

// ── splitting ────────────────────────────────────────────────────────────────

func TestSplitsATableAndItsImports(t *testing.T) {
	eachDialect(t, "splits a table and its imports", func(t *testing.T, dialect migrateDialect) {
		assertCase(t, dialect, `import {getTableConfig, {{int}}, {{table}}, {{text}}} from '{{mod}}';

const users = {{table}}('users', {id: {{int}}('id').primaryKey(), name: {{text}}('name').notNull()});
getTableConfig(users);
`, `import {getTableConfig} from '{{mod}}';
import {{{int}}, {{table}}, {{text}}} from '{{slim}}';
import {toDrizzle} from '{{slim}}/drizzle';

const users$table = {{table}}('users', {id: {{int}}('id', {primaryKey: true}), name: {{text}}('name', {notNull: true})});
const users = toDrizzle(users$table);
getTableConfig(users);
`)
	})
}

func TestKeepsTheTableCallExceptTheColumnGlue(t *testing.T) {
	// Only the column chains change: the formatting around them and a table-level call survive.
	eachDialect(t, "only pg: enableRLS stays on the table call", func(t *testing.T, dialect migrateDialect) {
		assertCase(t, dialect, `import {{{table}}, {{int}}} from '{{mod}}';

export const users = {{table}}('users', {
  id: {{int}}('id').primaryKey(),
}).enableRLS();
`, `import {{{table}}, {{int}}} from '{{slim}}';
import {toDrizzle} from '{{slim}}/drizzle';

export const users$table = {{table}}('users', {
  id: {{int}}('id', {primaryKey: true}),
}).enableRLS();
export const users = toDrizzle(users$table);
`)
	})
}

func TestReferencesInsideARecorderCallUseTheRecorder(t *testing.T) {
	// foreignColumns must be OUR column, so it becomes a tableRef(); the query below must stay drizzle's table.
	eachDialect(t, "references inside a recorder call", func(t *testing.T, dialect migrateDialect) {
		assertCase(t, dialect, `import {foreignKey, {{table}}, {{int}}} from '{{mod}}';
import {eq} from 'drizzle-orm';

const users = {{table}}('users', {id: {{int}}('id').primaryKey()});
const posts = {{table}}('posts', {authorId: {{int}}('author_id')}, (t) => [
  foreignKey({columns: [t.authorId], foreignColumns: [users.id]}),
]);
eq(users.id, 'x');
`, `import {eq} from 'drizzle-orm';
import {tableRef} from '@mionjs/drizzle-orm';
import {foreignKey, {{table}}, {{int}}} from '{{slim}}';
import {toDrizzle} from '{{slim}}/drizzle';

const users$table = {{table}}('users', {id: {{int}}('id', {primaryKey: true})});
const users = toDrizzle(users$table);
const posts$table = {{table}}('posts', {authorId: {{int}}('author_id')}, (t) => [
  foreignKey({columns: [t.authorId], foreignColumns: [tableRef(users$table, 'id')]}),
]);
const posts = toDrizzle(posts$table);
eq(users.id, 'x');
`)
	})
}

func TestSqlIsImportedTwiceWhenBothSidesUseIt(t *testing.T) {
	// drizzle's sql builds the query, ours records the default: one name, two bindings, only the recorder one rewritten.
	eachDialect(t, "sql imported twice", func(t *testing.T, dialect migrateDialect) {
		assertCase(t, dialect, `import {{{table}}, {{text}}} from '{{mod}}';
import {sql} from 'drizzle-orm';

const docs = {{table}}('docs', {at: {{text}}('at').default(sql`+"`now()`"+`)});
sql`+"`select 1`"+`;
`, `import {sql} from 'drizzle-orm';
import {sql as rtSql} from '@mionjs/drizzle-orm';
import {{{table}}, {{text}}} from '{{slim}}';
import {toDrizzle} from '{{slim}}/drizzle';

const docs$table = {{table}}('docs', {at: {{text}}('at', {default: [rtSql`+"`now()`"+`]})});
const docs = toDrizzle(docs$table);
sql`+"`select 1`"+`;
`)
	})
}

func TestABarrierKeepsADrizzleOperatorsArgumentOnDrizzle(t *testing.T) {
	// eq() did not migrate, so its column stays drizzle's even inside a recorder call; the view's columns fold like a table's.
	eachDialect(t, "a barrier keeps a drizzle operator's argument on drizzle", func(t *testing.T, dialect migrateDialect) {
		assertCase(t, dialect, `import {{{int}}, {{table}}, {{view}}, {{text}}} from '{{mod}}';
import {eq, sql} from 'drizzle-orm';

const users = {{table}}('users', {id: {{int}}('id'), name: {{text}}('name')});
const named = {{view}}('named', {name: {{text}}('name').notNull()}).as(sql`+"`select name from ${users} where ${eq(users.id, 1)}`"+`);
`, `import {eq} from 'drizzle-orm';
import {sql as rtSql} from '@mionjs/drizzle-orm';
import {{{int}}, {{table}}, {{view}}, {{text}}} from '{{slim}}';
import {toDrizzle} from '{{slim}}/drizzle';

const users$table = {{table}}('users', {id: {{int}}('id'), name: {{text}}('name')});
const users = toDrizzle(users$table);
const named$view = {{view}}('named', {name: {{text}}('name', {notNull: true})}).as(rtSql`+"`select name from ${users$table} where ${eq(users.id, 1)}`"+`);
const named = toDrizzle(named$view);
`)
	})
}

func TestASchemaSplitsAndItsTablesHangOffTheRecorder(t *testing.T) {
	eachDialect(t, "only pg, mysql: a schema splits", func(t *testing.T, dialect migrateDialect) {
		assertCase(t, dialect, `import {{{int}}, {{schema}}} from '{{mod}}';

const app = {{schema}}('app');
const users = app.table('users', {id: {{int}}('id').primaryKey()});
`, `import {{{int}}, {{schema}}} from '{{slim}}';
import {toDrizzle} from '{{slim}}/drizzle';

const app$schema = {{schema}}('app');
const app = toDrizzle(app$schema);
const users$table = app$schema.table('users', {id: {{int}}('id', {primaryKey: true})});
const users = toDrizzle(users$table);
`)
	})
}

func TestATableFactoryIsNotSplitButItsTablesAre(t *testing.T) {
	// `const pgTable = pgTableCreator(...)` SHADOWS the import, so recognition is by symbol, not name.
	eachDialect(t, "a table creator is not split, its tables are", func(t *testing.T, dialect migrateDialect) {
		assertCase(t, dialect, `import {{{creator}}, {{int}}} from '{{mod}}';

const {{table}} = {{creator}}((name) => `+"`pre_${name}`"+`);
const users = {{table}}('users', {id: {{int}}('id').primaryKey()});
`, `import {{{creator}}, {{int}}} from '{{slim}}';
import {toDrizzle} from '{{slim}}/drizzle';

const {{table}} = {{creator}}((name) => `+"`pre_${name}`"+`);
const users$table = {{table}}('users', {id: {{int}}('id', {primaryKey: true})});
const users = toDrizzle(users$table);
`)
	})
}

func TestAnAliasedImportKeepsItsLocalName(t *testing.T) {
	// pg-common.ts imports `uuid` twice, plain and as pgUuid, so each BINDING is decided on its own.
	eachDialect(t, "an aliased import keeps its local", func(t *testing.T, dialect migrateDialect) {
		assertCase(t, dialect, `import {{{table}}, {{text}}, {{text}} as myText} from '{{mod}}';

const users = {{table}}('users', {id: myText('id').primaryKey(), other: {{text}}('other')});
`, `import {{{table}}, {{text}}, {{text}} as myText} from '{{slim}}';
import {toDrizzle} from '{{slim}}/drizzle';

const users$table = {{table}}('users', {id: myText('id', {primaryKey: true}), other: {{text}}('other')});
const users = toDrizzle(users$table);
`)
	})
}

func TestALazyIndexDeclaredAfterItsTableStillRecords(t *testing.T) {
	// mysql-common.ts hands an index declared after its table to a lazy extraConfig, so its initializer records too.
	// An index SPLITS: the table's replay needs the recorder, drizzle's `.useIndex(idx)` hint its own IndexBuilder.
	eachDialect(t, "a lazy index declared after its table", func(t *testing.T, dialect migrateDialect) {
		assertCase(t, dialect, `import {index, {{int}}, {{table}}} from '{{mod}}';

const users = {{table}}('users', {name: {{int}}('name')}, () => [nameIndex]);
const nameIndex = index('name_idx').on(users.name);
`, `import {tableRef} from '@mionjs/drizzle-orm';
import {index, {{int}}, {{table}}} from '{{slim}}';
import {toDrizzle} from '{{slim}}/drizzle';

const users$table = {{table}}('users', {name: {{int}}('name')}, () => [name$index]);
const users = toDrizzle(users$table);
const name$index = index('name_idx').on(tableRef(users$table, 'name'));
const nameIndex = toDrizzle(name$index);
`)
	})
}

func TestTheSameRecorderNameIsReusedInSeparateScopes(t *testing.T) {
	// Each block is its own scope: claimed file-wide, drizzle's twenty `const users` test bodies would run out of suffixes.
	eachDialect(t, "the recorder name is reused in separate scopes", func(t *testing.T, dialect migrateDialect) {
		assertCase(t, dialect, `import {{{int}}, {{table}}} from '{{mod}}';

function first() {
  const users = {{table}}('users', {id: {{int}}('id')});
  return users;
}
function second() {
  const users = {{table}}('users', {id: {{int}}('id')});
  return users;
}
`, `import {{{int}}, {{table}}} from '{{slim}}';
import {toDrizzle} from '{{slim}}/drizzle';

function first() {
  const users$table = {{table}}('users', {id: {{int}}('id')});
  const users = toDrizzle(users$table);
  return users;
}
function second() {
  const users$table = {{table}}('users', {id: {{int}}('id')});
  const users = toDrizzle(users$table);
  return users;
}
`)
	})
}

func TestTranslatesANamespaceImport(t *testing.T) {
	// Half the namespace's members move and one alias cannot be both, so ours gets a SECOND namespace beside drizzle's.
	eachDialect(t, "a namespace import", func(t *testing.T, dialect migrateDialect) {
		assertCase(t, dialect, `import * as Driz from '{{mod}}';

const users = Driz.{{table}}('users', {id: Driz.{{int}}('id').notNull()});
Driz.getTableConfig(users);
`, `import * as Driz from '{{mod}}';
import * as rtDriz from '{{slim}}';
import {toDrizzle} from '{{slim}}/drizzle';

const users$table = rtDriz.{{table}}('users', {id: rtDriz.{{int}}('id', {notNull: true})});
const users = toDrizzle(users$table);
Driz.getTableConfig(users);
`)
	})
}

func TestTranslatingTwiceChangesNothing(t *testing.T) {
	// A migration tool gets re-run (a re-clone, an unsure user), so its own output must be a no-op input.
	eachDialect(t, "translating twice changes nothing", func(t *testing.T, dialect migrateDialect) {
		once, _ := migrate(t, dialect.src(`import {{{int}}, {{table}}} from '{{mod}}';

const parents = {{table}}('parents', {id: {{int}}('id').primaryKey()});
const users = {{table}}('users', {id: {{int}}('id').notNull().references(() => parents.id)});
`))
		twice, diags := migrate(t, once)
		for _, diagnostic := range diags {
			if diagnostic.Severity == drizzlemigrate.SeverityError {
				t.Fatalf("second pass refused something: %s", diagnostic.Describe())
			}
		}
		if twice != once {
			t.Fatalf("translating twice must be a no-op\n--- first ---\n%s\n--- second ---\n%s", once, twice)
		}
	})
}

func TestReportsWhichMigratedExportsWereUsed(t *testing.T) {
	// The lane's coverage gate crosses this with the manifests, so an entry that never reached a recorder must be absent.
	eachDialect(t, "reports which migrated exports were used", func(t *testing.T, dialect migrateDialect) {
		result := migrateFile(t, dialect.src(`import {getTableConfig, {{int}}, {{table}}} from '{{mod}}';

const users = {{table}}('users', {id: {{int}}('id')});
getTableConfig(users);
`))
		want := []string{dialect.fill["int"], dialect.fill["table"]}
		sort.Strings(want)
		if used := strings.Join(result.Used[dialect.name], ","); used != strings.Join(want, ",") {
			t.Fatalf("expected the two migrated exports that reached a recorder, got %q", used)
		}
	})
}

// ── folding chains into one call ─────────────────────────────────────────────

func TestFoldsEveryModifierKind(t *testing.T) {
	// A flag is `true`, arguments a tuple, a callback verbatim; modifiers follow a config's own keys, whatever the layout.
	eachDialect(t, "folds every modifier kind", func(t *testing.T, dialect migrateDialect) {
		assertCase(t, dialect, `import {{{int}}, {{str}}, {{table}}} from '{{mod}}';

const users = {{table}}('users', {
  id: {{int}}('id').primaryKey().notNull(),
  name: {{str}}('name', {length: 100}).notNull().unique('uq_name'),
  empty: {{str}}('empty', {}).default('x'),
  trailing: {{str}}('trailing', {length: 5,}).notNull(),
  bare: {{str}}().notNull(),
  slug: {{str}}('slug')
    .notNull()
    .$defaultFn(() => crypto.randomUUID()),
  touched: {{int}}('touched').$onUpdate(() => {
    return 1;
  }),
});
`, `import {{{int}}, {{str}}, {{table}}} from '{{slim}}';
import {toDrizzle} from '{{slim}}/drizzle';

const users$table = {{table}}('users', {
  id: {{int}}('id', {primaryKey: true, notNull: true}),
  name: {{str}}('name', {length: 100, notNull: true, unique: ['uq_name']}),
  empty: {{str}}('empty', {default: ['x']}),
  trailing: {{str}}('trailing', {length: 5, notNull: true,}),
  bare: {{str}}({notNull: true}),
  slug: {{str}}('slug', {notNull: true, $defaultFn: [() => crypto.randomUUID()]}),
  touched: {{int}}('touched', {$onUpdate: [() => {
    return 1;
  }]}),
});
const users = toDrizzle(users$table);
`)
	})
}

func TestFoldsIntoAConfigInItsOwnLayout(t *testing.T) {
	// A multi-line config gets one member per line, a config variable spreads, a non-literal db name stays the name.
	eachDialect(t, "folds into a config in its own layout", func(t *testing.T, dialect migrateDialect) {
		assertCase(t, dialect, `import {{{int}}, {{str}}, {{table}}} from '{{mod}}';

const config = {length: 5};
const users = {{table}}('users', {
	id: {{int}}('id' as string).primaryKey(),
	withComma: {{str}}('with_comma', {
		length: 5,
	}).notNull().default('x'),
	withoutComma: {{str}}('without_comma', {
		length: 5
	}).notNull(),
	shared: {{str}}('shared', config).notNull(),
});
`, `import {{{int}}, {{str}}, {{table}}} from '{{slim}}';
import {toDrizzle} from '{{slim}}/drizzle';

const config = {length: 5};
const users$table = {{table}}('users', {
	id: {{int}}('id' as string, {primaryKey: true}),
	withComma: {{str}}('with_comma', {
		length: 5,
		notNull: true,
		default: ['x'],
	}),
	withoutComma: {{str}}('without_comma', {
		length: 5,
		notNull: true
	}),
	shared: {{str}}('shared', {...config, notNull: true}),
});
const users = toDrizzle(users$table);
`)
	})
}

func TestFoldsSqlTypeAndReferences(t *testing.T) {
	// sql keeps its template, `$type<T>()` becomes the prop helper, a reference uses tableRef() and a forward one stays lazy.
	eachDialect(t, "folds sql, $type and references", func(t *testing.T, dialect migrateDialect) {
		assertCase(t, dialect, `import {{{int}}, {{table}}, {{text}}} from '{{mod}}';
import {sql} from 'drizzle-orm';

const posts = {{table}}('posts', {
  authorId: {{int}}('author_id').references(() => users.id, {onDelete: 'cascade'}).notNull(),
  body: {{text}}('body').$type<'a' | 'b'>().default(sql`+"`'a'`"+`),
});
const users = {{table}}('users', {id: {{int}}('id').primaryKey()});
`, `import {$type, sql as rtSql, tableRef} from '@mionjs/drizzle-orm';
import {{{int}}, {{table}}, {{text}}} from '{{slim}}';
import {toDrizzle} from '{{slim}}/drizzle';

const posts$table = {{table}}('posts', {
  authorId: {{int}}('author_id', {references: [() => tableRef(users$table, 'id'), {onDelete: 'cascade'}], notNull: true}),
  body: {{text}}('body', {$type: $type<'a' | 'b'>(), default: [rtSql`+"`'a'`"+`]}),
});
const posts = toDrizzle(posts$table);
const users$table = {{table}}('users', {id: {{int}}('id', {primaryKey: true})});
const users = toDrizzle(users$table);
`)
	})
}

func TestFoldsASelfReference(t *testing.T) {
	// A self-reference keeps a return annotation, TS7022 otherwise, now the TableRef the callback returns.
	eachDialect(t, "folds a self-reference", func(t *testing.T, dialect migrateDialect) {
		assertCase(t, dialect, `import {type {{AnyColumn}}, {{int}}, {{table}}} from '{{mod}}';

const emps = {{table}}('emps', {
  id: {{int}}('id').primaryKey(),
  managerId: {{int}}('manager_id').references((): {{AnyColumn}} => emps.id),
});
`, `import {type {{AnyColumn}}} from '{{mod}}';
import {type TableRef, tableRef} from '@mionjs/drizzle-orm';
import {{{int}}, {{table}}} from '{{slim}}';
import {toDrizzle} from '{{slim}}/drizzle';

const emps$table = {{table}}('emps', {
  id: {{int}}('id', {primaryKey: true}),
  managerId: {{int}}('manager_id', {references: [(): TableRef<'emps', 'id'> => tableRef(emps$table, 'id')]}),
});
const emps = toDrizzle(emps$table);
`)
	})
}

func TestFoldsTheColumnHelpersCallback(t *testing.T) {
	// drizzle's `(t) => ({...})` columns form folds like the object form.
	eachDialect(t, "folds the column helpers callback", func(t *testing.T, dialect migrateDialect) {
		assertCase(t, dialect, `import {{{table}}} from '{{mod}}';

const users = {{table}}('users', (t) => ({id: t.{{int}}('id').primaryKey()}));
`, `import {{{table}}} from '{{slim}}';
import {toDrizzle} from '{{slim}}/drizzle';

const users$table = {{table}}('users', (t) => ({id: t.{{int}}('id', {primaryKey: true})}));
const users = toDrizzle(users$table);
`)
	})
}

func TestFoldsMysqlEnumAfterItsValues(t *testing.T) {
	// mysqlEnum takes its values where other builders take a config, so the props come after them.
	eachDialect(t, "only mysql: mysqlEnum props follow its values", func(t *testing.T, dialect migrateDialect) {
		assertCase(t, dialect, `import {mysqlEnum, {{table}}} from '{{mod}}';

const users = {{table}}('users', {role: mysqlEnum('role', ['a', 'b']).notNull().default('a')});
`, `import {mysqlEnum, {{table}}} from '{{slim}}';
import {toDrizzle} from '{{slim}}/drizzle';

const users$table = {{table}}('users', {role: mysqlEnum('role', ['a', 'b'], {notNull: true, default: ['a']})});
const users = toDrizzle(users$table);
`)
	})
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
	// A one-argument view's columns come from drizzle's select typing, which the slim packages drop, so it stays drizzle.
	eachDialect(t, "refuses a query-builder view", func(t *testing.T, dialect migrateDialect) {
		assertRefusal(t, dialect.src(`import {{{int}}, {{table}}, {{view}}} from '{{mod}}';

const users = {{table}}('users', {id: {{int}}('id')});
const named = {{view}}('named').as((qb) => qb.select().from(users));
`), drizzlemigrate.CodeQueryBuilderView, dialect.src("const named = {{view}}('named').as((qb) => qb.select().from(users));"))
	})
}

func TestRefusesAMultiDeclaratorStatement(t *testing.T) {
	// `const a = …, b = …` has no clean place to put the drizzle half of either.
	eachDialect(t, "refuses a multi-declarator statement", func(t *testing.T, dialect migrateDialect) {
		assertRefusal(t, dialect.src(`import {{{int}}, {{table}}} from '{{mod}}';

const users = {{table}}('users', {id: {{int}}('id')}), posts = {{table}}('posts', {id: {{int}}('id')});
`), drizzlemigrate.CodeUnsupportedHead, dialect.src("const users = {{table}}('users', {id: {{int}}('id')}), posts ="))
	})
}

func TestRefusesAnUnfoldableChainAndWhatReferencesIt(t *testing.T) {
	// The props object holds a modifier once, so a repeat stays drizzle, as does a table whose tableRef() would lack a recorder.
	eachDialect(t, "refuses a repeated modifier and the tables referencing it", func(t *testing.T, dialect migrateDialect) {
		source := dialect.src(`import {{{int}}, {{table}}} from '{{mod}}';

const parents = {{table}}('parents', {id: {{int}}('id').notNull().notNull()});
const kids = {{table}}('kids', {pid: {{int}}('pid').references(() => parents.id)});
`)
		got, diags := migrate(t, source)
		refused := map[string]bool{}
		for _, diagnostic := range diags {
			if diagnostic.Code == drizzlemigrate.CodeUnfoldableColumn {
				refused[diagnostic.Decl] = true
			}
		}
		if !refused["parents"] || !refused["kids"] {
			t.Fatalf("expected both tables refused with %s, got %v", drizzlemigrate.CodeUnfoldableColumn, diags)
		}
		if got != source {
			t.Fatalf("a file whose every table is refused must stay as written:\n%s", got)
		}
	})
	eachDialect(t, "only pg: a two-dimensional array is refused", func(t *testing.T, dialect migrateDialect) {
		assertRefusal(t, dialect.src(`import {{{table}}, {{text}}} from '{{mod}}';

const plans = {{table}}('plans', {schedule: {{text}}('schedule').array().array()});
`), drizzlemigrate.CodeUnfoldableColumn, "text('schedule').array().array()")
	})
}

func TestLeavesAFileWithNoDrizzleImportsAlone(t *testing.T) {
	source := "export const answer = 42;\n"
	got, diags := migrate(t, source)
	if got != source || len(diags) != 0 {
		t.Fatalf("expected an untouched file with no diagnostics, got %q / %v", got, diags)
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
