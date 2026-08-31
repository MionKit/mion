package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/cachegen/operations"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// End-to-end coverage for the `{checkUnknowns: true}` fused validators: the
// call site must route to the vst / vest FAMILIES (not a variant of val / verr),
// those families must render their own entries for NESTED NAMED types, and the
// emitted bodies must carry the key check placed after the property checks.
//
// The nested-named-type assertion is the load-bearing one. A compile-time
// variant keeps the plain family's InnerPrefix, so a named nested type would be
// dependency-called on the PLAIN entry and its extra keys would go unchecked —
// the exact regression this design avoids.

// familyPrefix derives an entry-key prefix from the operation registry rather
// than hardcoding a hash, so a future FnHashLen bump cannot turn a real
// regression into a confusing "no entry emitted" failure.
func familyPrefix(t *testing.T, opName string) string {
	t.Helper()
	op, ok := operations.ByName(opName)
	if !ok {
		t.Fatalf("%s operation missing from the registry", opName)
	}
	return operations.PlainHash(op.Name) + "_"
}

func countEntriesWithPrefix(modules map[string]string, prefix string) int {
	count := 0
	for _, mod := range modules {
		count += strings.Count(mod, prefix)
	}
	return count
}

func TestCheckUnknowns_RoutesToFusedFamily(t *testing.T) {
	modules := scanEntryModules(t, `import {createValidateFn} from '@ts-runtypes/core';
interface User {a: string; b: number}
export const isUser = createValidateFn<User>(undefined, {checkUnknowns: true});
`)
	if _, ok := findEntryWith(modules, familyPrefix(t, "validateStrict")); !ok {
		t.Fatalf("no validateStrict entry emitted\nmodules: %v", keys(modules))
	}
}

func TestCheckUnknowns_PlainCallStillUsesPlainFamily(t *testing.T) {
	modules := scanEntryModules(t, `import {createValidateFn} from '@ts-runtypes/core';
interface User {a: string; b: number}
export const isUser = createValidateFn<User>();
`)
	if _, ok := findEntryWith(modules, familyPrefix(t, "validate")); !ok {
		t.Fatalf("no plain validate entry emitted\nmodules: %v", keys(modules))
	}
	if _, ok := findEntryWith(modules, familyPrefix(t, "validateStrict")); ok {
		t.Fatalf("plain call site emitted a validateStrict entry — the flag leaked\nmodules: %v", keys(modules))
	}
}

// The design's whole point: a NAMED nested type is emitted as its own entry and
// dependency-called, so the fused family must render a fused entry for it too.
// Two vst entries (the root and the nested type) prove the recursion; a variant
// would produce one.
func TestCheckUnknowns_RendersFusedEntryForNestedNamedType(t *testing.T) {
	modules := scanEntryModules(t, `import {createValidateFn} from '@ts-runtypes/core';
interface Address {street: string; city: string}
interface Person {name: string; address: Address}
export const isPerson = createValidateFn<Person>(undefined, {checkUnknowns: true});
`)
	prefix := familyPrefix(t, "validateStrict")
	if got := countEntriesWithPrefix(modules, prefix); got < 2 {
		t.Fatalf("expected fused entries for BOTH Person and the nested Address, found %d occurrences of %q\nmodules: %v",
			got, prefix, keys(modules))
	}
}

// The key check must sit AFTER the property checks in the object's && chain.
// That ordering is what makes the O(1) key-count compare sound at every depth
// (every declared prop is known present by the time it runs), so it is a
// correctness property, not formatting.
func TestCheckUnknowns_AllRequiredShapeUsesKeyCountCompare(t *testing.T) {
	modules := scanEntryModules(t, `import {createValidateFn} from '@ts-runtypes/core';
interface User {a: string; b: number}
export const isUser = createValidateFn<User>(undefined, {checkUnknowns: true});
`)
	name, ok := findEntryWith(modules, familyPrefix(t, "validateStrict"))
	if !ok {
		t.Fatalf("no validateStrict entry emitted\nmodules: %v", keys(modules))
	}
	body := modules[name]
	if !strings.Contains(body, "=== 2") {
		t.Errorf("all-required 2-prop shape did not use the key-count compare:\n%s", body)
	}
	// The count compare comes last: the property checks it depends on precede it.
	countAt := strings.Index(body, "=== 2")
	propAt := strings.LastIndex(body, "typeof")
	if countAt >= 0 && propAt >= 0 && countAt < propAt {
		t.Errorf("key-count compare emitted BEFORE the property checks — the fast path is unsound there:\n%s", body)
	}
}

// Optional props make the count meaningless (a missing optional and an extra key
// both shift it), so those shapes must fall back to the key-list scan.
func TestCheckUnknowns_OptionalPropShapeUsesKeyScan(t *testing.T) {
	modules := scanEntryModules(t, `import {createValidateFn} from '@ts-runtypes/core';
interface User {a: string; b?: number}
export const isUser = createValidateFn<User>(undefined, {checkUnknowns: true});
`)
	name, ok := findEntryWith(modules, familyPrefix(t, "validateStrict"))
	if !ok {
		t.Fatalf("no validateStrict entry emitted\nmodules: %v", keys(modules))
	}
	body := modules[name]
	if strings.Contains(body, "countEnumKeys") {
		t.Errorf("optional-prop shape wrongly used the key-count fast path:\n%s", body)
	}
	if !strings.Contains(body, "hasUnknownKeysFromArray") {
		t.Errorf("optional-prop shape did not fall back to the key-list scan:\n%s", body)
	}
}

// An index signature declares every key matching it, so there is nothing to
// reject and the node takes no key check at all.
func TestCheckUnknowns_IndexSignatureTakesNoKeyCheck(t *testing.T) {
	modules := scanEntryModules(t, `import {createValidateFn} from '@ts-runtypes/core';
export const isRecord = createValidateFn<Record<string, number>>(undefined, {checkUnknowns: true});
`)
	name, ok := findEntryWith(modules, familyPrefix(t, "validateStrict"))
	if !ok {
		t.Fatalf("no validateStrict entry emitted\nmodules: %v", keys(modules))
	}
	body := modules[name]
	for _, unwanted := range []string{"countEnumKeys", "hasUnknownKeysFromArray"} {
		if strings.Contains(body, unwanted) {
			t.Errorf("index-signature shape emitted %q — every matching key IS declared:\n%s", unwanted, body)
		}
	}
}

func TestCheckUnknowns_ErrorsRoutesToFusedFamily(t *testing.T) {
	modules := scanEntryModules(t, `import {createGetValidationErrorsFn} from '@ts-runtypes/core';
interface User {a: string}
export const errorsOf = createGetValidationErrorsFn<User>(undefined, {checkUnknowns: true});
`)
	if _, ok := findEntryWith(modules, familyPrefix(t, "validationErrorsStrict")); !ok {
		t.Fatalf("no validationErrorsStrict entry emitted\nmodules: %v", keys(modules))
	}
}

// The fused option composes with the other compile-time options rather than
// replacing them: the axis is unchanged, so a variant of the FUSED family is
// what a combined call site must resolve to.
func TestCheckUnknowns_ComposesWithValidateOptions(t *testing.T) {
	modules := scanEntryModules(t, `import {createValidateFn} from '@ts-runtypes/core';
interface User {a: 'x'}
export const isUser = createValidateFn<User>(undefined, {checkUnknowns: true, noLiterals: true});
`)
	op, ok := operations.ByName("validateStrict")
	if !ok {
		t.Fatalf("validateStrict operation missing from the registry")
	}
	want := operations.FnHashFor(op, []string{"noLiterals"}, "", false) + "_"
	if _, found := findEntryWith(modules, want); !found {
		t.Fatalf("no noLiterals variant of the fused family emitted\nmodules: %v", keys(modules))
	}
}

// Marker test coverage rule (ts-go-runtypes/CLAUDE.md): both getRunTypeId call
// shapes, written as paired tests using the natural shape for each intent.

func TestCheckUnknowns_MarkerStaticForm(t *testing.T) {
	r := setupInline(t, map[string]string{"static.ts": `import {getRunTypeId} from '@ts-runtypes/core';
interface User {a: string; b: number}
export const id = getRunTypeId<User>();
`})
	resolved := resolveFile(t, r, "static.ts")
	if resolved.ID == "" {
		t.Fatalf("static getRunTypeId<User>() resolved no id")
	}
}

func TestCheckUnknowns_MarkerReflectForm(t *testing.T) {
	r := setupInline(t, map[string]string{"reflect.ts": `import {getRunTypeId} from '@ts-runtypes/core';
interface User {a: string; b: number}
const v: User = {a: 'x', b: 1};
export const id = getRunTypeId(v);
`})
	resolved := resolveFile(t, r, "reflect.ts")
	if resolved.ID == "" {
		t.Fatalf("reflect getRunTypeId(v) resolved no id")
	}
}

// The hash-equivalence assertion the rule requires: both shapes of the same
// type resolve to one entry, so a fused validator built from either reaches the
// same compiled function.
func TestCheckUnknowns_MarkerFormEquivalence(t *testing.T) {
	r := setupInline(t, map[string]string{
		"static.ts": `import {getRunTypeId} from '@ts-runtypes/core';
interface User {a: string; b: number}
export const id = getRunTypeId<User>();
`,
		"reflect.ts": `import {getRunTypeId} from '@ts-runtypes/core';
interface User {a: string; b: number}
const v: User = {a: 'x', b: 1};
export const id = getRunTypeId(v);
`,
	})
	static := resolveFile(t, r, "static.ts")
	reflect := resolveFile(t, r, "reflect.ts")
	if static.ID != reflect.ID {
		t.Fatalf("static vs reflect form of User disagree: %q vs %q", static.ID, reflect.ID)
	}
}

// A `checkUnknowns` site and a plain site for the SAME type must coexist: the
// two families are independent, so both entries ship (pay-for-use).
func TestCheckUnknowns_CoexistsWithPlainSiteForSameType(t *testing.T) {
	modules := scanEntryModules(t, `import {createValidateFn} from '@ts-runtypes/core';
interface User {a: string; b: number}
export const isUser = createValidateFn<User>();
export const isUserStrict = createValidateFn<User>(undefined, {checkUnknowns: true});
`)
	for _, opName := range []string{"validate", "validateStrict"} {
		if _, ok := findEntryWith(modules, familyPrefix(t, opName)); !ok {
			t.Fatalf("no %s entry emitted when both call shapes are present\nmodules: %v", opName, keys(modules))
		}
	}
}

// Nothing about the fused families may disturb the wire: a scan carrying only a
// plain site must not gain fused demand.
func TestCheckUnknowns_NoFusedDemandWithoutTheFlag(t *testing.T) {
	r := setupInline(t, map[string]string{"a.ts": `import {createValidateFn} from '@ts-runtypes/core';
interface User {a: string}
export const isUser = createValidateFn<User>();
`})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}, IncludeEntryModules: true})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	for _, site := range resp.Sites {
		for _, demand := range site.Demand {
			if demand.FamilyTag == "vst" || demand.FamilyTag == "vest" {
				t.Fatalf("plain site demanded the fused family %q", demand.FamilyTag)
			}
		}
	}
}

// The fused validators run their key check INSIDE their own object guard, so
// they must not also pull in the one the standalone unknown-keys families carry.
//
// Both halves already avoid it — validate passes keepObjectCheck=false to
// callCheckUnknownPropertiesForHas, and the fused error arm calls
// emitParentUnknownKeyErrors directly rather than emitObjectUnknownKeyErrors,
// whose body IS guarded (that family has nothing above it asserting shape). But
// that is a property of where the shared helper's boundary happens to fall, not
// something the type system enforces: moving the guard down into the helper, or
// pointing the fused arm at the family arm, would silently emit the guard twice
// on every object node. Cheap to pin, easy to regress.
func TestCheckUnknowns_DoesNotDoubleGuardObjects(t *testing.T) {
	for _, row := range []struct{ label, factory, opName string }{
		{"validate", "createValidateFn", "validateStrict"},
		{"validationErrors", "createGetValidationErrorsFn", "validationErrorsStrict"},
	} {
		t.Run(row.label, func(t *testing.T) {
			modules := scanEntryModules(t, `import {`+row.factory+`} from '@ts-runtypes/core';
interface User {a: string; b?: number}
export const fn = `+row.factory+`<User>(undefined, {checkUnknowns: true});
`)
			name, ok := findEntryWith(modules, familyPrefix(t, row.opName))
			if !ok {
				t.Fatalf("no %s entry emitted\nmodules: %v", row.opName, keys(modules))
			}
			// The optional prop puts this shape on the key-SCAN path, which is the
			// one that could inherit a guard; the count-compare path emits none.
			body := modules[name]
			if got := strings.Count(body, "!==null&&!Array.isArray"); got > 1 {
				t.Errorf("%s emitted the object guard %d times, expected at most 1:\n%s", row.opName, got, body)
			}
			if got := strings.Count(body, "!== null && !Array.isArray"); got > 1 {
				t.Errorf("%s emitted the object guard %d times, expected at most 1:\n%s", row.opName, got, body)
			}
		})
	}
}
