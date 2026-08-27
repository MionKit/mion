package main

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
)

func TestMergePreservesStatusesAndDowngradesOnDrift(t *testing.T) {
	fresh := &Manifest{DrizzleOrm: "0.46.0", Entries: []Entry{
		{Dialect: "pg", Fn: "varchar", Kind: "column", Params: []string{"(name, config)"}, Status: statusPending},
		{Dialect: "pg", Fn: "numeric", Kind: "column", Params: []string{"(name, config, NEW)"}, Status: statusPending},
		{Dialect: "pg", Fn: "vector", Kind: "column", Params: []string{"(name)"}, Status: statusPending},
		{Dialect: "pg", Fn: "brandNew", Kind: "column", Params: []string{"(name)"}, Status: statusPending},
		{Dialect: "pg", Fn: "pgEnum", Kind: "function", Params: []string{"(enumName, values)"}, Status: statusPending},
		{Dialect: "pg", Fn: "unionAll", Kind: "function", Params: []string{"(left, right, NEW)"}, Status: statusPending},
		{Dialect: "pg", Fn: "PgColumn", Kind: "passthrough", Status: statusSkipped, Reason: passthroughReason},
	}}
	committed := &Manifest{DrizzleOrm: "0.45.2", Entries: []Entry{
		{Dialect: "pg", Fn: "varchar", Kind: "column", Params: []string{"(name, config)"}, Status: statusMigrated},
		{Dialect: "pg", Fn: "numeric", Kind: "column", Params: []string{"(name, config)"}, Status: statusMigrated},
		{Dialect: "pg", Fn: "vector", Kind: "column", Params: []string{"(name)"}, Status: statusSkipped, Reason: "no format"},
		{Dialect: "pg", Fn: "gone", Kind: "column", Params: []string{"(name)"}, Status: statusMigrated},
		{Dialect: "pg", Fn: "pgEnum", Kind: "function", Params: []string{"(enumName, values)"}, Status: statusSkipped, Reason: "enum typing already exact"},
		{Dialect: "pg", Fn: "unionAll", Kind: "function", Params: []string{"(left, right)"}, Status: statusMigrated},
		{Dialect: "pg", Fn: "PgColumn", Kind: "passthrough", Status: statusMigrated, Reason: "hand-edit that must NOT survive"},
	}}
	merged := merge(fresh, committed)
	byFn := map[string]Entry{}
	for _, entry := range merged.Entries {
		byFn[entry.Fn] = entry
	}
	if byFn["varchar"].Status != statusMigrated {
		t.Errorf("unchanged migrated entry lost its status: %+v", byFn["varchar"])
	}
	if byFn["numeric"].Status != statusPending || !strings.Contains(byFn["numeric"].Reason, "params drifted") {
		t.Errorf("param drift on a migrated entry must downgrade to pending: %+v", byFn["numeric"])
	}
	if byFn["vector"].Status != statusSkipped || byFn["vector"].Reason != "no format" {
		t.Errorf("skipped entry lost its hand-set reason: %+v", byFn["vector"])
	}
	if byFn["brandNew"].Status != statusPending {
		t.Errorf("new column fn must arrive pending: %+v", byFn["brandNew"])
	}
	if _, stillThere := byFn["gone"]; stillThere {
		t.Error("entry drizzle no longer exports must be dropped")
	}
	if byFn["pgEnum"].Status != statusSkipped || byFn["pgEnum"].Reason != "enum typing already exact" {
		t.Errorf("hand-set function skip must survive regeneration: %+v", byFn["pgEnum"])
	}
	if byFn["unionAll"].Status != statusPending || !strings.Contains(byFn["unionAll"].Reason, "params drifted") {
		t.Errorf("param drift on a migrated function must downgrade to pending: %+v", byFn["unionAll"])
	}
	if byFn["PgColumn"].Status != statusSkipped || byFn["PgColumn"].Reason != passthroughReason {
		t.Errorf("passthrough entries are generator-owned; hand-edits must be discarded: %+v", byFn["PgColumn"])
	}
	if merged.DrizzleOrm != "0.46.0" {
		t.Errorf("merged manifest must carry the fresh drizzle-orm version, got %s", merged.DrizzleOrm)
	}
}

func TestValidateRejectsBadStatusesAndCoverageHoles(t *testing.T) {
	manifest := &Manifest{Entries: []Entry{
		{Dialect: "pg", Fn: "varchar", Kind: "column", Status: statusMigrated},
		{Dialect: "pg", Fn: "vector", Kind: "column", Status: statusSkipped},
		{Dialect: "pg", Fn: "integer", Kind: "column", Status: "done"},
		{Dialect: "pg", Fn: "check", Kind: "function", Status: statusSkipped},
		{Dialect: "mysql", Fn: "varchar", Kind: "column", Status: statusMigrated},
		{Dialect: "mysql", Fn: "unionAll", Kind: "function", Status: statusMigrated},
		{Dialect: "sqlite", Fn: "text", Kind: "column", Status: statusPending},
	}}
	localExportsByDialect := map[string]map[string]bool{"pg": {"varchar": true}, "mysql": {}, "sqlite": {}}
	err := validate(manifest, localExportsByDialect)
	if err == nil {
		t.Fatal("expected validation failures")
	}
	message := err.Error()
	for _, expected := range []string{
		"pg.vector: skipped without a reason",
		"pg.check: skipped without a reason",
		`pg.integer: unknown status "done"`,
		"mysql.varchar: migrated but not a local export",
		"mysql.unionAll: migrated but not a local export",
		"sqlite: extraction found ZERO callable functions",
	} {
		if !strings.Contains(message, expected) {
			t.Errorf("missing finding %q in:\n%s", expected, message)
		}
	}
	if strings.Contains(message, "pg.varchar:") {
		t.Errorf("pg.varchar is a valid migrated local export, got:\n%s", message)
	}
}

// TestClassifyAndLocalExports runs the real extraction pieces over an
// overlay-only program (no node_modules): the *BuilderInitial return
// convention classifies columns (aliased consts included), other callables
// are reviewable functions, non-callables are passthrough, and only LOCAL
// proxy exports count for coverage.
func TestClassifyAndLocalExports(t *testing.T) {
	rootDir := filepath.ToSlash(t.TempDir())
	fixturePath := rootDir + "/fixture.ts"
	proxyPath := rootDir + "/proxy.ts"
	entryPath := rootDir + "/entry.ts"
	overlay := map[string]string{
		fixturePath: `export interface FakeBuilderInitial<TName extends string> {columnName: TName}
export function varchar(): FakeBuilderInitial<''>;
export function varchar<TName extends string, L extends number | undefined>(name: TName, config?: {length?: L}): FakeBuilderInitial<TName>;
export function varchar(): FakeBuilderInitial<string> {
  return {columnName: ''};
}
export const decimal: typeof varchar = varchar;
export function isHelper(value: unknown): boolean {
  return !!value;
}
export const answer = 42;
`,
		proxyPath: `export * from './fixture.ts';
export {answer as reExported} from './fixture.ts';
import {varchar as fixtureVarchar} from './fixture.ts';
export function varchar(): unknown {
  return fixtureVarchar();
}
export const decimal = varchar;
const localValue = 1;
export {localValue as renamed};
`,
		entryPath: `import * as fixture from './fixture.ts';
export const namespaces = {pg: fixture};
`,
	}
	prog, err := program.NewInferred(program.Options{Cwd: rootDir, SingleThreaded: true, Overlay: overlay}, []string{entryPath, proxyPath})
	if err != nil {
		t.Fatal(err)
	}
	typeChecker, releaseChecker := prog.TS.GetTypeChecker(context.Background())
	defer releaseChecker()

	namespacesType, err := namespacesTypeOf(prog, typeChecker, entryPath)
	if err != nil {
		t.Fatal(err)
	}
	fixtureType := checker.Checker_getTypeOfPropertyOfType(typeChecker, namespacesType, "pg")
	if fixtureType == nil {
		t.Fatal("no namespace type for the fixture module")
	}
	entriesByFn := map[string]Entry{}
	for _, exportSymbol := range typeChecker.GetPropertiesOfType(fixtureType) {
		entriesByFn[exportSymbol.Name] = classifyExport(typeChecker, "pg", exportSymbol)
	}
	varcharEntry := entriesByFn["varchar"]
	if varcharEntry.Kind != "column" || varcharEntry.Status != statusPending {
		t.Errorf("varchar must classify as a pending column: %+v", varcharEntry)
	}
	if len(varcharEntry.Params) != 2 || varcharEntry.Params[0] != "()" || !strings.Contains(varcharEntry.Params[1], "config?: {length?: L}") {
		t.Errorf("varchar overload params not captured: %+v", varcharEntry.Params)
	}
	if entriesByFn["decimal"].Kind != "column" {
		t.Errorf("a const alias of a column fn must classify as column: %+v", entriesByFn["decimal"])
	}
	helperEntry := entriesByFn["isHelper"]
	if helperEntry.Kind != "function" || helperEntry.Status != statusPending {
		t.Errorf("a non-column callable must classify as a pending function: %+v", helperEntry)
	}
	if len(helperEntry.Params) != 1 || !strings.Contains(helperEntry.Params[0], "value: unknown") {
		t.Errorf("function params not captured: %+v", helperEntry.Params)
	}
	answerEntry := entriesByFn["answer"]
	if answerEntry.Kind != "passthrough" || answerEntry.Status != statusSkipped || answerEntry.Reason != passthroughReason {
		t.Errorf("a non-callable value must be a generator-skipped passthrough: %+v", answerEntry)
	}

	exports := localExports(prog, proxyPath)
	for _, localName := range []string{"varchar", "decimal", "renamed"} {
		if !exports[localName] {
			t.Errorf("local export %q not detected: %v", localName, exports)
		}
	}
	for _, passthroughName := range []string{"answer", "reExported", "isHelper"} {
		if exports[passthroughName] {
			t.Errorf("passthrough %q must NOT count as a local export", passthroughName)
		}
	}
}
