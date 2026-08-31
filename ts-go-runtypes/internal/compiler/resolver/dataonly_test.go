package resolver_test

import (
	"testing"

	"github.com/mionkit/ts-runtypes/internal/protocol"
	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// TestDataOnly_TypeName_NamedInterfaceArg — the headline behavior. When the
// marker call site instantiates DataOnly with a NAMED interface, the
// resolved root type is a synthesized mapped object whose alias is dropped
// by TS during the conditional+key-filtering map. The serializer must
// recognise this special case and stamp TypeName = "DataOnly<RootCircular>"
// so the inlining predicate keeps the entry external (DefaultIsRTInlined
// treats TypeName-empty KindObjectLiteral as inlinable).
func TestDataOnly_TypeName_NamedInterfaceArg(t *testing.T) {
	const code = `import {getRunTypeId, type DataOnly} from '@mionjs/run-types';
interface RootCircular {
  isRoot: true;
  ciRoort?: RootCircular;
}
getRunTypeId<DataOnly<RootCircular>>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != reflection.KindObjectLiteral {
		t.Fatalf("expected KindObjectLiteral, got %d", tn.Kind)
	}
	want := "DataOnly<RootCircular>"
	if tn.TypeName != want {
		t.Fatalf("expected TypeName=%q, got %q", want, tn.TypeName)
	}
}

// TestDataOnly_TypeName_NamedAliasArg — same headline behavior, but the
// inner T is a `type` alias rather than an `interface`. The composed name
// should still pick up the alias' symbol name.
func TestDataOnly_TypeName_NamedAliasArg(t *testing.T) {
	const code = `import {getRunTypeId, type DataOnly} from '@mionjs/run-types';
type User = {id: number; name: string};
getRunTypeId<DataOnly<User>>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != reflection.KindObjectLiteral {
		t.Fatalf("expected KindObjectLiteral, got %d", tn.Kind)
	}
	want := "DataOnly<User>"
	if tn.TypeName != want {
		t.Fatalf("expected TypeName=%q, got %q", want, tn.TypeName)
	}
}

// TestDataOnly_TypeName_AnonymousArg — when the user feeds DataOnly an
// inline object literal with no name (`DataOnly<{a, b}>`), there's no
// inner name to inherit. The recognition path bails out and TypeName
// stays empty — same behavior as any other anonymous compound. Stamping
// `"DataOnly<__type>"` or `"DataOnly<>"` would just be misleading labels.
func TestDataOnly_TypeName_AnonymousArg(t *testing.T) {
	const code = `import {getRunTypeId, type DataOnly} from '@mionjs/run-types';
getRunTypeId<DataOnly<{a: number; b: number}>>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != reflection.KindObjectLiteral {
		t.Fatalf("expected KindObjectLiteral, got %d", tn.Kind)
	}
	if tn.TypeName != "" {
		t.Fatalf("expected TypeName=\"\" for DataOnly over an anonymous object literal, got %q", tn.TypeName)
	}
}

// TestDataOnly_NonDataOnlyMappedTypeUntouched — a user-defined mapped type
// with the same key-filtering shape MUST be left alone. Only DataOnly gets
// the special-case TypeName stamp; everything else preserves current
// "anonymous mapped result" behavior (TypeName empty → inlines).
func TestDataOnly_NonDataOnlyMappedTypeUntouched(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type StripSymbols<T> = T extends object
  ? {[K in keyof T as K extends symbol ? never : K]: StripSymbols<T[K]>}
  : T;
interface User {id: number; name: string}
getRunTypeId<StripSymbols<User>>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != reflection.KindObjectLiteral {
		t.Fatalf("expected KindObjectLiteral, got %d", tn.Kind)
	}
	// A user-defined StripSymbols mapped type follows the existing rule: no
	// alias, no interface symbol, no special treatment → TypeName empty.
	if tn.TypeName != "" {
		t.Fatalf("expected TypeName=\"\" for user-defined mapped result, got %q", tn.TypeName)
	}
}

// The two tests below pin the NO-Temporal posture: setupInline normally
// injects the temporal.d.ts ambient, but a real consumer without the Temporal
// lib has no such ambient — and the DataOnlyNativeExtra augmentation (always
// loaded through the marker package's root declaration graph) used to fall
// back to `unknown` there, absorbing DataOnly's keep union and collapsing the
// projection to the identity (no mapped type, so the label degraded to the
// inner interface's own name). The `never`-falling guard in
// formats/datetime/temporalFormats.ts keeps the ladder intact, so the label
// must compose WITHOUT any Temporal ambient. Paired static + reflect forms
// per the marker test coverage rule, converging on one id.

func TestDataOnly_TypeName_NoTemporalAmbient_Static(t *testing.T) {
	const code = `import {getRunTypeId, type DataOnly} from '@mionjs/run-types';
type User = {id: number; name: string};
getRunTypeId<DataOnly<User>>();
`
	// An empty "temporal.d.ts" suppresses setupInline's ambient injection —
	// the program has NO Temporal types anywhere, the consumer-default posture.
	r := setupInline(t, map[string]string{"temporal.d.ts": "", "call.ts": code})
	tn := resolveFile(t, r, "call.ts")
	if tn.Kind != reflection.KindObjectLiteral {
		t.Fatalf("expected KindObjectLiteral (the projected mapped object, not the identity), got %d", tn.Kind)
	}
	if tn.TypeName != "DataOnly<User>" {
		t.Fatalf("expected TypeName=%q without a Temporal ambient, got %q", "DataOnly<User>", tn.TypeName)
	}
}

func TestDataOnly_TypeName_NoTemporalAmbient_Reflect(t *testing.T) {
	const code = `import {getRunTypeId, type DataOnly} from '@mionjs/run-types';
type User = {id: number; name: string};
declare const u: DataOnly<User>;
getRunTypeId(u);
`
	r := setupInline(t, map[string]string{"temporal.d.ts": "", "call.ts": code})
	tn := resolveFile(t, r, "call.ts")
	if tn.Kind != reflection.KindObjectLiteral {
		t.Fatalf("expected KindObjectLiteral (the projected mapped object, not the identity), got %d", tn.Kind)
	}
	if tn.TypeName != "DataOnly<User>" {
		t.Fatalf("expected TypeName=%q without a Temporal ambient, got %q", "DataOnly<User>", tn.TypeName)
	}
}

// TestDataOnly_NoTemporalAmbient_FormEquivalence — the paired shapes above
// must also converge on ONE reflection id (the hash-equivalence half of the
// marker coverage rule).
func TestDataOnly_NoTemporalAmbient_FormEquivalence(t *testing.T) {
	const code = `import {getRunTypeId, type DataOnly} from '@mionjs/run-types';
type User = {id: number; name: string};
getRunTypeId<DataOnly<User>>();
declare const u: DataOnly<User>;
getRunTypeId(u);
`
	r := setupInline(t, map[string]string{"temporal.d.ts": "", "call.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	if len(resp.Sites) != 2 {
		t.Fatalf("expected 2 getRunTypeId sites, got %d", len(resp.Sites))
	}
	if resp.Sites[0].ID != resp.Sites[1].ID {
		t.Fatalf("static and reflect forms must converge without a Temporal ambient: %q vs %q", resp.Sites[0].ID, resp.Sites[1].ID)
	}
}
