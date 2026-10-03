package resolver_test

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
	"github.com/mionkit/mion/ts-go-runtypes/internal/testfixtures"
)

// MKR016: plain tsc writes every TS `private` field, method and accessor of a class without its type in a .d.ts, so
// a class read from a published package checks those members as `any`. Paired static / value tests per the marker
// coverage rule.

// tscLedgerDts is what plain tsc emits for a class with a private field, method and getter.
const tscLedgerDts = `export declare class Account {
    id: string;
    private balance;
    private audit;
    private get label();
}
`

var tscLedgerMembers = []string{"balance", "audit", "label"}

func ledgerFiles(dts, site string) map[string]string {
	return map[string]string{
		"node_modules/@acme/ledger/package.json":    testfixtures.LedgerPackageJSON,
		"node_modules/@acme/ledger/dist/index.d.ts": dts,
		"consumer.ts": site,
	}
}

func scanLedger(t *testing.T, dts, site string) protocol.Response {
	t.Helper()
	resolver := setupInline(t, ledgerFiles(dts, site))
	resp := resolver.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"consumer.ts"}, IncludeRunTypes: true})
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
	if len(fired) != len(tscLedgerMembers) {
		t.Fatalf("want one MKR016 per typeless private member (%d), got %d (all codes: %v)", len(tscLedgerMembers), len(fired), codesOf(resp))
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
	for _, name := range tscLedgerMembers {
		if !members[name] {
			t.Errorf("want %s reported, got %v", name, members)
		}
	}
}

func TestTypelessPrivateMember_StaticFormFires(t *testing.T) {
	assertLedgerFires(t, testfixtures.LedgerStaticSite)
}

func TestTypelessPrivateMember_ValueFormFires(t *testing.T) {
	assertLedgerFires(t, testfixtures.LedgerValueSite)
}

func TestTypelessPrivateMember_FormEquivalence(t *testing.T) {
	static := scanLedger(t, tscLedgerDts, testfixtures.LedgerStaticSite)
	value := scanLedger(t, tscLedgerDts, testfixtures.LedgerValueSite)
	if len(static.Sites) == 0 || len(value.Sites) == 0 {
		t.Fatalf("missing sites: static %d, value %d", len(static.Sites), len(value.Sites))
	}
	if static.Sites[0].ID != value.Sites[0].ID {
		t.Errorf("both call shapes must share one id: static %s, value %s", static.Sites[0].ID, value.Sites[0].ID)
	}
}

const optionalLedgerDts = "export declare class Account { id: string; private note?; private set tag(value); }\n"

func assertOptionalAndSetterFire(t *testing.T, site string) {
	t.Helper()
	resp := scanLedger(t, optionalLedgerDts, site)
	members := map[string]bool{}
	for _, diagnostic := range mkr016Diags(resp) {
		members[diagnostic.Args[0]] = true
	}
	if !members["note"] || !members["tag"] {
		t.Errorf("want MKR016 for the optional member and the setter, got %v (codes %v)", members, codesOf(resp))
	}
}

func TestTypelessPrivateMember_OptionalAndSetterFire_Static(t *testing.T) {
	assertOptionalAndSetterFire(t, testfixtures.LedgerStaticSite)
}

func TestTypelessPrivateMember_OptionalAndSetterFire_Value(t *testing.T) {
	assertOptionalAndSetterFire(t, testfixtures.LedgerValueSite)
}

func TestTypelessPrivateMember_NestedStaticFires(t *testing.T) {
	resp := scanLedger(t, tscLedgerDts, `import {getRunTypeId} from '@mionjs/run-types';
import {Account} from '@acme/ledger';
export const id = getRunTypeId<{owner: string; account: Account}>();
`)
	if fired := mkr016Diags(resp); len(fired) != len(tscLedgerMembers) {
		t.Errorf("want MKR016 one object deeper, got %v", codesOf(resp))
	}
}

func TestTypelessPrivateMember_NestedValueFires(t *testing.T) {
	resp := scanLedger(t, tscLedgerDts, `import {getRunTypeId} from '@mionjs/run-types';
import {Account} from '@acme/ledger';
declare const holder: {owner: string; account: Account};
export const id = getRunTypeId(holder);
`)
	if fired := mkr016Diags(resp); len(fired) != len(tscLedgerMembers) {
		t.Errorf("want MKR016 one object deeper, got %v", codesOf(resp))
	}
}

// Every shape where the member keeps a type, or is not a TS `private`, stays quiet.
var typedLedgers = map[string]string{
	"typed private (mion compile)": "export declare class Account { id: string; private balance: number; private get label(): string; }\n",
	"protected":                    "export declare class Account { id: string; protected balance: number; }\n",
	"es private":                   "export declare class Account { #private; id: string; }\n",
	"private constructor":          "export declare class Account { id: string; private constructor(); }\n",
}

func assertQuietWhenTyped(t *testing.T, site string) {
	t.Helper()
	for name, dts := range typedLedgers {
		if fired := mkr016Diags(scanLedger(t, dts, site)); len(fired) > 0 {
			t.Errorf("%s: unexpected MKR016 %+v", name, fired)
		}
	}
}

func TestTypelessPrivateMember_QuietWhenTyped_Static(t *testing.T) {
	assertQuietWhenTyped(t, testfixtures.LedgerStaticSite)
}

func TestTypelessPrivateMember_QuietWhenTyped_Value(t *testing.T) {
	assertQuietWhenTyped(t, testfixtures.LedgerValueSite)
}

const sourceAccount = "export class Account { id = ''; private balance = 0; private audit(): void {} private get label(): string { return this.id; } }\n"

func assertQuietForSourceClass(t *testing.T, site string) {
	t.Helper()
	resolver := setupInline(t, map[string]string{"account.ts": sourceAccount, "consumer.ts": site})
	resp := resolver.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"consumer.ts"}})
	if fired := mkr016Diags(resp); len(fired) > 0 {
		t.Errorf("a source class keeps its private types, unexpected MKR016 %+v", fired)
	}
}

func TestTypelessPrivateMember_QuietForSourceClass_Static(t *testing.T) {
	assertQuietForSourceClass(t, "import {getRunTypeId} from '@mionjs/run-types';\nimport {Account} from './account.ts';\nexport const id = getRunTypeId<Account>();\n")
}

func TestTypelessPrivateMember_QuietForSourceClass_Value(t *testing.T) {
	assertQuietForSourceClass(t, "import {getRunTypeId} from '@mionjs/run-types';\nimport {Account} from './account.ts';\ndeclare const account: Account;\nexport const id = getRunTypeId(account);\n")
}

// Turned off, the error changes nothing but the halt: each member reads as an optional `any`, since a private
// method in a .d.ts looks just like a field and a plain JSON object never carries it.
func assertDowngradedReadsAsOptionalAny(t *testing.T, site string) {
	t.Helper()
	resolver := setupInline(t, ledgerFiles(tscLedgerDts, site))
	generated := resolver.Dispatch(protocol.Request{Op: protocol.OpGenerate})
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
	if downgraded != len(tscLedgerMembers) {
		t.Errorf("want every MKR016 kept as downgraded, got %d (codes %v)", downgraded, codesIn(generated.Diagnostics))
	}
	root := resolveFile(t, resolver, "consumer.ts")
	types := dump(resolver)
	for _, name := range []string{"balance", "audit"} {
		member := findMember(types, root, name)
		if member == nil {
			t.Errorf("%s: a typeless private member must stay in the shape", name)
			continue
		}
		if !member.Optional {
			t.Errorf("%s: must be optional", name)
		}
		if value := deref(types, member.Child); value == nil || value.Kind != reflection.KindAny {
			t.Errorf("%s: must read as any, got %+v", name, value)
		}
	}
}

func TestTypelessPrivateMember_DowngradedReadsAsOptionalAny_Static(t *testing.T) {
	assertDowngradedReadsAsOptionalAny(t, `import {getRunTypeId} from '@mionjs/run-types';
import {Account} from '@acme/ledger';
// @mion-downgrade-error MKR016
export const id = getRunTypeId<Account>();
`)
}

func TestTypelessPrivateMember_DowngradedReadsAsOptionalAny_Value(t *testing.T) {
	assertDowngradedReadsAsOptionalAny(t, `import {getRunTypeId} from '@mionjs/run-types';
import {Account} from '@acme/ledger';
declare const account: Account;
// @mion-downgrade-error MKR016
export const id = getRunTypeId(account);
`)
}

// A hand-written `any` member is legal, and the same `any` type as a typeless private member: it must not hide it.
const ledgerWithWrittenAnyDts = "export declare class Account { data: any; private balance; }\n"

func TestTypelessPrivateMember_NotHiddenByAWrittenAny_Static(t *testing.T) {
	if fired := mkr016Diags(scanLedger(t, ledgerWithWrittenAnyDts, testfixtures.LedgerStaticSite)); len(fired) != 1 {
		t.Errorf("want MKR016 for balance after a written any, got %d", len(fired))
	}
}

func TestTypelessPrivateMember_NotHiddenByAWrittenAny_Value(t *testing.T) {
	if fired := mkr016Diags(scanLedger(t, ledgerWithWrittenAnyDts, testfixtures.LedgerValueSite)); len(fired) != 1 {
		t.Errorf("want MKR016 for balance after a written any, got %d", len(fired))
	}
}
