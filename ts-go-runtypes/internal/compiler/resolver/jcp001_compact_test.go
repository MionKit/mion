package resolver_test

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// JCP001: `compact` over a function / symbol leaf at a propagating position (tuple slot, array element, record value,
// callable object) must render an alwaysThrow with its sibling's code (cj as clone → PJS*, cjr as mutate → RJ*),
// never an empty entry the composite still binds.

// jcp001CompactCase pairs a type shape with the root code its
// unserializable-leaf position should surface (identical across the compact and
// sibling strategies).
type jcp001CompactCase struct {
	name    string
	shape   string
	encoder string // expected encoder root code (clone == compact)
	decoder string // expected decoder root code (mutate == compact)
}

var jcp001CompactCases = []jcp001CompactCase{
	{"tuple_fn", `type T = [string, () => void]`, diagnostics.CodePJSFunctionRoot, diagnostics.CodeRJFunctionRoot},
	{"array_fn", `type T = Array<() => void>`, diagnostics.CodePJSFunctionRoot, diagnostics.CodeRJFunctionRoot},
	{"callable_iface", `interface T { (x: number): number; a: string }`, diagnostics.CodePJSFunctionRoot, diagnostics.CodeRJFunctionRoot},
	{"tuple_symbol", `type T = [number, symbol]`, diagnostics.CodePJSSymbolRoot, diagnostics.CodeRJSymbolRoot},
	{"record_symbol", `type T = Record<string, symbol>`, diagnostics.CodePJSSymbolRoot, diagnostics.CodeRJSymbolRoot},
}

// runtypeCodes collects the runtype-family diagnostic codes a scan produced.
func runtypeCodes(t *testing.T, shape, fn, strategy string) []string {
	t.Helper()
	code := "import {createJsonEncoderFn, createJsonDecoderFn} from '@mionjs/run-types';\n" +
		shape + ";\n" +
		"export const _ = " + fn + "<T>(undefined, {strategy: '" + strategy + "'});\n"
	r := setupInline(t, map[string]string{"a.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"a.ts"},
		IncludeEntryModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	var codes []string
	for _, d := range resp.Diagnostics {
		if d.Code == diagnostics.CodeCompositeMissingPrimitive {
			t.Fatalf("JCP001 internal breach for %s/%s: args=%v", shape, strategy, d.Args)
		}
		if d.Family == diagnostics.FamilyRunType {
			codes = append(codes, d.Code)
		}
	}
	return codes
}

func containsCode(codes []string, want string) bool {
	for _, c := range codes {
		if c == want {
			return true
		}
	}
	return false
}

// TestJCP001_CompactMatchesSibling pins that compact encode/decode surface the
// same alwaysThrow root code as clone/mutate and never trip JCP001.
func TestJCP001_CompactMatchesSibling(t *testing.T) {
	for _, tc := range jcp001CompactCases {
		t.Run(tc.name, func(t *testing.T) {
			// Encoder: compact (cj) must match clone (pjs).
			cloneCodes := runtypeCodes(t, tc.shape, "createJsonEncoderFn", "clone")
			compactEnc := runtypeCodes(t, tc.shape, "createJsonEncoderFn", "compact")
			if !containsCode(cloneCodes, tc.encoder) {
				t.Fatalf("clone encoder should surface %s, got %v", tc.encoder, cloneCodes)
			}
			if !containsCode(compactEnc, tc.encoder) {
				t.Errorf("compact encoder should surface %s (matching clone), got %v", tc.encoder, compactEnc)
			}

			// Decoder: compact (cjr) must match mutate (rj).
			mutateCodes := runtypeCodes(t, tc.shape, "createJsonDecoderFn", "mutate")
			compactDec := runtypeCodes(t, tc.shape, "createJsonDecoderFn", "compact")
			if !containsCode(mutateCodes, tc.decoder) {
				t.Fatalf("mutate decoder should surface %s, got %v", tc.decoder, mutateCodes)
			}
			if !containsCode(compactDec, tc.decoder) {
				t.Errorf("compact decoder should surface %s (matching mutate), got %v", tc.decoder, compactDec)
			}
		})
	}
}

// TestJCP001_CompactPropertyDropStillWarns — an unserializable member at a
// PROPERTY position (not propagating) is dropped with a Warning, exactly like
// the sibling strategies; the object still renders, so no root throw and no
// JCP001. Guards that the diag-code delegation also wires the per-slot drop
// diagnostics (SlotMethodDropped, …), which were silent no-ops before the fix —
// asserted by matching clone's dropped-property warning code exactly.
func TestJCP001_CompactPropertyDropStillWarns(t *testing.T) {
	const shape = `interface T { a: string; onClick: () => void }`
	cloneEnc := runtypeCodes(t, shape, "createJsonEncoderFn", "clone")
	compactEnc := runtypeCodes(t, shape, "createJsonEncoderFn", "compact")
	if len(cloneEnc) == 0 {
		t.Fatalf("clone encoder should warn on a dropped function property, got none")
	}
	// Same dropped-property warning code as clone (PJS011 = method/function
	// value dropped); before the fix compact emitted nothing here.
	if !containsCode(cloneEnc, diagnostics.CodePJSMethodDropped) {
		t.Fatalf("expected clone to warn %s, got %v", diagnostics.CodePJSMethodDropped, cloneEnc)
	}
	if !containsCode(compactEnc, diagnostics.CodePJSMethodDropped) {
		t.Errorf("compact encoder should warn %s on a dropped function property (matching clone), got %v",
			diagnostics.CodePJSMethodDropped, compactEnc)
	}
}
