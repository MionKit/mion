package convert_test

import (
	"fmt"
	"math/rand"
	"os"
	"sort"
	"strconv"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/convert"
	"github.com/mionkit/mion/ts-go-runtypes/internal/jsengine"
	"github.com/mionkit/mion/ts-go-runtypes/internal/testfixtures"
)

// setupDrizzleConvert mirrors setupConvert but mounts the REAL drizzle
// packages (sources) and resolves under the "source" export condition, the
// way the shipped packages actually publish their authoring surface.
func setupDrizzleConvert(t testing.TB, sources map[string]string) (*program.Program, *resolver.Session, string) {
	t.Helper()
	cwd := tspath.NormalizePath(t.TempDir())
	overlay := map[string]string{}
	drizzleFiles, drizzleErr := testfixtures.RealDrizzlePackages()
	if drizzleErr != nil {
		t.Fatalf("real drizzle packages unavailable: %v", drizzleErr)
	}
	for rel, content := range drizzleFiles {
		overlay[tspath.ResolvePath(cwd, rel)] = content
	}
	relNames := make([]string, 0, len(sources))
	for rel, content := range sources {
		overlay[tspath.ResolvePath(cwd, rel)] = content
		relNames = append(relNames, rel)
	}
	sort.Strings(relNames)
	fileNames := make([]string, 0, len(relNames))
	for _, rel := range relNames {
		fileNames = append(fileNames, tspath.ResolvePath(cwd, rel))
	}
	prog, progErr := program.NewInferred(program.Options{Cwd: cwd, Overlay: overlay, SingleThreaded: true, Conditions: []string{"source"}}, fileNames)
	if progErr != nil {
		t.Fatalf("build program: %v", progErr)
	}
	session, resolverErr := resolver.New(prog, resolver.Options{Cwd: cwd, SingleThreaded: true, JSEngine: jsengine.NewSidecar("")})
	if resolverErr != nil {
		t.Fatalf("build resolver: %v", resolverErr)
	}
	return prog, session, cwd
}

func convertDrizzleOne(t testing.TB, source string, opts convert.Options) (string, []convert.Diagnostic) {
	t.Helper()
	prog, session, cwd := setupDrizzleConvert(t, map[string]string{"main.ts": source})
	defer session.Close()
	absPath := tspath.ResolvePath(cwd, "main.ts")
	result, convertErr := convert.ConvertFile(prog, session.Checker(), session.Cache(), session.MarkerOptions(), absPath, opts, nil)
	if convertErr != nil {
		t.Fatalf("ConvertFile: %v", convertErr)
	}
	return result.Output, result.Diags
}

// ── the ONE dialect list ─────────────────────────────────────────────────────
//
// Every case runs once per dialect. A case that fits only some says so in its
// name, `only pg: …` or `only pg, mysql: …`, and eachDialect reads that prefix,
// so the name and the dialects it runs in cannot disagree.

type drizzleDialect struct {
	name string
	// fill holds the {{placeholder}} spellings a case's source is written in.
	fill map[string]string
}

var drizzleDialects = []drizzleDialect{
	{name: "pg", fill: map[string]string{
		"mod": "@mionjs/drizzle-orm-pg-core", "table": "pgTable", "Table": "PgTable", "creator": "pgTableCreator", "schema": "pgSchema",
		"int": "integer", "Int": "Integer", "str": "varchar", "Str": "Varchar", "text": "text", "Text": "Text", "serial": "serial", "Serial": "Serial",
	}},
	{name: "mysql", fill: map[string]string{
		"mod": "@mionjs/drizzle-orm-mysql-core", "table": "mysqlTable", "Table": "MysqlTable", "creator": "mysqlTableCreator", "schema": "mysqlSchema",
		"int": "int", "Int": "Int", "str": "varchar", "Str": "Varchar", "text": "text", "Text": "Text", "serial": "serial", "Serial": "Serial",
	}},
	{name: "sqlite", fill: map[string]string{
		"mod": "@mionjs/drizzle-orm-sqlite-core", "table": "sqliteTable", "Table": "SqliteTable", "creator": "sqliteTableCreator", "schema": "",
		"int": "integer", "Int": "Integer", "str": "text", "Str": "Text", "text": "text", "Text": "Text", "serial": "integer", "Serial": "Integer",
	}},
}

// src spells a case's template in this dialect.
func (dialect drizzleDialect) src(template string) string {
	pairs := make([]string, 0, 2*len(dialect.fill))
	for key, value := range dialect.fill {
		pairs = append(pairs, "{{"+key+"}}", value)
	}
	return strings.NewReplacer(pairs...).Replace(template)
}

// namedImport is `import {a, b} from '<mod>';` over the dialect spellings of the given placeholders, sorted
// the way the import planner writes them.
func (dialect drizzleDialect) namedImport(placeholders ...string) string {
	seen := map[string]bool{}
	var names []string
	for _, placeholder := range placeholders {
		name := dialect.src(placeholder)
		if !seen[name] {
			seen[name] = true
			names = append(names, name)
		}
	}
	sort.Strings(names)
	return "import {" + strings.Join(names, ", ") + "} from '" + dialect.fill["mod"] + "';\n"
}

// eachDialect runs body once per dialect of the list, narrowed by an `only a, b:` prefix on name.
func eachDialect(t *testing.T, name string, body func(t *testing.T, dialect drizzleDialect)) {
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
		for _, dialect := range drizzleDialects {
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

func expectContains(t *testing.T, label, output string, wants ...string) {
	t.Helper()
	for _, want := range wants {
		if !strings.Contains(output, want) {
			t.Fatalf("%s missing %q:\n%s", label, want, output)
		}
	}
}

func expectRefusal(t *testing.T, diags []convert.Diagnostic, output, wantInMessage string) {
	t.Helper()
	for _, diagnostic := range diags {
		if diagnostic.Code == convert.CodeDrizzleUnsupported && strings.Contains(diagnostic.Message, wantInMessage) {
			return
		}
	}
	t.Fatalf("expected a CNV009 refusal containing %q, got %v\noutput:\n%s", wantInMessage, diags, output)
}

// roundTrip drives builders→type→builders→type and pins the canonical fixpoint.
func roundTrip(t *testing.T, builders string) (typeForm string, buildersForm string) {
	t.Helper()
	typeForm, diags := convertDrizzleOne(t, builders, convert.Options{Target: convert.TargetType})
	expectNoDiags(t, diags)
	buildersForm, diags = convertDrizzleOne(t, typeForm, convert.Options{Target: convert.TargetBuilders})
	expectNoDiags(t, diags)
	typeAgain, diags := convertDrizzleOne(t, buildersForm, convert.Options{Target: convert.TargetType})
	expectNoDiags(t, diags)
	if typeAgain != typeForm {
		t.Fatalf("type form is not a fixpoint:\n--- first ---\n%s\n--- second ---\n%s", typeForm, typeAgain)
	}
	same, diags := convertDrizzleOne(t, typeForm, convert.Options{Target: convert.TargetType})
	expectNoDiags(t, diags)
	if same != typeForm {
		t.Fatalf("re-converting the type form is not a byte no-op:\n%s", same)
	}
	return typeForm, buildersForm
}

// ── builders ⇄ type ──────────────────────────────────────────────────────────

const drizzleBuildersTemplate = "import * as DZ from '{{mod}}';\n" +
	"export const users = DZ.{{table}}('users', {\n" +
	"  id: DZ.{{int}}({primaryKey: true}),\n" +
	"  name: DZ.{{str}}('user_name', {length: 100, notNull: true}),\n" +
	"  age: DZ.{{int}}({notNull: true, default: [21]}),\n" +
	"  bio: DZ.{{str}}('bio_text', {length: 500}),\n" +
	"  note: DZ.{{text}}(),\n" +
	"});\n" +
	"export type UsersTable = typeof users;\n"

const drizzleTypeTemplate = "import * as DZ from '{{mod}}';\n" +
	"export type UsersTable = DZ.{{Table}}<'users', {\n" +
	"  id: DZ.{{Int}}<{primaryKey: true}>;\n" +
	"  name: DZ.{{Str}}<{length: 100; notNull: true}>;\n" +
	"  age: DZ.{{Int}}<{notNull: true; default: [21]}>;\n" +
	"  bio: DZ.{{Str}}<{length: 500}>;\n" +
	"  note: DZ.{{Text}};\n" +
	"}, [], {name: 'user_name'; bio: 'bio_text'}>;\n" +
	"export const users = DZ.tableFromType<UsersTable>();\n"

func TestDrizzle_BuildersToType(t *testing.T) {
	eachDialect(t, "builders to type", func(t *testing.T, dialect drizzleDialect) {
		output, diags := convertDrizzleOne(t, dialect.src(drizzleBuildersTemplate), convert.Options{Target: convert.TargetType})
		expectNoDiags(t, diags)
		if want := dialect.src(drizzleTypeTemplate); output != want {
			t.Fatalf("builders→type:\n--- want ---\n%s\n--- got ---\n%s", want, output)
		}
	})
}

func TestDrizzle_TypeToBuilders(t *testing.T) {
	eachDialect(t, "type to builders", func(t *testing.T, dialect drizzleDialect) {
		output, diags := convertDrizzleOne(t, dialect.src(drizzleTypeTemplate), convert.Options{Target: convert.TargetBuilders})
		expectNoDiags(t, diags)
		if want := dialect.src(drizzleBuildersTemplate); output != want {
			t.Fatalf("type→builders:\n--- want ---\n%s\n--- got ---\n%s", want, output)
		}
	})
}

// TestDrizzle_DbNameEqualToKeyIsDropped pins the canonical builders spelling: a db name equal to its key adds
// nothing to the type, so it prints back nameless.
func TestDrizzle_DbNameEqualToKeyIsDropped(t *testing.T) {
	eachDialect(t, "db name equal to its key", func(t *testing.T, dialect drizzleDialect) {
		source := dialect.src("import * as DZ from '{{mod}}';\n" +
			"export const t = DZ.{{table}}('t', {id: DZ.{{int}}('id', {primaryKey: true}), n: DZ.{{int}}('n')});\n")
		output, diags := convertDrizzleOne(t, source, convert.Options{Target: convert.TargetType})
		expectNoDiags(t, diags)
		expectContains(t, "builders→type", output, dialect.src("  id: DZ.{{Int}}<{primaryKey: true}>;\n  n: DZ.{{Int}};\n}>;"))
	})
}

func TestDrizzle_RoundTripFixpoint(t *testing.T) {
	eachDialect(t, "round trip fixpoint", func(t *testing.T, dialect drizzleDialect) {
		_, buildersForm := roundTrip(t, dialect.src(drizzleBuildersTemplate))
		if want := dialect.src(drizzleBuildersTemplate); buildersForm != want {
			t.Fatalf("the canonical builders form did not come back:\n--- want ---\n%s\n--- got ---\n%s", want, buildersForm)
		}
	})
}

// ── named imports ────────────────────────────────────────────────────────────
//
// The spelling a file was written in is the spelling it keeps. Drizzle's own
// code, and everything `mion drizzle-migrate` emits from it, imports the
// dialect package's NAMES; the namespace form above is the other half of the
// same rule, not the only one that converts.

func namedBuildersSource(dialect drizzleDialect) string {
	return dialect.namedImport("{{int}}", "{{table}}", "{{str}}") + dialect.src(
		"export const users = {{table}}('users', {\n"+
			"  id: {{int}}({primaryKey: true}),\n"+
			"  name: {{str}}({length: 100, notNull: true}),\n"+
			"  age: {{int}}({notNull: true, default: [21]}),\n"+
			"});\n"+
			"export type UsersTable = typeof users;\n")
}

func TestDrizzle_NamedImportsBuildersToType(t *testing.T) {
	eachDialect(t, "named imports builders to type", func(t *testing.T, dialect drizzleDialect) {
		output, diags := convertDrizzleOne(t, namedBuildersSource(dialect), convert.Options{Target: convert.TargetType})
		expectNoDiags(t, diags)
		expectContains(t, "named builders→type", output, dialect.src("export type UsersTable = {{Table}}<'users', {\n"+
			"  id: {{Int}}<{primaryKey: true}>;\n"+
			"  name: {{Str}}<{length: 100; notNull: true}>;\n"+
			"  age: {{Int}}<{notNull: true; default: [21]}>;\n"+
			"}>;\n"+
			"export const users = tableFromType<UsersTable>();"))
		// The type names arrive as type-only bindings, the bridge as a value one.
		expectContains(t, "named builders→type imports", output, dialect.src("type {{Table}}"), dialect.src("type {{Int}}"))
		if strings.Contains(output, "type tableFromType") {
			t.Fatalf("the bridge is CALLED, so it cannot come in as `import type`:\n%s", output)
		}
		// The builders the file no longer calls are gone.
		for _, gone := range []string{dialect.src("{{int}},"), dialect.src(" {{str}},"), dialect.src("{{table}},")} {
			if strings.Contains(output, gone) {
				t.Fatalf("named builders→type kept the now-unused builder import %q:\n%s", gone, output)
			}
		}
		if strings.Contains(output, "DZ.") {
			t.Fatalf("named builders→type invented a namespace spelling:\n%s", output)
		}
	})
}

func TestDrizzle_NamedImportsRoundTripFixpoint(t *testing.T) {
	eachDialect(t, "named imports round trip", func(t *testing.T, dialect drizzleDialect) {
		source := namedBuildersSource(dialect)
		_, buildersForm := roundTrip(t, source)
		if buildersForm != source {
			t.Fatalf("named round trip did not return the original:\nwant:\n%s\ngot:\n%s", source, buildersForm)
		}
	})
}

// TestDrizzle_NamedImportsRuntimeModifiers is the runtime-callback half under the named spelling: the callback
// text moves into options.runtime and back, unchanged, and the type carries only the flag.
func TestDrizzle_NamedImportsRuntimeModifiers(t *testing.T) {
	eachDialect(t, "named imports runtime modifiers", func(t *testing.T, dialect drizzleDialect) {
		source := dialect.namedImport("{{int}}", "{{table}}", "{{str}}") + dialect.src(
			"export const jobs = {{table}}('jobs', {\n"+
				"  id: {{int}}({primaryKey: true}),\n"+
				"  slug: {{str}}({length: 80, notNull: true, $defaultFn: [() => 'slug-1']}),\n"+
				"});\n"+
				"export type JobsTable = typeof jobs;\n")
		typeForm, buildersForm := roundTrip(t, source)
		expectContains(t, "named runtime-modifier type form", typeForm,
			dialect.src("  slug: {{Str}}<{length: 80; notNull: true; $defaultFn: true}>;"),
			"export const jobs = tableFromType<JobsTable>({runtime: {slug: {$defaultFn: () => 'slug-1'}}});")
		if buildersForm != source {
			t.Fatalf("named runtime-modifier round trip did not return the original:\nwant:\n%s\ngot:\n%s", source, buildersForm)
		}
	})
}

// TestDrizzle_NamedImportsAliasOnCollision covers the file the drizzle-e2e lane actually feeds the arm:
// drizzle's OWN names live beside ours in the same file, so a name the printed output needs can already be
// bound to something else. It comes in under a free local rather than colliding.
func TestDrizzle_NamedImportsAliasOnCollision(t *testing.T) {
	eachDialect(t, "named imports alias on collision", func(t *testing.T, dialect drizzleDialect) {
		source := dialect.src("import type {{{Table}}} from 'drizzle-orm/" + dialect.name + "-core';\n" +
			"import {{{int}}, {{table}}} from '{{mod}}';\n" +
			"export const users = {{table}}('users', {\n" +
			"  id: {{int}}({primaryKey: true}),\n" +
			"});\n" +
			"export type UsersTable = typeof users;\n" +
			"export type Held = {{Table}}<any, any, any>;\n")
		output, diags := convertDrizzleOne(t, source, convert.Options{Target: convert.TargetType})
		expectNoDiags(t, diags)
		expectContains(t, "collision", output,
			dialect.src("export type Held = {{Table}}<any, any, any>;"),
			dialect.src("export type UsersTable = {{Table}}$rt<'users', {"),
			dialect.src("{{Table}} as {{Table}}$rt"))
	})
}

// ── extraConfig ──────────────────────────────────────────────────────────────

// TestDrizzle_KeyedExtraConfig covers the OTHER extraConfig shape drizzle accepts, which its own suites still
// write. drizzle reads only the values of that object and so does the recorder, so the keys are labels: the
// entries convert, and the builders form comes back as the array.
func TestDrizzle_KeyedExtraConfig(t *testing.T) {
	eachDialect(t, "keyed-object extraConfig", func(t *testing.T, dialect drizzleDialect) {
		source := dialect.namedImport("{{table}}", "{{text}}", "unique") + dialect.src(
			"export const cities = {{table}}('cities', {\n"+
				"  name: {{text}}({notNull: true}),\n"+
				"}, (t) => ({\n"+
				"  f: unique('custom_name').on(t.name),\n"+
				"}));\n"+
				"export type CitiesTable = typeof cities;\n")
		typeForm, diags := convertDrizzleOne(t, source, convert.Options{Target: convert.TargetType})
		expectNoDiags(t, diags)
		expectContains(t, "keyed builders→type", typeForm, "TableEntry<'unique', ['custom_name'], {on: [{col: 'name'}]}>,")
		buildersForm, diags := convertDrizzleOne(t, typeForm, convert.Options{Target: convert.TargetBuilders})
		expectNoDiags(t, diags)
		expectContains(t, "keyed type→builders", buildersForm, "unique('custom_name').on(t.name),")
	})
}

// TestDrizzle_GroupedExtraConfig covers the grouping drizzle flattens one level of (`extraConfig.flat(1)`),
// which its own mysql suite writes.
func TestDrizzle_GroupedExtraConfig(t *testing.T) {
	eachDialect(t, "grouped-array extraConfig", func(t *testing.T, dialect drizzleDialect) {
		source := dialect.namedImport("index", "{{int}}", "{{table}}", "primaryKey") + dialect.src(
			"export const rows = {{table}}('rows', {\n"+
				"  id: {{int}}(),\n"+
				"}, (t) => [\n"+
				"  [index('rows_id').on(t.id), primaryKey({columns: [t.id], name: 'custom'})],\n"+
				"]);\n"+
				"export type RowsTable = typeof rows;\n")
		typeForm, diags := convertDrizzleOne(t, source, convert.Options{Target: convert.TargetType})
		expectNoDiags(t, diags)
		expectContains(t, "grouped builders→type", typeForm,
			"TableEntry<'index', ['rows_id'], {on: [{col: 'id'}]}>,",
			"TableEntry<'primaryKey', [{columns: [{col: 'id'}], name: 'custom'}]>,")
	})
}

const drizzleExtrasTemplate = "import {sql} from '@mionjs/drizzle-orm';\n" +
	"import * as DZ from '{{mod}}';\n" +
	"export const extras = DZ.{{table}}('extras_t', {\n" +
	"  a: DZ.{{int}}('a_col', {notNull: true}),\n" +
	"  b: DZ.{{str}}({length: 10}),\n" +
	"}, (t) => [\n" +
	"  DZ.index('idx_a').on(t.a),\n" +
	"  DZ.uniqueIndex('uidx_b').on(t.b),\n" +
	"  DZ.unique('uq_ab').on(t.a, t.b),\n" +
	"  DZ.check('chk_a', sql`a >= 0`),\n" +
	"]);\n" +
	"export type ExtrasTable = typeof extras;\n"

// TestDrizzle_TableExtras pins the extraConfig road through both directions, with the names map after the
// extras tuple.
func TestDrizzle_TableExtras(t *testing.T) {
	eachDialect(t, "table extras", func(t *testing.T, dialect drizzleDialect) {
		source := dialect.src(drizzleExtrasTemplate)
		typeForm, buildersForm := roundTrip(t, source)
		expectContains(t, "builders→type extras", typeForm,
			"}, [\n",
			"  DZ.TableEntry<'index', ['idx_a'], {on: [{col: 'a'}]}>,",
			"  DZ.TableEntry<'uniqueIndex', ['uidx_b'], {on: [{col: 'b'}]}>,",
			"  DZ.TableEntry<'unique', ['uq_ab'], {on: [{col: 'a'}, {col: 'b'}]}>,",
			"  DZ.TableEntry<'check', ['chk_a', DZ.Sql<'a >= 0'>]>,\n], {a: 'a_col'}>;")
		if buildersForm != source {
			t.Fatalf("extras round trip did not return the original:\nwant:\n%s\ngot:\n%s", source, buildersForm)
		}
	})
}

// TestDrizzle_ForeignKeyEntryTableRef pins another table's column in an entry: tableRef() on the builders
// road, {table, col} in the type.
func TestDrizzle_ForeignKeyEntryTableRef(t *testing.T) {
	eachDialect(t, "foreignKey entry with tableRef", func(t *testing.T, dialect drizzleDialect) {
		source := dialect.src("import * as DZ from '{{mod}}';\n" +
			"import {tableRef} from '@mionjs/drizzle-orm';\n" +
			"export const parents = DZ.{{table}}('parents', {\n" +
			"  id: DZ.{{int}}({primaryKey: true}),\n" +
			"});\n" +
			"export type Parents = typeof parents;\n" +
			"export const kids = DZ.{{table}}('kids', {\n" +
			"  pid: DZ.{{int}}(),\n" +
			"}, (t) => [\n" +
			"  DZ.foreignKey({columns: [t.pid], foreignColumns: [tableRef(parents, 'id')]}),\n" +
			"]);\n" +
			"export type Kids = typeof kids;\n")
		typeForm, buildersForm := roundTrip(t, source)
		expectContains(t, "foreignKey builders→type", typeForm,
			"DZ.TableEntry<'foreignKey', [{columns: [{col: 'pid'}], foreignColumns: [{table: 'parents', col: 'id'}]}]>,",
			"export const kids = DZ.tableFromType<Kids>({tables: {parents: parents}});")
		if strings.Contains(typeForm, "tableRef") {
			t.Fatalf("the type form kept an unused tableRef import:\n%s", typeForm)
		}
		if buildersForm != source {
			t.Fatalf("foreignKey round trip did not return the original:\nwant:\n%s\ngot:\n%s", source, buildersForm)
		}
	})
}

// ── refused heads ────────────────────────────────────────────────────────────

// TestDrizzle_UnspellableHeadsSayWhy pins the reports for the table heads the type road cannot express. The
// declaration IS a recognized table, so a refusal that reads "not recognized" would send the reader hunting
// for a bug that is not there.
func TestDrizzle_UnspellableHeadsSayWhy(t *testing.T) {
	cases := []struct{ name, source, want string }{
		{
			name: "table creator refused",
			source: "import {{{creator}}, {{int}}} from '{{mod}}';\n" +
				"export function scenario() {\n" +
				"  const {{table}} = {{creator}}((name) => `prefixed_${name}`);\n" +
				"  const users = {{table}}('users', {id: {{int}}()});\n" +
				"  return users;\n" +
				"}\n",
			want: "table creator",
		},
		{
			name: "only pg, mysql: schema head refused",
			source: "import {{{schema}}, {{int}}} from '{{mod}}';\n" +
				"const mySchema = {{schema}}('mySchema');\n" +
				"export const users = mySchema.table('users', {id: {{int}}()});\n",
			want: "cannot carry the schema it belongs to",
		},
		{
			name: "only pg: enableRLS head refused",
			source: "import {{{table}}, {{int}}} from '{{mod}}';\n" +
				"export const users = {{table}}('users', {id: {{int}}()}).enableRLS();\n",
			want: "chained modifier on the table (.enableRLS())",
		},
	}
	for _, testCase := range cases {
		eachDialect(t, testCase.name, func(t *testing.T, dialect drizzleDialect) {
			output, diags := convertDrizzleOne(t, dialect.src(testCase.source), convert.Options{Target: convert.TargetType})
			expectRefusal(t, diags, output, testCase.want)
		})
	}
}

// ── declarations inside a scope ──────────────────────────────────────────────

// TestDrizzle_NestedDeclarations covers where drizzle's own suites actually declare their tables: inside test
// bodies, not at the top level (95 of 113 in pg-common.ts). A table in a block is an ordinary table.
func TestDrizzle_NestedDeclarations(t *testing.T) {
	eachDialect(t, "nested declarations", func(t *testing.T, dialect drizzleDialect) {
		source := dialect.namedImport("{{int}}", "{{table}}", "{{text}}") + dialect.src(
			"\n"+
				"export function scenarioOne() {\n"+
				"  const users = {{table}}('users', {id: {{text}}({primaryKey: true})});\n"+
				"  return users;\n"+
				"}\n"+
				"\n"+
				"export function scenarioTwo() {\n"+
				"  const users = {{table}}('users_two', {id: {{int}}({primaryKey: true})});\n"+
				"  return users;\n"+
				"}\n")
		typeForm, diags := convertDrizzleOne(t, source, convert.Options{Target: convert.TargetType})
		expectNoDiags(t, diags)
		expectContains(t, "nested builders→type", typeForm,
			dialect.src("  type Users = {{Table}}<'users', {\n    id: {{Text}}<{primaryKey: true}>;\n  }>;"),
			dialect.src("  type Users = {{Table}}<'users_two', {\n    id: {{Int}}<{primaryKey: true}>;\n  }>;"),
			"  const users = tableFromType<Users>();")
		// Sibling scopes claim the same name: a file-wide claim budget would have pushed the second onto
		// UsersT, and runs out entirely on the ninth.
		if strings.Contains(typeForm, "UsersT") {
			t.Fatalf("sibling scopes should each claim Users:\n%s", typeForm)
		}
		buildersForm, diags := convertDrizzleOne(t, typeForm, convert.Options{Target: convert.TargetBuilders})
		expectNoDiags(t, diags)
		expectContains(t, "nested type→builders", buildersForm,
			dialect.src("  const users = {{table}}('users', {\n    id: {{text}}({primaryKey: true}),\n  });\n  type Users = typeof users;\n  return users;"))
		again, diags := convertDrizzleOne(t, typeForm, convert.Options{Target: convert.TargetType})
		expectNoDiags(t, diags)
		if again != typeForm {
			t.Fatalf("nested type form is not a byte fixpoint:\nwant:\n%s\ngot:\n%s", typeForm, again)
		}
	})
}

// TestDrizzle_NestedScopeDoesNotShadow pins the other side of scoped naming: a claimed pair name may repeat
// across sibling scopes, but never shadow a name the file already uses at the top level.
func TestDrizzle_NestedScopeDoesNotShadow(t *testing.T) {
	eachDialect(t, "nested scope does not shadow", func(t *testing.T, dialect drizzleDialect) {
		source := dialect.namedImport("{{int}}", "{{table}}") + dialect.src(
			"export type Users = {taken: true};\n"+
				"export function scenario() {\n"+
				"  const users = {{table}}('users', {id: {{int}}({primaryKey: true})});\n"+
				"  return users;\n"+
				"}\n")
		typeForm, diags := convertDrizzleOne(t, source, convert.Options{Target: convert.TargetType})
		expectNoDiags(t, diags)
		expectContains(t, "nested shadow", typeForm,
			"export type Users = {taken: true};",
			dialect.src("  type UsersT = {{Table}}<'users', {"),
			"  const users = tableFromType<UsersT>();")
	})
}

// TestDrizzle_DerivedPairNames pins the pair-naming rule in both directions: a const derives its type by
// uppercasing the first letter, and a type derives its const by lowercasing it.
func TestDrizzle_DerivedPairNames(t *testing.T) {
	eachDialect(t, "derived pair names", func(t *testing.T, dialect drizzleDialect) {
		buildersOnly := dialect.src("import * as DZ from '{{mod}}';\n" +
			"export const users = DZ.{{table}}('users', {id: DZ.{{int}}({primaryKey: true})});\n")
		typeForm, diags := convertDrizzleOne(t, buildersOnly, convert.Options{Target: convert.TargetType})
		expectNoDiags(t, diags)
		expectContains(t, "derived type name", typeForm,
			dialect.src("export type Users = DZ.{{Table}}<'users', {"),
			"export const users = DZ.tableFromType<Users>();")

		typeOnly := dialect.src("import * as DZ from '{{mod}}';\n" +
			"export type UsersTable = DZ.{{Table}}<'users', {\n" +
			"  id: DZ.{{Int}}<{primaryKey: true}>;\n" +
			"}>;\n")
		buildersForm, diags := convertDrizzleOne(t, typeOnly, convert.Options{Target: convert.TargetBuilders})
		expectNoDiags(t, diags)
		expectContains(t, "derived const name", buildersForm,
			dialect.src("export const usersTable = DZ.{{table}}('users', {"),
			"export type UsersTable = typeof usersTable;")
		if strings.Contains(buildersForm, "usersRT") || strings.Contains(typeForm, "usersRT") {
			t.Fatalf("drizzle derivation produced an RT-suffixed const:\n%s\n%s", typeForm, buildersForm)
		}
	})
}

// TestDrizzle_MigratedRecorderConstName is the case that started the naming rule: the `$table` recorder
// binding `drizzle-migrate` emits used to derive `Users$tableTable`, a doubled word from two translations.
func TestDrizzle_MigratedRecorderConstName(t *testing.T) {
	eachDialect(t, "migrated recorder const name", func(t *testing.T, dialect drizzleDialect) {
		source := dialect.src("import * as DZ from '{{mod}}';\n" +
			"export const users$table = DZ.{{table}}('users', {id: DZ.{{int}}({primaryKey: true})});\n")
		typeForm, diags := convertDrizzleOne(t, source, convert.Options{Target: convert.TargetType})
		expectNoDiags(t, diags)
		if strings.Contains(typeForm, "tableTable") {
			t.Fatalf("the recorder marker must not double the Table word:\n%s", typeForm)
		}
		expectContains(t, "migrated recorder name", typeForm,
			dialect.src("export type Users$table = DZ.{{Table}}<'users', {"),
			"export const users$table = DZ.tableFromType<Users$table>();")
	})
}

// TestDrizzle_CapitalisedConstGetsTSuffix — uppercasing a const that is ALREADY capitalised would hand the
// type the const's own spelling, so it takes a `T`.
func TestDrizzle_CapitalisedConstGetsTSuffix(t *testing.T) {
	eachDialect(t, "capitalised const gets T suffix", func(t *testing.T, dialect drizzleDialect) {
		source := dialect.src("import * as DZ from '{{mod}}';\n" +
			"export const Users = DZ.{{table}}('users', {id: DZ.{{int}}({primaryKey: true})});\n")
		typeForm, diags := convertDrizzleOne(t, source, convert.Options{Target: convert.TargetType})
		expectNoDiags(t, diags)
		expectContains(t, "capitalised const", typeForm,
			dialect.src("export type UsersT = DZ.{{Table}}<'users', {"),
			"export const Users = DZ.tableFromType<UsersT>();")
	})
}

// ── references ───────────────────────────────────────────────────────────────

const drizzleRefHeader = "import {tableRef} from '@mionjs/drizzle-orm';\nimport * as DZ from '{{mod}}';\n"

// TestDrizzle_ForwardReferenceThunk: drizzle schemas often declare the parent later; the eager tables option
// needs a thunk, and the type names the parent's derived type.
func TestDrizzle_ForwardReferenceThunk(t *testing.T) {
	eachDialect(t, "forward reference", func(t *testing.T, dialect drizzleDialect) {
		source := dialect.src(drizzleRefHeader +
			"export const children = DZ.{{table}}('children', {\n" +
			"  pid: DZ.{{int}}({references: [() => tableRef(parents, 'id')]}),\n" +
			"});\n" +
			"export const parents = DZ.{{table}}('parents', {\n" +
			"  id: DZ.{{int}}({primaryKey: true}),\n" +
			"});\n")
		typeForm, buildersForm := roundTrip(t, source)
		expectContains(t, "forward reference type form", typeForm,
			dialect.src("  pid: DZ.{{Int}}<{references: [TableRef<Parents, 'id'>]}>;"),
			"export const children = DZ.tableFromType<Children>({tables: {parents: () => parents}});",
			"export const parents = DZ.tableFromType<Parents>();",
			"import {type TableRef} from '@mionjs/drizzle-orm';")
		// Back on the builders road the reference is a lazy callback again, so the declaration order the
		// file was written in still stands.
		expectContains(t, "forward reference builders form", buildersForm,
			dialect.src("  pid: DZ.{{int}}({references: [() => tableRef(parents, 'id')]}),"),
			"import {tableRef} from '@mionjs/drizzle-orm';")
		if strings.Index(buildersForm, "'children'") > strings.Index(buildersForm, "'parents'") {
			t.Fatalf("the round trip reordered the declarations:\n%s", buildersForm)
		}
	})
}

// TestDrizzle_SelfReferenceRoundTrip pins that a self-reference keeps its return annotation (TS7022) on the
// builders road and names the table by its db name in the type.
func TestDrizzle_SelfReferenceRoundTrip(t *testing.T) {
	eachDialect(t, "self reference", func(t *testing.T, dialect drizzleDialect) {
		source := dialect.src("import {type TableRef, tableRef} from '@mionjs/drizzle-orm';\n" +
			"import * as DZ from '{{mod}}';\n" +
			"export const emps = DZ.{{table}}('emps', {\n" +
			"  id: DZ.{{serial}}({primaryKey: true}),\n" +
			"  managerId: DZ.{{int}}('manager_id', {references: [(): TableRef<'emps', 'id'> => tableRef(emps, 'id')]}),\n" +
			"});\n" +
			"export type Emps = typeof emps;\n")
		typeForm, buildersForm := roundTrip(t, source)
		expectContains(t, "self-reference type form", typeForm,
			"export const emps = DZ.tableFromType<Emps>({tables: {emps: () => emps}});",
			dialect.src("  managerId: DZ.{{Int}}<{references: [TableRef<'emps', 'id'>]}>;"),
			"}, [], {managerId: 'manager_id'}>;")
		if buildersForm != source {
			t.Fatalf("the self-reference round trip did not return the original:\nwant:\n%s\ngot:\n%s", source, buildersForm)
		}
	})
}

// TestDrizzle_BackwardReferenceStaysPlain pins the other half: nothing about the thunk leaks into a file
// whose reference target is already declared.
func TestDrizzle_BackwardReferenceStaysPlain(t *testing.T) {
	eachDialect(t, "backward reference", func(t *testing.T, dialect drizzleDialect) {
		source := dialect.src(drizzleRefHeader +
			"export const parents = DZ.{{table}}('parents', {\n" +
			"  id: DZ.{{int}}({primaryKey: true}),\n" +
			"});\n" +
			"export const children = DZ.{{table}}('children', {\n" +
			"  pid: DZ.{{int}}({references: [() => tableRef(parents, 'id')]}),\n" +
			"});\n")
		typeForm, diags := convertDrizzleOne(t, source, convert.Options{Target: convert.TargetType})
		expectNoDiags(t, diags)
		expectContains(t, "backward reference", typeForm, "export const children = DZ.tableFromType<Children>({tables: {parents: parents}});")
	})
}

// TestDrizzle_ReferenceToARefusedTable pins a reference to a table that does not convert: a builders const
// is still named as `typeof <const>`, while a standalone type left unconverted has no const to call.
func TestDrizzle_ReferenceToARefusedTable(t *testing.T) {
	eachDialect(t, "reference to a refused builders table", func(t *testing.T, dialect drizzleDialect) {
		source := dialect.src("import {tableRef, $type} from '@mionjs/drizzle-orm';\n" +
			"import * as DZ from '{{mod}}';\n" +
			"export const parents = DZ.{{table}}('parents', {\n" +
			"  id: DZ.{{int}}({primaryKey: true, $type: $type<1 | 2>()}),\n" +
			"});\n" +
			"export const children = DZ.{{table}}('children', {\n" +
			"  pid: DZ.{{int}}({references: [() => tableRef(parents, 'id')]}),\n" +
			"});\n")
		output, diags := convertDrizzleOne(t, source, convert.Options{Target: convert.TargetType})
		expectRefusal(t, diags, output, "prop $type")
		if len(diags) != 1 {
			t.Fatalf("only the table with $type should refuse, got %v", diags)
		}
		expectContains(t, "dependent type form", output,
			dialect.src("  pid: DZ.{{Int}}<{references: [TableRef<typeof parents, 'id'>]}>;"),
			"export const children = DZ.tableFromType<Children>({tables: {parents: parents}});",
			dialect.src("export const parents = DZ.{{table}}('parents', {"))
	})
	eachDialect(t, "reference to a refused standalone type", func(t *testing.T, dialect drizzleDialect) {
		source := dialect.src("import type {TableRef} from '@mionjs/drizzle-orm';\n" +
			"import * as DZ from '{{mod}}';\n" +
			"export type Parents = DZ.{{Table}}<'parents', {\n" +
			"  id: DZ.{{Int}}<{primaryKey: true; $type: [1 | 2]}>;\n" +
			"}>;\n" +
			"export type Kids = DZ.{{Table}}<'kids', {\n" +
			"  pid: DZ.{{Int}}<{references: [TableRef<Parents, 'id'>]}>;\n" +
			"}>;\n")
		output, diags := convertDrizzleOne(t, source, convert.Options{Target: convert.TargetBuilders})
		expectRefusal(t, diags, output, "the $type override")
		expectRefusal(t, diags, output, "which did not convert, so it has no const to call")
		if output != source {
			t.Fatalf("both declarations should stay as written:\n%s", output)
		}
	})
}

// Deliberately legacy-named (parentsRT/childrenRT): existing names are always preserved by conversion,
// whatever their suffix — this fixture doubles as that coverage.
const drizzleRefSqlTemplate = "import {sql, tableRef} from '@mionjs/drizzle-orm';\n" +
	"import * as DZ from '{{mod}}';\n" +
	"export const parentsRT = DZ.{{table}}('parents', {\n" +
	"  id: DZ.{{int}}({primaryKey: true}),\n" +
	"});\n" +
	"export type ParentsRT = typeof parentsRT;\n" +
	"export const childrenRT = DZ.{{table}}('children', {\n" +
	"  pid: DZ.{{int}}({references: [() => tableRef(parentsRT, 'id'), {onDelete: 'cascade'}], notNull: true}),\n" +
	"  note: DZ.{{text}}({default: [sql`'x'`]}),\n" +
	"});\n" +
	"export type ChildrenRT = typeof childrenRT;\n"

// TestDrizzle_ReferencesAndSql pins the references + literal-sql spellings through both directions and the
// fixpoint.
func TestDrizzle_ReferencesAndSql(t *testing.T) {
	eachDialect(t, "references with sql", func(t *testing.T, dialect drizzleDialect) {
		source := dialect.src(drizzleRefSqlTemplate)
		typeForm, buildersForm := roundTrip(t, source)
		expectContains(t, "references type form", typeForm,
			dialect.src("pid: DZ.{{Int}}<{references: [TableRef<ParentsRT, 'id'>, {onDelete: 'cascade'}]; notNull: true}>;"),
			dialect.src("note: DZ.{{Text}}<{default: [DZ.Sql<'\\'x\\''>]}>;"),
			// The referenced table rides the emitted tables option.
			"export const parentsRT = DZ.tableFromType<ParentsRT>();",
			"export const childrenRT = DZ.tableFromType<ChildrenRT>({tables: {parents: parentsRT}});")
		if buildersForm != source {
			t.Fatalf("references round trip did not return the original:\nwant:\n%s\ngot:\n%s", source, buildersForm)
		}
	})
}

// ── runtime callbacks ────────────────────────────────────────────────────────

const drizzleRuntimeTemplate = "import * as DZ from '{{mod}}';\n" +
	"export const jobs = DZ.{{table}}('jobs', {\n" +
	"  id: DZ.{{int}}({primaryKey: true}),\n" +
	"  slug: DZ.{{str}}({length: 80, notNull: true, $defaultFn: [() => 'slug-' + Math.random()]}),\n" +
	"  attempts: DZ.{{int}}({$default: [() => 0]}),\n" +
	"  touchedAt: DZ.{{text}}('touched_at', {$onUpdate: [() => new Date().toISOString()]}),\n" +
	"  counter: DZ.{{int}}({$onUpdateFn: [() => {\n" +
	"    const next = 1 + 1;\n" +
	"    return next;\n" +
	"  }]}),\n" +
	"});\n" +
	"export type JobsTable = typeof jobs;\n"

// TestDrizzle_RuntimeModifiers pins the runtime callbacks through both directions: the type carries the flag,
// the callbacks move VERBATIM into options.runtime (multi-line bodies included), and it is a byte fixpoint.
func TestDrizzle_RuntimeModifiers(t *testing.T) {
	eachDialect(t, "runtime modifiers", func(t *testing.T, dialect drizzleDialect) {
		source := dialect.src(drizzleRuntimeTemplate)
		typeForm, buildersForm := roundTrip(t, source)
		expectContains(t, "runtime type form", typeForm,
			dialect.src("  slug: DZ.{{Str}}<{length: 80; notNull: true; $defaultFn: true}>;"),
			dialect.src("  attempts: DZ.{{Int}}<{$default: true}>;"),
			dialect.src("  touchedAt: DZ.{{Text}}<{$onUpdate: true}>;"),
			dialect.src("  counter: DZ.{{Int}}<{$onUpdateFn: true}>;"),
			"export const jobs = DZ.tableFromType<JobsTable>({runtime: {"+
				"slug: {$defaultFn: () => 'slug-' + Math.random()}, "+
				"attempts: {$default: () => 0}, "+
				"touchedAt: {$onUpdate: () => new Date().toISOString()}, "+
				"counter: {$onUpdateFn: () => {\n"+
				"    const next = 1 + 1;\n"+
				"    return next;\n"+
				"  }}}});")
		if buildersForm != source {
			t.Fatalf("runtime round trip did not return the original:\nwant:\n%s\ngot:\n%s", source, buildersForm)
		}
	})
}

// TestDrizzle_RuntimeMismatchRefusals pins the two-way flag↔callback validation on the type→builders direction.
func TestDrizzle_RuntimeMismatchRefusals(t *testing.T) {
	cases := []struct{ name, source, want string }{
		{
			name: "flag without callback",
			source: "import * as DZ from '{{mod}}';\n" +
				"export type TTable = DZ.{{Table}}<'t', {\n" +
				"  c: DZ.{{Int}}<{$defaultFn: true}>;\n" +
				"}>;\n" +
				"export const t = DZ.tableFromType<TTable>();\n",
			want: "no matching callback",
		},
		{
			name: "callback without flag",
			source: "import * as DZ from '{{mod}}';\n" +
				"export type TTable = DZ.{{Table}}<'t', {\n" +
				"  c: DZ.{{Int}};\n" +
				"}>;\n" +
				"export const t = DZ.tableFromType<TTable>({runtime: {c: {$defaultFn: () => 1}}});\n",
			want: "no matching $defaultFn flag",
		},
	}
	for _, testCase := range cases {
		eachDialect(t, testCase.name, func(t *testing.T, dialect drizzleDialect) {
			output, diags := convertDrizzleOne(t, dialect.src(testCase.source), convert.Options{Target: convert.TargetBuilders})
			expectRefusal(t, diags, output, testCase.want)
			if !strings.Contains(output, dialect.src("DZ.{{Table}}<'t', {")) {
				t.Fatalf("the refused declaration was rewritten:\n%s", output)
			}
		})
	}
}

// ── refusals ─────────────────────────────────────────────────────────────────

func TestDrizzle_RefusalsCNV009(t *testing.T) {
	cases := []struct{ name, source, want string }{
		{
			name: "$type override",
			source: "import {$type} from '@mionjs/drizzle-orm';\nimport * as DZ from '{{mod}}';\n" +
				"export const t = DZ.{{table}}('t', {c: DZ.{{text}}({$type: $type<'a' | 'b'>()})});\n",
			want: "prop $type",
		},
		{
			name: "references outside the file",
			source: "import {tableRef} from '@mionjs/drizzle-orm';\nimport * as DZ from '{{mod}}';\n" +
				"declare const p: any;\n" +
				"export const t = DZ.{{table}}('t', {pid: DZ.{{int}}({references: [() => tableRef(p, 'id')]})});\n",
			want: "not a drizzle table this declaration can see",
		},
		{
			name: "interpolated sql",
			source: "import {sql} from '@mionjs/drizzle-orm';\nimport * as DZ from '{{mod}}';\n" +
				"export const t = DZ.{{table}}('t', {c: DZ.{{int}}({default: [sql`${1} + 1`]})});\n",
			want: "argument is not a literal",
		},
		{
			name: "extraConfig index decorator",
			source: "import * as DZ from '{{mod}}';\n" +
				"export const t = DZ.{{table}}('t', {c: DZ.{{int}}()}, (self) => [DZ.index('i').on(self.c.desc())]);\n",
			want: "extraConfig",
		},
		{
			name: "non-literal default",
			source: "import * as DZ from '{{mod}}';\n" +
				"const v = 21;\n" +
				"export const t = DZ.{{table}}('t', {c: DZ.{{int}}({default: [v]})});\n",
			want: "argument is not a literal",
		},
		{
			name: "chained modifier",
			source: "import * as DZ from '{{mod}}';\n" +
				"export const t = DZ.{{table}}('t', {c: DZ.{{int}}().notNull()});\n",
			want: "chained .notNull()",
		},
	}
	for _, testCase := range cases {
		eachDialect(t, testCase.name, func(t *testing.T, dialect drizzleDialect) {
			output, diags := convertDrizzleOne(t, dialect.src(testCase.source), convert.Options{Target: convert.TargetType})
			expectRefusal(t, diags, output, testCase.want)
			// The REFUSED declaration (table 't') stays byte-untouched.
			if !strings.Contains(output, dialect.src("DZ.{{table}}('t', {")) {
				t.Fatalf("the refused declaration was rewritten:\n%s", output)
			}
		})
	}
}

// TestDrizzle_RefusalsNoTypeTwin pins that the columns WITHOUT a type twin, enum and custom, refuse loudly on
// both roads instead of failing silent, and the declaration stays byte-untouched.
func TestDrizzle_RefusalsNoTypeTwin(t *testing.T) {
	cases := []struct {
		name, source, keep, want string
		target                   convert.Target
	}{
		{
			name: "only mysql: mysqlEnum values array",
			source: "import * as DZ from '{{mod}}';\n" +
				"export const t = DZ.{{table}}('t', {role: DZ.mysqlEnum('role', ['admin', 'user'])});\n",
			keep: "DZ.{{table}}('t', {", want: `builder "mysqlEnum" takes a values array`, target: convert.TargetType,
		},
		{
			name: "only pg: pgEnum handle",
			source: "import * as DZ from '{{mod}}';\n" +
				"const role = DZ.pgEnum('role', ['admin', 'user']);\n" +
				"export const t = DZ.{{table}}('t', {role: role()});\n",
			keep: "DZ.{{table}}('t', {", want: "locally declared handle", target: convert.TargetType,
		},
		{
			name: "customType handle",
			source: "import * as DZ from '{{mod}}';\n" +
				"const custom = DZ.customType<{data: string}>({dataType: () => 'text'});\n" +
				"export const t = DZ.{{table}}('t', {c: custom()});\n",
			keep: "DZ.{{table}}('t', {", want: "locally declared handle", target: convert.TargetType,
		},
		{
			name: "only pg: enum column type",
			source: "import * as DZ from '{{mod}}';\n" +
				"export type TTable = DZ.{{Table}}<'t', {role: DZ.PgEnumCol<['admin', 'user']>}>;\n",
			keep: "DZ.{{Table}}<'t', {", want: "is a enum column, which has no type twin", target: convert.TargetBuilders,
		},
		{
			name: "only mysql: enum column type",
			source: "import * as DZ from '{{mod}}';\n" +
				"export type TTable = DZ.{{Table}}<'t', {role: DZ.MysqlEnumCol<['admin', 'user']>}>;\n",
			keep: "DZ.{{Table}}<'t', {", want: "is a enum column, which has no type twin", target: convert.TargetBuilders,
		},
		{
			name: "custom column type",
			source: "import * as DZ from '{{mod}}';\n" +
				"export type TTable = DZ.{{Table}}<'t', {c: DZ.CustomCol<string>}>;\n",
			keep: "DZ.{{Table}}<'t', {", want: "is a custom column, which has no type twin", target: convert.TargetBuilders,
		},
	}
	for _, testCase := range cases {
		eachDialect(t, testCase.name, func(t *testing.T, dialect drizzleDialect) {
			output, diags := convertDrizzleOne(t, dialect.src(testCase.source), convert.Options{Target: testCase.target})
			expectRefusal(t, diags, output, testCase.want)
			if !strings.Contains(output, dialect.src(testCase.keep)) {
				t.Fatalf("the refused declaration was rewritten:\n%s", output)
			}
		})
	}
}

// TestDrizzle_OnlySqliteIntKeepsItsOwnColumnType pins drizzle's `int`: it has its own column type rather than
// borrowing Integer's, so a converted table prints back as int() and not integer().
func TestDrizzle_OnlySqliteIntKeepsItsOwnColumnType(t *testing.T) {
	eachDialect(t, "only sqlite: int keeps its own column type", func(t *testing.T, dialect drizzleDialect) {
		source := "import * as DZ from '@mionjs/drizzle-orm-sqlite-core';\n" +
			"export const t = DZ.sqliteTable('t', {\n  n: DZ.int('n_col'),\n});\n" +
			"export type TTable = typeof t;\n"
		typeForm, buildersForm := roundTrip(t, source)
		expectContains(t, "int type form", typeForm, "  n: DZ.Int;\n}, [], {n: 'n_col'}>;")
		if buildersForm != source {
			t.Fatalf("int came back as something else:\n%s", buildersForm)
		}
	})
}

// ── fuzz ─────────────────────────────────────────────────────────────────────

// TestFuzz_DrizzleRoundTrip sweeps random tables over each dialect's vocabulary through
// builders→type→builders→type, pinning the same fixpoint oracle as the static round trips. Iterations ride
// MION_FUZZ_ITER like the atom sweep.
func TestFuzz_DrizzleRoundTrip(t *testing.T) {
	if testing.Short() {
		t.Skip("randomized sweep skipped under -short")
	}
	iterations := 6
	if raw := os.Getenv("MION_FUZZ_ITER"); raw != "" {
		parsed, parseErr := strconv.Atoi(raw)
		if parseErr != nil {
			t.Fatalf("MION_FUZZ_ITER: %v", parseErr)
		}
		iterations = parsed
	}
	baseSeed := entrySeed(t, "drizzlego")
	eachDialect(t, "round trip over the dialect vocabulary", func(t *testing.T, dialect drizzleDialect) {
		for iteration := 0; iteration < iterations; iteration++ {
			seed := baseSeed + int64(iteration)
			source := randomDrizzleBuildersFile(dialect, rand.New(rand.NewSource(seed)))
			leg1, diags := convertDrizzleOne(t, source, convert.Options{Target: convert.TargetType})
			failOnDiags(t, seed, source, diags)
			leg2, diags := convertDrizzleOne(t, leg1, convert.Options{Target: convert.TargetBuilders})
			failOnDiags(t, seed, leg1, diags)
			leg3, diags := convertDrizzleOne(t, leg2, convert.Options{Target: convert.TargetType})
			failOnDiags(t, seed, leg2, diags)
			if leg3 != leg1 {
				t.Fatalf("seed %d: type form not a fixpoint\n--- source ---\n%s\n--- leg1 ---\n%s\n--- leg3 ---\n%s", seed, source, leg1, leg3)
			}
			if leg2 != source {
				t.Fatalf("seed %d: the canonical builders source did not come back\n--- source ---\n%s\n--- leg2 ---\n%s", seed, source, leg2)
			}
		}
	})
}

func failOnDiags(t *testing.T, seed int64, source string, diags []convert.Diagnostic) {
	t.Helper()
	for _, diagnostic := range diags {
		t.Fatalf("seed %d: unexpected diagnostic %s [%s]: %s\n--- source ---\n%s", seed, diagnostic.Code, diagnostic.Decl, diagnostic.Message, source)
	}
}

// fuzzColumn is one draw of a dialect's vocabulary: the builder, its config props and the runtime-callback
// value its data type takes.
type fuzzColumn struct {
	fn, config, callbackValue string
	mods                      []string
}

// fuzzVocabularies are the builders each dialect's generator draws from, the same space the JS fuzz suites use.
var fuzzVocabularies = map[string][]func(rng *rand.Rand) fuzzColumn{
	"pg": {
		func(rng *rand.Rand) fuzzColumn {
			return fuzzColumn{fn: "varchar", config: fmt.Sprintf("length: %d", 1+rng.Intn(200)), callbackValue: "'rv'", mods: []string{"default: ['dflt']"}}
		},
		func(rng *rand.Rand) fuzzColumn {
			return fuzzColumn{fn: "integer", callbackValue: "7", mods: []string{fmt.Sprintf("default: [%d]", rng.Intn(100))}}
		},
		func(*rand.Rand) fuzzColumn {
			return fuzzColumn{fn: "uuid", callbackValue: "'00000000-0000-0000-0000-000000000000'", mods: []string{"defaultRandom: true"}}
		},
		func(*rand.Rand) fuzzColumn {
			return fuzzColumn{fn: "text", config: "enum: ['a', 'b', 'c']", callbackValue: "'a'"}
		},
		func(rng *rand.Rand) fuzzColumn {
			return fuzzColumn{fn: "boolean", callbackValue: "true", mods: []string{fmt.Sprintf("default: [%t]", rng.Intn(2) == 0)}}
		},
		func(*rand.Rand) fuzzColumn {
			return fuzzColumn{fn: "timestamp", config: "mode: 'string'", callbackValue: "'2026-01-01T00:00:00Z'", mods: []string{"defaultNow: true"}}
		},
		func(rng *rand.Rand) fuzzColumn {
			return fuzzColumn{fn: "numeric", config: fmt.Sprintf("precision: %d, scale: %d", 1+rng.Intn(12), 1+rng.Intn(4)), callbackValue: "'1.5'"}
		},
		func(*rand.Rand) fuzzColumn {
			return fuzzColumn{fn: "bigint", config: "mode: 'number'", callbackValue: "9"}
		},
		func(*rand.Rand) fuzzColumn { return fuzzColumn{fn: "smallint", callbackValue: "1"} },
	},
	"mysql": {
		func(rng *rand.Rand) fuzzColumn {
			return fuzzColumn{fn: "varchar", config: fmt.Sprintf("length: %d", 1+rng.Intn(200)), callbackValue: "'rv'", mods: []string{"default: ['dflt']"}}
		},
		func(rng *rand.Rand) fuzzColumn {
			return fuzzColumn{fn: "int", callbackValue: "7", mods: []string{fmt.Sprintf("default: [%d]", rng.Intn(100)), "autoincrement: true"}}
		},
		func(*rand.Rand) fuzzColumn {
			return fuzzColumn{fn: "int", config: "unsigned: true", callbackValue: "7"}
		},
		func(*rand.Rand) fuzzColumn {
			return fuzzColumn{fn: "text", config: "enum: ['a', 'b', 'c']", callbackValue: "'a'"}
		},
		func(rng *rand.Rand) fuzzColumn {
			return fuzzColumn{fn: "boolean", callbackValue: "true", mods: []string{fmt.Sprintf("default: [%t]", rng.Intn(2) == 0)}}
		},
		func(*rand.Rand) fuzzColumn {
			return fuzzColumn{fn: "timestamp", config: "mode: 'string'", callbackValue: "'2026-01-01 00:00:00'", mods: []string{"defaultNow: true", "onUpdateNow: true"}}
		},
		func(rng *rand.Rand) fuzzColumn {
			return fuzzColumn{fn: "decimal", config: fmt.Sprintf("precision: %d, scale: %d", 1+rng.Intn(12), 1+rng.Intn(4)), callbackValue: "'1.5'"}
		},
		func(*rand.Rand) fuzzColumn {
			return fuzzColumn{fn: "bigint", config: "mode: 'number'", callbackValue: "9"}
		},
		func(*rand.Rand) fuzzColumn { return fuzzColumn{fn: "tinyint", callbackValue: "1"} },
	},
	"sqlite": {
		func(rng *rand.Rand) fuzzColumn {
			return fuzzColumn{fn: "text", config: fmt.Sprintf("length: %d", 1+rng.Intn(200)), callbackValue: "'rv'", mods: []string{"default: ['dflt']"}}
		},
		func(rng *rand.Rand) fuzzColumn {
			return fuzzColumn{fn: "integer", callbackValue: "7", mods: []string{fmt.Sprintf("default: [%d]", rng.Intn(100))}}
		},
		func(*rand.Rand) fuzzColumn {
			return fuzzColumn{fn: "int", config: "mode: 'number'", callbackValue: "7"}
		},
		func(*rand.Rand) fuzzColumn {
			return fuzzColumn{fn: "text", config: "enum: ['a', 'b', 'c']", callbackValue: "'a'"}
		},
		func(*rand.Rand) fuzzColumn {
			return fuzzColumn{fn: "integer", config: "mode: 'boolean'", callbackValue: "true"}
		},
		func(*rand.Rand) fuzzColumn { return fuzzColumn{fn: "real", callbackValue: "1.5"} },
		func(*rand.Rand) fuzzColumn {
			return fuzzColumn{fn: "numeric", config: "mode: 'number'", callbackValue: "1.5"}
		},
		func(*rand.Rand) fuzzColumn {
			return fuzzColumn{fn: "blob", config: "mode: 'bigint'", callbackValue: "9n"}
		},
	},
}

// randomDrizzleBuildersFile renders 1-2 random tables over a dialect's vocabulary in the canonical builders
// layout, so the round trip must return it byte for byte.
func randomDrizzleBuildersFile(dialect drizzleDialect, rng *rand.Rand) string {
	vocabulary := fuzzVocabularies[dialect.name]
	tableCount := 1 + rng.Intn(2)
	usesRef := tableCount == 2 && rng.Intn(2) == 0
	var out strings.Builder
	if usesRef {
		out.WriteString("import {tableRef} from '@mionjs/drizzle-orm';\n")
	}
	out.WriteString(dialect.src("import * as DZ from '{{mod}}';\n"))
	for tableIndex := 0; tableIndex < tableCount; tableIndex++ {
		columnCount := 1 + rng.Intn(5)
		var columns []string
		for i := 0; i < columnCount; i++ {
			column := vocabulary[rng.Intn(len(vocabulary))](rng)
			var props []string
			if column.config != "" {
				props = append(props, column.config)
			}
			for _, mod := range column.mods {
				if rng.Intn(2) == 0 {
					props = append(props, mod)
				}
			}
			if rng.Intn(2) == 0 {
				props = append(props, "notNull: true")
			}
			if rng.Intn(4) == 0 {
				props = append(props, fmt.Sprintf("unique: ['uq_c%d']", i))
			}
			if rng.Intn(4) == 0 {
				method := []string{"$default", "$defaultFn", "$onUpdate", "$onUpdateFn"}[rng.Intn(4)]
				props = append(props, method+": [() => "+column.callbackValue+"]")
			}
			if i == 0 && rng.Intn(3) == 0 {
				props = append(props, "primaryKey: true")
			}
			var args []string
			if rng.Intn(3) == 0 {
				args = append(args, fmt.Sprintf("'c%d_db'", i))
			}
			if len(props) > 0 {
				args = append(args, "{"+strings.Join(props, ", ")+"}")
			}
			columns = append(columns, fmt.Sprintf("  col_%d: DZ.%s(%s),", i, column.fn, strings.Join(args, ", ")))
		}
		// A reference onto the first table (col_0 always exists): the type form carries it through the
		// emitted tables option and names the first table's derived type.
		if tableIndex == 1 && usesRef {
			columns = append(columns, dialect.src("  ref_pid: DZ.{{int}}({references: [() => tableRef(table0, 'col_0')]}),"))
		}
		extras := ""
		if rng.Intn(2) == 0 {
			var entries []string
			if rng.Intn(2) == 0 {
				entries = append(entries, fmt.Sprintf("  DZ.index('idx_%d').on(t.col_0),", tableIndex))
			}
			if rng.Intn(2) == 0 {
				entries = append(entries, fmt.Sprintf("  DZ.unique('uqx_%d').on(t.col_0),", tableIndex))
			}
			if len(entries) > 0 {
				extras = ", (t) => [\n" + strings.Join(entries, "\n") + "\n]"
			}
		}
		fmt.Fprintf(&out, "export const table%d = DZ.%s('t_%d', {\n%s\n}%s);\nexport type Table%d = typeof table%d;\n",
			tableIndex, dialect.fill["table"], tableIndex, strings.Join(columns, "\n"), extras, tableIndex, tableIndex)
	}
	return out.String()
}
