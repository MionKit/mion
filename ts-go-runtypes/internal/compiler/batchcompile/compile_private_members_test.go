package batchcompile

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/sourcerewrite"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/testfixtures"
)

// Plain tsc erases private member types (MKR016); `mion compile` must write them `protected`, typed, with the source's id.

const ledgerMoneyTS = "export type Money = {amount: number; currency: string};\n"

const ledgerAccountTS = `import type {Money} from './money.ts';

type Note = {text: string};

export class Account {
  id = '';
  private balance: Money = {amount: 0, currency: 'EUR'};
  private count = 0;
  private note?: Note;
  protected kept: boolean = true;
  #secret = 1;
  constructor(private readonly key: string) {}
  private audit(): void;
  private audit(reason: string): void;
  private audit(reason?: string): void {}
  private get label(): string { return this.id + this.#secret; }
}

export class Registry {
  private constructor() {}
}
`

func declarationTsconfig(extra string) string {
	return strings.Replace(projectTsconfigJSON, `"strict": true,`, `"strict": true, "declaration": true,`+extra, 1)
}

func compileLedger(t *testing.T, extra string) string {
	t.Helper()
	dir := writeProject(t, map[string]string{"money.ts": ledgerMoneyTS, "index.ts": ledgerAccountTS})
	writeFile(t, filepath.Join(dir, "tsconfig.json"), declarationTsconfig(extra))
	compileProject(t, dir, nil)
	return dir
}

func assertContains(t *testing.T, text string, wanted ...string) {
	t.Helper()
	for _, want := range wanted {
		if !strings.Contains(text, want) {
			t.Errorf("must contain %q:\n%s", want, text)
		}
	}
}

func TestCompile_DeclarationsKeepPrivateMemberTypes(t *testing.T) {
	dir := compileLedger(t, "")
	dts := readEmitted(t, dir, "index.d.ts")
	assertContains(t, dts,
		"protected balance: Money;",
		"protected count: number;",
		"protected note?: Note;",
		"protected kept: boolean;",
		"protected audit(): void;",
		"protected audit(reason: string): void;",
		"protected get label(): string;",
		"constructor(key: string);",
		"protected readonly key: string;",
		"private constructor();",
		"Money } from",
		"type Note = {",
	)
	for _, unwanted := range []string{"private balance", "private count", "private note", "private audit", "private get"} {
		if strings.Contains(dts, unwanted) {
			t.Errorf("the declaration must not keep %q:\n%s", unwanted, dts)
		}
	}
	if js := readEmitted(t, dir, "index.js"); strings.Contains(js, "protected") {
		t.Errorf("the rewrite is for the declaration only, the js changed:\n%s", js)
	}
}

// assertMapPointsAt checks that a .d.ts.map has a segment at the source token's original column, never at the shifted one.
func assertMapPointsAt(t *testing.T, raw, source, lineMarker, token string, shift int) {
	t.Helper()
	var sourceMap protocol.SourceMap
	if err := json.Unmarshal([]byte(raw), &sourceMap); err != nil {
		t.Fatalf("parse map: %v\n%s", err, raw)
	}
	if len(sourceMap.Sources) != 1 || filepath.IsAbs(sourceMap.Sources[0]) {
		t.Errorf("the map must name the source relative to the map file, got %v", sourceMap.Sources)
	}
	line, column := -1, -1
	for index, text := range strings.Split(source, "\n") {
		if strings.Contains(text, lineMarker) {
			line, column = index, strings.Index(text, token)
		}
	}
	found := false
	for _, position := range sourcerewrite.OriginalPositions(sourceMap.Mappings) {
		if position[0] != line {
			continue
		}
		found = found || position[1] == column
		if position[1] == column+shift {
			t.Errorf("a segment points at the spliced column %d, not the original %d", position[1], column)
		}
	}
	if !found {
		t.Errorf("no segment points at %q (line %d, column %d)", token, line, column)
	}
}

// The declaration map points at the source as written, not at the overlay where `protected` is 2 characters longer.
func TestCompile_DeclarationMapPointsAtOriginalColumns(t *testing.T) {
	dir := compileLedger(t, ` "declarationMap": true,`)
	assertMapPointsAt(t, readEmitted(t, dir, "index.d.ts.map"), ledgerAccountTS, "private balance", "balance", len("protected")-len("private"))
}

// The build-version splice is an insertion in the middle of a line, so the map must undo it for what follows.
func TestCompile_DeclarationMapUndoesTheBuildVersionSplice(t *testing.T) {
	server := strings.Replace(versionedServerTS, "b: number): number => a + b)});", "b: number): number => a + b)}), revision = 1;", 1)
	dir := writeProject(t, map[string]string{"router.d.ts": versionedRouterDTS, "server.ts": server})
	writeFile(t, filepath.Join(dir, "tsconfig.json"), declarationTsconfig(` "declarationMap": true,`))
	compileProject(t, dir, nil)
	match := injectedVersionRE.FindStringSubmatch(readEmitted(t, dir, "server.js"))
	if match == nil {
		t.Fatalf("initRoutes got no build version")
	}
	assertMapPointsAt(t, readEmitted(t, dir, "server.d.ts.map"), server, "revision = 1", "revision", len(", '"+match[1]+"'"))
}

// Both splice sources on one file land in one overlay: neither drops the other.
func TestCompile_DeclarationsMergeBothSplicesInOneFile(t *testing.T) {
	dir := writeProject(t, map[string]string{"index.ts": `import {registerPureFn} from '@mionjs/run-types/runtime';
export const shout = registerPureFn(function (text: string): string {
  return text.toUpperCase();
});
export class Counter { private hits: number = 0; }
`})
	writeFile(t, filepath.Join(dir, "package.json"), `{"name": "@acme/shout", "type": "module", "peerDependencies": {"@mionjs/run-types": "*"}}`)
	writeFile(t, filepath.Join(dir, "tsconfig.json"), declarationTsconfig(""))
	compileProject(t, dir, nil)
	assertContains(t, readEmitted(t, dir, "index.d.ts"), "@acme/shout#", "protected hits: number;")
}

// installLedger compiles a consumer of @acme/ledger installed from the given files, returning its site id and codes.
func installLedger(t *testing.T, packageFiles map[string]string, consumer string) (string, []string) {
	t.Helper()
	dir := writeProject(t, map[string]string{"consumer.ts": consumer})
	for rel, content := range packageFiles {
		writeFile(t, filepath.Join(dir, "node_modules", "@acme", "ledger", filepath.FromSlash(rel)), content)
	}
	result := compileProject(t, dir, nil)
	id := emittedRunTypeIds(t, readEmitted(t, dir, "consumer.js"))["id"]
	if id == "" {
		t.Fatalf("the consumer got no id:\n%s", readEmitted(t, dir, "consumer.js"))
	}
	codes := make([]string, 0, len(result.Diagnostics))
	for _, diagnostic := range result.Diagnostics {
		codes = append(codes, diagnostic.Code)
	}
	return id, codes
}

func ledgerFromSource() map[string]string {
	return map[string]string{
		"package.json": `{"name": "@acme/ledger", "version": "1.0.0", "types": "./src/index.ts"}`,
		"src/money.ts": ledgerMoneyTS,
		"src/index.ts": ledgerAccountTS,
	}
}

func ledgerFromCompile(t *testing.T) map[string]string {
	t.Helper()
	dir := compileLedger(t, "")
	return map[string]string{
		"package.json":    testfixtures.LedgerPackageJSON,
		"dist/money.d.ts": readEmitted(t, dir, "money.d.ts"),
		"dist/index.d.ts": readEmitted(t, dir, "index.d.ts"),
	}
}

func assertRoundTrip(t *testing.T, consumer string) {
	t.Helper()
	sourceID, sourceCodes := installLedger(t, ledgerFromSource(), consumer)
	compiledID, compiledCodes := installLedger(t, ledgerFromCompile(t), consumer)
	if sourceID != compiledID {
		t.Errorf("the compiled .d.ts must give the source id: source %s, compiled %s", sourceID, compiledID)
	}
	for road, codes := range map[string][]string{"a package read from its sources": sourceCodes, "a mion-compiled .d.ts": compiledCodes} {
		for _, code := range codes {
			if code == diagnostics.CodeMarkerTypelessPrivateMember {
				t.Errorf("%s must not raise %s", road, code)
			}
		}
	}
}

func TestCompile_PrivateMembersRoundTrip_Static(t *testing.T) {
	assertRoundTrip(t, testfixtures.LedgerStaticSite)
}

func TestCompile_PrivateMembersRoundTrip_Value(t *testing.T) {
	assertRoundTrip(t, testfixtures.LedgerValueSite)
}

func TestCompile_PrivateMembersRoundTrip_FormEquivalence(t *testing.T) {
	compiled := ledgerFromCompile(t)
	staticID, _ := installLedger(t, compiled, testfixtures.LedgerStaticSite)
	valueID, _ := installLedger(t, compiled, testfixtures.LedgerValueSite)
	if staticID != valueID {
		t.Errorf("both call shapes must share one id: static %s, value %s", staticID, valueID)
	}
}

const isolatedTsconfigExtra = ` "isolatedDeclarations": true,`

// isolatedDeclarations exempts a private member from a written type; the `protected` splice must not take that away.
func TestCompile_IsolatedDeclarationsKeepInferredPrivateTypes(t *testing.T) {
	dir := writeProject(t, map[string]string{"index.ts": `export class Cache {
  private entries = new Map<string, number>();
  private hits = 0;
}
`})
	writeFile(t, filepath.Join(dir, "tsconfig.json"), declarationTsconfig(isolatedTsconfigExtra))
	compileProject(t, dir, nil)
	assertContains(t, readEmitted(t, dir, "index.d.ts"), "protected entries: Map<string, number>;", "protected hits: number;")
}

// The user's own isolatedDeclarations error still fails the build, reported from the source as written.
func TestCompile_IsolatedDeclarationsStillReportsTheSourceError(t *testing.T) {
	dir := writeProject(t, map[string]string{"index.ts": `export class Cache {
  private hits = 0;
}
export const next = (n: number) => n + 1;
`})
	writeFile(t, filepath.Join(dir, "tsconfig.json"), declarationTsconfig(isolatedTsconfigExtra))
	_, err := Run(Options{Cwd: dir, TsconfigPath: "tsconfig.json", GenDir: filepath.Join(dir, ".mion")})
	if err == nil || !strings.Contains(err.Error(), "src/index.ts(4,") || !strings.Contains(err.Error(), "error TS9013") {
		t.Fatalf("the source's own isolatedDeclarations error must fail the build, got %v", err)
	}
	if strings.Contains(err.Error(), "TS9012") {
		t.Errorf("the private member must not be reported, it broke no rule: %v", err)
	}
}

// pinoTypes stands in for a package only some consumers have.
const pinoTypes = `export interface Logger { info(message: string): void }
export declare function pino(): Logger;
`

// No guard: the type is kept even when it comes from a devDependency, and the import ships with it.
func TestCompile_PrivateMemberTypedFromADevDependencyKeepsItsType(t *testing.T) {
	dir := writeProject(t, map[string]string{"index.ts": `import type {Logger} from 'pino';
export class Service {
  private logger?: Logger;
}
`})
	writeFile(t, filepath.Join(dir, "node_modules", "pino", "package.json"), `{"name": "pino", "types": "./index.d.ts"}`)
	writeFile(t, filepath.Join(dir, "node_modules", "pino", "index.d.ts"), pinoTypes)
	writeFile(t, filepath.Join(dir, "package.json"), `{"name": "@acme/service", "devDependencies": {"pino": "1.0.0"}}`)
	writeFile(t, filepath.Join(dir, "tsconfig.json"), declarationTsconfig(""))
	compileProject(t, dir, nil)
	assertContains(t, readEmitted(t, dir, "index.d.ts"), "protected logger?: Logger;", "from 'pino'")
}

// No guard: a type tsc never had to name, written as `protected`, fails the build with TypeScript's own error.
func TestCompile_PrivateMemberWithAnUnnameableTypeFailsTheBuild(t *testing.T) {
	dir := writeProject(t, map[string]string{"index.ts": `import {makeClient} from 'sdk';
export class Service {
  private client = makeClient();
}
`})
	sdk := filepath.Join(dir, "node_modules", "sdk")
	writeFile(t, filepath.Join(sdk, "package.json"), `{"name": "sdk", "types": "./index.d.ts"}`)
	writeFile(t, filepath.Join(sdk, "index.d.ts"), "import type {Client} from 'transport';\nexport declare function makeClient(): Client;\n")
	writeFile(t, filepath.Join(sdk, "node_modules", "transport", "package.json"), `{"name": "transport", "types": "./index.d.ts"}`)
	writeFile(t, filepath.Join(sdk, "node_modules", "transport", "index.d.ts"), "export interface Client { send(): void }\n")
	writeFile(t, filepath.Join(dir, "tsconfig.json"), declarationTsconfig(""))
	_, err := Run(Options{Cwd: dir, TsconfigPath: "tsconfig.json", GenDir: filepath.Join(dir, ".mion")})
	// Column 11 is `client` as written; the spliced text puts it at 13.
	if err == nil || !strings.Contains(err.Error(), "src/index.ts(3,11)") || !strings.Contains(err.Error(), "cannot be named") {
		t.Fatalf("the unnameable type must fail the build at the member as written, got %v", err)
	}
}
