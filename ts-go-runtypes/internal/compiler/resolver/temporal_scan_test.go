package resolver_test

import (
	"testing"

	_ "github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats/all"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// temporal_scan_test.go proves the scanner recognises every builtin Temporal
// type: namespace-qualified detection → KindClass + the right SubKind +
// ClassRef.Builtin = "Temporal.<Name>", and distinct structural ids per type.

// scanTemporal returns the root RunType for getRunTypeId<Temporal.<typeName>>().
func scanTemporal(t *testing.T, typeName string) *reflection.RunType {
	t.Helper()
	code := `import {getRunTypeId} from '@mionjs/run-types';
export const _ = getRunTypeId<Temporal.` + typeName + `>();
`
	r := setupInline(t, map[string]string{"a.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}, IncludeRunTypes: true})
	if resp.Error != "" {
		t.Fatalf("scan %s: %s", typeName, resp.Error)
	}
	for _, rt := range resp.RunTypes {
		if rt.SubKind != 0 && reflection.IsTemporalSubKind(rt.SubKind) {
			return rt
		}
	}
	t.Fatalf("no Temporal RunType found for %s; got %d runtypes", typeName, len(resp.RunTypes))
	return nil
}

func TestTemporal_ScanAllTypes(t *testing.T) {
	cases := []struct {
		typeName string
		subKind  reflection.ReflectionSubKind
		builtin  string
	}{
		{"Instant", reflection.SubKindTemporalInstant, "Temporal.Instant"},
		{"ZonedDateTime", reflection.SubKindTemporalZonedDateTime, "Temporal.ZonedDateTime"},
		{"PlainDate", reflection.SubKindTemporalPlainDate, "Temporal.PlainDate"},
		{"PlainTime", reflection.SubKindTemporalPlainTime, "Temporal.PlainTime"},
		{"PlainDateTime", reflection.SubKindTemporalPlainDateTime, "Temporal.PlainDateTime"},
		{"PlainYearMonth", reflection.SubKindTemporalPlainYearMonth, "Temporal.PlainYearMonth"},
		{"PlainMonthDay", reflection.SubKindTemporalPlainMonthDay, "Temporal.PlainMonthDay"},
		{"Duration", reflection.SubKindTemporalDuration, "Temporal.Duration"},
	}
	ids := map[string]string{}
	for _, tc := range cases {
		t.Run(tc.typeName, func(t *testing.T) {
			node := scanTemporal(t, tc.typeName)
			if node.Kind != reflection.KindClass {
				t.Fatalf("%s: expected KindClass, got %v", tc.typeName, node.Kind)
			}
			if node.SubKind != tc.subKind {
				t.Fatalf("%s: expected SubKind %d, got %d", tc.typeName, tc.subKind, node.SubKind)
			}
			if node.ClassRef == nil || node.ClassRef.Builtin != tc.builtin {
				t.Fatalf("%s: expected ClassRef.Builtin %q, got %+v", tc.typeName, tc.builtin, node.ClassRef)
			}
			// Temporal node must NOT expose its interface methods as data
			// children (atomic builtin, like Date).
			if len(node.Children) != 0 {
				t.Fatalf("%s: expected no children, got %d", tc.typeName, len(node.Children))
			}
			ids[tc.typeName] = node.ID
		})
	}
	// Every Temporal type must hash to a distinct structural id.
	seen := map[string]string{}
	for name, id := range ids {
		if prev, dup := seen[id]; dup {
			t.Fatalf("id collision: %s and %s both hash to %q", prev, name, id)
		}
		seen[id] = name
	}
}

// TestTemporal_UserTypeNamedPlainDateNotDetected proves the namespace gate:
// a user interface literally named PlainDate (no Temporal parent) is NOT
// treated as the builtin.
func TestTemporal_UserTypeNamedPlainDateNotDetected(t *testing.T) {
	code := `import {getRunTypeId} from '@mionjs/run-types';
interface PlainDate { year: number; month: number; day: number; }
export const _ = getRunTypeId<PlainDate>();
`
	r := setupInline(t, map[string]string{"a.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}, IncludeRunTypes: true})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	for _, rt := range resp.RunTypes {
		if reflection.IsTemporalSubKind(rt.SubKind) {
			t.Fatalf("user PlainDate wrongly detected as Temporal builtin (SubKind %d)", rt.SubKind)
		}
	}
}
