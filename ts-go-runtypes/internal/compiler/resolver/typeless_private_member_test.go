package resolver_test

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// MKR016: plain tsc writes every TS `private` field and method of a class as `private name;` in a .d.ts, so a
// class read from a published package checks those members as `any`. Paired static / value tests per the
// marker coverage rule.

const ledgerPackageJSON = `{"name": "@acme/ledger", "version": "1.0.0", "types": "./dist/index.d.ts"}`

// tscLedgerDts is what plain tsc emits for `class Account { id = ”; private balance = 0; private audit() {} }`.
const tscLedgerDts = `export declare class Account {
    id: string;
    private balance;
    private audit;
}
`

const ledgerStaticSite = `import {getRunTypeId} from '@mionjs/run-types';
import {Account} from '@acme/ledger';
export const id = getRunTypeId<Account>();
`

const ledgerValueSite = `import {getRunTypeId} from '@mionjs/run-types';
import {Account} from '@acme/ledger';
declare const account: Account;
export const id = getRunTypeId(account);
`

func ledgerFiles(dts, site string) map[string]string {
	return map[string]string{
		"node_modules/@acme/ledger/package.json":    ledgerPackageJSON,
		"node_modules/@acme/ledger/dist/index.d.ts": dts,
		"consumer.ts": site,
	}
}

func scanLedger(t *testing.T, dts, site string) protocol.Response {
	t.Helper()
	r := setupInline(t, ledgerFiles(dts, site))
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"consumer.ts"}, IncludeRunTypes: true})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	return resp
}

func mkr016Diags(resp protocol.Response) []diagnostics.Diagnostic {
	var out []diagnostics.Diagnostic
	for _, diagnostic := range resp.Diagnostics {
		if diagnostic.Code == diagnostics.CodeMarkerTypelessPrivateMember {
			out = append(out, diagnostic)
		}
	}
	return out
}

// assertLedgerFires checks one error per typeless member, the shared `any` included: the walk must not stop at the first.
func assertLedgerFires(t *testing.T, site string) {
	t.Helper()
	resp := scanLedger(t, tscLedgerDts, site)
	fired := mkr016Diags(resp)
	if len(fired) != 2 {
		t.Fatalf("want one MKR016 per typeless private member (2), got %d (all codes: %v)", len(fired), codesOf(resp))
	}
	members := map[string]bool{}
	for _, diagnostic := range fired {
		if len(diagnostic.Args) != 2 || diagnostic.Args[1] != "Account" {
			t.Errorf("MKR016 must name the member and the class, args=%v", diagnostic.Args)
			continue
		}
		members[diagnostic.Args[0]] = true
		if diagnostic.Severity != diagnostics.SeverityError {
			t.Errorf("MKR016 must fail the build, severity %v", diagnostic.Severity)
		}
	}
	if !members["balance"] || !members["audit"] {
		t.Errorf("want balance and audit reported, got %v", members)
	}
}

func TestTypelessPrivateMember_StaticFormFires(t *testing.T) {
	assertLedgerFires(t, ledgerStaticSite)
}

func TestTypelessPrivateMember_ValueFormFires(t *testing.T) {
	assertLedgerFires(t, ledgerValueSite)
}

func TestTypelessPrivateMember_FormEquivalence(t *testing.T) {
	static := scanLedger(t, tscLedgerDts, ledgerStaticSite)
	value := scanLedger(t, tscLedgerDts, ledgerValueSite)
	if len(static.Sites) == 0 || len(value.Sites) == 0 {
		t.Fatalf("missing sites: static %d, value %d", len(static.Sites), len(value.Sites))
	}
	if static.Sites[0].ID != value.Sites[0].ID {
		t.Errorf("both call shapes must share one id: static %s, value %s", static.Sites[0].ID, value.Sites[0].ID)
	}
}

func TestTypelessPrivateMember_OptionalFires(t *testing.T) {
	resp := scanLedger(t, "export declare class Account { id: string; private note?; }\n", ledgerStaticSite)
	if fired := mkr016Diags(resp); len(fired) != 1 || fired[0].Args[0] != "note" {
		t.Errorf("want MKR016 for the optional typeless member, got %v", codesOf(resp))
	}
}

func TestTypelessPrivateMember_NestedStaticFires(t *testing.T) {
	resp := scanLedger(t, tscLedgerDts, `import {getRunTypeId} from '@mionjs/run-types';
import {Account} from '@acme/ledger';
export const id = getRunTypeId<{owner: string; account: Account}>();
`)
	if fired := mkr016Diags(resp); len(fired) != 2 {
		t.Errorf("want MKR016 one object deeper, got %v", codesOf(resp))
	}
}

func TestTypelessPrivateMember_NestedValueFires(t *testing.T) {
	resp := scanLedger(t, tscLedgerDts, `import {getRunTypeId} from '@mionjs/run-types';
import {Account} from '@acme/ledger';
declare const holder: {owner: string; account: Account};
export const id = getRunTypeId(holder);
`)
	if fired := mkr016Diags(resp); len(fired) != 2 {
		t.Errorf("want MKR016 one object deeper, got %v", codesOf(resp))
	}
}

// Every shape where the member keeps a type, or is not a TS `private`, stays quiet.
func TestTypelessPrivateMember_QuietWhenTyped(t *testing.T) {
	quiet := map[string]string{
		"typed private (mion compile)": "export declare class Account { id: string; private balance: number; }\n",
		"protected":                    "export declare class Account { id: string; protected balance: number; }\n",
		"es private":                   "export declare class Account { #private; id: string; }\n",
		"private constructor":          "export declare class Account { id: string; private constructor(); }\n",
	}
	for name, dts := range quiet {
		for shape, site := range map[string]string{"static": ledgerStaticSite, "value": ledgerValueSite} {
			if fired := mkr016Diags(scanLedger(t, dts, site)); len(fired) > 0 {
				t.Errorf("%s (%s): unexpected MKR016 %+v", name, shape, fired)
			}
		}
	}
}

func TestTypelessPrivateMember_QuietForSourceClass(t *testing.T) {
	source := "export class Account { id = ''; private balance = 0; private audit(): void {} }\n"
	for shape, site := range map[string]string{
		"static": "import {getRunTypeId} from '@mionjs/run-types';\nimport {Account} from './account.ts';\nexport const id = getRunTypeId<Account>();\n",
		"value":  "import {getRunTypeId} from '@mionjs/run-types';\nimport {Account} from './account.ts';\ndeclare const account: Account;\nexport const id = getRunTypeId(account);\n",
	} {
		r := setupInline(t, map[string]string{"account.ts": source, "consumer.ts": site})
		resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"consumer.ts"}})
		if fired := mkr016Diags(resp); len(fired) > 0 {
			t.Errorf("%s: a source class keeps its private types, unexpected MKR016 %+v", shape, fired)
		}
	}
}

// Turned off, the error changes nothing: the member is still read as a required `any`.
func TestTypelessPrivateMember_DowngradedReadsAsAny(t *testing.T) {
	site := `import {getRunTypeId} from '@mionjs/run-types';
import {Account} from '@acme/ledger';
// @mion-downgrade-error MKR016
export const id = getRunTypeId<Account>();
`
	r := setupInline(t, ledgerFiles(tscLedgerDts, site))
	generated := r.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if generated.Error != "" {
		t.Fatalf("generate: %s", generated.Error)
	}
	downgraded := 0
	for _, diagnostic := range generated.Diagnostics {
		if diagnostic.Code == diagnostics.CodeMarkerTypelessPrivateMember {
			if !diagnostic.Downgraded {
				t.Errorf("MKR016 under the directive must be kept and marked downgraded: %+v", diagnostic)
			}
			downgraded++
		}
	}
	if downgraded != 2 {
		t.Errorf("want both MKR016 kept as downgraded, got %d (codes %v)", downgraded, codesIn(generated.Diagnostics))
	}
	root := resolveFile(t, r, "consumer.ts")
	types := dump(r)
	for _, name := range []string{"balance", "audit"} {
		member := findMember(types, root, name)
		if member == nil {
			t.Errorf("%s: a typeless private member must stay in the shape", name)
			continue
		}
		if member.Optional {
			t.Errorf("%s: must stay required", name)
		}
		if value := deref(types, member.Child); value == nil || value.Kind != reflection.KindAny {
			t.Errorf("%s: must read as any, got %+v", name, value)
		}
	}
}
