package resolver_test

import (
	"testing"

	_ "github.com/mionkit/ts-runtypes/internal/cachegen/typefunctions/formats/all"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// temporalNotLoadedDiags scans `code` and returns the TMP001 diagnostics.
// When suppressAmbient is true, an EMPTY temporal.d.ts is overlaid so the
// `Temporal` namespace is NOT declared — simulating a consumer whose tsconfig
// lib doesn't load Temporal (the type resolves to `any`).
func temporalNotLoadedDiags(t *testing.T, code string, suppressAmbient bool) []diagnostics.Diagnostic {
	t.Helper()
	sources := map[string]string{"a.ts": code}
	if suppressAmbient {
		sources["temporal.d.ts"] = "// no Temporal namespace declared\n"
	}
	r := setupInline(t, sources)
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	var out []diagnostics.Diagnostic
	for _, d := range resp.Diagnostics {
		if d.Code == diagnostics.CodeTemporalNotLoaded {
			out = append(out, d)
		}
	}
	return out
}

func TestTemporalGuard_FiresWhenLibMissing(t *testing.T) {
	code := `import {getRunTypeId} from '@mionjs/run-types';
export const _ = getRunTypeId<Temporal.PlainDate>();
`
	diags := temporalNotLoadedDiags(t, code, true)
	if len(diags) != 1 {
		t.Fatalf("expected 1 TMP001 when Temporal lib missing, got %d", len(diags))
	}
	if diags[0].Severity != diagnostics.SeverityError {
		t.Errorf("expected Error severity, got %d", diags[0].Severity)
	}
	if len(diags[0].Args) == 0 || diags[0].Args[0] != "Temporal.PlainDate" {
		t.Errorf("expected arg Temporal.PlainDate, got %+v", diags[0].Args)
	}
}

func TestTemporalGuard_SilentWhenLibLoaded(t *testing.T) {
	code := `import {getRunTypeId} from '@mionjs/run-types';
export const _ = getRunTypeId<Temporal.PlainDate>();
`
	// Ambient present (default) → Temporal.PlainDate is a real type → no diag.
	if diags := temporalNotLoadedDiags(t, code, false); len(diags) != 0 {
		t.Fatalf("expected NO TMP001 when Temporal lib loaded, got %+v", diags)
	}
}

func TestTemporalGuard_FiresForNestedTemporalProperty(t *testing.T) {
	code := `import {getRunTypeId} from '@mionjs/run-types';
export const _ = getRunTypeId<{createdAt: Temporal.Instant; name: string}>();
`
	diags := temporalNotLoadedDiags(t, code, true)
	if len(diags) != 1 {
		t.Fatalf("expected 1 TMP001 for nested Temporal.Instant, got %d", len(diags))
	}
	if diags[0].Args[0] != "Temporal.Instant" {
		t.Errorf("expected Temporal.Instant, got %+v", diags[0].Args)
	}
}

// The predicate split from the MKR013 sibling, pinned. A consumer-side stub
// (`declare namespace Temporal { type PlainDate = any }`) resolves to the TRUE
// `any` intrinsic — not the checker's error type — so the generic guard treats
// it as deliberate `any` and stays silent, while the Temporal guard still
// refuses the WRITTEN reference: no builtin Temporal name may mean `any`. The
// value-first shape writes no type syntax at the call, so a stubbed value
// passes as deliberate `any` — the guards only see call-site syntax.
func TestTemporalGuard_AnyStub(t *testing.T) {
	stub := "declare namespace Temporal { type PlainDate = any }\n"
	countCodes := func(resp protocol.Response) (tmp001, mkr013 int) {
		for _, d := range resp.Diagnostics {
			switch d.Code {
			case diagnostics.CodeTemporalNotLoaded:
				tmp001++
			case diagnostics.CodeMarkerUnresolvedTypeName:
				mkr013++
			}
		}
		return tmp001, mkr013
	}
	t.Run("static getRunTypeId<T>() refuses the stubbed reference", func(t *testing.T) {
		r := setupInline(t, map[string]string{
			"temporal.d.ts": stub,
			"a.ts": `import {getRunTypeId} from '@mionjs/run-types';
export const _ = getRunTypeId<Temporal.PlainDate>();
`,
		})
		resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
		if resp.Error != "" {
			t.Fatalf("scan: %s", resp.Error)
		}
		tmp001, mkr013 := countCodes(resp)
		if tmp001 != 1 {
			t.Fatalf("stubbed Temporal.PlainDate must fire TMP001, got %d", tmp001)
		}
		if mkr013 != 0 {
			t.Errorf("the generic guard must not double-report the stub (true `any` intrinsic), got %d MKR013", mkr013)
		}
	})
	t.Run("value-first getRunTypeId(value) passes the stub as deliberate any", func(t *testing.T) {
		r := setupInline(t, map[string]string{
			"temporal.d.ts": stub,
			"a.ts": `import {getRunTypeId} from '@mionjs/run-types';
declare const when: Temporal.PlainDate;
export const _ = getRunTypeId(when);
`,
		})
		resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
		if resp.Error != "" {
			t.Fatalf("scan: %s", resp.Error)
		}
		tmp001, mkr013 := countCodes(resp)
		if tmp001 != 0 || mkr013 != 0 {
			t.Fatalf("value-first over a stubbed (true-any) Temporal must stay silent, got TMP001=%d MKR013=%d", tmp001, mkr013)
		}
	})
}

// A user type literally named `Temporal.Foo` (not a builtin) or a bare
// `PlainDate` must NOT trip the guard.
func TestTemporalGuard_IgnoresNonBuiltinNames(t *testing.T) {
	code := `import {getRunTypeId} from '@mionjs/run-types';
interface PlainDate { y: number }
export const _ = getRunTypeId<PlainDate>();
`
	if diags := temporalNotLoadedDiags(t, code, true); len(diags) != 0 {
		t.Fatalf("bare PlainDate should not trip the guard, got %+v", diags)
	}
}
