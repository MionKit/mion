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

// A UNION takes no key check of its own — it has no keys. Its object MEMBERS do,
// and each compiles through the same fused emitter, which is what makes the
// fused validator answer per branch: a cat carrying `barks` is rejected because
// `barks` is undeclared on the branch that matched, even though it is declared
// somewhere in the union.
func TestCheckUnknowns_UnionChecksEachMemberSeparately(t *testing.T) {
	modules := scanEntryModules(t, `import {createValidateFn} from '@ts-runtypes/core';
interface Cat {kind: 'cat'; meows: boolean}
interface Dog {kind: 'dog'; barks: number}
export const isPet = createValidateFn<Cat | Dog>(undefined, {checkUnknowns: true});
`)
	// Both members are named, so each renders its own fused entry carrying its
	// own 2-key compare. A merged allowlist would emit ONE check over 3 names.
	prefix := familyPrefix(t, "validateStrict")
	if got := countEntriesWithPrefix(modules, prefix); got < 3 {
		t.Fatalf("expected fused entries for the union and both members, got %d\nmodules: %v", got, keys(modules))
	}
	for _, typeName := range []string{"Cat", "Dog"} {
		name, ok := findEntryForType(modules, prefix, typeName)
		if !ok {
			t.Fatalf("no validateStrict entry for %s\nmodules: %v", typeName, keys(modules))
		}
		if !strings.Contains(modules[name], "=== 2") {
			t.Errorf("%s arm did not close over its OWN two keys:\n%s", typeName, modules[name])
		}
	}
}

// The ERROR family cannot check a union's keys itself — its union arm delegates
// the verdict to a validator. Under the fused family that must be the STRICT
// validator, or the report comes back empty for a value its own validator
// rejects.
func TestCheckUnknowns_UnionErrorsAskTheStrictValidator(t *testing.T) {
	modules := scanEntryModules(t, `import {createGetValidationErrorsFn} from '@ts-runtypes/core';
interface Cat {kind: 'cat'; meows: boolean}
interface Dog {kind: 'dog'; barks: number}
export const petErrors = createGetValidationErrorsFn<Cat | Dog>(undefined, {checkUnknowns: true});
`)
	name, ok := findEntryWith(modules, familyPrefix(t, "validationErrorsStrict"))
	if !ok {
		t.Fatalf("no validationErrorsStrict entry emitted\nmodules: %v", keys(modules))
	}
	body := modules[name]
	strictPrefix := familyPrefix(t, "validateStrict")
	plainPrefix := familyPrefix(t, "validate")
	if !strings.Contains(body, strictPrefix) {
		t.Errorf("union error arm does not consult the strict validator:\n%s", body)
	}
	if strings.Contains(body, "'"+plainPrefix) {
		t.Errorf("union error arm still reaches the PLAIN validator:\n%s", body)
	}
}

// A callable shape is a Function, not a plain object: its own extra properties
// belong to the call signature, so it takes no key check. This is the
// callSigChild != nil branch, which had no coverage.
func TestCheckUnknowns_CallableShapeTakesNoKeyCheck(t *testing.T) {
	modules := scanEntryModules(t, `import {createValidateFn} from '@ts-runtypes/core';
interface Callable {(input: string): number}
export const isCallable = createValidateFn<Callable>(undefined, {checkUnknowns: true});
`)
	name, ok := findEntryWith(modules, familyPrefix(t, "validateStrict"))
	if !ok {
		t.Fatalf("no validateStrict entry emitted\nmodules: %v", keys(modules))
	}
	body := modules[name]
	for _, unwanted := range []string{"countEnumKeys", "hasUnknownKeysFromArray"} {
		if strings.Contains(body, unwanted) {
			t.Errorf("callable shape emitted %q — a Function's own props are the call signature's business:\n%s", unwanted, body)
		}
	}
}

// EVERY TERM OF THE OBJECT GUARD IS EMITTED EXACTLY ONCE, and the two halves
// come from different places for different reasons.
//
// The blind hasUnknownKeys carries the whole guard — `typeof`, `!== null`,
// `!Array.isArray` — because nothing above it has established anything. The
// fused families split it: the SHAPE half is the validator's own leading term,
// so the key check must not repeat it, while the ARRAY half belongs to the key
// check, because passing validation does not prove a value is not an array (an
// array can satisfy an object shape). Neither term appears twice.
func TestCheckUnknowns_EmitsTheObjectGuardOnce(t *testing.T) {
	modules := scanEntryModules(t, `import {createValidateFn, createGetValidationErrorsFn} from '@ts-runtypes/core';
interface T {a: string; b: number}
export const isT = createValidateFn<T>(undefined, {checkUnknowns: true});
export const tErrors = createGetValidationErrorsFn<T>(undefined, {checkUnknowns: true});
`)
	for _, family := range []string{"validateStrict", "validationErrorsStrict"} {
		name, ok := findEntryWith(modules, familyPrefix(t, family))
		if !ok {
			t.Fatalf("no %s entry emitted\nmodules: %v", family, keys(modules))
		}
		body := fnBodyOf(modules[name])
		// The shape half comes from the validator's own leading term. Validation
		// established it, so the key check must not repeat it.
		if got := strings.Count(body, objectGuardNeedle); got != 1 {
			t.Errorf("%s emits the shape guard %d times, want exactly 1:\n%s", family, got, body)
		}
		// The array half survives, exactly once, and comes from the key check.
		// Validation does NOT establish it: an array can satisfy an object shape.
		if got := strings.Count(body, "Array.isArray"); got != 1 {
			t.Errorf("%s emits the array test %d times, want exactly 1:\n%s", family, got, body)
		}
	}
}

// The flag the fused families inherit for free: with runsAfterValidation the
// standalone predicate emits NO object guard at all, because the caller promised
// the value already passed validate. Pinned against the blind form, which must
// keep every part of it.
func TestCheckUnknowns_RunsAfterValidationEmitsNoObjectGuard(t *testing.T) {
	modules := scanEntryModules(t, `import {createHasUnknownKeysFn} from '@ts-runtypes/core';
interface T {a: string; b: number}
export const blind = createHasUnknownKeysFn<T>();
export const fast = createHasUnknownKeysFn<T>(undefined, {runsAfterValidation: true});
`)
	shapeParts := []string{objectGuardNeedle, "v !== null"}

	// The blind predicate has nothing above it establishing anything, so it
	// carries the whole guard.
	blind, ok := findEntryWithAll(modules, append(append([]string{}, shapeParts...), `!Array.isArray(v)`))
	if !ok {
		t.Fatalf("the blind hasUnknownKeys entry lost its object guard\nmodules: %v", keys(modules))
	}

	// The fast variant is a separate entry keyed by its variant hash. The SHAPE
	// halves go, because the caller promised validation ran.
	fast, ok := findEntryWithout(modules, blind, "huk", shapeParts)
	if !ok {
		t.Fatalf("no shape-guardless runsAfterValidation entry emitted\nmodules: %v", keys(modules))
	}
	if !strings.Contains(modules[fast], "countEnumKeys") {
		t.Errorf("the runsAfterValidation entry is not the key-count fast path:\n%s", modules[fast])
	}
	// The ARRAY half stays. Validation proved the shape, not that the value is
	// not an array, and no family checks an array for undeclared keys.
	if !strings.Contains(modules[fast], "!Array.isArray(v)") {
		t.Errorf("the runsAfterValidation entry dropped the array test too:\n%s", modules[fast])
	}
}

// objectGuardNeedle is the guard as it appears INSIDE an emitted module, where
// the body is a JS string literal and its quotes are backslash-escaped.
const objectGuardNeedle = `typeof v === \'object\'`

// fnBodyOf slices an entry module from its emitted `function ` onward, so an
// assertion about the BODY never matches something in the import block or the
// tuple header.
func fnBodyOf(module string) string {
	if at := strings.Index(module, "function "); at >= 0 {
		return module[at:]
	}
	return module
}

// findEntryWithAll returns the entry containing every one of the given
// substrings.
func findEntryWithAll(modules map[string]string, needles []string) (string, bool) {
	for _, name := range sortedEntryNames(modules) {
		if moduleHasAll(modules[name], needles) {
			return name, true
		}
	}
	return "", false
}

// findEntryWithout returns an entry of the given family tag, other than
// `exclude`, containing NONE of the given substrings.
func findEntryWithout(modules map[string]string, exclude string, familyTag string, needles []string) (string, bool) {
	for _, name := range sortedEntryNames(modules) {
		if name == exclude {
			continue
		}
		module := modules[name]
		if !strings.Contains(module, "['"+familyTag+"'") {
			continue
		}
		if !moduleHasAll(module, needles) && !moduleHasAny(module, needles) {
			return name, true
		}
	}
	return "", false
}

func moduleHasAll(haystack string, needles []string) bool {
	for _, needle := range needles {
		if !strings.Contains(haystack, needle) {
			return false
		}
	}
	return true
}

func moduleHasAny(haystack string, needles []string) bool {
	for _, needle := range needles {
		if strings.Contains(haystack, needle) {
			return true
		}
	}
	return false
}

// The validator and its error twin must agree at every node about WHETHER a key
// check is emitted. They ask one shared predicate (emitsUnknownKeyCheck) rather
// than each spelling the conditions out, and this pins that: for every shape
// where one family emits nothing, the other must emit nothing either.
//
// A disagreement here is not cosmetic. It means a caller gets a rejection and
// then an empty list of reasons, which is exactly the bug the union arm shipped.
func TestCheckUnknowns_BothFusedFamiliesGateAlike(t *testing.T) {
	cases := []struct {
		name    string
		decl    string
		target  string
		emitted bool
	}{
		{"all required", "interface T {a: string; b: number}", "T", true},
		{"optional prop", "interface T {a: string; b?: number}", "T", true},
		{"index signature", "interface T {[k: string]: number}", "T", false},
		{"callable", "interface T {(input: string): number}", "T", false},
		{"no declared props", "interface T {}", "T", false},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			modules := scanEntryModules(t, `import {createValidateFn, createGetValidationErrorsFn} from '@ts-runtypes/core';
`+testCase.decl+`
export const isT = createValidateFn<`+testCase.target+`>(undefined, {checkUnknowns: true});
export const tErrors = createGetValidationErrorsFn<`+testCase.target+`>(undefined, {checkUnknowns: true});
`)
			validatorEmits := entryMentionsKeyCheck(t, modules, familyPrefix(t, "validateStrict"))
			errorsEmit := entryMentionsKeyCheck(t, modules, familyPrefix(t, "validationErrorsStrict"))
			if validatorEmits != errorsEmit {
				t.Fatalf("the two fused families disagree: validator emits=%v, errors emit=%v\nmodules: %v", validatorEmits, errorsEmit, keys(modules))
			}
			if validatorEmits != testCase.emitted {
				t.Errorf("key check emitted=%v, want %v", validatorEmits, testCase.emitted)
			}
		})
	}
}

// entryMentionsKeyCheck reports whether a family's entry carries a key check in
// ANY of its shapes. The two families spell it differently on purpose: the
// validator wants a verdict (the O(1) count compare, or the boolean scan), the
// error form wants the keys themselves so it can name them. What must match is
// whether a check is there at all.
func entryMentionsKeyCheck(t *testing.T, modules map[string]string, prefix string) bool {
	t.Helper()
	name, ok := findEntryWith(modules, prefix)
	if !ok {
		t.Fatalf("no entry emitted for prefix %q\nmodules: %v", prefix, keys(modules))
	}
	body := modules[name]
	for _, shape := range []string{"countEnumKeys", "hasUnknownKeysFromArray", "getUnknownKeysFromArray"} {
		if strings.Contains(body, shape) {
			return true
		}
	}
	return false
}

// An ARRAY node emits no key check of its own — a JSON array cannot carry
// undeclared object properties, so there is nothing to ask. All it emits is the
// traversal, and only when an element has something worth checking. An array of
// primitives emits nothing at all.
func TestCheckUnknowns_ArrayNodeOnlyTraverses(t *testing.T) {
	t.Run("elements worth checking", func(t *testing.T) {
		modules := scanEntryModules(t, `import {createValidateFn} from '@ts-runtypes/core';
interface Item {a: string}
export const isItems = createValidateFn<Item[]>(undefined, {checkUnknowns: true});
`)
		prefix := familyPrefix(t, "validateStrict")
		root, ok := findEntryForType(modules, prefix, "Item[]")
		if !ok {
			// The array root may be keyed by its own printed name; fall back to the
			// entry that is not the element type.
			root, ok = findEntryWith(modules, prefix)
		}
		if !ok {
			t.Fatalf("no validateStrict entry emitted\nmodules: %v", keys(modules))
		}
		element, ok := findEntryForType(modules, prefix, "Item")
		if !ok {
			t.Fatalf("no validateStrict entry for the element type\nmodules: %v", keys(modules))
		}
		if root == element {
			t.Fatalf("expected separate entries for the array and its element type\nmodules: %v", keys(modules))
		}
		// The element carries the check; the array itself only reaches it.
		if !strings.Contains(modules[element], "countEnumKeys") {
			t.Errorf("the element type lost its key check:\n%s", modules[element])
		}
		for _, unwanted := range []string{"countEnumKeys", "hasUnknownKeysFromArray"} {
			if strings.Contains(modules[root], unwanted) {
				t.Errorf("the array node emitted %q — an array has no undeclared properties to find:\n%s", unwanted, modules[root])
			}
		}
	})

	t.Run("elements with nothing to check", func(t *testing.T) {
		modules := scanEntryModules(t, `import {createValidateFn} from '@ts-runtypes/core';
export const isNames = createValidateFn<string[]>(undefined, {checkUnknowns: true});
`)
		name, ok := findEntryWith(modules, familyPrefix(t, "validateStrict"))
		if !ok {
			t.Fatalf("no validateStrict entry emitted\nmodules: %v", keys(modules))
		}
		for _, unwanted := range []string{"countEnumKeys", "hasUnknownKeysFromArray"} {
			if strings.Contains(modules[name], unwanted) {
				t.Errorf("an array of primitives emitted %q:\n%s", unwanted, modules[name])
			}
		}
	})
}
