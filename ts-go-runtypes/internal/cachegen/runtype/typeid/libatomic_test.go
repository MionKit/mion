package typeid_test

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// What a standard-library type does now, pinned. The projection decides data by
// what IS data, and a type declared in the standard library is not on that list,
// so it goes in whole: subKind + classRef, no members. These tests are the
// user-visible half of that rule, and the two places it must NOT reach.
//
// The rule is about WHERE a type is declared, not what it is called, which is
// why there is no list anywhere to fall behind a new lib edition.

// libDeclared are three standard-library types nobody would call binary, chosen
// because each used to be WALKED and each was a different kind of wrong.
// `Intl.DateTimeFormat` had four distinct structural ids across the libs, so one
// model's id depended on the consumer's tsconfig. `Object` walked into the
// prototype surface. `URLSearchParams` walked its methods and iterator surface
// as if they were the payload. (`URL` itself is a supported native, see nativeurl_test.go.)
var libDeclared = []struct {
	label   string
	spelled string
	builtin string
}{
	{"URLSearchParams", "URLSearchParams", "URLSearchParams"},
	{"Intl.DateTimeFormat", "Intl.DateTimeFormat", "DateTimeFormat"},
	{"Object", "Object", "Object"},
}

func TestLibAtomic_LibClassesProjectWhole(t *testing.T) {
	for _, subject := range libDeclared {
		root := rootUnderLib(t, "esnext,dom", `import {getRunTypeId} from '@mionjs/run-types';
export const id = getRunTypeId<`+subject.spelled+`>();
`)
		if root.SubKind != reflection.SubKindNonSerializable {
			t.Errorf("%s: expected SubKindNonSerializable, got %d", subject.label, root.SubKind)
		}
		if root.ClassRef == nil || root.ClassRef.Builtin != subject.builtin {
			t.Errorf("%s: expected builtin classRef %q, got %+v", subject.label, subject.builtin, root.ClassRef)
		}
		if len(root.Children) != 0 {
			t.Errorf("%s must project atomically, got %d members", subject.label, len(root.Children))
		}
	}
}

// TestLibAtomic_FormEquivalence — the marker coverage rule for the pin above:
// the same lib type reached through a VALUE lands on the static form's entry.
func TestLibAtomic_FormEquivalence(t *testing.T) {
	static := rootUnderLib(t, "esnext,dom", `import {getRunTypeId} from '@mionjs/run-types';
export const id = getRunTypeId<{link: URLSearchParams}>();
`)
	reflected := rootUnderLib(t, "esnext,dom", `import {getRunTypeId} from '@mionjs/run-types';
declare const row: {link: URLSearchParams};
export const id = getRunTypeId(row);
`)
	if static.ID != reflected.ID {
		t.Fatalf("getRunTypeId<{link: URLSearchParams}>() and getRunTypeId(value) must share an id: %q vs %q", static.ID, reflected.ID)
	}
}

// TestLibAtomic_OneIdWhateverTheLib — taking a lib type whole is what makes its
// id stop depending on the consumer's tsconfig. `Intl.DateTimeFormat` had FOUR
// structural ids across the libs while it was walked, because each edition adds
// members to it. Nothing about a dropped value can differ, so nothing about its
// id does.
func TestLibAtomic_OneIdWhateverTheLib(t *testing.T) {
	for _, subject := range libDeclared {
		source := `import {getRunTypeId} from '@mionjs/run-types';
export const id = getRunTypeId<{value: ` + subject.spelled + `}>();
`
		var baseline, baselineLib string
		for _, lib := range []string{"es2020,dom", "es2022,dom", "es2025,dom", "esnext,dom"} {
			structural := structuralUnderLib(t, lib, source)
			if baseline == "" {
				baseline, baselineLib = structural, lib
				continue
			}
			if structural != baseline {
				t.Errorf("%s under lib %s differs from %s:\n  %s\n  %s",
					subject.label, lib, baselineLib, structural, baseline)
			}
		}
	}
}

// TestLibAtomic_AliasesStillWalk — the guard on the rule. `Partial`, `Record`
// and `Readonly` are declared in the standard library too, but they are ALIASES:
// what the checker hands back is the consumer's own shape wearing a lib name.
// Taking those whole would strip a model down to nothing.
//
// Nothing tests for "alias" explicitly. The rule asks for an interface- or
// class-flagged symbol, and a mapped type has neither, which is the same test
// the object projection already uses for its own name stamping.
func TestLibAtomic_AliasesStillWalk(t *testing.T) {
	for _, alias := range []struct {
		label    string
		source   string
		expected string
	}{
		{"Partial", `interface Address {street: string; zip: string}
export const id = getRunTypeId<Partial<Address>>();
`, "street"},
		{"Record", `export const id = getRunTypeId<Record<string, number>>();
`, "31:5:6"},
		{"Readonly", `interface Address {street: string}
export const id = getRunTypeId<Readonly<Address>>();
`, "street"},
	} {
		structural := structuralUnderLib(t, "esnext,dom", `import {getRunTypeId} from '@mionjs/run-types';
`+alias.source)
		if !strings.Contains(structural, alias.expected) {
			t.Errorf("%s must still walk to the consumer's own shape, got %s", alias.label, structural)
		}
	}
}

// Adding a member the platform lacks to a lib interface makes the whole symbol the author's, so it is walked.
// A merge that adds nothing leaves it the platform's (platform_declared_test.go).
// The projection gets large, but dropping a member the author just declared would be worse.
func TestLibAtomic_AugmentedLibInterfaceIsTheAuthorsAgain(t *testing.T) {
	structural := structuralUnderLib(t, "esnext,dom", `import {getRunTypeId} from '@mionjs/run-types';
declare global {
  interface URL {mine: string}
}
export const id = getRunTypeId<{link: URL}>();
`)
	if strings.Contains(structural, "32:link:2004#URL}") || strings.Contains(structural, "32:link:2005}") {
		t.Fatalf("an augmented URL is partly the author's own declaration, so it must be walked: %s", structural)
	}
	if !strings.Contains(structural, "mine") {
		t.Errorf("the author's added member must appear in the projection: %s", structural)
	}
}
