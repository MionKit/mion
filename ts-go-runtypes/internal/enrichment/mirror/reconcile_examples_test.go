package mirror

// Worked-example tests for the enrich-mirror reconciler — readable, one scenario
// each, showing the committed mirror a user edited and what `gen --update`
// produces. They double as documentation of the reconciler's behaviour on the
// common edits. (The property test next door proves the same invariants hold over
// random edit sequences; these spell out the headline cases in plain sight.)

import (
	"regexp"
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/enrichment"
)

// blankLabels empties every authored rt$label value so two mirrors that differ ONLY in
// authored text compare equal — the normalizer for the content-blindness check.
func blankLabels(mirror string) string {
	return regexp.MustCompile(`rt\$label: '[^']*'`).ReplaceAllString(mirror, "rt$$label: ''")
}

// Metamorphic: the reconciler is CONTENT-BLIND. The SAME source edit (drop `age`, add
// `email`, keep `name`), applied to a mirror with EMPTY authored values and to one
// with FILLED values, produces the same STRUCTURE — same fields kept / added /
// orphaned, same markers — differing only in the carried text. Pins that no reconcile
// decision branches on what the author wrote (filling labels can never change which
// fields move where, or whether it converges).
func TestExample_ReconcileIsContentBlind(t *testing.T) {
	header := "import type { User } from '../src';\n" +
		"import type { FriendlyText, MockData } from '@ts-runtypes/core';\n\n" +
		"/** @rtType User#u1 @rtIds {name: strId, age: numId} */\n"
	emptyExisting := header +
		"export const friendlyUser: FriendlyText<User> = {rt$label: '', name: {rt$label: ''}, age: {rt$label: ''}};\n"
	filledExisting := header +
		"export const friendlyUser: FriendlyText<User> = {rt$label: 'Account', name: {rt$label: 'Name'}, age: {rt$label: 'Age'}};\n"

	spec := friendlySpec(enrichment.NamedConst{
		TypeName: "User", DeclFile: "/src.ts", FriendlyVar: "friendlyUser",
		Friendly: "{rt$label: '', name: {rt$label: ''}, email: {rt$label: ''}}",
		TypeID:   "u2", ChildIDs: map[string]string{"name": "strId", "email": "strId"},
	})
	outEmpty := mustReconcile(t, spec, emptyExisting, sourceDeclaring("User"))
	outFilled := mustReconcile(t, spec, filledExisting, sourceDeclaring("User"))

	if blankLabels(outEmpty) != blankLabels(outFilled) {
		t.Errorf("reconcile is not content-blind:\n--- empty (blanked) ---\n%s\n--- filled (blanked) ---\n%s", blankLabels(outEmpty), blankLabels(outFilled))
	}
}

// friendlySpec builds a friendly-only desired set (one const per case keeps the
// example readable; the mock form behaves identically).
func friendlySpec(consts ...enrichment.NamedConst) Spec {
	return Spec{
		MirrorPath:   "/rt/models.ts",
		SourceFile:   "/src.ts",
		WantFriendly: true,
		Consts:       consts,
	}
}

// mustReconcile runs the real Reconcile and returns the new mirror text.
func mustReconcile(t *testing.T, spec Spec, existing string, readSource func(string) (string, error)) string {
	t.Helper()
	out, _, err := Reconcile(spec, []byte(existing), readSource)
	if err != nil {
		t.Fatalf("Reconcile error: %v", err)
	}
	return string(out)
}

// sourceDeclaring fakes the breadcrumb source file: it declares the given type
// names so the orphan judgement sees them as still-present.
func sourceDeclaring(names ...string) func(string) (string, error) {
	return func(string) (string, error) {
		var b strings.Builder
		for _, name := range names {
			b.WriteString("export interface " + name + " {}\n")
		}
		return b.String(), nil
	}
}

func requireContains(t *testing.T, text, want string) {
	t.Helper()
	if !strings.Contains(text, want) {
		t.Errorf("expected the mirror to contain %q, got:\n%s", want, text)
	}
}

func requireMissing(t *testing.T, text, bad string) {
	t.Helper()
	if strings.Contains(text, bad) {
		t.Errorf("expected the mirror NOT to contain %q, got:\n%s", bad, text)
	}
}

// Rename a FIELD (name -> fullName). The reconciler pairs the dropped `name` with
// the added `fullName` by their shared field-type id and carries the authored
// label across — no orphan, no empty twin.
func TestExample_RenameField_carriesValue(t *testing.T) {
	existing := "import type { User } from '../src';\n" +
		"import type { FriendlyText, MockData } from '@ts-runtypes/core';\n\n" +
		"/** @rtType User#u1 @rtIds {name: strId} */\n" +
		"export const friendlyUser: FriendlyText<User> = {\n" +
		"  rt$label: '',\n" +
		"  name: {rt$label: 'Full name'},\n" +
		"};\n"

	spec := friendlySpec(enrichment.NamedConst{
		TypeName: "User", DeclFile: "/src.ts", FriendlyVar: "friendlyUser",
		Friendly: "{rt$label: '', fullName: {rt$label: ''}}",
		TypeID:   "u2", ChildIDs: map[string]string{"fullName": "strId"},
	})
	out := mustReconcile(t, spec, existing, sourceDeclaring("User"))

	requireContains(t, out, "fullName: {rt$label: 'Full name'}") // value carried to the new key
	requireMissing(t, out, "@rtOrphan")                          // no orphan trail
	requireMissing(t, out, "name: {rt$label")                    // old key gone (it became fullName)
}

// Rename a whole INTERFACE (User -> Account). Same shape => same structural id, so
// the reconciler carries the ENTIRE tree and just rewrites the name in three
// places (var, annotation, marker) plus the breadcrumb. No orphan, no regenerated
// empty twin. (Before the fix this crashed with "overlapping splice ops".)
func TestExample_RenameInterface_carriesTreeAndRenames(t *testing.T) {
	existing := "import type { User } from '../src';\n" +
		"import type { FriendlyText, MockData } from '@ts-runtypes/core';\n\n" +
		"/** @rtType User#shapeId @rtIds {name: strId} */\n" +
		"export const friendlyUser: FriendlyText<User> = {\n" +
		"  rt$label: 'A person',\n" +
		"  name: {rt$label: 'Full name'},\n" +
		"};\n"

	spec := friendlySpec(enrichment.NamedConst{
		TypeName: "Account", DeclFile: "/src.ts", FriendlyVar: "friendlyAccount",
		Friendly: "{rt$label: '', name: {rt$label: ''}}",
		TypeID:   "shapeId", ChildIDs: map[string]string{"name": "strId"},
	})
	out := mustReconcile(t, spec, existing, sourceDeclaring("Account"))

	requireContains(t, out, "export const friendlyAccount: FriendlyText<Account>") // var + annotation renamed
	requireContains(t, out, "@rtType Account#shapeId")                             // marker renamed (same id)
	requireContains(t, out, "import type { Account }")                             // breadcrumb renamed
	requireContains(t, out, "rt$label: 'A person'")                                // root label carried
	requireContains(t, out, "name: {rt$label: 'Full name'}")                       // field carried
	requireMissing(t, out, "@rtOrphan")                                            // no orphan tree
	requireMissing(t, out, "friendlyUser")                                         // old const fully gone
}

// Rename a whole interface AND reshape it in one edit (Widget{id,size} ->
// Gadget{id,size,color}). Both the NAME and the whole-graph structural id change,
// so neither the name match nor the old id-ONLY rename matcher fired — the authored
// tree was lost to an @rtOrphan carcass. Graph-parity scoring pairs them by their
// shared field graph (id + size overlap) and CARRIES the authored values onto the
// renamed-and-grown const, scaffolding only the genuinely new field.
func TestExample_RenameAndReshape_carriesByGraphParity(t *testing.T) {
	existing := "import type { Widget } from '../src';\n" +
		"import type { FriendlyText, MockData } from '@ts-runtypes/core';\n\n" +
		"/** @rtType Widget#widId @rtIds {id: idStr, size: numId} */\n" +
		"export const friendlyWidget: FriendlyText<Widget> = {\n" +
		"  rt$label: 'A widget',\n" +
		"  id: {rt$label: 'Identifier'},\n" +
		"  size: {rt$label: 'Size in mm'},\n" +
		"};\n"

	spec := friendlySpec(enrichment.NamedConst{
		TypeName: "Gadget", DeclFile: "/src.ts", FriendlyVar: "friendlyGadget",
		Friendly: "{rt$label: '', id: {rt$label: ''}, size: {rt$label: ''}, color: {rt$label: ''}}",
		TypeID:   "gadId", // different whole-graph id — the reshape changed it
		ChildIDs: map[string]string{"id": "idStr", "size": "numId", "color": "colId"},
	})
	out := mustReconcile(t, spec, existing, sourceDeclaring("Gadget"))

	requireContains(t, out, "export const friendlyGadget: FriendlyText<Gadget>") // var + annotation renamed
	requireContains(t, out, "@rtType Gadget#gadId")                              // marker updated to new id
	requireContains(t, out, "rt$label: 'A widget'")                              // root label carried
	requireContains(t, out, "id: {rt$label: 'Identifier'}")                      // kept field carried
	requireContains(t, out, "size: {rt$label: 'Size in mm'}")                    // kept field carried
	requireContains(t, out, "color:")                                            // new field scaffolded
	requireMissing(t, out, "@rtOrphan")                                          // nothing orphaned
	requireMissing(t, out, "friendlyWidget")                                     // old const fully gone

	// Fixed point: a second --update is a byte-identical no-op (marker now carries
	// the new id + child-id map, so nothing re-pairs).
	out2 := mustReconcile(t, spec, out, sourceDeclaring("Gadget"))
	if out != out2 {
		t.Errorf("rename+reshape not a fixed point:\n--- first ---\n%s\n--- second ---\n%s", out, out2)
	}
}

// Two same-shape types renamed in ONE pass (A,B -> X,Y, all sharing a structural
// id) is genuinely ambiguous: every drop ties every add at score 1.0, so there is
// no unique best match. The matcher must NOT guess — it falls through to the safe
// orphan + scaffold path, preserving each authored value in its own carcass rather
// than risking a mis-attribution onto the wrong renamed type.
func TestExample_TwoSameShapeRenames_ambiguousFallsThrough(t *testing.T) {
	existing := "import type { A, B } from '../src';\n" +
		"import type { FriendlyText, MockData } from '@ts-runtypes/core';\n\n" +
		"/** @rtType A#sameId @rtIds {x: strId} */\n" +
		"export const friendlyA: FriendlyText<A> = {rt$label: 'the A', x: {rt$label: 'x of A'}};\n\n" +
		"/** @rtType B#sameId @rtIds {x: strId} */\n" +
		"export const friendlyB: FriendlyText<B> = {rt$label: 'the B', x: {rt$label: 'x of B'}};\n"

	body := "{rt$label: '', x: {rt$label: ''}}"
	spec := friendlySpec(
		enrichment.NamedConst{TypeName: "X", DeclFile: "/src.ts", FriendlyVar: "friendlyX", Friendly: body, TypeID: "sameId", ChildIDs: map[string]string{"x": "strId"}},
		enrichment.NamedConst{TypeName: "Y", DeclFile: "/src.ts", FriendlyVar: "friendlyY", Friendly: body, TypeID: "sameId", ChildIDs: map[string]string{"x": "strId"}},
	)
	out := mustReconcile(t, spec, existing, sourceDeclaring("X", "Y"))

	requireContains(t, out, "export const friendlyX: FriendlyText<X>") // X scaffolded under its own name
	requireContains(t, out, "export const friendlyY: FriendlyText<Y>") // Y scaffolded under its own name
	requireContains(t, out, "@rtOrphan")                               // A and B orphaned, not carried
	requireContains(t, out, "x of A")                                  // A's value preserved in its carcass
	requireContains(t, out, "x of B")                                  // B's value preserved in its carcass
}

// Rename a NOMINAL type (an enum): its id is name-dependent so it CHANGES on
// rename, and its const has no field graph to score — neither the id fast-path nor
// graph-parity can pair it. The REFERENTIAL signal does: the parent field that
// referenced the old enum now references the new one (its @rtIds child id
// repointed e0old→e0new), concrete evidence of the rename, so the authored enum
// label carries onto the live renamed const instead of being lost to an @rtOrphan.
func TestExample_RenameEnum_carriesByReferentialLink(t *testing.T) {
	existing := "import type { Holder, E0 } from '../src';\n" +
		"import type { FriendlyText, MockData } from '@ts-runtypes/core';\n\n" +
		"/** @rtType E0#e0old */\n" +
		"export const friendlyE0: FriendlyText<E0> = {rt$label: 'A status enum', rt$errors: {type: ''}};\n\n" +
		"/** @rtType Holder#holdId @rtIds {kind: e0old} */\n" +
		"export const friendlyHolder: FriendlyText<Holder> = {rt$label: 'Holder', kind: friendlyE0};\n"

	spec := friendlySpec(
		enrichment.NamedConst{
			TypeName: "Status", DeclFile: "/src.ts", FriendlyVar: "friendlyStatus",
			Friendly: "{rt$label: '', rt$errors: {type: ''}}", TypeID: "e0new", // enum id changed with the rename
		},
		enrichment.NamedConst{
			TypeName: "Holder", DeclFile: "/src.ts", FriendlyVar: "friendlyHolder",
			Friendly: "{rt$label: '', kind: friendlyStatus}",
			TypeID:   "holdId", ChildIDs: map[string]string{"kind": "e0new"}, // field repointed to the new id
		},
	)
	out := mustReconcile(t, spec, existing, sourceDeclaring("Holder", "Status"))

	requireContains(t, out, "export const friendlyStatus: FriendlyText<Status> = {rt$label: 'A status enum'") // carried onto the LIVE const
	requireContains(t, out, "@rtType Status#e0new")                                                           // marker renamed to the new id
	requireMissing(t, out, "@rtType E0#e0old")                                                                // old enum not orphaned (it was renamed)
}

// Soundness: two unrelated enums deleted and two unrelated enums added, with NO
// parent field repointing between them. There is no referential evidence and no
// field graph, so the matcher does NOT guess — it falls through, preserving each
// authored label in its carcass rather than mis-carrying onto an unrelated enum.
func TestExample_RenameEnum_noReferentialLink_fallsThrough(t *testing.T) {
	existing := "import type { E1, E2 } from '../src';\n" +
		"import type { FriendlyText, MockData } from '@ts-runtypes/core';\n\n" +
		"/** @rtType E1#e1 */\n" +
		"export const friendlyE1: FriendlyText<E1> = {rt$label: 'enum one', rt$errors: {type: ''}};\n\n" +
		"/** @rtType E2#e2 */\n" +
		"export const friendlyE2: FriendlyText<E2> = {rt$label: 'enum two', rt$errors: {type: ''}};\n"

	spec := friendlySpec(
		enrichment.NamedConst{TypeName: "E3", DeclFile: "/src.ts", FriendlyVar: "friendlyE3", Friendly: "{rt$label: '', rt$errors: {type: ''}}", TypeID: "e3"},
		enrichment.NamedConst{TypeName: "E4", DeclFile: "/src.ts", FriendlyVar: "friendlyE4", Friendly: "{rt$label: '', rt$errors: {type: ''}}", TypeID: "e4"},
	)
	out := mustReconcile(t, spec, existing, sourceDeclaring("E3", "E4"))

	requireContains(t, out, "@rtOrphan") // E1/E2 orphaned (preserved)...
	requireContains(t, out, "enum one")  // ...labels kept in carcasses, not mis-carried
	requireContains(t, out, "enum two")
	requireContains(t, out, "export const friendlyE3: FriendlyText<E3> = {rt$label: ''") // E3/E4 scaffolded fresh
	requireContains(t, out, "export const friendlyE4: FriendlyText<E4> = {rt$label: ''")
}

// Soundness: one enum E0 is referenced by TWO fields that repoint to DIFFERENT new
// enums (fieldA→E1, fieldB→E2). The referential signal links E0 to both, so neither
// is a unique best — strict mutual-best ties and falls through. E0's label is
// preserved in its carcass, and neither E1 nor E2 mis-carries it.
func TestExample_RenameEnum_ambiguousRepoint_fallsThrough(t *testing.T) {
	existing := "import type { HolderA, HolderB, E0 } from '../src';\n" +
		"import type { FriendlyText, MockData } from '@ts-runtypes/core';\n\n" +
		"/** @rtType E0#e0 */\n" +
		"export const friendlyE0: FriendlyText<E0> = {rt$label: 'shared enum', rt$errors: {type: ''}};\n\n" +
		"/** @rtType HolderA#ha @rtIds {fieldA: e0} */\n" +
		"export const friendlyHolderA: FriendlyText<HolderA> = {rt$label: '', fieldA: friendlyE0};\n\n" +
		"/** @rtType HolderB#hb @rtIds {fieldB: e0} */\n" +
		"export const friendlyHolderB: FriendlyText<HolderB> = {rt$label: '', fieldB: friendlyE0};\n"

	spec := friendlySpec(
		enrichment.NamedConst{TypeName: "E1", DeclFile: "/src.ts", FriendlyVar: "friendlyE1", Friendly: "{rt$label: '', rt$errors: {type: ''}}", TypeID: "e1"},
		enrichment.NamedConst{TypeName: "E2", DeclFile: "/src.ts", FriendlyVar: "friendlyE2", Friendly: "{rt$label: '', rt$errors: {type: ''}}", TypeID: "e2"},
		enrichment.NamedConst{TypeName: "HolderA", DeclFile: "/src.ts", FriendlyVar: "friendlyHolderA", Friendly: "{rt$label: '', fieldA: friendlyE1}", TypeID: "ha", ChildIDs: map[string]string{"fieldA": "e1"}},
		enrichment.NamedConst{TypeName: "HolderB", DeclFile: "/src.ts", FriendlyVar: "friendlyHolderB", Friendly: "{rt$label: '', fieldB: friendlyE2}", TypeID: "hb", ChildIDs: map[string]string{"fieldB": "e2"}},
	)
	out := mustReconcile(t, spec, existing, sourceDeclaring("HolderA", "HolderB", "E1", "E2"))

	requireContains(t, out, "@rtOrphan")                                                 // E0 orphaned (ambiguous, not guessed)
	requireContains(t, out, "shared enum")                                               // E0's label preserved in its carcass
	requireContains(t, out, "export const friendlyE1: FriendlyText<E1> = {rt$label: ''") // E1 scaffolded empty — no mis-carry
	requireContains(t, out, "export const friendlyE2: FriendlyText<E2> = {rt$label: ''") // E2 scaffolded empty — no mis-carry
}

// Change a field's TYPE without changing its template (age: number -> string).
// The friendly family merges IN PLACE: the authored label still names the
// field whatever its kind, so it stays LIVE (no carcass, no blank re-scaffold);
// constraint keys reconcile individually via the rt$errors descent. This is
// the i18n fuzz T3 preservation contract
// (docs/done/i18n-sync-authored-leaf-lost-on-prune-update.md). A change that
// also changes the structural template still replaces
// (TestMerge_FriendlyChildTypeChanged_TemplateChangeReplaces), and the mock
// family keeps the whole-field carcass on any type change
// (TestMerge_MockChildTypeChanged_StillReplaces).
func TestExample_ChangeFieldType_keepsStillValidLeavesLive(t *testing.T) {
	existing := "import type { User } from '../src';\n" +
		"import type { FriendlyText, MockData } from '@ts-runtypes/core';\n\n" +
		"/** @rtType User#u1 @rtIds {age: numId} */\n" +
		"export const friendlyUser: FriendlyText<User> = {\n" +
		"  rt$label: '',\n" +
		"  age: {rt$label: 'Years old'},\n" +
		"};\n"

	spec := friendlySpec(enrichment.NamedConst{
		TypeName: "User", DeclFile: "/src.ts", FriendlyVar: "friendlyUser",
		Friendly: "{rt$label: '', age: {rt$label: ''}}",
		TypeID:   "u2", ChildIDs: map[string]string{"age": "strId"}, // age is now a string
	})
	out := mustReconcile(t, spec, existing, sourceDeclaring("User"))

	if strings.Contains(out, "@rtOrphanChild") {
		t.Errorf("same-template type change must not carcass the field:\n%s", out)
	}
	requireContains(t, out, "age: {rt$label: 'Years old'}") // authored label lives on, in place
	requireContains(t, out, "@rtIds {age: strId}")          // marker refreshed to the new id
}

// Add a field. A fresh skeleton is inserted; existing authored values are
// untouched.
func TestExample_AddField_insertsFreshSkeleton(t *testing.T) {
	existing := "import type { User } from '../src';\n" +
		"import type { FriendlyText, MockData } from '@ts-runtypes/core';\n\n" +
		"/** @rtType User#u1 @rtIds {name: strId} */\n" +
		"export const friendlyUser: FriendlyText<User> = {\n" +
		"  rt$label: '',\n" +
		"  name: {rt$label: 'Full name'},\n" +
		"};\n"

	spec := friendlySpec(enrichment.NamedConst{
		TypeName: "User", DeclFile: "/src.ts", FriendlyVar: "friendlyUser",
		Friendly: "{rt$label: '', name: {rt$label: ''}, email: {rt$label: ''}}",
		TypeID:   "u2", ChildIDs: map[string]string{"name": "strId", "email": "strId"},
	})
	out := mustReconcile(t, spec, existing, sourceDeclaring("User"))

	requireContains(t, out, "name: {rt$label: 'Full name'}") // existing value untouched
	requireContains(t, out, "email:")                        // new field added
	requireMissing(t, out, "@rtOrphan")
}

// Delete a field. It is commented out as @rtOrphanChild — the authored value is
// preserved (restorable / prunable), never silently dropped.
func TestExample_DeleteField_orphanChildsIt(t *testing.T) {
	existing := "import type { User } from '../src';\n" +
		"import type { FriendlyText, MockData } from '@ts-runtypes/core';\n\n" +
		"/** @rtType User#u1 @rtIds {name: strId, nickname: strId} */\n" +
		"export const friendlyUser: FriendlyText<User> = {\n" +
		"  rt$label: '',\n" +
		"  name: {rt$label: 'Full name'},\n" +
		"  nickname: {rt$label: 'Nickname'},\n" +
		"};\n"

	spec := friendlySpec(enrichment.NamedConst{
		TypeName: "User", DeclFile: "/src.ts", FriendlyVar: "friendlyUser",
		Friendly: "{rt$label: '', name: {rt$label: ''}}",
		TypeID:   "u2", ChildIDs: map[string]string{"name": "strId"},
	})
	out := mustReconcile(t, spec, existing, sourceDeclaring("User"))

	requireContains(t, out, "name: {rt$label: 'Full name'}") // surviving field untouched
	requireContains(t, out, "@rtOrphanChild")                // deleted field commented out...
	requireContains(t, out, "rt$label: 'Nickname'")          // ...with its value preserved
}

// Two DIFFERENT named types with the SAME shape (A and B share a structural id)
// are kept as DISTINCT consts and never conflate — emission and matching are by
// NAME, the id is only a change-detection signal.
func TestExample_TwoSameShapeTypes_stayDistinct(t *testing.T) {
	existing := "import type { A, B } from '../src';\n" +
		"import type { FriendlyText, MockData } from '@ts-runtypes/core';\n\n" +
		"/** @rtType A#sameId @rtIds {x: strId} */\n" +
		"export const friendlyA: FriendlyText<A> = {rt$label: 'the A', x: {rt$label: 'x of A'}};\n\n" +
		"/** @rtType B#sameId @rtIds {x: strId} */\n" +
		"export const friendlyB: FriendlyText<B> = {rt$label: 'the B', x: {rt$label: 'x of B'}};\n"

	body := "{rt$label: '', x: {rt$label: ''}}"
	spec := friendlySpec(
		enrichment.NamedConst{TypeName: "A", DeclFile: "/src.ts", FriendlyVar: "friendlyA", Friendly: body, TypeID: "sameId", ChildIDs: map[string]string{"x": "strId"}},
		enrichment.NamedConst{TypeName: "B", DeclFile: "/src.ts", FriendlyVar: "friendlyB", Friendly: body, TypeID: "sameId", ChildIDs: map[string]string{"x": "strId"}},
	)
	out := mustReconcile(t, spec, existing, sourceDeclaring("A", "B"))

	// Both consts survive with their OWN authored labels — no conflation, no orphan.
	requireContains(t, out, "the A")
	requireContains(t, out, "the B")
	requireContains(t, out, "x of A")
	requireContains(t, out, "x of B")
	requireMissing(t, out, "@rtOrphan")
}

// A whole-const @rtOrphan carcass (deleted type C) coexists with TWO new types A
// and B that share C's shape (same structural id). Restore-by-id made BOTH A and B
// restore C's one carcass → two splices over the SAME byte range → the
// "overlapping splice ops — internal error" crash. Restore-by-NAME leaves the
// carcass inert and scaffolds A and B fresh. (Cluster A: the crash.)
func TestExample_SameShapeNewTypes_noDoubleRestoreCrash(t *testing.T) {
	existing := "import type { A, B } from '../src';\n" +
		"import type { FriendlyText, MockData } from '@ts-runtypes/core';\n\n" +
		"/* @rtOrphan /** @rtType C#shape *\\/\n" +
		"export const friendlyC: FriendlyText<C> = {rt$label: 'old C label'}; */\n"

	body := "{rt$label: ''}"
	spec := friendlySpec(
		enrichment.NamedConst{TypeName: "A", DeclFile: "/src.ts", FriendlyVar: "friendlyA", Friendly: body, TypeID: "shape"},
		enrichment.NamedConst{TypeName: "B", DeclFile: "/src.ts", FriendlyVar: "friendlyB", Friendly: body, TypeID: "shape"},
	)
	out := mustReconcile(t, spec, existing, sourceDeclaring("A", "B")) // must NOT crash

	requireContains(t, out, "export const friendlyA: FriendlyText<A>") // A scaffolded under its own name
	requireContains(t, out, "export const friendlyB: FriendlyText<B>") // B scaffolded under its own name
	requireContains(t, out, "/* @rtOrphan")                            // C's carcass left intact
	requireContains(t, out, "old C label")                             // C's preserved value untouched
}

// A NEW type A with the SAME shape as a deleted-type carcass C must scaffold under
// ITS OWN name and leave C's carcass inert — restore-by-id wrongly revived
// friendlyC (the old name) for A's reconcile, which then re-orphaned next pass
// (churn). The reconcile must also be a single-pass FIXED POINT. (Cluster A: churn.)
func TestExample_NewTypeSameShapeAsCarcass_doesNotReviveOldConst(t *testing.T) {
	existing := "import type { A } from '../src';\n" +
		"import type { FriendlyText, MockData } from '@ts-runtypes/core';\n\n" +
		"/* @rtOrphan /** @rtType C#shape *\\/\n" +
		"export const friendlyC: FriendlyText<C> = {rt$label: 'old C'}; */\n"

	spec := friendlySpec(enrichment.NamedConst{
		TypeName: "A", DeclFile: "/src.ts", FriendlyVar: "friendlyA", Friendly: "{rt$label: ''}", TypeID: "shape",
	})
	src := sourceDeclaring("A")
	out := mustReconcile(t, spec, existing, src)

	requireContains(t, out, "export const friendlyA: FriendlyText<A>") // A under its OWN name, not revived as C
	requireContains(t, out, "/* @rtOrphan")                            // C's carcass stays a carcass
	requireContains(t, out, "old C")                                   // C's value preserved, inert

	out2 := mustReconcile(t, spec, out, src)
	if out != out2 {
		t.Errorf("not a fixed point — the carcass churned across a second --update:\n--- first ---\n%s\n--- second ---\n%s", out, out2)
	}
}

// A type whose structural id CHANGED while it was orphaned (e.g. a Map whose
// element type was edited) restores from its carcass with a REFRESHED marker in
// ONE pass: the stale id the carcass carried is corrected on restore, not left for
// a second --update to fix (which was an R6 non-convergence). The authored body
// still carries; a same-id reappear stays byte-identical (next test).
func TestExample_RestoreCarcass_refreshesStaleMarker(t *testing.T) {
	existing := "import type { Map } from '../src';\n" +
		"import type { FriendlyText, MockData } from '@ts-runtypes/core';\n\n" +
		"/* @rtOrphan /** @rtType Map#oldId @rtIds {rt$values: oldVal} *\\/\n" +
		"export const friendlyMap: FriendlyText<Map> = {rt$label: 'Authored map', rt$values: {rt$label: 'a value'}}; */\n"

	spec := friendlySpec(enrichment.NamedConst{
		TypeName: "Map", DeclFile: "/src.ts", FriendlyVar: "friendlyMap",
		Friendly: "{rt$label: '', rt$values: {rt$label: ''}}",
		TypeID:   "newId", ChildIDs: map[string]string{"rt$values": "newVal"}, // id changed while orphaned
	})
	out := mustReconcile(t, spec, existing, sourceDeclaring("Map"))

	requireContains(t, out, "@rtType Map#newId")        // marker refreshed to the current id...
	requireContains(t, out, "rt$values: newVal")        // ...including the @rtIds child id
	requireContains(t, out, "rt$label: 'Authored map'") // authored body carried verbatim
	requireMissing(t, out, "Map#oldId")                 // stale id gone
	requireMissing(t, out, "@rtOrphan")                 // carcass consumed (restored live)

	// Fixed point: a second --update is a byte-identical no-op (no stale marker left).
	out2 := mustReconcile(t, spec, out, sourceDeclaring("Map"))
	if out != out2 {
		t.Errorf("restore left a stale marker → not a fixed point:\n--- first ---\n%s\n--- second ---\n%s", out, out2)
	}
}

// The legitimate case still works: the SAME named type B reappears (deleted, then
// re-added with the same name) → its @rtOrphan carcass restores VERBATIM, recovering
// the authored value. (Restore-by-name keeps this; only the cross-name restores go.)
func TestExample_DeletedTypeReappears_restoresByName(t *testing.T) {
	existing := "import type { A } from '../src';\n" +
		"import type { FriendlyText, MockData } from '@ts-runtypes/core';\n\n" +
		"/* @rtOrphan /** @rtType B#bId *\\/\n" +
		"export const friendlyB: FriendlyText<B> = {rt$label: 'Authored B'}; */\n"

	spec := friendlySpec(enrichment.NamedConst{
		TypeName: "B", DeclFile: "/src.ts", FriendlyVar: "friendlyB", Friendly: "{rt$label: ''}", TypeID: "bId",
	})
	out := mustReconcile(t, spec, existing, sourceDeclaring("B"))

	requireContains(t, out, "export const friendlyB: FriendlyText<B> = {rt$label: 'Authored B'}") // restored verbatim
	requireMissing(t, out, "@rtOrphan")                                                           // carcass un-commented
}

// Lazy annotation migration: a mirror authored before the friendly-text rename
// still reads `FriendlyType`. `gen --update` rewrites BOTH the const annotation
// wrapper and the `import type { FriendlyType }` DSL import to `FriendlyText` in
// place — the file kept compiling via the deprecated alias, and this pass
// migrates it. The authored body is untouched (content-blind), so only the
// wrapper + import change.
func TestExample_LegacyFriendlyTypeAnnotationMigrates(t *testing.T) {
	existing := "import type { User } from '../src';\n" +
		"import type { FriendlyType } from '@ts-runtypes/core';\n\n" +
		"/** @rtType User#u1 @rtIds {name: strId} */\n" +
		"export const friendlyUser: FriendlyType<User> = {rt$label: 'Account', rt$errors: {type: ''}, name: {rt$label: 'Name', rt$errors: {type: ''}}};\n"

	spec := friendlySpec(enrichment.NamedConst{
		TypeName: "User", DeclFile: "/src.ts", FriendlyVar: "friendlyUser",
		Friendly: "{rt$label: '', rt$errors: {type: ''}, name: {rt$label: '', rt$errors: {type: ''}}}",
		TypeID:   "u1", ChildIDs: map[string]string{"name": "strId"},
	})
	out := mustReconcile(t, spec, existing, sourceDeclaring("User"))

	requireContains(t, out, "export const friendlyUser: FriendlyText<User>")          // annotation wrapper migrated
	requireContains(t, out, "import type { FriendlyText } from '@ts-runtypes/core';") // DSL import migrated
	requireContains(t, out, "rt$label: 'Account'")                                    // authored body untouched
	requireMissing(t, out, "FriendlyType")                                            // no legacy spelling survives
}

// Orphaned consts are NOT migrated: an existing legacy `FriendlyType` const whose
// source type is gone is commented into an @rtOrphan carcass, and the carcass
// keeps its original text verbatim (the wrapper splice would collide with the
// whole-statement orphan splice, and a commented-out const's name is moot).
func TestExample_OrphanedLegacyConst_keepsVerbatimWrapper(t *testing.T) {
	existing := "import type { User } from '../src';\n" +
		"import type { FriendlyType } from '@ts-runtypes/core';\n\n" +
		"/** @rtType Ghost#gId */\n" +
		"export const friendlyGhost: FriendlyType<Ghost> = {rt$label: 'Ghost'};\n"

	spec := friendlySpec() // desire nothing → the orphaned const has no live match
	out := mustReconcile(t, spec, existing, sourceDeclaring("User"))

	requireContains(t, out, "@rtOrphan")                          // const carcassed
	requireContains(t, out, "friendlyGhost: FriendlyType<Ghost>") // wrapper left verbatim in the carcass
}
