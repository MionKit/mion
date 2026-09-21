package resolver_test

import "testing"

// `{checkUnionUnknowns: true}` swaps the OPERATION the same way `{checkUnknowns: true}` does, so the call site's
// marker still says 'val' / 'verr' and this swap is the only thing routing it.

func TestCheckUnionUnknowns_RoutesToTheUnionKeysFamily(t *testing.T) {
	modules := scanEntryModules(t, `import {createValidateFn} from '@mionjs/run-types';
type Something = {a: string} | Record<string, number>;
export const isSomething = createValidateFn<Something>(undefined, {checkUnionUnknowns: true});
`)
	if _, ok := findEntryWith(modules, familyPrefix(t, "validateUnionKeys")); !ok {
		t.Fatalf("no validateUnionKeys entry emitted\nmodules: %v", keys(modules))
	}
}

func TestCheckUnionUnknowns_ErrorsFormRoutesToo(t *testing.T) {
	modules := scanEntryModules(t, `import {createGetValidationErrorsFn} from '@mionjs/run-types';
type Something = {a: string} | Record<string, number>;
export const errs = createGetValidationErrorsFn<Something>(undefined, {checkUnionUnknowns: true});
`)
	if _, ok := findEntryWith(modules, familyPrefix(t, "validationErrorsUnionKeys")); !ok {
		t.Fatalf("no validationErrorsUnionKeys entry emitted\nmodules: %v", keys(modules))
	}
}

func TestCheckUnionUnknowns_PlainCallIsUnaffected(t *testing.T) {
	modules := scanEntryModules(t, `import {createValidateFn} from '@mionjs/run-types';
type Something = {a: string} | Record<string, number>;
export const isSomething = createValidateFn<Something>();
`)
	if _, ok := findEntryWith(modules, familyPrefix(t, "validateUnionKeys")); ok {
		t.Fatalf("plain call site emitted a union-keys entry — the flag leaked\nmodules: %v", keys(modules))
	}
}

// checkUnknowns is strictly stronger, so it wins when both are set.
func TestCheckUnionUnknowns_CheckUnknownsWinsWhenBothAreSet(t *testing.T) {
	modules := scanEntryModules(t, `import {createValidateFn} from '@mionjs/run-types';
type Something = {a: string} | Record<string, number>;
export const isSomething = createValidateFn<Something>(undefined, {checkUnknowns: true, checkUnionUnknowns: true});
`)
	if _, ok := findEntryWith(modules, familyPrefix(t, "validateStrict")); !ok {
		t.Fatalf("expected the stronger validateStrict family\nmodules: %v", keys(modules))
	}
	if _, ok := findEntryWith(modules, familyPrefix(t, "validateUnionKeys")); ok {
		t.Fatalf("both families were emitted for one call site\nmodules: %v", keys(modules))
	}
}

// A NAMED union member is dependency-called into its own entry, so the family must render one for it too; a
// variant would render only the root and the member would lose the check.
func TestCheckUnionUnknowns_RendersEntriesForNamedMembers(t *testing.T) {
	modules := scanEntryModules(t, `import {createValidateFn} from '@mionjs/run-types';
interface Cat {kind: 'cat'; meows: boolean}
interface Dog {kind: 'dog'; barks: number}
export const isPet = createValidateFn<Cat | Dog>(undefined, {checkUnionUnknowns: true});
`)
	prefix := familyPrefix(t, "validateUnionKeys")
	if got := countEntriesWithPrefix(modules, prefix); got < 3 {
		t.Fatalf("expected entries for the union AND both named members, found %d occurrences of %q\nmodules: %v",
			got, prefix, keys(modules))
	}
}
