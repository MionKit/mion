package resolver_test

import (
	"strings"
	"testing"

	_ "github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats/all"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// Each RT-fn family emits the right Temporal code: validate (instanceof), restore (Temporal.X.from), stringify (toJSON).
// One type per assertion keeps it fast; the scan test already covers all 8.

// emitSourcesFor seeds via createValidateFn, which demands `it`; other families need emitSourcesForFn with their createX.
func emitSourcesFor(t *testing.T, typeName string) *protocol.Response {
	t.Helper()
	return emitSourcesForFn(t, "createValidateFn", typeName)
}

// emitSourcesForFn scans `<fnName><Temporal.<typeName>>()` requesting entry
// modules. Demand-driven families (rjs/ruk/…) only emit when the call
// site demands them, so the caller picks the createX whose fnId maps to the
// family under assertion.
func emitSourcesForFn(t *testing.T, fnName, typeName string) *protocol.Response {
	t.Helper()
	code := `import {` + fnName + `} from '@mionjs/run-types';
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
	// rjs is demand-driven: createJsonDecoderFn (default clone → [rjs]) seeds it.
	resp := emitSourcesForFn(t, "createJsonDecoderFn", "PlainDate")
	if !strings.Contains(familyEntrySources(*resp, "restoreFromJsonClone"), "Temporal.PlainDate.from(") {
		t.Fatalf("restoreFromJsonClone missing Temporal.PlainDate.from:\n%s", familyEntrySources(*resp, "restoreFromJsonClone"))
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
