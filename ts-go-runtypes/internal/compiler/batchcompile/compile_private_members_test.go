package batchcompile

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/sourcerewrite"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// A plain tsc .d.ts erases every private member's type, which a consumer could only read as `any` (MKR016). These
// tests pin that `mion compile` writes those members as `protected` with their type, and that a consumer of the
// emitted .d.ts gets the same type id as from the source.

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

func TestCompile_DeclarationsKeepPrivateMemberTypes(t *testing.T) {
	dir := compileLedger(t, "")
	dts := readEmitted(t, dir, "index.d.ts")
	for _, want := range []string{
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
	} {
		if !strings.Contains(dts, want) {
			t.Errorf("the declaration must contain %q:\n%s", want, dts)
		}
	}
	for _, unwanted := range []string{"private balance", "private count", "private note", "private audit", "private get"} {
		if strings.Contains(dts, unwanted) {
			t.Errorf("the declaration must not keep %q:\n%s", unwanted, dts)
		}
	}
	if js := readEmitted(t, dir, "index.js"); strings.Contains(js, "protected") {
		t.Errorf("the rewrite is for the declaration only, the js changed:\n%s", js)
	}
}

// The declaration map must point at the source as written, not at the overlay where `protected` is 2 characters longer.
func TestCompile_DeclarationMapPointsAtOriginalColumns(t *testing.T) {
	dir := compileLedger(t, ` "declarationMap": true,`)
	raw := readEmitted(t, dir, "index.d.ts.map")
	var sourceMap protocol.SourceMap
	if err := json.Unmarshal([]byte(raw), &sourceMap); err != nil {
		t.Fatalf("parse map: %v\n%s", err, raw)
	}
	if len(sourceMap.Sources) != 1 || filepath.IsAbs(sourceMap.Sources[0]) || !strings.HasSuffix(sourceMap.Sources[0], "src/index.ts") {
		t.Errorf("the map must name the source relative to the map file, got %v", sourceMap.Sources)
	}
	lines := strings.Split(ledgerAccountTS, "\n")
	balanceLine, balanceColumn := -1, -1
	for index, line := range lines {
		if strings.Contains(line, "private balance") {
			balanceLine, balanceColumn = index, strings.Index(line, "balance")
		}
	}
	positions := sourcerewrite.OriginalPositions(sourceMap.Mappings)
	found := false
	for _, position := range positions {
		if position[0] != balanceLine {
			continue
		}
		if position[1] == balanceColumn {
			found = true
		}
		if position[1] == balanceColumn+2 {
			t.Errorf("a segment points at the overlay column %d, not the original %d", position[1], balanceColumn)
		}
	}
	if !found {
		t.Errorf("no segment points at `balance` (line %d, column %d): %v", balanceLine, balanceColumn, positions)
	}
}

const ledgerStaticConsumer = `import {getRunTypeId} from '@mionjs/run-types';
import {Account} from '@acme/ledger';
export const id = getRunTypeId<Account>();
`

const ledgerValueConsumer = `import {getRunTypeId} from '@mionjs/run-types';
import {Account} from '@acme/ledger';
declare const account: Account;
export const id = getRunTypeId(account);
`

// scanConsumer installs @acme/ledger from the given files and returns the consumer's site id and diagnostic codes.
func scanLedgerConsumer(t *testing.T, packageFiles map[string]string, consumer string) (string, []string) {
	t.Helper()
	dir := writeProject(t, map[string]string{"consumer.ts": consumer})
	for rel, content := range packageFiles {
		writeFile(t, filepath.Join(dir, "node_modules", "@acme", "ledger", filepath.FromSlash(rel)), content)
	}
	prog, err := program.New(program.Options{Cwd: dir, TsconfigPath: "tsconfig.json"})
	if err != nil {
		t.Fatalf("program: %v", err)
	}
	session, err := resolver.New(prog, resolver.Options{Cwd: dir, CacheDir: filepath.Join(dir, ".cache")})
	if err != nil {
		t.Fatalf("resolver: %v", err)
	}
	defer session.Close()
	resp := session.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{filepath.Join(dir, "src", "consumer.ts")}})
	if resp.Error != "" || len(resp.Sites) == 0 {
		t.Fatalf("scan: error %q, %d sites", resp.Error, len(resp.Sites))
	}
	codes := make([]string, 0, len(resp.Diagnostics))
	for _, diagnostic := range resp.Diagnostics {
		codes = append(codes, diagnostic.Code)
	}
	return resp.Sites[0].ID, codes
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
		"package.json":    `{"name": "@acme/ledger", "version": "1.0.0", "types": "./dist/index.d.ts"}`,
		"dist/money.d.ts": readEmitted(t, dir, "money.d.ts"),
		"dist/index.d.ts": readEmitted(t, dir, "index.d.ts"),
	}
}

func assertRoundTrip(t *testing.T, consumer string) {
	t.Helper()
	sourceID, _ := scanLedgerConsumer(t, ledgerFromSource(), consumer)
	compiledID, codes := scanLedgerConsumer(t, ledgerFromCompile(t), consumer)
	if sourceID != compiledID {
		t.Errorf("the compiled .d.ts must give the source id: source %s, compiled %s", sourceID, compiledID)
	}
	for _, code := range codes {
		if code == diagnostics.CodeMarkerTypelessPrivateMember {
			t.Errorf("a mion-compiled .d.ts must not raise %s", code)
		}
	}
}

func TestCompile_PrivateMembersRoundTrip_Static(t *testing.T) {
	assertRoundTrip(t, ledgerStaticConsumer)
}

func TestCompile_PrivateMembersRoundTrip_Value(t *testing.T) {
	assertRoundTrip(t, ledgerValueConsumer)
}

func TestCompile_PrivateMembersRoundTrip_FormEquivalence(t *testing.T) {
	compiled := ledgerFromCompile(t)
	staticID, _ := scanLedgerConsumer(t, compiled, ledgerStaticConsumer)
	valueID, _ := scanLedgerConsumer(t, compiled, ledgerValueConsumer)
	if staticID != valueID {
		t.Errorf("both call shapes must share one id: static %s, value %s", staticID, valueID)
	}
}
