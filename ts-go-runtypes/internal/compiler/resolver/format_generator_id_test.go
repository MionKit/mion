package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// scanGeneratorIDs scans code and returns the reflection-only site ids in source order, plus every diagnostic.
func scanGeneratorIDs(t *testing.T, code string) ([]string, []diagnostics.Diagnostic) {
	t.Helper()
	resp := setupInline(t, map[string]string{"test.ts": code}).Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"test.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	return siteIDsIn(resp, "test.ts"), resp.Diagnostics
}

const generatorTypes = `import {getRunTypeId} from '@mionjs/run-types';
import * as TF from '@mionjs/run-types/formats';
import {GEN} from '@mionjs/run-types/formats';
type First = TF.String<{maxLength: 120; generator: 'firstName'}>;
type Last = TF.String<{maxLength: 120; generator: GEN.lastName}>;
type LastLiteral = TF.String<{maxLength: 120; generator: 'lastName'}>;
`

// TestGeneratorID_TwinsDifferStatic: same bounds, different generator → different ids, and GEN.x = the literal.
func TestGeneratorID_TwinsDifferStatic(t *testing.T) {
	ids, diags := scanGeneratorIDs(t, generatorTypes+`
export const first = getRunTypeId<First>();
export const last = getRunTypeId<Last>();
export const lastLiteral = getRunTypeId<LastLiteral>();
`)
	assertGeneratorIDs(t, ids, diags)
}

// TestGeneratorID_TwinsDifferValue is the value call shape of the same three types.
func TestGeneratorID_TwinsDifferValue(t *testing.T) {
	ids, diags := scanGeneratorIDs(t, generatorTypes+`
declare const firstValue: First;
declare const lastValue: Last;
declare const lastLiteralValue: LastLiteral;
export const first = getRunTypeId(firstValue);
export const last = getRunTypeId(lastValue);
export const lastLiteral = getRunTypeId(lastLiteralValue);
`)
	assertGeneratorIDs(t, ids, diags)
}

func assertGeneratorIDs(t *testing.T, ids []string, diags []diagnostics.Diagnostic) {
	t.Helper()
	if len(ids) != 3 {
		t.Fatalf("want 3 site ids, got %v", ids)
	}
	if ids[0] == ids[1] {
		t.Fatalf("firstName and lastName twins must get different ids, both %q", ids[0])
	}
	if ids[1] != ids[2] {
		t.Fatalf("GEN.lastName and 'lastName' must give one id: %q vs %q", ids[1], ids[2])
	}
	for _, diag := range diags {
		if diag.Code == diagnostics.CodeFMTSampleConflict || strings.HasPrefix(diag.Code, "marker-comptime-arg-") {
			t.Fatalf("unexpected %s: %+v", diag.Code, diag)
		}
	}
}

// TestGeneratorID_ValueFirstBuilder: `TF.string({generator: GEN.lastName})` converges on the type-first id.
func TestGeneratorID_ValueFirstBuilder(t *testing.T) {
	ids, diags := scanGeneratorIDs(t, generatorTypes+`
export const last = getRunTypeId<LastLiteral>();
const built = TF.string({maxLength: 120, generator: GEN.lastName});
export const builtID = getRunTypeId(built);
const nested = TF.string({maxLength: 120, generator: TF.GEN.lastName});
export const nestedID = getRunTypeId(nested);
`)
	for _, diag := range diags {
		if strings.HasPrefix(diag.Code, "marker-comptime-arg-") {
			t.Fatalf("GEN.lastName must be read as a literal, got %+v", diag)
		}
	}
	if len(ids) < 3 || ids[0] != ids[len(ids)-2] || ids[0] != ids[len(ids)-1] {
		t.Fatalf("both builder spellings must converge on the type-first id, got %v", ids)
	}
}

// TestGeneratorID_StaticEqualsValue: the two getRunTypeId call shapes give one id for the same generator type.
func TestGeneratorID_StaticEqualsValue(t *testing.T) {
	ids, _ := scanGeneratorIDs(t, generatorTypes+`
declare const lastValue: Last;
export const static_ = getRunTypeId<Last>();
export const value = getRunTypeId(lastValue);
`)
	if len(ids) != 2 || ids[0] != ids[1] {
		t.Fatalf("both call shapes must give one id, got %v", ids)
	}
}
