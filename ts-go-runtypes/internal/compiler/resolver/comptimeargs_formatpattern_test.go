package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// The two documented spellings of a value-first `pattern` slot, side by side:
// an inline `{source, flags, mockSamples}` literal and a `registerFormatPattern`
// value bound to a const. Both are compile-time literals — the scanner recovers
// the bundle from the property's resolved TYPE either way — so neither may raise
// a CTA finding. These run against the REAL marker package (no ambient overlay),
// so the shape under test is the one a consumer writes.

// scanFormatPatternCTA scans a single test.ts against the real marker package
// and returns its CTA-family diagnostics.
func scanFormatPatternCTA(t *testing.T, code string) []diagnostics.Diagnostic {
	t.Helper()
	session := setupInline(t, map[string]string{"test.ts": code})
	response := session.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"test.ts"}})
	if response.Error != "" {
		t.Fatalf("scanFiles: %s", response.Error)
	}
	var cta []diagnostics.Diagnostic
	for _, diagnostic := range filterDiagsByFamily(response.Diagnostics, diagnostics.FamilyMarker) {
		if strings.HasPrefix(diagnostic.Code, "CTA") {
			cta = append(cta, diagnostic)
		}
	}
	return cta
}

// TestFormatPatternCTA_BothSpellingsAccepted is the finding's regression test:
// the registerFormatPattern value raised CTA003 ("function call") because the
// const-trace reached the call, while the inline literal beside it passed.
func TestFormatPatternCTA_BothSpellingsAccepted(t *testing.T) {
	const code = `import {registerFormatPattern} from '@mionjs/run-types';
import * as TF from '@mionjs/run-types/formats';
import * as RT from '@mionjs/run-types/builders';
const hexPattern = registerFormatPattern({source: '^[0-9a-f]+$', flags: 'i', mockSamples: ['DEADbeef']});
const Model = RT.object({
  slug: TF.string({pattern: {source: '^[a-z0-9-]+$', flags: '', mockSamples: ['ok-slug']}}),
  hex: TF.string({pattern: hexPattern}),
  inlineCall: TF.string({pattern: registerFormatPattern({source: '^[0-9]+$', mockSamples: ['42']})}),
});
void Model;
`
	if cta := scanFormatPatternCTA(t, code); len(cta) != 0 {
		t.Fatalf("expected no CTA diagnostics for the inline and registerFormatPattern pattern forms, got %d: %+v", len(cta), cta)
	}
}

// TestFormatPatternCTA_WidenedPatternRejected pins the limit of the acceptance:
// the call is a leaf only because its RETURN TYPE carries every field as a
// literal. A `FormatPattern` widened to `source: string` carries nothing the
// scanner can read, so it stays a CTA003 rather than silently losing the pattern.
func TestFormatPatternCTA_WidenedPatternRejected(t *testing.T) {
	const helpers = `import type {FormatPattern} from '@mionjs/run-types';
export declare function widePattern(): FormatPattern;
`
	const code = `import * as TF from '@mionjs/run-types/formats';
import * as RT from '@mionjs/run-types/builders';
import {widePattern} from './helpers.ts';
const wide = widePattern();
const Model = RT.object({loose: TF.string({pattern: wide})});
void Model;
`
	cta := scanFormatPatternCTA2(t, map[string]string{"helpers.ts": helpers, "test.ts": code})
	if len(cta) != 1 || cta[0].Code != diagnostics.CodeCompTimeArgsForbiddenConstruct {
		t.Fatalf("expected 1 CTA003 for a widened FormatPattern, got %d: %+v", len(cta), cta)
	}
}

// TestFormatPatternCTA_UserBundleRejected pins the other half of the gate: the
// return type must be DECLARED in the marker package. A user module's own
// all-literal bundle looks identical at the type level, but nothing reads it off
// the type, so dynamic construction stays rejected.
func TestFormatPatternCTA_UserBundleRejected(t *testing.T) {
	const helpers = `export function makePattern() {
  return {source: '^[0-9a-f]+$', flags: 'i'} as const;
}
`
	const code = `import * as TF from '@mionjs/run-types/formats';
import * as RT from '@mionjs/run-types/builders';
import {makePattern} from './helpers.ts';
const mine = makePattern();
const Model = RT.object({hex: TF.string({pattern: mine})});
void Model;
`
	cta := scanFormatPatternCTA2(t, map[string]string{"helpers.ts": helpers, "test.ts": code})
	if len(cta) != 1 || cta[0].Code != diagnostics.CodeCompTimeArgsForbiddenConstruct {
		t.Fatalf("expected 1 CTA003 for a user-module bundle call, got %d: %+v", len(cta), cta)
	}
}

// scanFormatPatternCTA2 is scanFormatPatternCTA over a multi-file overlay; only
// test.ts is scanned.
func scanFormatPatternCTA2(t *testing.T, sources map[string]string) []diagnostics.Diagnostic {
	t.Helper()
	session := setupInline(t, sources)
	response := session.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"test.ts"}})
	if response.Error != "" {
		t.Fatalf("scanFiles: %s", response.Error)
	}
	var cta []diagnostics.Diagnostic
	for _, diagnostic := range filterDiagsByFamily(response.Diagnostics, diagnostics.FamilyMarker) {
		if strings.HasPrefix(diagnostic.Code, "CTA") {
			cta = append(cta, diagnostic)
		}
	}
	return cta
}
