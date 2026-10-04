package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// marker-any-from-unresolved-name — the unresolved-type-name guard (unresolved_name_guard.go). The
// detection is the checker's own error-type identity (marker.IsErrorLikeAny),
// so a deliberately written `any`, and a resolved `type Loose = any`, must
// never trip it, while a name that failed to resolve must — in BOTH marker
// shapes (static getRunTypeId<T>() via the written-syntax walk, value-first
// getRunTypeId(value) via the resolved-slot probe), per the marker coverage
// rule. Sibling precedence: marker-temporal-lib-missing and marker-any-from-unresolved-import own their causes, marker-any-from-unresolved-name must
// stay silent beside them.

func scanConsumer(t *testing.T, source string) protocol.Response {
	t.Helper()
	r := setupInline(t, map[string]string{"consumer.ts": source})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"consumer.ts"}, IncludeRunTypes: true})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	return resp
}

func codesOf(resp protocol.Response) []string {
	codes := make([]string, 0, len(resp.Diagnostics))
	for _, diagnostic := range resp.Diagnostics {
		codes = append(codes, diagnostic.Code)
	}
	return codes
}

func markerAnyFromUnresolvedNameDiags(resp protocol.Response) []diagnostics.Diagnostic {
	var out []diagnostics.Diagnostic
	for _, diagnostic := range resp.Diagnostics {
		if diagnostic.Code == diagnostics.CodeMarkerUnresolvedTypeName {
			out = append(out, diagnostic)
		}
	}
	return out
}

// Static form: the written type argument nests a reference to a name that
// exists nowhere, so the reference resolves to the checker's error type. The
// diagnostic names the written reference.
func TestUnresolvedName_StaticFormFires(t *testing.T) {
	resp := scanConsumer(t, `import {getRunTypeId} from '@mionjs/run-types';
export const id = getRunTypeId<{value: Missing}>();
`)
	fired := markerAnyFromUnresolvedNameDiags(resp)
	if len(fired) != 1 {
		t.Fatalf("want exactly one marker-any-from-unresolved-name, got %d (all codes: %v)", len(fired), codesOf(resp))
	}
	if len(fired[0].Args) != 1 || fired[0].Args[0] != "Missing" {
		t.Errorf("marker-any-from-unresolved-name should name the written reference; args=%v", fired[0].Args)
	}
	if fired[0].Severity != diagnostics.SeverityError {
		t.Errorf("marker-any-from-unresolved-name must be an error, got %v", fired[0].Severity)
	}
}

// Value-first form (paired with the static case above per the marker coverage
// rule): the call writes no type syntax at all — the value's declared type
// carries the failed resolution — so the resolved-slot probe fires, naming
// the value argument.
func TestUnresolvedName_ReflectFormFires(t *testing.T) {
	resp := scanConsumer(t, `import {getRunTypeId} from '@mionjs/run-types';
declare const broken: Missing;
export const id = getRunTypeId(broken);
`)
	fired := markerAnyFromUnresolvedNameDiags(resp)
	if len(fired) != 1 {
		t.Fatalf("want exactly one marker-any-from-unresolved-name, got %d (all codes: %v)", len(fired), codesOf(resp))
	}
	if len(fired[0].Args) != 1 || fired[0].Args[0] != "broken" {
		t.Errorf("reflect-form marker-any-from-unresolved-name should name the value argument; args=%v", fired[0].Args)
	}
}

// The transitive alias: `Broken` itself resolves, but its declaration
// references a missing name, so the alias's declared type IS the error type.
// The symbol-lookup sketch in the original todo would have missed this; the
// error-type identity catches it and names the written reference.
func TestUnresolvedName_TransitiveAliasFires(t *testing.T) {
	resp := scanConsumer(t, `import {getRunTypeId} from '@mionjs/run-types';
type Broken = Missing;
export const id = getRunTypeId<{value: Broken}>();
`)
	fired := markerAnyFromUnresolvedNameDiags(resp)
	if len(fired) == 0 {
		t.Fatalf("transitive error-any must fire marker-any-from-unresolved-name (all codes: %v)", codesOf(resp))
	}
	names := make([]string, 0, len(fired))
	for _, diagnostic := range fired {
		names = append(names, strings.Join(diagnostic.Args, ","))
	}
	if !strings.Contains(strings.Join(names, " "), "Broken") {
		t.Errorf("marker-any-from-unresolved-name should name the reference written at the call (Broken); got %v", names)
	}
}

// Deliberate broad types stay legal in both shapes: a written `any` keyword
// and an alias of `any` are the true `any` intrinsic, never the error type.
func TestUnresolvedName_DeliberateAnyStaysLegal(t *testing.T) {
	t.Run("static any keyword", func(t *testing.T) {
		resp := scanConsumer(t, `import {getRunTypeId} from '@mionjs/run-types';
export const id = getRunTypeId<any>();
`)
		if fired := markerAnyFromUnresolvedNameDiags(resp); len(fired) > 0 {
			t.Fatalf("written `any` must not fire marker-any-from-unresolved-name: %+v", fired)
		}
	})
	t.Run("static alias of any", func(t *testing.T) {
		resp := scanConsumer(t, `import {getRunTypeId} from '@mionjs/run-types';
type Loose = any;
export const id = getRunTypeId<Loose>();
`)
		if fired := markerAnyFromUnresolvedNameDiags(resp); len(fired) > 0 {
			t.Fatalf("`type Loose = any` must not fire marker-any-from-unresolved-name: %+v", fired)
		}
	})
	t.Run("value-first over any", func(t *testing.T) {
		resp := scanConsumer(t, `import {getRunTypeId} from '@mionjs/run-types';
declare const loose: any;
export const id = getRunTypeId(loose);
`)
		if fired := markerAnyFromUnresolvedNameDiags(resp); len(fired) > 0 {
			t.Fatalf("value-first over a deliberate `any` must not fire marker-any-from-unresolved-name: %+v", fired)
		}
	})
}

// Resolved types never trip the guard, and the two marker shapes keep their
// id equivalence with the guard active (the marker coverage rule's paired
// hash-equivalence assertion for this suite).
func TestUnresolvedName_ResolvedTypeSilentAndFormEquivalent(t *testing.T) {
	resp := scanConsumer(t, `import {getRunTypeId} from '@mionjs/run-types';
interface Fine { a: string; b: number }

// static getRunTypeId<T>()
export const staticId = getRunTypeId<Fine>();

// value-first getRunTypeId(value)
declare const sample: Fine;
export const valueId = getRunTypeId(sample);
`)
	if fired := markerAnyFromUnresolvedNameDiags(resp); len(fired) > 0 {
		t.Fatalf("resolved types must not fire marker-any-from-unresolved-name: %+v", fired)
	}
	if len(resp.Sites) != 2 {
		t.Fatalf("want the two getRunTypeId sites, got %d", len(resp.Sites))
	}
	if resp.Sites[0].ID != resp.Sites[1].ID {
		t.Errorf("static vs value-first ids diverged with the guard active: %q vs %q", resp.Sites[0].ID, resp.Sites[1].ID)
	}
}

// Sibling precedence: a missing Temporal lib is marker-temporal-lib-missing's cause — marker-any-from-unresolved-name must
// not double-report the same degraded slot. The empty temporal.d.ts overlay
// simulates a project whose lib does not load the Temporal namespace.
func TestUnresolvedName_YieldsToTemporalGuard(t *testing.T) {
	r := setupInline(t, map[string]string{
		"temporal.d.ts": "export {};\n",
		"consumer.ts": `import {getRunTypeId} from '@mionjs/run-types';
export const id = getRunTypeId<Temporal.PlainDate>();
`,
	})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"consumer.ts"}, IncludeRunTypes: true})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	sawTemporal := false
	for _, diagnostic := range resp.Diagnostics {
		if diagnostic.Code == diagnostics.CodeTemporalNotLoaded {
			sawTemporal = true
		}
	}
	if !sawTemporal {
		t.Fatalf("expected marker-temporal-lib-missing for the missing Temporal lib (all codes: %v)", codesOf(resp))
	}
	if fired := markerAnyFromUnresolvedNameDiags(resp); len(fired) > 0 {
		t.Errorf("marker-any-from-unresolved-name must yield to marker-temporal-lib-missing for the same slot: %+v", fired)
	}
}

// Sibling precedence: an unresolved import is marker-any-from-unresolved-import's cause — the import
// specifier is the actionable finding, so marker-any-from-unresolved-name stays silent for the call.
func TestUnresolvedName_YieldsToUnresolvedImportGuard(t *testing.T) {
	resp := scanConsumer(t, `import {getRunTypeId} from '@mionjs/run-types';
import type {Broken} from './does-not-exist.js';
export const id = getRunTypeId<Broken>();
`)
	sawImport := false
	for _, diagnostic := range resp.Diagnostics {
		if diagnostic.Code == diagnostics.CodeMarkerAnyFromUnresolvedImport {
			sawImport = true
		}
	}
	if !sawImport {
		t.Fatalf("expected marker-any-from-unresolved-import for the unresolved import (all codes: %v)", codesOf(resp))
	}
	if fired := markerAnyFromUnresolvedNameDiags(resp); len(fired) > 0 {
		t.Errorf("marker-any-from-unresolved-name must yield to marker-any-from-unresolved-import for the same call: %+v", fired)
	}
}

// The same guard one object deeper: the unresolved name sits on a member of
// a named interface, so the root type argument is a healthy object and the
// written-syntax walk sees only `Payload`. The graph walk reports the member
// once per call, in both marker shapes, and a written `any` member stays legal.
func TestUnresolvedName_NestedMemberFires(t *testing.T) {
	t.Run("static form", func(t *testing.T) {
		resp := scanConsumer(t, `import {getRunTypeId} from '@mionjs/run-types';
interface Payload {id: string; user: Missing}
export const id = getRunTypeId<Payload>();
`)
		fired := markerAnyFromUnresolvedNameDiags(resp)
		if len(fired) != 1 {
			t.Fatalf("want exactly one marker-any-from-unresolved-name for the nested member, got %d: %v", len(fired), codesOf(resp))
		}
		if fired[0].Args[0] != "Missing" {
			t.Errorf("nested marker-any-from-unresolved-name must name the written type, got %v", fired[0].Args)
		}
		if len(fired[0].Related) != 1 || !strings.Contains(fired[0].Related[0].Message, "`user`") {
			t.Errorf("nested marker-any-from-unresolved-name must relate the member's declaration, got %+v", fired[0].Related)
		}
	})
	t.Run("value-first form", func(t *testing.T) {
		resp := scanConsumer(t, `import {getRunTypeId} from '@mionjs/run-types';
interface Payload {id: string; user: Missing}
declare const payload: Payload;
export const id = getRunTypeId(payload);
`)
		if fired := markerAnyFromUnresolvedNameDiags(resp); len(fired) != 1 {
			t.Fatalf("want exactly one marker-any-from-unresolved-name for the nested member, got %d: %v", len(fired), codesOf(resp))
		}
	})
	t.Run("two objects deep, through an array and a Map", func(t *testing.T) {
		resp := scanConsumer(t, `import {getRunTypeId} from '@mionjs/run-types';
interface Inner {who: Missing}
interface Payload {items: Inner[]; byId: Map<string, Inner>}
export const id = getRunTypeId<Payload>();
`)
		if fired := markerAnyFromUnresolvedNameDiags(resp); len(fired) != 1 {
			t.Fatalf("want exactly one marker-any-from-unresolved-name (the shared Inner member, reported once), got %d: %v", len(fired), codesOf(resp))
		}
	})
	t.Run("inline literal reports once, not twice", func(t *testing.T) {
		resp := scanConsumer(t, `import {getRunTypeId} from '@mionjs/run-types';
export const id = getRunTypeId<{value: Missing}>();
`)
		if fired := markerAnyFromUnresolvedNameDiags(resp); len(fired) != 1 {
			t.Fatalf("the written-syntax walk and the graph walk must not both report a member written at the call, got %d: %+v", len(fired), fired)
		}
	})
	t.Run("hand-written any member stays legal", func(t *testing.T) {
		resp := scanConsumer(t, `import {getRunTypeId} from '@mionjs/run-types';
type Loose = any;
interface Payload {id: string; data: any; loose: Loose; bag: Record<string, any>}
export const id = getRunTypeId<Payload>();
`)
		if fired := markerAnyFromUnresolvedNameDiags(resp); len(fired) > 0 {
			t.Fatalf("a deliberate `any` member must not fire marker-any-from-unresolved-name: %+v", fired)
		}
	})
}

// Each unresolved member gets its own marker-any-from-unresolved-name: members naming one type share one `any`, which once hid all but the first.
func assertEachMissingMemberFires(t *testing.T, source string) {
	t.Helper()
	fired := markerAnyFromUnresolvedNameDiags(scanConsumer(t, source))
	members := map[string]bool{}
	for _, diagnostic := range fired {
		for _, related := range diagnostic.Related {
			members[related.Message] = true
		}
	}
	if len(fired) != 2 || len(members) != 2 {
		t.Errorf("want one marker-any-from-unresolved-name per member, got %d: %v", len(fired), members)
	}
}

func TestUnresolvedName_EachMissingMemberFires_Static(t *testing.T) {
	assertEachMissingMemberFires(t, `import {getRunTypeId} from '@mionjs/run-types';
interface Payload { first: Missing; second: Missing }
export const id = getRunTypeId<{payload: Payload}>();
`)
}

func TestUnresolvedName_EachMissingMemberFires_Value(t *testing.T) {
	assertEachMissingMemberFires(t, `import {getRunTypeId} from '@mionjs/run-types';
interface Payload { first: Missing; second: Missing }
declare const holder: {payload: Payload};
export const id = getRunTypeId(holder);
`)
}
