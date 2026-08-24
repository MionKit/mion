package mirror

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/enrichment"
)

// Translation files reconcile with the ORDINARY type-driven Spec — same
// machinery as the friendly source mirror, parameterized by the src-derived
// driver (locale-prefixed vars, locale plural arms, sibling refs renamed).
// These tests pin the translation-specific behaviours of that one reconcile:
// plural-arm locale ownership, the mandatory-`other` backstop, the normal
// SourceDeclaresType orphan oracle over translation-named consts, and the
// const-rename carry (incl. the sibling-reference fixup). The desired sides
// are hand-built equivalents of what cmd's translate driver emits (mirror
// tests own no Program).

const translationSrcPath = "/proj/src/models.ts"
const translationMirrorPath = "/proj/runtypes/generated/i18n/pl/models.ts"

// translationSrcText is the src the orphan oracle reads (both types declared).
const translationSrcText = "export interface Address { street: string }\n" +
	"export interface User { name: string; home: Address }\n"

// translationFixture is an EXISTING pl translation file: locale-prefixed
// consts annotated FriendlyText<T>, a src-type breadcrumb, pl plural arms, and
// two authored (translated) leaves the reconcile must preserve.
const translationFixture = `import type { Address, User } from '../../../../src/models';
import type { FriendlyText } from '@ts-runtypes/core';

/** @rtType Address#a1 @rtIds {street: s1} */
export const pl_friendlyAddress: FriendlyText<Address> = {
  rt$label: '',
  rt$errors: {type: ''},
  street: {rt$label: 'Ulica', rt$errors: {type: ''}},
};

/** @rtType User#u1 @rtIds {home: a1, name: n1} */
export const pl_friendlyUser: FriendlyText<User> = {
  rt$label: '',
  rt$errors: {type: ''},
  name: {rt$label: '', rt$errors: {
    type: '',
    minLength: {one: '', few: '', many: '', other: ''},
    pattern: 'tylko litery',
  }},
  home: pl_friendlyAddress,
};
`

// desiredTranslationConsts hand-builds the src-derived desired side for locale
// pl over models.ts — what EmitClosure (SourceLocale: pl) + the driver's var
// prefixing/sibling renaming would emit.
func desiredTranslationConsts() []enrichment.NamedConst {
	address := enrichment.NamedConst{
		TypeName: "Address", DeclFile: translationSrcPath,
		FriendlyVar: "pl_friendlyAddress",
		Friendly:    "{rt$label: '', rt$errors: {type: ''}, street: {rt$label: '', rt$errors: {type: ''}}}",
		TypeID:      "a1", ChildIDs: map[string]string{"street": "s1"},
	}
	user := enrichment.NamedConst{
		TypeName: "User", DeclFile: translationSrcPath,
		FriendlyVar: "pl_friendlyUser",
		Friendly: "{rt$label: '', rt$errors: {type: ''}, " +
			"name: {rt$label: '', rt$errors: {type: '', minLength: {one: '', few: '', many: '', other: ''}, pattern: ''}}, " +
			"home: pl_friendlyAddress}",
		TypeID: "u1", ChildIDs: map[string]string{"home": "a1", "name": "n1"},
	}
	return []enrichment.NamedConst{address, user}
}

// translationSpec bundles the pl translation Spec over a desired set — an
// ORDINARY spec: the breadcrumb/orphan oracle is the src .ts, like any mirror.
func translationSpec(consts []enrichment.NamedConst) Spec {
	return Spec{
		MirrorPath:    translationMirrorPath,
		SourceFile:    translationSrcPath,
		Consts:        consts,
		VarDeclFile:   map[string]string{},
		WantFriendly:  true,
		WantMock:      false,
		MirrorPathFor: func(declFile string) string { return declFile },
	}
}

// reconcileTranslation runs the full Reconcile of a desired set against an
// existing translation file, with srcText backing the orphan oracle.
func reconcileTranslation(t *testing.T, consts []enrichment.NamedConst, existing, srcText string) (string, bool) {
	t.Helper()
	out, changed, err := Reconcile(translationSpec(consts), []byte(existing),
		func(string) (string, error) { return srcText, nil })
	if err != nil {
		t.Fatalf("Reconcile: %v", err)
	}
	return string(out), changed
}

func TestTranslation_InSyncIsNoOp(t *testing.T) {
	out, changed := reconcileTranslation(t, desiredTranslationConsts(), translationFixture, translationSrcText)
	if changed {
		t.Errorf("an in-sync translation must be a byte-identical no-op; got:\n%s", out)
	}
	// Authored (translated) leaves survive: a desired blank never clobbers them.
	if !strings.Contains(out, "Ulica") || !strings.Contains(out, "tylko litery") {
		t.Errorf("authored translation lost:\n%s", out)
	}
}

func TestTranslation_ErrorsDescentScaffoldsAddedConstraints(t *testing.T) {
	// The src type gains a maxLength (count-bearing → a plural with the TARGET
	// locale's arms, already baked into the desired side by EmitClosure) and an
	// allowedChars (plain string) on name — the rt$errors descent must scaffold
	// both as blanks in the translation.
	grown := desiredTranslationConsts()
	grown[1].Friendly = strings.Replace(grown[1].Friendly,
		"pattern: ''",
		"pattern: '', maxLength: {one: '', few: '', many: '', other: ''}, allowedChars: ''", 1)

	out, changed := reconcileTranslation(t, grown, translationFixture, translationSrcText)
	if !changed {
		t.Fatalf("src-added constraints must change the translation")
	}
	if !strings.Contains(out, "maxLength: {one: '', few: '', many: '', other: ''}") {
		t.Errorf("added count-bearing constraint not scaffolded with the locale's arms:\n%s", out)
	}
	if !strings.Contains(out, "allowedChars: ''") {
		t.Errorf("added string constraint not scaffolded blank:\n%s", out)
	}
}

func TestTranslation_ErrorsDescentOrphansDroppedConstraint(t *testing.T) {
	// The src type drops `pattern` (a recognized constraint name) — the filled
	// translation must be orphan-childed, value preserved.
	shrunk := desiredTranslationConsts()
	shrunk[1].Friendly = strings.Replace(shrunk[1].Friendly, ", pattern: ''", "", 1)

	out, changed := reconcileTranslation(t, shrunk, translationFixture, translationSrcText)
	if !changed {
		t.Fatalf("src-dropped constraint must change the translation")
	}
	if !strings.Contains(out, "/* @rtOrphanChild pattern: 'tylko litery', */") {
		t.Errorf("dropped constraint must orphan (value preserved):\n%s", out)
	}
}

func TestTranslation_PluralArmsLocaleOwned(t *testing.T) {
	// The translator prunes `few`, fills `many`, and hand-adds `two` (their
	// language, their call) — arms are LOCALE-OWNED: never orphaned, never
	// rename-paired, never forced back to the desired set.
	authored := strings.Replace(translationFixture,
		"minLength: {one: '', few: '', many: '', other: ''}",
		"minLength: {one: '', many: 'dużo znaków', two: 'para', other: ''}", 1)

	out, changed := reconcileTranslation(t, desiredTranslationConsts(), authored, translationSrcText)
	if changed {
		t.Fatalf("locale-owned arms must not churn; got:\n%s", out)
	}
	if !strings.Contains(out, "minLength: {one: '', many: 'dużo znaków', two: 'para', other: ''}") {
		t.Errorf("arm set was edited:\n%s", out)
	}
	if strings.Contains(out, "@rtOrphanChild") {
		t.Errorf("an arm was orphaned:\n%s", out)
	}
}

func TestTranslation_OnlyMandatoryOtherArmReinserted(t *testing.T) {
	// Pruned past the mandatory backstop: only `other` is ever re-inserted — a
	// pruned one/few/many stays pruned.
	pruned := strings.Replace(translationFixture,
		"minLength: {one: '', few: '', many: '', other: ''}",
		"minLength: {one: 'znak'}", 1)

	out, changed := reconcileTranslation(t, desiredTranslationConsts(), pruned, translationSrcText)
	if !changed {
		t.Fatalf("the missing `other` backstop must be re-scaffolded")
	}
	if !strings.Contains(out, "one: 'znak'") {
		t.Errorf("filled arm lost:\n%s", out)
	}
	if !strings.Contains(out, "other: ''") {
		t.Errorf("mandatory `other` not re-inserted:\n%s", out)
	}
	for _, prunedArm := range []string{"few: ''", "many: ''"} {
		if strings.Contains(out, prunedArm) {
			t.Errorf("pruned arm %q must stay pruned:\n%s", prunedArm, out)
		}
	}
}

func TestTranslation_OrphanViaNormalOracle(t *testing.T) {
	// The Address type is deleted from src: the translation const orphans via
	// the SAME SourceDeclaresType oracle as any mirror const — its type name
	// comes from its FriendlyText<Address> annotation, its breadcrumb points at
	// the src .ts. The preserved value survives inside the carcass.
	userOnly := desiredTranslationConsts()[1:]
	srcWithoutAddress := "export interface User { name: string; home: unknown }\n"

	out, changed := reconcileTranslation(t, userOnly, translationFixture, srcWithoutAddress)
	if !changed {
		t.Fatalf("expected the orphan pass to fire")
	}
	if !strings.Contains(out, "/* @rtOrphan ") || !strings.Contains(out, "pl_friendlyAddress") {
		t.Errorf("stale translation const must be @rtOrphan'd:\n%s", out)
	}
	if !strings.Contains(out, "Ulica") {
		t.Errorf("orphaned value must be preserved inside the carcass:\n%s", out)
	}

	// Counter-case: the type still declared (merely absent from this closure) —
	// KEEP, never orphan.
	out, changed = reconcileTranslation(t, userOnly, translationFixture, translationSrcText)
	if changed || strings.Contains(out, "@rtOrphan ") {
		t.Errorf("a still-declared type must never orphan:\n%s", out)
	}
}

func TestTranslation_ConstRenameCarriesWithSiblingFixup(t *testing.T) {
	// The src renames Address → Location (same structural id a1). The rename
	// carries via the shared @rtType id: var + annotation + marker rewritten in
	// place, the authored tree kept, and the SIBLING reference in
	// pl_friendlyUser fixed up to the new var.
	renamed := desiredTranslationConsts()
	renamed[0].TypeName = "Location"
	renamed[0].FriendlyVar = "pl_friendlyLocation"
	renamed[1].Friendly = strings.Replace(renamed[1].Friendly, "pl_friendlyAddress", "pl_friendlyLocation", 1)
	srcRenamed := strings.ReplaceAll(translationSrcText, "Address", "Location")

	out, changed := reconcileTranslation(t, renamed, translationFixture, srcRenamed)
	if !changed {
		t.Fatalf("src rename must carry into the translation")
	}
	if !strings.Contains(out, "export const pl_friendlyLocation: FriendlyText<Location>") {
		t.Errorf("translation const not renamed in place:\n%s", out)
	}
	if !strings.Contains(out, "@rtType Location#a1") {
		t.Errorf("marker not refreshed with the new type name:\n%s", out)
	}
	if strings.Contains(out, "@rtOrphan ") {
		t.Errorf("a rename must never orphan:\n%s", out)
	}
	if !strings.Contains(out, "street: {rt$label: 'Ulica'") {
		t.Errorf("authored value lost across the rename:\n%s", out)
	}
	if !strings.Contains(out, "home: pl_friendlyLocation,") {
		t.Errorf("sibling reference not fixed up:\n%s", out)
	}
}

func TestRenameIdentifierAll_BoundaryAware(t *testing.T) {
	// The exported renamer (the translate driver's sibling-reference rewriter)
	// is word-boundary aware: neither a longer identifier nor an
	// already-prefixed locale twin may match.
	input := "{a: friendlyUser, b: friendlyUserProfile, c: pl_friendlyUser, d: friendlyUser}"
	want := "{a: es_friendlyUser, b: friendlyUserProfile, c: pl_friendlyUser, d: es_friendlyUser}"
	if got := string(RenameIdentifierAll([]byte(input), "friendlyUser", "es_friendlyUser")); got != want {
		t.Errorf("RenameIdentifierAll = %q, want %q", got, want)
	}
}
