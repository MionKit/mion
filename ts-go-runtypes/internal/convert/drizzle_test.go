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
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/convert"
	"github.com/mionkit/ts-runtypes/internal/jsengine"
	"github.com/mionkit/ts-runtypes/internal/testfixtures"
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

const drizzleHeader = "import * as DB from '@mionjs/drizzle-orm-pg-core';\n"

const drizzleBuildersSource = drizzleHeader +
	"export const users = DB.pgTable('users', {\n" +
	"  id: DB.uuid('id').primaryKey().defaultRandom(),\n" +
	"  name: DB.varchar('name', {length: 100}).notNull(),\n" +
	"  age: DB.integer('age').notNull().default(21),\n" +
	"  bio: DB.varchar('bio', {length: 500}),\n" +
	"  note: DB.varchar(),\n" +
	"});\n" +
	"export type UsersTable = typeof users;\n"

const drizzleTypeSource = drizzleHeader +
	"export type UsersTable = DB.PgTable<'users', {\n" +
	"  id: DB.Uuid<'id'> & DB.PrimaryKey & DB.DefaultRandom;\n" +
	"  name: DB.Varchar<'name', {length: 100}> & DB.NotNull;\n" +
	"  age: DB.Integer<'age'> & DB.NotNull & DB.Default<21>;\n" +
	"  bio: DB.Varchar<'bio', {length: 500}>;\n" +
	"  note: DB.Varchar;\n" +
	"}>;\n" +
	"export const users = DB.tableFromType<UsersTable>();\n"

func TestDrizzle_BuildersToType(t *testing.T) {
	output, diags := convertDrizzleOne(t, drizzleBuildersSource, convert.Options{Target: convert.TargetType})
	expectNoDiags(t, diags)
	for _, want := range []string{
		"export type UsersTable = DB.PgTable<'users', {",
		"  id: DB.Uuid<'id'> & DB.PrimaryKey & DB.DefaultRandom;",
		"  name: DB.Varchar<'name', {length: 100}> & DB.NotNull;",
		"  age: DB.Integer<'age'> & DB.NotNull & DB.Default<21>;",
		"  bio: DB.Varchar<'bio', {length: 500}>;",
		"  note: DB.Varchar;",
		"export const users = DB.tableFromType<UsersTable>();",
	} {
		if !strings.Contains(output, want) {
			t.Fatalf("builders→type output missing %q:\n%s", want, output)
		}
	}
	if strings.Contains(output, "typeof users") {
		t.Fatalf("builders→type left the typeof alias behind:\n%s", output)
	}
	// The marker form needs no getRunType: neither the call nor an import.
	if strings.Contains(output, "getRunType") {
		t.Fatalf("builders→type emitted a getRunType reference:\n%s", output)
	}
}

func TestDrizzle_TypeToBuilders(t *testing.T) {
	output, diags := convertDrizzleOne(t, drizzleTypeSource, convert.Options{Target: convert.TargetBuilders})
	expectNoDiags(t, diags)
	for _, want := range []string{
		"export const users = DB.pgTable('users', {",
		"  id: DB.uuid('id').primaryKey().defaultRandom(),",
		"  name: DB.varchar('name', {length: 100}).notNull(),",
		"  age: DB.integer('age').notNull().default(21),",
		"  bio: DB.varchar('bio', {length: 500}),",
		"  note: DB.varchar(),",
		"export type UsersTable = typeof users;",
	} {
		if !strings.Contains(output, want) {
			t.Fatalf("type→builders output missing %q:\n%s", want, output)
		}
	}
	if strings.Contains(output, "tableFromType") {
		t.Fatalf("type→builders left the tableFromType handle behind:\n%s", output)
	}
}

// TestDrizzle_DerivedPairNames pins the Table naming rule for invented names:
// a table const derives a Table-suffixed type (users → UsersTable) and a
// table type derives an RT-free const (UsersTable → users) — the RT-suffix
// derivation stays reserved for actual runtype pairs.
// ── named imports ────────────────────────────────────────────────────────────
//
// The spelling a file was written in is the spelling it keeps. Drizzle's own
// code, and everything `ts-runtypes drizzle-migrate` emits from it, imports the
// dialect package's NAMES; the namespace form above is the other half of the
// same rule, not the only one that converts.

const drizzleNamedHeader = "import {integer, pgTable, uuid, varchar} from '@mionjs/drizzle-orm-pg-core';\n"

const drizzleNamedBuildersSource = drizzleNamedHeader +
	"export const users = pgTable('users', {\n" +
	"  id: uuid('id').primaryKey().defaultRandom(),\n" +
	"  name: varchar('name', {length: 100}).notNull(),\n" +
	"  age: integer('age').notNull().default(21),\n" +
	"});\n" +
	"export type UsersTable = typeof users;\n"

func TestDrizzle_NamedImportsBuildersToType(t *testing.T) {
	output, diags := convertDrizzleOne(t, drizzleNamedBuildersSource, convert.Options{Target: convert.TargetType})
	expectNoDiags(t, diags)
	for _, want := range []string{
		"export type UsersTable = PgTable<'users', {",
		"  id: Uuid<'id'> & PrimaryKey & DefaultRandom;",
		"  name: Varchar<'name', {length: 100}> & NotNull;",
		"  age: Integer<'age'> & NotNull & Default<21>;",
		"export const users = tableFromType<UsersTable>();",
	} {
		if !strings.Contains(output, want) {
			t.Fatalf("named builders→type output missing %q:\n%s", want, output)
		}
	}
	// The type names arrive as type-only bindings, the bridge as a value one.
	if !strings.Contains(output, "type PgTable") || !strings.Contains(output, "type Uuid") {
		t.Fatalf("named builders→type did not import the type names:\n%s", output)
	}
	if strings.Contains(output, "type tableFromType") {
		t.Fatalf("the bridge is CALLED, so it cannot come in as `import type`:\n%s", output)
	}
	// The builders the file no longer calls are gone.
	for _, gone := range []string{"uuid,", "varchar,", " integer,"} {
		if strings.Contains(output, gone) {
			t.Fatalf("named builders→type kept the now-unused builder import %q:\n%s", gone, output)
		}
	}
	if strings.Contains(output, "DB.") {
		t.Fatalf("named builders→type invented a namespace spelling:\n%s", output)
	}
}

func TestDrizzle_NamedImportsRoundTripFixpoint(t *testing.T) {
	typeForm, diags := convertDrizzleOne(t, drizzleNamedBuildersSource, convert.Options{Target: convert.TargetType})
	expectNoDiags(t, diags)
	buildersForm, diags := convertDrizzleOne(t, typeForm, convert.Options{Target: convert.TargetBuilders})
	expectNoDiags(t, diags)
	if buildersForm != drizzleNamedBuildersSource {
		t.Fatalf("named round trip did not return the original:\nwant:\n%s\ngot:\n%s", drizzleNamedBuildersSource, buildersForm)
	}
	again, diags := convertDrizzleOne(t, typeForm, convert.Options{Target: convert.TargetType})
	expectNoDiags(t, diags)
	if again != typeForm {
		t.Fatalf("named type form is not a byte fixpoint:\nwant:\n%s\ngot:\n%s", typeForm, again)
	}
}

// TestDrizzle_NamedImportsRuntimeModifiers is the runtime-callback half under
// the named spelling: the callback text moves into options.runtime and back,
// unchanged, and the type carries only the marker.
func TestDrizzle_NamedImportsRuntimeModifiers(t *testing.T) {
	source := "import {pgTable, uuid, varchar} from '@mionjs/drizzle-orm-pg-core';\n" +
		"export const jobs = pgTable('jobs', {\n" +
		"  id: uuid('id').primaryKey(),\n" +
		"  slug: varchar('slug', {length: 80}).notNull().$defaultFn(() => 'slug-1'),\n" +
		"});\n" +
		"export type JobsTable = typeof jobs;\n"
	typeForm, diags := convertDrizzleOne(t, source, convert.Options{Target: convert.TargetType})
	expectNoDiags(t, diags)
	for _, want := range []string{
		"  slug: Varchar<'slug', {length: 80}> & NotNull & $DefaultFn;",
		"export const jobs = tableFromType<JobsTable>({runtime: {slug: {$defaultFn: () => 'slug-1'}}});",
	} {
		if !strings.Contains(typeForm, want) {
			t.Fatalf("named runtime-modifier type form missing %q:\n%s", want, typeForm)
		}
	}
	buildersForm, diags := convertDrizzleOne(t, typeForm, convert.Options{Target: convert.TargetBuilders})
	expectNoDiags(t, diags)
	if buildersForm != source {
		t.Fatalf("named runtime-modifier round trip did not return the original:\nwant:\n%s\ngot:\n%s", source, buildersForm)
	}
}

// TestDrizzle_NamedImportsAliasOnCollision covers the file the drizzle-e2e lane
// actually feeds the arm: drizzle's OWN names live beside ours in the same
// file, so a name the printed output needs can already be bound to something
// else. It comes in under a free local rather than colliding.
func TestDrizzle_NamedImportsAliasOnCollision(t *testing.T) {
	source := "import type {PgTable} from 'drizzle-orm/pg-core';\n" +
		"import {pgTable, uuid} from '@mionjs/drizzle-orm-pg-core';\n" +
		"export const users = pgTable('users', {\n" +
		"  id: uuid('id').primaryKey(),\n" +
		"});\n" +
		"export type UsersTable = typeof users;\n" +
		"export type Held = PgTable<any, any, any>;\n"
	output, diags := convertDrizzleOne(t, source, convert.Options{Target: convert.TargetType})
	expectNoDiags(t, diags)
	if !strings.Contains(output, "export type Held = PgTable<any, any, any>;") {
		t.Fatalf("the drizzle-owned PgTable binding was disturbed:\n%s", output)
	}
	if !strings.Contains(output, "export type UsersTable = PgTable2<'users', {") {
		t.Fatalf("ours did not take a free local beside drizzle's:\n%s", output)
	}
	if !strings.Contains(output, "PgTable as PgTable2") {
		t.Fatalf("the aliased binding was not imported:\n%s", output)
	}
}

func TestDrizzle_DerivedPairNames(t *testing.T) {
	buildersOnly := drizzleHeader +
		"export const users = DB.pgTable('users', {id: DB.integer('id').primaryKey()});\n"
	typeForm, diags := convertDrizzleOne(t, buildersOnly, convert.Options{Target: convert.TargetType})
	expectNoDiags(t, diags)
	for _, want := range []string{
		"export type UsersTable = DB.PgTable<'users', {",
		"export const users = DB.tableFromType<UsersTable>();",
	} {
		if !strings.Contains(typeForm, want) {
			t.Fatalf("derived type name missing %q:\n%s", want, typeForm)
		}
	}

	typeOnly := drizzleHeader +
		"export type UsersTable = DB.PgTable<'users', {\n" +
		"  id: DB.Integer<'id'> & DB.PrimaryKey;\n" +
		"}>;\n"
	buildersForm, diags := convertDrizzleOne(t, typeOnly, convert.Options{Target: convert.TargetBuilders})
	expectNoDiags(t, diags)
	for _, want := range []string{
		"export const users = DB.pgTable('users', {",
		"export type UsersTable = typeof users;",
	} {
		if !strings.Contains(buildersForm, want) {
			t.Fatalf("derived const name missing %q:\n%s", want, buildersForm)
		}
	}
	if strings.Contains(buildersForm, "usersRT") || strings.Contains(typeForm, "usersRT") {
		t.Fatalf("drizzle derivation produced an RT-suffixed const:\n%s\n%s", typeForm, buildersForm)
	}
}

// TestDrizzle_BackwardReferenceRefusal pins the eager-tables-option guard: a
// child table declared BEFORE its referenced parent is legal on the builders
// road (the closure is lazy) but has no valid type form, so it refuses with
// CNV009 and stays byte-untouched.
// TestDrizzle_ForwardReferenceThunk covers the ordering drizzle's own schemas
// are written in: `references: () => parents.id` is lazy, so the parent
// routinely sits FURTHER DOWN the file. A bare value in the tables option would
// be read before that declaration exists, so a forward reference rides a thunk
// — and a backward one keeps the plain spelling it always had.
func TestDrizzle_ForwardReferenceThunk(t *testing.T) {
	source := drizzleHeader +
		"export const children = DB.pgTable('children', {\n" +
		"  pid: DB.integer('pid').references(() => parents.id),\n" +
		"});\n" +
		"export const parents = DB.pgTable('parents', {\n" +
		"  id: DB.integer('id').primaryKey(),\n" +
		"});\n"
	typeForm, diags := convertDrizzleOne(t, source, convert.Options{Target: convert.TargetType})
	expectNoDiags(t, diags)
	if !strings.Contains(typeForm, "export const children = DB.tableFromType<ChildrenTable>({tables: {parents: () => parents}});") {
		t.Fatalf("the forward reference did not ride a thunk:\n%s", typeForm)
	}
	if !strings.Contains(typeForm, "export const parents = DB.tableFromType<ParentsTable>();") {
		t.Fatalf("the parent declaration did not convert:\n%s", typeForm)
	}
	buildersForm, diags := convertDrizzleOne(t, typeForm, convert.Options{Target: convert.TargetBuilders})
	expectNoDiags(t, diags)
	// Back on the builders road the reference is a lazy callback again, so the
	// declaration order the file was written in still stands.
	if !strings.Contains(buildersForm, "  pid: DB.integer('pid').references(() => parents.id),") {
		t.Fatalf("the forward reference did not come back:\n%s", buildersForm)
	}
	if strings.Index(buildersForm, "'children'") > strings.Index(buildersForm, "'parents'") {
		t.Fatalf("the round trip reordered the declarations:\n%s", buildersForm)
	}
	again, diags := convertDrizzleOne(t, typeForm, convert.Options{Target: convert.TargetType})
	expectNoDiags(t, diags)
	if again != typeForm {
		t.Fatalf("the thunk spelling is not a byte fixpoint:\nwant:\n%s\ngot:\n%s", typeForm, again)
	}
}

// TestDrizzle_BackwardReferenceStaysPlain pins the other half: nothing about
// the thunk leaks into a file whose reference target is already declared.
func TestDrizzle_BackwardReferenceStaysPlain(t *testing.T) {
	source := drizzleHeader +
		"export const parents = DB.pgTable('parents', {\n" +
		"  id: DB.integer('id').primaryKey(),\n" +
		"});\n" +
		"export const children = DB.pgTable('children', {\n" +
		"  pid: DB.integer('pid').references(() => parents.id),\n" +
		"});\n"
	typeForm, diags := convertDrizzleOne(t, source, convert.Options{Target: convert.TargetType})
	expectNoDiags(t, diags)
	if !strings.Contains(typeForm, "export const children = DB.tableFromType<ChildrenTable>({tables: {parents: parents}});") {
		t.Fatalf("a backward reference should stay the plain value:\n%s", typeForm)
	}
}

// TestDrizzle_RoundTripFixpoint drives builders→type→builders→type and pins
// the canonical fixpoint: leg2 (type) and leg4 (type) byte-equal, leg3
// (builders) reconverts to itself.
func TestDrizzle_RoundTripFixpoint(t *testing.T) {
	leg1, diags := convertDrizzleOne(t, drizzleBuildersSource, convert.Options{Target: convert.TargetType})
	expectNoDiags(t, diags)
	leg2, diags := convertDrizzleOne(t, leg1, convert.Options{Target: convert.TargetBuilders})
	expectNoDiags(t, diags)
	leg3, diags := convertDrizzleOne(t, leg2, convert.Options{Target: convert.TargetType})
	expectNoDiags(t, diags)
	if leg3 != leg1 {
		t.Fatalf("type form is not a fixpoint:\n--- first ---\n%s\n--- second ---\n%s", leg1, leg3)
	}
	same, diags := convertDrizzleOne(t, leg1, convert.Options{Target: convert.TargetType})
	expectNoDiags(t, diags)
	if same != leg1 {
		t.Fatalf("re-converting the type form is not a byte no-op:\n%s", same)
	}
}

const drizzleMysqlHeader = "import * as DB from '@mionjs/drizzle-orm-mysql-core';\n"

const drizzleMysqlBuildersSource = drizzleMysqlHeader +
	"export const devices = DB.mysqlTable('devices', {\n" +
	"  id: DB.serial('id').primaryKey(),\n" +
	"  name: DB.varchar('name', {length: 100}).notNull(),\n" +
	"  views: DB.int('views', {unsigned: true}).notNull(),\n" +
	"  plan: DB.text('plan', {enum: ['free', 'pro']}).notNull(),\n" +
	"});\n" +
	"export type DevicesTable = typeof devices;\n"

// TestDrizzle_MysqlRoundTripFixpoint drives a mysql builders table through
// builders→type→builders→type, pinning the mysqlTable → MysqlTable pair and
// the same fixpoint oracle as the pg round trip.
func TestDrizzle_MysqlRoundTripFixpoint(t *testing.T) {
	leg1, diags := convertDrizzleOne(t, drizzleMysqlBuildersSource, convert.Options{Target: convert.TargetType})
	expectNoDiags(t, diags)
	for _, want := range []string{
		"export type DevicesTable = DB.MysqlTable<'devices', {",
		"  id: DB.Serial<'id'> & DB.PrimaryKey;",
		"  name: DB.Varchar<'name', {length: 100}> & DB.NotNull;",
		"  views: DB.Int<'views', {unsigned: true}> & DB.NotNull;",
		"  plan: DB.Text<'plan', {enum: ['free', 'pro']}> & DB.NotNull;",
		"export const devices = DB.tableFromType<DevicesTable>();",
	} {
		if !strings.Contains(leg1, want) {
			t.Fatalf("mysql builders→type output missing %q:\n%s", want, leg1)
		}
	}
	leg2, diags := convertDrizzleOne(t, leg1, convert.Options{Target: convert.TargetBuilders})
	expectNoDiags(t, diags)
	for _, want := range []string{
		"export const devices = DB.mysqlTable('devices', {",
		"  id: DB.serial('id').primaryKey(),",
		"  views: DB.int('views', {unsigned: true}).notNull(),",
		"  plan: DB.text('plan', {enum: ['free', 'pro']}).notNull(),",
	} {
		if !strings.Contains(leg2, want) {
			t.Fatalf("mysql type→builders output missing %q:\n%s", want, leg2)
		}
	}
	leg3, diags := convertDrizzleOne(t, leg2, convert.Options{Target: convert.TargetType})
	expectNoDiags(t, diags)
	if leg3 != leg1 {
		t.Fatalf("mysql type form is not a fixpoint:\n--- first ---\n%s\n--- second ---\n%s", leg1, leg3)
	}
}

func TestDrizzle_RefusalsCNV009(t *testing.T) {
	cases := map[string]string{
		"$type override": drizzleHeader +
			"export const t = DB.pgTable('t', {c: DB.jsonb('c').$type<{a: number}>()});\n",
		"references outside the file": drizzleHeader +
			"declare const p: {id: number};\n" +
			"export const t = DB.pgTable('t', {pid: DB.integer('pid').references(() => p.id)});\n",
		"interpolated sql": "import {sql} from '@mionjs/drizzle-orm';\n" + drizzleHeader +
			"export const t = DB.pgTable('t', {c: DB.integer('c').default(sql`${1} + 1`)});\n",
		"extraConfig index decorator": drizzleHeader +
			"export const t = DB.pgTable('t', {c: DB.integer('c')}, (self) => [DB.index('i').on(self.c.desc())]);\n",
		"non-literal default": drizzleHeader +
			"const v = 21;\n" +
			"export const t = DB.pgTable('t', {c: DB.integer('c').default(v)});\n",
	}
	for label, source := range cases {
		t.Run(label, func(t *testing.T) {
			output, diags := convertDrizzleOne(t, source, convert.Options{Target: convert.TargetType})
			var found bool
			for _, diagnostic := range diags {
				if diagnostic.Code == convert.CodeDrizzleUnsupported {
					found = true
				}
			}
			if !found {
				t.Fatalf("%s: expected a CNV009 refusal, got diags %v\noutput:\n%s", label, diags, output)
			}
			// The REFUSED declaration (table 't') stays byte-untouched; sibling
			// tables in the same file may legitimately convert.
			if !strings.Contains(output, "DB.pgTable('t', {") {
				t.Fatalf("%s: the refused declaration was rewritten:\n%s", label, output)
			}
		})
	}
}

// TestDrizzle_RefusalsNoTypeTwin pins that builders WITHOUT a type twin refuse
// loudly instead of failing silent: mysqlEnum's values-array arg trips the
// config-shape gate; sqlite's int (the builders-only alias of integer) trips
// the vocabulary gate naming the missing "Int" type. Either way the
// declaration stays byte-untouched.
func TestDrizzle_RefusalsNoTypeTwin(t *testing.T) {
	cases := map[string]struct {
		source        string
		keep          string
		wantInMessage string
	}{
		"mysqlEnum values array": {
			source: drizzleMysqlHeader +
				"export const t = DB.mysqlTable('t', {role: DB.mysqlEnum('role', ['admin', 'user'])});\n",
			keep:          "DB.mysqlTable('t', {",
			wantInMessage: `builder "mysqlEnum"`,
		},
		"sqlite int alias of integer": {
			source: "import * as DB from '@mionjs/drizzle-orm-sqlite-core';\n" +
				"export const t = DB.sqliteTable('t', {n: DB.int('n')});\n",
			keep:          "DB.sqliteTable('t', {",
			wantInMessage: `no column type "Int"`,
		},
	}
	for label, testCase := range cases {
		t.Run(label, func(t *testing.T) {
			output, diags := convertDrizzleOne(t, testCase.source, convert.Options{Target: convert.TargetType})
			var found bool
			for _, diagnostic := range diags {
				if diagnostic.Code == convert.CodeDrizzleUnsupported && strings.Contains(diagnostic.Message, testCase.wantInMessage) {
					found = true
				}
			}
			if !found {
				t.Fatalf("%s: expected a CNV009 refusal containing %q, got diags %v\noutput:\n%s", label, testCase.wantInMessage, diags, output)
			}
			if !strings.Contains(output, testCase.keep) {
				t.Fatalf("%s: the refused declaration was rewritten:\n%s", label, output)
			}
		})
	}
}

// Deliberately legacy-named (parentsRT/childrenRT): existing names are always
// preserved by conversion, whatever their suffix — this fixture doubles as
// that coverage.
const drizzleRefSqlSource = "import {sql} from '@mionjs/drizzle-orm';\n" + drizzleHeader +
	"export const parentsRT = DB.pgTable('parents', {\n" +
	"  id: DB.integer('id').primaryKey(),\n" +
	"});\n" +
	"export type ParentsRT = typeof parentsRT;\n" +
	"export const childrenRT = DB.pgTable('children', {\n" +
	"  pid: DB.integer('pid').references(() => parentsRT.id, {onDelete: 'cascade'}).notNull(),\n" +
	"  createdAt: DB.timestamp('created_at').default(sql`now()`),\n" +
	"});\n" +
	"export type ChildrenRT = typeof childrenRT;\n"

// TestDrizzle_ReferencesAndSql pins the references + literal-sql spellings
// through both directions and the fixpoint.
func TestDrizzle_ReferencesAndSql(t *testing.T) {
	typeForm, diags := convertDrizzleOne(t, drizzleRefSqlSource, convert.Options{Target: convert.TargetType})
	expectNoDiags(t, diags)
	for _, want := range []string{
		"pid: DB.Integer<'pid'> & DB.References<'parents', 'id', {onDelete: 'cascade'}> & DB.NotNull;",
		"createdAt: DB.Timestamp<'created_at'> & DB.Default<DB.Sql<'now()'>>;",
		// The referenced table rides the emitted tables option (the runtime
		// bridge resolves References through it).
		"export const parentsRT = DB.tableFromType<ParentsRT>();",
		"export const childrenRT = DB.tableFromType<ChildrenRT>({tables: {parents: parentsRT}});",
	} {
		if !strings.Contains(typeForm, want) {
			t.Fatalf("builders→type missing %q:\n%s", want, typeForm)
		}
	}
	buildersForm, diags := convertDrizzleOne(t, typeForm, convert.Options{Target: convert.TargetBuilders})
	expectNoDiags(t, diags)
	for _, want := range []string{
		".references(() => parentsRT.id, {onDelete: 'cascade'}).notNull(),",
		".default(sql`now()`),",
	} {
		if !strings.Contains(buildersForm, want) {
			t.Fatalf("type→builders missing %q:\n%s", want, buildersForm)
		}
	}
	typeAgain, diags := convertDrizzleOne(t, buildersForm, convert.Options{Target: convert.TargetType})
	expectNoDiags(t, diags)
	if typeAgain != typeForm {
		t.Fatalf("references/sql type form not a fixpoint:\n--- first ---\n%s\n--- second ---\n%s", typeForm, typeAgain)
	}
}

const drizzleExtrasSource = "import {sql} from '@mionjs/drizzle-orm';\n" + drizzleHeader +
	"export const extras = DB.pgTable('extras_t', {\n" +
	"  a: DB.integer('a').notNull(),\n" +
	"  b: DB.varchar('b', {length: 10}),\n" +
	"}, (t) => [\n" +
	"  DB.index('idx_a').on(t.a),\n" +
	"  DB.uniqueIndex('uidx_b').on(t.b),\n" +
	"  DB.unique('uq_ab').on(t.a, t.b),\n" +
	"  DB.check('chk_a', sql`a >= 0`),\n" +
	"]);\n" +
	"export type ExtrasTable = typeof extras;\n"

// TestDrizzle_TableExtras pins the extraConfig road through both directions
// and the fixpoint.
func TestDrizzle_TableExtras(t *testing.T) {
	typeForm, diags := convertDrizzleOne(t, drizzleExtrasSource, convert.Options{Target: convert.TargetType})
	expectNoDiags(t, diags)
	for _, want := range []string{
		"}, [\n",
		"  DB.TableEntry<'index', ['idx_a'], {on: [{col: 'a'}]}>,",
		"  DB.TableEntry<'uniqueIndex', ['uidx_b'], {on: [{col: 'b'}]}>,",
		"  DB.TableEntry<'unique', ['uq_ab'], {on: [{col: 'a'}, {col: 'b'}]}>,",
		"  DB.TableEntry<'check', ['chk_a', DB.Sql<'a >= 0'>]>,",
	} {
		if !strings.Contains(typeForm, want) {
			t.Fatalf("builders→type extras missing %q:\n%s", want, typeForm)
		}
	}
	buildersForm, diags := convertDrizzleOne(t, typeForm, convert.Options{Target: convert.TargetBuilders})
	expectNoDiags(t, diags)
	for _, want := range []string{
		", (t) => [\n",
		"  DB.index('idx_a').on(t.a),",
		"  DB.unique('uq_ab').on(t.a, t.b),",
		"  DB.check('chk_a', sql`a >= 0`),",
	} {
		if !strings.Contains(buildersForm, want) {
			t.Fatalf("type→builders extras missing %q:\n%s", want, buildersForm)
		}
	}
	typeAgain, diags := convertDrizzleOne(t, buildersForm, convert.Options{Target: convert.TargetType})
	expectNoDiags(t, diags)
	if typeAgain != typeForm {
		t.Fatalf("extras type form not a fixpoint:\n--- first ---\n%s\n--- second ---\n%s", typeForm, typeAgain)
	}
}

const drizzleRuntimeSource = drizzleHeader +
	"export const jobs = DB.pgTable('jobs', {\n" +
	"  id: DB.uuid('id').primaryKey(),\n" +
	"  slug: DB.varchar('slug', {length: 80}).notNull().$defaultFn(() => 'slug-' + Math.random()),\n" +
	"  attempts: DB.integer('attempts').$default(() => 0),\n" +
	"  touchedAt: DB.timestamp('touched_at', {mode: 'string'}).$onUpdate(() => new Date().toISOString()),\n" +
	"  counter: DB.integer('counter').$onUpdateFn(() => {\n" +
	"    const next = 1 + 1;\n" +
	"    return next;\n" +
	"  }),\n" +
	"});\n" +
	"export type JobsTable = typeof jobs;\n"

// TestDrizzle_RuntimeModifiers pins the runtime-callback modifiers through
// both directions: the type form carries the flag markers plus the callbacks
// VERBATIM in options.runtime (alias preserved: $default vs $defaultFn,
// multi-line bodies included), and the whole thing is a byte fixpoint.
func TestDrizzle_RuntimeModifiers(t *testing.T) {
	typeForm, diags := convertDrizzleOne(t, drizzleRuntimeSource, convert.Options{Target: convert.TargetType})
	expectNoDiags(t, diags)
	for _, want := range []string{
		"  slug: DB.Varchar<'slug', {length: 80}> & DB.NotNull & DB.$DefaultFn;",
		"  attempts: DB.Integer<'attempts'> & DB.$Default;",
		"  touchedAt: DB.Timestamp<'touched_at', {mode: 'string'}> & DB.$OnUpdate;",
		"  counter: DB.Integer<'counter'> & DB.$OnUpdateFn;",
		"export const jobs = DB.tableFromType<JobsTable>({runtime: {" +
			"slug: {$defaultFn: () => 'slug-' + Math.random()}, " +
			"attempts: {$default: () => 0}, " +
			"touchedAt: {$onUpdate: () => new Date().toISOString()}, " +
			"counter: {$onUpdateFn: () => {\n" +
			"    const next = 1 + 1;\n" +
			"    return next;\n" +
			"  }}}});",
	} {
		if !strings.Contains(typeForm, want) {
			t.Fatalf("builders→type runtime missing %q:\n%s", want, typeForm)
		}
	}
	buildersForm, diags := convertDrizzleOne(t, typeForm, convert.Options{Target: convert.TargetBuilders})
	expectNoDiags(t, diags)
	for _, want := range []string{
		".notNull().$defaultFn(() => 'slug-' + Math.random()),",
		".$default(() => 0),",
		".$onUpdate(() => new Date().toISOString()),",
		".$onUpdateFn(() => {\n    const next = 1 + 1;\n    return next;\n  }),",
	} {
		if !strings.Contains(buildersForm, want) {
			t.Fatalf("type→builders runtime missing %q:\n%s", want, buildersForm)
		}
	}
	typeAgain, diags := convertDrizzleOne(t, buildersForm, convert.Options{Target: convert.TargetType})
	expectNoDiags(t, diags)
	if typeAgain != typeForm {
		t.Fatalf("runtime type form not a fixpoint:\n--- first ---\n%s\n--- second ---\n%s", typeForm, typeAgain)
	}
}

// TestDrizzle_RuntimeMismatchRefusals pins the two-way marker↔callback
// validation on the type→builders direction.
func TestDrizzle_RuntimeMismatchRefusals(t *testing.T) {
	cases := map[string]struct {
		source        string
		wantInMessage string
	}{
		"marker without callback": {
			source: drizzleHeader +
				"export type TTable = DB.PgTable<'t', {\n" +
				"  c: DB.Integer<'c'> & DB.$DefaultFn;\n" +
				"}>;\n" +
				"export const t = DB.tableFromType<TTable>();\n",
			wantInMessage: "no matching callback",
		},
		"callback without marker": {
			source: drizzleHeader +
				"export type TTable = DB.PgTable<'t', {\n" +
				"  c: DB.Integer<'c'>;\n" +
				"}>;\n" +
				"export const t = DB.tableFromType<TTable>({runtime: {c: {$defaultFn: () => 1}}});\n",
			wantInMessage: "no matching $defaultFn marker",
		},
	}
	for label, testCase := range cases {
		t.Run(label, func(t *testing.T) {
			output, diags := convertDrizzleOne(t, testCase.source, convert.Options{Target: convert.TargetBuilders})
			var found bool
			for _, diagnostic := range diags {
				if diagnostic.Code == convert.CodeDrizzleUnsupported && strings.Contains(diagnostic.Message, testCase.wantInMessage) {
					found = true
				}
			}
			if !found {
				t.Fatalf("%s: expected a CNV009 refusal containing %q, got %v\noutput:\n%s", label, testCase.wantInMessage, diags, output)
			}
			if !strings.Contains(output, "DB.PgTable<'t', {") {
				t.Fatalf("%s: the refused declaration was rewritten:\n%s", label, output)
			}
		})
	}
}

// TestFuzz_DrizzleRoundTrip sweeps random slice-vocabulary tables through
// builders→type→builders→type, pinning the same fixpoint oracle as the static
// round-trip test. Iterations ride RT_FUZZ_ITER like the atom sweep.
func TestFuzz_DrizzleRoundTrip(t *testing.T) {
	if testing.Short() {
		t.Skip("randomized sweep skipped under -short")
	}
	iterations := 6
	if raw := os.Getenv("RT_FUZZ_ITER"); raw != "" {
		parsed, parseErr := strconv.Atoi(raw)
		if parseErr != nil {
			t.Fatalf("RT_FUZZ_ITER: %v", parseErr)
		}
		iterations = parsed
	}
	baseSeed := entrySeed(t, "drizzlego")
	for iteration := 0; iteration < iterations; iteration++ {
		seed := baseSeed + int64(iteration)
		source := randomDrizzleBuildersFile(rand.New(rand.NewSource(seed)))
		leg1, diags := convertDrizzleOne(t, source, convert.Options{Target: convert.TargetType})
		failOnDiags(t, seed, source, diags)
		leg2, diags := convertDrizzleOne(t, leg1, convert.Options{Target: convert.TargetBuilders})
		failOnDiags(t, seed, leg1, diags)
		leg3, diags := convertDrizzleOne(t, leg2, convert.Options{Target: convert.TargetType})
		failOnDiags(t, seed, leg2, diags)
		if leg3 != leg1 {
			t.Fatalf("seed %d: type form not a fixpoint\n--- source ---\n%s\n--- leg1 ---\n%s\n--- leg3 ---\n%s", seed, source, leg1, leg3)
		}
	}
}

func failOnDiags(t *testing.T, seed int64, source string, diags []convert.Diagnostic) {
	t.Helper()
	for _, diagnostic := range diags {
		t.Fatalf("seed %d: unexpected diagnostic %s [%s]: %s\n--- source ---\n%s", seed, diagnostic.Code, diagnostic.Decl, diagnostic.Message, source)
	}
}

// randomDrizzleBuildersFile renders 1-2 random tables over the covered pg
// vocabulary (the same space the JS fuzz suites draw from), builders form,
// canonical layout.
func randomDrizzleBuildersFile(rng *rand.Rand) string {
	var out strings.Builder
	out.WriteString(drizzleHeader)
	tableCount := 1 + rng.Intn(2)
	for tableIndex := 0; tableIndex < tableCount; tableIndex++ {
		columnCount := 1 + rng.Intn(5)
		var columns []string
		for i := 0; i < columnCount; i++ {
			key := fmt.Sprintf("col_%d", i)
			var text string
			// callbackValue keeps the runtime-modifier draws TYPE-CORRECT: the
			// emitted options.runtime is typed () => ColDataOf<column>.
			var callbackValue string
			switch rng.Intn(9) {
			case 0:
				text = fmt.Sprintf("DB.varchar('c%d', {length: %d})", i, 1+rng.Intn(200))
				if rng.Intn(2) == 0 {
					text += ".default('dflt')"
				}
				callbackValue = "'rv'"
			case 1:
				text = fmt.Sprintf("DB.integer('c%d')", i)
				if rng.Intn(2) == 0 {
					text += fmt.Sprintf(".default(%d)", rng.Intn(100))
				}
				callbackValue = "7"
			case 2:
				text = fmt.Sprintf("DB.uuid('c%d')", i)
				if rng.Intn(2) == 0 {
					text += ".defaultRandom()"
				}
				callbackValue = "'00000000-0000-0000-0000-000000000000'"
			case 3:
				if rng.Intn(2) == 0 {
					text = fmt.Sprintf("DB.text('c%d', {enum: ['a', 'b', 'c']})", i)
					callbackValue = "'a'"
				} else {
					text = fmt.Sprintf("DB.text('c%d')", i)
					callbackValue = "'rv'"
				}
			case 4:
				text = fmt.Sprintf("DB.boolean('c%d')", i)
				if rng.Intn(2) == 0 {
					text += fmt.Sprintf(".default(%t)", rng.Intn(2) == 0)
				}
				callbackValue = "true"
			case 5:
				text = fmt.Sprintf("DB.timestamp('c%d', {mode: 'string'})", i)
				if rng.Intn(2) == 0 {
					text += ".defaultNow()"
				}
				callbackValue = "'2026-01-01T00:00:00Z'"
			case 6:
				text = fmt.Sprintf("DB.numeric('c%d', {precision: %d, scale: %d})", i, 1+rng.Intn(12), 1+rng.Intn(4))
				callbackValue = "'1.5'"
			case 7:
				text = fmt.Sprintf("DB.bigint('c%d', {mode: 'number'})", i)
				callbackValue = "9"
			default:
				text = fmt.Sprintf("DB.smallint('c%d')", i)
				callbackValue = "1"
			}
			if rng.Intn(2) == 0 {
				text += ".notNull()"
			}
			if rng.Intn(4) == 0 {
				text += fmt.Sprintf(".unique('uq_c%d')", i)
			}
			if rng.Intn(4) == 0 {
				method := []string{"$default", "$defaultFn", "$onUpdate", "$onUpdateFn"}[rng.Intn(4)]
				text += "." + method + "(() => " + callbackValue + ")"
			}
			if i == 0 && rng.Intn(3) == 0 {
				text += ".primaryKey()"
			}
			columns = append(columns, "  "+key+": "+text+",")
		}
		// A forward reference onto the first table (col_0 always exists): the
		// type form must carry it through the emitted tables option.
		if tableIndex == 1 && rng.Intn(3) == 0 {
			columns = append(columns, "  ref_pid: DB.integer('ref_pid').references(() => table0.col_0),")
		}
		extras := ""
		if rng.Intn(2) == 0 {
			var entries []string
			if rng.Intn(2) == 0 {
				entries = append(entries, fmt.Sprintf("  DB.index('idx_%d').on(t.col_0),", tableIndex))
			}
			if rng.Intn(2) == 0 {
				entries = append(entries, fmt.Sprintf("  DB.unique('uqx_%d').on(t.col_0),", tableIndex))
			}
			if len(entries) > 0 {
				extras = ", (t) => [\n" + strings.Join(entries, "\n") + "\n]"
			}
		}
		fmt.Fprintf(&out, "export const table%d = DB.pgTable('t_%d', {\n%s\n}%s);\n", tableIndex, tableIndex, strings.Join(columns, "\n"), extras)
	}
	return out.String()
}
