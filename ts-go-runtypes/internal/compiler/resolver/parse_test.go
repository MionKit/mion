package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/cachegen/operations"
)

// Resolver coverage for createParseFn: the `strategy` option must pick the right
// family, the site must demand the validationErrors entry its cold path needs,
// and the emitted body must carry the guards that keep parse total on junk.

func TestParse_DefaultsToStripFamily(t *testing.T) {
	modules := scanEntryModules(t, `import {createParseFn} from '@ts-runtypes/core';
interface User {id: number; name: string}
export const parseUser = createParseFn<User>();
`)
	if _, ok := findEntryWith(modules, familyPrefix(t, "parse")); !ok {
		t.Fatalf("no parse entry emitted\nmodules: %v", keys(modules))
	}
	for _, other := range []string{"parseFail", "parsePreserve"} {
		if _, ok := findEntryWith(modules, familyPrefix(t, other)); ok {
			t.Fatalf("default call site emitted a %s entry\nmodules: %v", other, keys(modules))
		}
	}
}

func TestParse_StrategySelectsTheFamily(t *testing.T) {
	for _, row := range []struct{ strategy, opName string }{
		{"strip", "parse"},
		{"fail", "parseFail"},
		{"preserve", "parsePreserve"},
	} {
		t.Run(row.strategy, func(t *testing.T) {
			modules := scanEntryModules(t, `import {createParseFn} from '@ts-runtypes/core';
interface User {id: number; name: string}
export const parseUser = createParseFn<User>(undefined, {strategy: '`+row.strategy+`'});
`)
			if _, ok := findEntryWith(modules, familyPrefix(t, row.opName)); !ok {
				t.Fatalf("strategy %q did not select %s\nmodules: %v", row.strategy, row.opName, keys(modules))
			}
		})
	}
}

// The factory resolves TWO tuples: the parse body, and the validationErrors
// entry it builds the report from on failure. A site missing the second would
// throw with an empty report.
func TestParse_DemandsTheValidationErrorsEntry(t *testing.T) {
	modules := scanEntryModules(t, `import {createParseFn} from '@ts-runtypes/core';
interface User {id: number; name: string}
export const parseUser = createParseFn<User>();
`)
	if _, ok := findEntryWith(modules, familyPrefix(t, "validationErrors")); !ok {
		t.Fatalf("parse site did not demand the validationErrors entry its cold path needs\nmodules: %v", keys(modules))
	}
}

// Totality guards. The restore arms parse builds on assume validated input, so
// each risky leaf must check the wire shape BEFORE converting. Without these a
// junk payload escapes as a raw SyntaxError / RangeError instead of an
// RTParseError.
func TestParse_GuardsTheThrowingLeaves(t *testing.T) {
	for _, row := range []struct{ label, src, want string }{
		{
			label: "bigint",
			src:   `interface T {n: bigint}`,
			// BigInt('nope') throws — the digits test has to run first.
			want: "typeof",
		},
		{
			label: "date",
			src:   `interface T {at: Date}`,
			// new Date(junk) yields an Invalid Date, caught by the NaN check.
			want: "isNaN",
		},
		{
			label: "regexp",
			src:   `interface T {re: RegExp}`,
			// the restore arm indexes .match() output with no null check.
			want: "match",
		},
	} {
		t.Run(row.label, func(t *testing.T) {
			modules := scanEntryModules(t, `import {createParseFn} from '@ts-runtypes/core';
`+row.src+`
export const parse = createParseFn<T>();
`)
			name, ok := findEntryWith(modules, familyPrefix(t, "parse"))
			if !ok {
				t.Fatalf("no parse entry emitted\nmodules: %v", keys(modules))
			}
			if !strings.Contains(modules[name], row.want) {
				t.Errorf("%s leaf is missing its %q guard:\n%s", row.label, row.want, modules[name])
			}
		})
	}
}

// The strip family rebuilds each object from its declared properties. A NAMED
// nested type is dependency-called, and the call's result must be ASSIGNED back
// or the rebuilt object is silently discarded — the bug this pins.
func TestParse_AssignsTheDependencyCallResult(t *testing.T) {
	modules := scanEntryModules(t, `import {createParseFn} from '@ts-runtypes/core';
interface Address {street: string}
interface Person {name: string; address: Address}
export const parsePerson = createParseFn<Person>();
`)
	// Named BY TYPE: Address gets its own parse entry in the same family, and it
	// has no nested call to assign, so picking it would fail this check for a
	// reason that has nothing to do with the bug being pinned.
	name, ok := findEntryForType(modules, familyPrefix(t, "parse"), "Person")
	if !ok {
		t.Fatalf("no parse entry emitted for Person\nmodules: %v", keys(modules))
	}
	// The root body must WRITE the child call back, not just invoke it.
	body := modules[name]
	if !strings.Contains(body, "address=") && !strings.Contains(body, "address =") {
		t.Errorf("root parse body never assigns the nested call's result — the rebuilt object is discarded:\n%s", body)
	}
}

// Marker test coverage rule (ts-go-runtypes/CLAUDE.md): both getRunTypeId call
// shapes, paired, with one hash-equivalence assertion.

func TestParse_MarkerStaticForm(t *testing.T) {
	r := setupInline(t, map[string]string{"static.ts": `import {getRunTypeId} from '@ts-runtypes/core';
interface Payload {id: number; at: Date}
export const id = getRunTypeId<Payload>();
`})
	if resolved := resolveFile(t, r, "static.ts"); resolved.ID == "" {
		t.Fatalf("static getRunTypeId<Payload>() resolved no id")
	}
}

func TestParse_MarkerReflectForm(t *testing.T) {
	r := setupInline(t, map[string]string{"reflect.ts": `import {getRunTypeId} from '@ts-runtypes/core';
interface Payload {id: number; at: Date}
const v: Payload = {id: 1, at: new Date()};
export const id = getRunTypeId(v);
`})
	if resolved := resolveFile(t, r, "reflect.ts"); resolved.ID == "" {
		t.Fatalf("reflect getRunTypeId(v) resolved no id")
	}
}

func TestParse_MarkerFormEquivalence(t *testing.T) {
	r := setupInline(t, map[string]string{
		"static.ts": `import {getRunTypeId} from '@ts-runtypes/core';
interface Payload {id: number; at: Date}
export const id = getRunTypeId<Payload>();
`,
		"reflect.ts": `import {getRunTypeId} from '@ts-runtypes/core';
interface Payload {id: number; at: Date}
const v: Payload = {id: 1, at: new Date()};
export const id = getRunTypeId(v);
`,
	})
	static := resolveFile(t, r, "static.ts")
	reflect := resolveFile(t, r, "reflect.ts")
	if static.ID != reflect.ID {
		t.Fatalf("static vs reflect form of Payload disagree: %q vs %q", static.ID, reflect.ID)
	}
}

// The parse families are independent of the JSON decoder: a parse site must not
// drag in a jsonDecoder composite, and vice versa.
func TestParse_DoesNotDemandTheJsonDecoder(t *testing.T) {
	modules := scanEntryModules(t, `import {createParseFn} from '@ts-runtypes/core';
interface User {id: number}
export const parseUser = createParseFn<User>();
`)
	op, ok := operations.ByName("jsonDecoder")
	if !ok {
		t.Fatalf("jsonDecoder operation missing from the registry")
	}
	decoderHash := operations.FnHashFor(op, nil, "strip", false) + "_"
	if _, found := findEntryWith(modules, decoderHash); found {
		t.Errorf("parse site pulled in a jsonDecoder composite\nmodules: %v", keys(modules))
	}
}
