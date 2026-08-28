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
	"export const usersRT = DB.pgTable('users', {\n" +
	"  id: DB.uuid('id').primaryKey().defaultRandom(),\n" +
	"  name: DB.varchar('name', {length: 100}).notNull(),\n" +
	"  age: DB.integer('age').notNull().default(21),\n" +
	"  bio: DB.varchar('bio', {length: 500}),\n" +
	"  note: DB.varchar(),\n" +
	"});\n" +
	"export type UsersRT = typeof usersRT;\n"

const drizzleTypeSource = "import {getRunType} from '@ts-runtypes/core';\n" +
	drizzleHeader +
	"export type UsersRT = DB.PgTable<'users', {\n" +
	"  id: DB.Uuid<'id'> & DB.PrimaryKey & DB.DefaultRandom;\n" +
	"  name: DB.Varchar<'name', {length: 100}> & DB.NotNull;\n" +
	"  age: DB.Integer<'age'> & DB.NotNull & DB.Default<21>;\n" +
	"  bio: DB.Varchar<'bio', {length: 500}>;\n" +
	"  note: DB.Varchar;\n" +
	"}>;\n" +
	"export const usersRT = DB.tableFromType<UsersRT>(getRunType<UsersRT>());\n"

func TestDrizzle_BuildersToType(t *testing.T) {
	output, diags := convertDrizzleOne(t, drizzleBuildersSource, convert.Options{Target: convert.TargetType})
	expectNoDiags(t, diags)
	for _, want := range []string{
		"export type UsersRT = DB.PgTable<'users', {",
		"  id: DB.Uuid<'id'> & DB.PrimaryKey & DB.DefaultRandom;",
		"  name: DB.Varchar<'name', {length: 100}> & DB.NotNull;",
		"  age: DB.Integer<'age'> & DB.NotNull & DB.Default<21>;",
		"  bio: DB.Varchar<'bio', {length: 500}>;",
		"  note: DB.Varchar;",
		"export const usersRT = DB.tableFromType<UsersRT>(getRunType<UsersRT>());",
		"import {getRunType} from '@ts-runtypes/core';",
	} {
		if !strings.Contains(output, want) {
			t.Fatalf("builders→type output missing %q:\n%s", want, output)
		}
	}
	if strings.Contains(output, "typeof usersRT") {
		t.Fatalf("builders→type left the typeof alias behind:\n%s", output)
	}
}

func TestDrizzle_TypeToBuilders(t *testing.T) {
	output, diags := convertDrizzleOne(t, drizzleTypeSource, convert.Options{Target: convert.TargetBuilders})
	expectNoDiags(t, diags)
	for _, want := range []string{
		"export const usersRT = DB.pgTable('users', {",
		"  id: DB.uuid('id').primaryKey().defaultRandom(),",
		"  name: DB.varchar('name', {length: 100}).notNull(),",
		"  age: DB.integer('age').notNull().default(21),",
		"  bio: DB.varchar('bio', {length: 500}),",
		"  note: DB.varchar(),",
		"export type UsersRT = typeof usersRT;",
	} {
		if !strings.Contains(output, want) {
			t.Fatalf("type→builders output missing %q:\n%s", want, output)
		}
	}
	if strings.Contains(output, "tableFromType") {
		t.Fatalf("type→builders left the tableFromType handle behind:\n%s", output)
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
	"export const devicesRT = DB.mysqlTable('devices', {\n" +
	"  id: DB.serial('id').primaryKey(),\n" +
	"  name: DB.varchar('name', {length: 100}).notNull(),\n" +
	"  views: DB.int('views', {unsigned: true}).notNull(),\n" +
	"  plan: DB.text('plan', {enum: ['free', 'pro']}).notNull(),\n" +
	"});\n" +
	"export type DevicesRT = typeof devicesRT;\n"

// TestDrizzle_MysqlRoundTripFixpoint drives a mysql builders table through
// builders→type→builders→type, pinning the mysqlTable → MysqlTable pair and
// the same fixpoint oracle as the pg round trip.
func TestDrizzle_MysqlRoundTripFixpoint(t *testing.T) {
	leg1, diags := convertDrizzleOne(t, drizzleMysqlBuildersSource, convert.Options{Target: convert.TargetType})
	expectNoDiags(t, diags)
	for _, want := range []string{
		"export type DevicesRT = DB.MysqlTable<'devices', {",
		"  id: DB.Serial<'id'> & DB.PrimaryKey;",
		"  name: DB.Varchar<'name', {length: 100}> & DB.NotNull;",
		"  views: DB.Int<'views', {unsigned: true}> & DB.NotNull;",
		"  plan: DB.Text<'plan', {enum: ['free', 'pro']}> & DB.NotNull;",
		"export const devicesRT = DB.tableFromType<DevicesRT>(getRunType<DevicesRT>());",
	} {
		if !strings.Contains(leg1, want) {
			t.Fatalf("mysql builders→type output missing %q:\n%s", want, leg1)
		}
	}
	leg2, diags := convertDrizzleOne(t, leg1, convert.Options{Target: convert.TargetBuilders})
	expectNoDiags(t, diags)
	for _, want := range []string{
		"export const devicesRT = DB.mysqlTable('devices', {",
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
		"runtime fn modifier": drizzleHeader +
			"export const t = DB.pgTable('t', {c: DB.integer('c').$defaultFn(() => 1)});\n",
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
	"export const extrasRT = DB.pgTable('extras_t', {\n" +
	"  a: DB.integer('a').notNull(),\n" +
	"  b: DB.varchar('b', {length: 10}),\n" +
	"}, (t) => [\n" +
	"  DB.index('idx_a').on(t.a),\n" +
	"  DB.uniqueIndex('uidx_b').on(t.b),\n" +
	"  DB.unique('uq_ab').on(t.a, t.b),\n" +
	"  DB.check('chk_a', sql`a >= 0`),\n" +
	"]);\n" +
	"export type ExtrasRT = typeof extrasRT;\n"

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
			switch rng.Intn(9) {
			case 0:
				text = fmt.Sprintf("DB.varchar('c%d', {length: %d})", i, 1+rng.Intn(200))
				if rng.Intn(2) == 0 {
					text += ".default('dflt')"
				}
			case 1:
				text = fmt.Sprintf("DB.integer('c%d')", i)
				if rng.Intn(2) == 0 {
					text += fmt.Sprintf(".default(%d)", rng.Intn(100))
				}
			case 2:
				text = fmt.Sprintf("DB.uuid('c%d')", i)
				if rng.Intn(2) == 0 {
					text += ".defaultRandom()"
				}
			case 3:
				if rng.Intn(2) == 0 {
					text = fmt.Sprintf("DB.text('c%d', {enum: ['a', 'b', 'c']})", i)
				} else {
					text = fmt.Sprintf("DB.text('c%d')", i)
				}
			case 4:
				text = fmt.Sprintf("DB.boolean('c%d')", i)
				if rng.Intn(2) == 0 {
					text += fmt.Sprintf(".default(%t)", rng.Intn(2) == 0)
				}
			case 5:
				text = fmt.Sprintf("DB.timestamp('c%d', {mode: 'string'})", i)
				if rng.Intn(2) == 0 {
					text += ".defaultNow()"
				}
			case 6:
				text = fmt.Sprintf("DB.numeric('c%d', {precision: %d, scale: %d})", i, 1+rng.Intn(12), 1+rng.Intn(4))
			case 7:
				text = fmt.Sprintf("DB.bigint('c%d', {mode: 'number'})", i)
			default:
				text = fmt.Sprintf("DB.smallint('c%d')", i)
			}
			if rng.Intn(2) == 0 {
				text += ".notNull()"
			}
			if rng.Intn(4) == 0 {
				text += fmt.Sprintf(".unique('uq_c%d')", i)
			}
			if i == 0 && rng.Intn(3) == 0 {
				text += ".primaryKey()"
			}
			columns = append(columns, "  "+key+": "+text+",")
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
		fmt.Fprintf(&out, "export const table%dRT = DB.pgTable('t_%d', {\n%s\n}%s);\n", tableIndex, tableIndex, strings.Join(columns, "\n"), extras)
	}
	return out.String()
}
