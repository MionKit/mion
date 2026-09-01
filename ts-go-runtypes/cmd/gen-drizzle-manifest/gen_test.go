package main

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
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

// TestPendingReport pins the --pending review queue: every pending entry
// appears with its kind, overload params and reason (a drift note carries the
// previous shape); reviewed entries never appear; an all-reviewed manifest
// says so instead of printing an empty list.
func TestPendingReport(t *testing.T) {
	manifest := &Manifest{Entries: []Entry{
		{Dialect: "pg", Fn: "varchar", Kind: "column", Params: []string{"(name, config)"}, Status: statusMigrated},
		{Dialect: "pg", Fn: "vector", Kind: "column", Params: []string{"(name)", "(name, config)"}, Status: statusPending},
		{Dialect: "mysql", Fn: "unionAll", Kind: "function", Params: []string{"(left, right)"}, Status: statusPending, Reason: "params drifted; was: (left)"},
		{Dialect: "pg", Fn: "inet", Kind: "column", Status: statusSkipped, Reason: "no format"},
	}}
	report := pendingReport(manifest)
	for _, expected := range []string{
		"2 entries awaiting review",
		"pg.vector  [column]",
		"params: (name)",
		"params: (name, config)",
		"mysql.unionAll  [function]",
		"reason: params drifted; was: (left)",
	} {
		if !strings.Contains(report, expected) {
			t.Errorf("missing %q in report:\n%s", expected, report)
		}
	}
	for _, absent := range []string{"varchar", "inet"} {
		if strings.Contains(report, absent) {
			t.Errorf("reviewed entry %q must not appear in the pending report:\n%s", absent, report)
		}
	}
	if clean := pendingReport(&Manifest{}); !strings.Contains(clean, "nothing pending") {
		t.Errorf("all-reviewed manifest must say nothing is pending, got:\n%s", clean)
	}
}

func testConfig() *Config {
	return &Config{Dialects: []DialectConfig{
		{Dialect: "mysql", Module: "drizzle-orm/mysql-core", PackageDir: "packages/drizzle-orm-mysql-core", Proxy: "src/index.ts", Manifest: "manifests/mysql.manifest.json"},
		{Dialect: "pg", Module: "drizzle-orm/pg-core", PackageDir: "packages/drizzle-orm-pg-core", Proxy: "src/index.ts", Manifest: "manifests/pg.manifest.json"},
		{Dialect: "sqlite", Module: "drizzle-orm/sqlite-core", PackageDir: "packages/drizzle-orm-sqlite-core", Proxy: "src/index.ts", Manifest: "manifests/sqlite.manifest.json"},
	}}
}

// TestPerDialectFilesRoundTrip pins the on-disk layout the config drives: one
// file per configured dialect inside ITS package dir with the dialect at the
// file root (never on entries), statuses surviving the write/load cycle, and
// manifest files no dialect claims being flagged as strays.
func TestPerDialectFilesRoundTrip(t *testing.T) {
	config := testConfig()
	combined := &Manifest{DrizzleOrm: "0.45.2", Entries: []Entry{
		{Dialect: "pg", Fn: "varchar", Kind: "column", Params: []string{"(name, config)"}, Status: statusMigrated},
		{Dialect: "mysql", Fn: "varchar", Kind: "column", Params: []string{"(name, config)"}, Status: statusSkipped, Reason: "why"},
		{Dialect: "sqlite", Fn: "text", Kind: "column", Params: []string{"(name)"}, Status: statusPending},
	}}
	repoRoot := t.TempDir()
	for _, dialect := range config.Dialects {
		encoded, err := marshalManifest(manifestForDialect(combined, dialect.Dialect))
		if err != nil {
			t.Fatal(err)
		}
		if rootMentions := bytes.Count(encoded, []byte(`"dialect"`)); rootMentions != 1 {
			t.Errorf("%s file must carry the dialect ONCE at the root, found %d mentions", dialect.Dialect, rootMentions)
		}
		if err := os.MkdirAll(filepath.Dir(dialect.manifestPath(repoRoot)), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(dialect.manifestPath(repoRoot), encoded, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	loaded, err := loadCommitted(repoRoot, config)
	if err != nil {
		t.Fatal(err)
	}
	byKey := map[string]Entry{}
	for _, entry := range loaded.Entries {
		byKey[entryKey(entry)] = entry
	}
	if byKey["pg:varchar"].Status != statusMigrated || byKey["mysql:varchar"].Reason != "why" || byKey["sqlite:text"].Status != statusPending {
		t.Errorf("statuses/reasons lost in the write/load round-trip: %+v", loaded.Entries)
	}
	if loaded.DrizzleOrm != "0.45.2" {
		t.Errorf("drizzle-orm version lost in round-trip: %q", loaded.DrizzleOrm)
	}

	strayPath := filepath.Join(repoRoot, "packages", "drizzle-orm-pg-core", "manifests", "oracle.manifest.json")
	if err := os.WriteFile(strayPath, []byte("{}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	strays, err := strayManifestFiles(repoRoot, config)
	if err != nil {
		t.Fatal(err)
	}
	if len(strays) != 1 || strays[0] != strayPath {
		t.Errorf("unclaimed manifest file must be flagged as stray, got %v", strays)
	}
}

// TestLoadConfigValidation pins the config contract: the tool is fully driven
// by dialects.json, so a broken config must fail loudly, and a good one must
// round-trip every field.
func TestLoadConfigValidation(t *testing.T) {
	configDir := t.TempDir()
	writeConfig := func(content string) string {
		path := filepath.Join(configDir, "dialects.json")
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
		return path
	}

	goodPath := writeConfig(`{"dialects": [
		{"dialect": "pg", "module": "drizzle-orm/pg-core", "packageDir": "packages/drizzle-orm-pg-core", "proxy": "src/index.ts", "manifest": "manifests/pg.manifest.json"}
	]}`)
	config, err := loadConfig(goodPath)
	if err != nil {
		t.Fatal(err)
	}
	if len(config.Dialects) != 1 || config.Dialects[0].Module != "drizzle-orm/pg-core" || config.Dialects[0].PackageDir != "packages/drizzle-orm-pg-core" {
		t.Errorf("config fields lost on load: %+v", config)
	}
	if got := filepath.ToSlash(config.Dialects[0].manifestPath("/repo")); got != "/repo/packages/drizzle-orm-pg-core/manifests/pg.manifest.json" {
		t.Errorf("manifestPath must resolve packageDir-relative under the repo root, got %q", got)
	}

	for name, badContent := range map[string]string{
		"missing packageDir": `{"dialects": [{"dialect": "pg", "module": "m", "proxy": "p", "manifest": "pg.manifest.json"}]}`,
		"no dialects":        `{"dialects": []}`,
		"empty fields":       `{"dialects": [{"dialect": "pg"}]}`,
		"duplicate dialect": `{"dialects": [
			{"dialect": "pg", "module": "m", "packageDir": "d1", "proxy": "p", "manifest": "a.manifest.json"},
			{"dialect": "pg", "module": "m", "packageDir": "d2", "proxy": "p", "manifest": "b.manifest.json"}]}`,
		"manifest escapes the package dir": `{"dialects": [
			{"dialect": "pg", "module": "m", "packageDir": "d", "proxy": "p", "manifest": "../pg.manifest.json"}]}`,
		"absolute packageDir": `{"dialects": [
			{"dialect": "pg", "module": "m", "packageDir": "/abs", "proxy": "p", "manifest": "pg.manifest.json"}]}`,
		"manifest wrong suffix": `{"dialects": [
			{"dialect": "pg", "module": "m", "packageDir": "d", "proxy": "p", "manifest": "manifests/pg.json"}]}`,
	} {
		if _, err := loadConfig(writeConfig(badContent)); err == nil {
			t.Errorf("%s: expected loadConfig to fail", name)
		}
	}

	if _, err := loadConfig(filepath.Join(configDir, "nope.json")); err == nil {
		t.Error("missing config file must fail")
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
	err := validate(manifest, localExportsByDialect, testConfig())
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
export {ghost} from 'drizzle-orm/fake-core';
import {varchar as fixtureVarchar} from './fixture.ts';
export const decimal = varchar;
const localValue = 1;
export {localValue as renamed};
export function varchar(): unknown {
  return fixtureVarchar();
}
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
	// Own declarations, relative star re-exports (the fixture's own functions
	// and consts) and relative named re-exports all count as local.
	for _, localName := range []string{"varchar", "decimal", "renamed", "isHelper", "answer", "reExported"} {
		if !exports[localName] {
			t.Errorf("local export %q not detected: %v", localName, exports)
		}
	}
	// A named re-export from a BARE specifier is drizzle passthrough: never local.
	if exports["ghost"] {
		t.Errorf("bare-specifier re-export must NOT count as a local export: %v", exports)
	}
}
