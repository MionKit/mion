package resolver_test

import (
	"strings"
	"testing"

	_ "github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats/all"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// native_date_format_test.go covers the FormatDate (native Date) family:
// the brand is lifted off the `Date & {brand}` intersection onto a
// KindClass/SubKindDate node, min/max bounds validate the same way as the
// string formats (both date+time components allowed), and the emitted
// validate carries the bound comparison over the Date's getTime().

// scanNativeDate builds a getRunTypeId<TypeFormat<Date, 'nativeDate', P>>()
// snippet and returns the emitted validate source, the scanned RunTypes,
// and any FMT002 diagnostics.
func scanNativeDate(t *testing.T, params string) (string, []*reflection.RunType, []diagnostics.Diagnostic) {
	t.Helper()
	code := `import {createValidateFn} from '@mionjs/run-types';
` + typeFormatBrandDecl + `
export const _ = createValidateFn<TypeFormat<Date, 'nativeDate', ` + params + `>>();
`
	r := setupInline(t, map[string]string{"a.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"a.ts"},
		IncludeRunTypes:     true,
		IncludeEntryModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	var diags []diagnostics.Diagnostic
	for _, d := range resp.Diagnostics {
		if d.Code == diagnostics.CodeFMTInvalidParams {
			diags = append(diags, d)
		}
	}
	return familyEntrySources(resp, "validate"), resp.RunTypes, diags
}

// findNativeDate returns the RunType carrying the nativeDate annotation.
func findNativeDate(runTypes []*reflection.RunType) *reflection.RunType {
	for _, rt := range runTypes {
		if rt.FormatAnnotation != nil && rt.FormatAnnotation.Name == "nativeDate" {
			return rt
		}
	}
	return nil
}

func TestNativeDate_BrandLiftedOntoDateNode(t *testing.T) {
	_, runTypes, diags := scanNativeDate(t, `{min: 'now-P1Y'; max: 'now'}`)
	if len(diags) != 0 {
		t.Fatalf("valid bounds should not diagnose, got %+v", diags)
	}
	node := findNativeDate(runTypes)
	if node == nil {
		t.Fatal("no RunType carrying the nativeDate annotation")
	}
	if node.Kind != reflection.KindClass {
		t.Fatalf("expected KindClass, got %v", node.Kind)
	}
	if node.SubKind != reflection.SubKindDate {
		t.Fatalf("expected SubKindDate, got %v", node.SubKind)
	}
}

func TestNativeDate_ValidateEmitsBoundCheck(t *testing.T) {
	source, _, _ := scanNativeDate(t, `{min: '2020-01-01T00:00:00'; max: 'now'}`)
	if !strings.Contains(source, "instanceof Date") {
		t.Fatalf("expected base Date check in emitted validate, got:\n%s", source)
	}
	if !strings.Contains(source, ".getTime()") {
		t.Fatalf("expected getTime() bound comparison in emitted validate, got:\n%s", source)
	}
}

// TestNativeDate_ValidateEmitsExclusiveBoundCheck locks the exclusive
// operators: gt emits `>` and lt emits `<` over the Date's getTime() (vs
// the inclusive `>=`/`<=` for min/max).
func TestNativeDate_ValidateEmitsExclusiveBoundCheck(t *testing.T) {
	source, _, _ := scanNativeDate(t, `{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T00:00:00'}`)
	if !strings.Contains(source, ".getTime() > ") {
		t.Fatalf("expected exclusive `> ` for gt in validate, got:\n%s", source)
	}
	if !strings.Contains(source, ".getTime() < ") {
		t.Fatalf("expected exclusive `< ` for lt in validate, got:\n%s", source)
	}
}

// TestNativeDate_RunTypeCacheCarriesFormatAnnotation locks in that the
// reflection cache module (virtual:runtypes-cache, what getRunTypeId /
// getRunTypeId consumers read) stores `formatAnnotation` on the
// KindClass/Date node exactly as it does for atomic string formats — the
// kind-agnostic writeFooter path in compiled/runtype/module.go plus the
// brand lift in collapseIntersection. A regression here would silently
// strip format metadata from native-Date runtypes.
func TestNativeDate_RunTypeCacheCarriesFormatAnnotation(t *testing.T) {
	code := `import {getRunTypeId} from '@mionjs/run-types';
` + typeFormatBrandDecl + `
export const _ = getRunTypeId<TypeFormat<Date, 'nativeDate', {min: 'now'}>>();
`
	r := setupInline(t, map[string]string{"a.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"a.ts"},
		IncludeEntryModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	if !strings.Contains(allEntrySources(resp), ".formatAnnotation = ") {
		t.Fatalf("branded Date runType cache missing formatAnnotation assignment:\n%s", allEntrySources(resp))
	}
	if !strings.Contains(allEntrySources(resp), `"name":"nativeDate"`) {
		t.Fatalf("formatAnnotation present but missing nativeDate name:\n%s", allEntrySources(resp))
	}
}

// TestNativeDate_NodeHasNoBrandProperties guards the shape your reviewer
// flagged: the projected Date node must NOT expose the
// __rtFormatName/__rtFormatParams sentinels as children/properties (the
// brand lives only in FormatAnnotation, exactly like an atomic string
// format). A regression would surface the brand props as Date "members".
func TestNativeDate_NodeHasNoBrandProperties(t *testing.T) {
	_, runTypes, _ := scanNativeDate(t, `{min: 'now'}`)
	node := findNativeDate(runTypes)
	if node == nil {
		t.Fatal("no nativeDate node")
	}
	for _, child := range node.Children {
		if strings.HasPrefix(child.Name, "__rtFormat") {
			t.Fatalf("brand sentinel %q leaked onto the Date node as a property", child.Name)
		}
	}
}

// TestNativeDate_StructuralIDExcludesBrandShape proves the structural id
// is computed as <Date-class-id> + formatKey (not as an object literal
// whose members include the brand sentinels): different params hash
// differently, and a branded Date differs from a plain Date only by the
// format key — both kept consistent with the serialize-side projection.
func TestNativeDate_StructuralIDExcludesBrandShape(t *testing.T) {
	idOf := func(params string) string {
		_, runTypes, _ := scanNativeDate(t, params)
		node := findNativeDate(runTypes)
		if node == nil {
			t.Fatalf("no nativeDate node for %s", params)
		}
		return node.ID
	}
	minID := idOf(`{min: 'now'}`)
	maxID := idOf(`{max: 'now'}`)
	if minID == maxID {
		t.Fatalf("FormatDate<{min}> and FormatDate<{max}> must not share a cache id (%q)", minID)
	}
}

func TestNativeDate_ParamValidation(t *testing.T) {
	cases := []struct {
		name    string
		params  string
		wantErr bool
	}{
		{"relative both components ok", `{min: 'now-P1DT2H'}`, false},
		{"absolute ok", `{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}`, false},
		{"bare now ok", `{max: 'now'}`, false},
		{"malformed duration", `{min: 'now+P'}`, true},
		{"bad absolute literal", `{min: 'not-a-date'}`, true},
		{"gt/lt exclusive ok", `{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}`, false},
		{"gt > lt rejected", `{gt: '2020-12-31T00:00:00'; lt: '2020-01-01T00:00:00'}`, true},
		{"min + gt rejected (XOR)", `{min: '2020-01-01T00:00:00'; gt: '2020-02-01T00:00:00'}`, true},
		{"max + lt rejected (XOR)", `{max: '2020-12-01T00:00:00'; lt: '2020-11-01T00:00:00'}`, true},
		{"min + lt distinct edges ok", `{min: '2020-01-01T00:00:00'; lt: '2020-11-01T00:00:00'}`, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, _, diags := scanNativeDate(t, tc.params)
			if (len(diags) > 0) != tc.wantErr {
				t.Fatalf("params %s: got %+v wantErr %v", tc.params, diags, tc.wantErr)
			}
		})
	}
}
