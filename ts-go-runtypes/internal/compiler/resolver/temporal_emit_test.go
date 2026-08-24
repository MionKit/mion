package resolver_test

import (
	"strings"
	"testing"

	_ "github.com/mionkit/ts-runtypes/internal/cachegen/typefunctions/formats/all"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// temporal_emit_test.go asserts each RT-fn family emits the right code for a
// Temporal type: validate (instanceof), restore (Temporal.X.from), stringify
// (toJSON), binary (serString/desString + from). One representative type per
// assertion keeps it fast; the scan test already covers all 8 detect.

// emitSourcesFor scans createValidateFn<Temporal.<typeName>>() requesting entry
// modules, and returns the response. Use this for families seeded by the
// always-emit `it` path (validate / JSON / runType); binary families are now
// demand-driven, so they must be seeded via emitSourcesForFn with the matching
// createBinaryEncoderFn/Decoder call.
func emitSourcesFor(t *testing.T, typeName string) *protocol.Response {
	t.Helper()
	return emitSourcesForFn(t, "createValidateFn", typeName)
}

// emitSourcesForFn scans `<fnName><Temporal.<typeName>>()` requesting entry
// modules. Demand-driven families (tb/fb/huk/…) only emit when the call
// site demands them, so the caller picks the createX whose fnId maps to the
// family under assertion (binary→createBinaryEncoderFn/createBinaryDecoderFn).
func emitSourcesForFn(t *testing.T, fnName, typeName string) *protocol.Response {
	t.Helper()
	code := `import {` + fnName + `} from '@ts-runtypes/core';
export const _ = ` + fnName + `<Temporal.` + typeName + `>();
`
	r := setupInline(t, map[string]string{"a.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}, IncludeEntryModules: true})
	if resp.Error != "" {
		t.Fatalf("scan %s: %s", typeName, resp.Error)
	}
	return &resp
}

func TestTemporal_EmitValidate(t *testing.T) {
	cases := map[string]string{
		"PlainDate":     "instanceof Temporal.PlainDate",
		"Instant":       "instanceof Temporal.Instant",
		"ZonedDateTime": "instanceof Temporal.ZonedDateTime",
		"Duration":      "instanceof Temporal.Duration",
	}
	for typeName, want := range cases {
		t.Run(typeName, func(t *testing.T) {
			resp := emitSourcesFor(t, typeName)
			if !strings.Contains(familyEntrySources(*resp, "validate"), want) {
				t.Fatalf("%s validate missing %q:\n%s", typeName, want, familyEntrySources(*resp, "validate"))
			}
		})
	}
}

func TestTemporal_EmitRestoreFromJson(t *testing.T) {
	// rj is demand-driven now: createJsonDecoderFn (default strip → [rj, ukuw]) seeds it.
	resp := emitSourcesForFn(t, "createJsonDecoderFn", "PlainDate")
	if !strings.Contains(familyEntrySources(*resp, "restoreFromJson"), "Temporal.PlainDate.from(") {
		t.Fatalf("restoreFromJson missing Temporal.PlainDate.from:\n%s", familyEntrySources(*resp, "restoreFromJson"))
	}
}

func TestTemporal_EmitStringifyJson(t *testing.T) {
	// sj is demand-driven now: only createJsonEncoderFn(direct) → [sj] seeds it.
	code := `import {createJsonEncoderFn} from '@ts-runtypes/core';
export const _ = createJsonEncoderFn<Temporal.Instant>(undefined, {strategy: 'direct'});
`
	r := setupInline(t, map[string]string{"a.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}, IncludeEntryModules: true})
	if resp.Error != "" {
		t.Fatalf("scan Instant: %s", resp.Error)
	}
	if !strings.Contains(familyEntrySources(resp, "stringifyJson"), ".toJSON()") {
		t.Fatalf("stringifyJson missing toJSON():\n%s", familyEntrySources(resp, "stringifyJson"))
	}
}

func TestTemporal_EmitBinaryRoundTripShape(t *testing.T) {
	// Numeric-packed type: the emitter dispatches to the serializer's
	// serTemporal*/desTemporal* methods — the byte layout lives in the runtime
	// dataView.ts, asserted end-to-end in JS (test/adapters/temporal.test.ts).
	// tb/fb are demand-driven now: seed each via the matching binary createX.
	to := emitSourcesForFn(t, "createBinaryEncoderFn", "PlainDateTime")
	if !strings.Contains(familyEntrySources(*to, "toBinary"), ".serTemporalPlainDateTime(") {
		t.Fatalf("toBinary missing serTemporalPlainDateTime():\n%s", familyEntrySources(*to, "toBinary"))
	}
	from := emitSourcesForFn(t, "createBinaryDecoderFn", "PlainDateTime")
	if !strings.Contains(familyEntrySources(*from, "fromBinary"), ".desTemporalPlainDateTime()") {
		t.Fatalf("fromBinary missing desTemporalPlainDateTime():\n%s", familyEntrySources(*from, "fromBinary"))
	}

	// String-fallback type (Duration): keeps serString(toJSON()) / from(desString()).
	durTo := emitSourcesForFn(t, "createBinaryEncoderFn", "Duration")
	if !strings.Contains(familyEntrySources(*durTo, "toBinary"), ".serString(") || !strings.Contains(familyEntrySources(*durTo, "toBinary"), ".toJSON()") {
		t.Fatalf("Duration toBinary missing serString(toJSON()):\n%s", familyEntrySources(*durTo, "toBinary"))
	}
	durFrom := emitSourcesForFn(t, "createBinaryDecoderFn", "Duration")
	if !strings.Contains(familyEntrySources(*durFrom, "fromBinary"), "Temporal.Duration.from(") || !strings.Contains(familyEntrySources(*durFrom, "fromBinary"), ".desString()") {
		t.Fatalf("Duration fromBinary missing from(desString()):\n%s", familyEntrySources(*durFrom, "fromBinary"))
	}
}

func TestTemporal_RunTypeCacheCarriesClassType(t *testing.T) {
	// classType wiring lives in the runtype bundle, which is demand-driven on
	// REFLECTION sites — seed via getRunTypeId, not a createX call (a
	// createX-only file emits zero runtype modules).
	resp := emitSourcesForFn(t, "getRunTypeId", "PlainDate")
	if !strings.Contains(allEntrySources(*resp), "globalThis.Temporal.PlainDate") {
		t.Fatalf("runType bundle missing classType wiring globalThis.Temporal.PlainDate:\n%s", allEntrySources(*resp))
	}
}
