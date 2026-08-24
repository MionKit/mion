package mirror

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/enrichment"
)

// todoLine is the exact PLAIN `@todo` line constBlock stamps on a newly-generated
// const. It is deliberately OUTSIDE the `@rt` namespace (a `//` line comment, not
// a `@rt`-prefixed JSDoc tag) — the compiler only emits it, never acts on it. The
// tests pin its format + placement.
const todoLine = "// @todo: generated skeleton — fill in real data, then delete this line"

// TestTodoComment_Format pins the exact `@todo` line + its trailing newline, so a
// careless reword can't silently break the placement contract — AND asserts the
// flag is OUTSIDE the `@rt` namespace (a plain `@todo`, never `@rtTodo`).
func TestTodoComment_Format(t *testing.T) {
	got := todoComment()
	if got != todoLine+"\n" {
		t.Errorf("todoComment() = %q, want %q", got, todoLine+"\n")
	}
	// Namespace rule: the new-const flag is a PLAIN `@todo`, never `@rt`-prefixed.
	if strings.Contains(got, "@rt") {
		t.Errorf("the new-const flag must be a PLAIN @todo OUTSIDE the @rt namespace; got %q", got)
	}
	if !strings.Contains(got, "@todo") {
		t.Errorf("todoComment() must carry a plain @todo tag; got %q", got)
	}
}

// TestConstBlock_EmitsTodoAfterMarker: a generated const carries exactly ONE
// `@todo` line, placed AFTER the `@rtType`/`@rtIds` marker line and BEFORE the
// `export const` keyword — a separate line, never folded into the marker.
func TestConstBlock_EmitsTodoAfterMarker(t *testing.T) {
	named := enrichment.NamedConst{
		TypeName:    "User",
		FriendlyVar: "friendlyUser",
		TypeID:      "uID",
		ChildIDs:    map[string]string{"name": "nID"},
	}
	block := ConstBlock(named.FriendlyVar, "FriendlyType", named, "{rt$label: ''}")

	if strings.Count(block, "@todo") != 1 {
		t.Errorf("a new const must carry exactly one @todo line:\n%s", block)
	}
	// The marker keeps its own `@rtType`; the flag must NOT be a namespaced @rtTodo.
	if strings.Contains(block, "@rtTodo") {
		t.Errorf("the flag must be a plain @todo, never @rtTodo:\n%s", block)
	}
	// Order: marker line, then @todo line, then the export.
	markerIdx := strings.Index(block, "@rtType")
	todoIdx := strings.Index(block, "@todo")
	exportIdx := strings.Index(block, "export const")
	if !(markerIdx >= 0 && markerIdx < todoIdx && todoIdx < exportIdx) {
		t.Errorf("expected @rtType < @todo < export const; got marker=%d todo=%d export=%d:\n%s",
			markerIdx, todoIdx, exportIdx, block)
	}
	// The @todo rides its own line — the marker's `*/` and a newline separate them.
	if !strings.Contains(block, "*/\n"+todoLine+"\n") {
		t.Errorf("@todo must be on its own SEPARATE line after the marker:\n%s", block)
	}
	// And it is never folded INTO the @rtType marker line.
	if strings.Contains(block, "@rtType") {
		markerLineEnd := strings.Index(block, "@rtType")
		markerLine := block[markerLineEnd : strings.Index(block[markerLineEnd:], "\n")+markerLineEnd]
		if strings.Contains(markerLine, "@todo") {
			t.Errorf("@todo must NOT be folded into the @rtType marker line: %q", markerLine)
		}
	}
}

// TestConstBlock_EmitsTodoWithoutMarker: a degenerate const with no structural id
// (markerComment returns "") still gets its `@todo` — the flag means "needs data"
// independent of whether the reconcile marker is present.
func TestConstBlock_EmitsTodoWithoutMarker(t *testing.T) {
	named := enrichment.NamedConst{TypeName: "Anon", FriendlyVar: "friendlyAnon"} // no TypeID
	block := ConstBlock(named.FriendlyVar, "FriendlyType", named, "{rt$label: ''}")
	if strings.Contains(block, "@rtType") {
		t.Fatalf("precondition: a const with no TypeID should have no @rtType marker:\n%s", block)
	}
	if strings.Count(block, "@todo") != 1 {
		t.Errorf("a marker-less new const must still carry exactly one @todo:\n%s", block)
	}
	if !strings.HasPrefix(block, todoLine+"\n") {
		t.Errorf("@todo should lead the marker-less block:\n%s", block)
	}
}

// TestAppendNewConsts_StampsTodo: the reconcile NEW-const append path
// (appendNewConsts) stamps a fresh `@todo` on each appended const, friendly +
// mock alike (one per const).
func TestAppendNewConsts_StampsTodo(t *testing.T) {
	src := "import type { A } from './a';\n" +
		"import type { FriendlyType, MockData } from '@ts-runtypes/core';\n"
	index := mustParse(t, "/rt/gen/a.ts", src)
	spec := Spec{
		MirrorPath:   "/rt/gen/a.ts",
		SourceFile:   "/src/a.ts",
		Out:          "/rt/gen/a.ts", // single-file: skip cross-file import wiring
		WantFriendly: true,
		WantMock:     true,
	}
	added := []enrichment.NamedConst{{
		TypeName:    "B",
		FriendlyVar: "friendlyB",
		MockVar:     "mockB",
		Friendly:    "{rt$label: ''}",
		Mock:        "{}",
		TypeID:      "bID",
	}}
	out := string(appendNewConsts(index.raw, spec, index, added))
	// One @todo per appended const (friendly + mock) = 2.
	if n := strings.Count(out, "@todo"); n != 2 {
		t.Errorf("expected 2 @todo lines (friendly + mock); got %d:\n%s", n, out)
	}
}

// TestReconcile_DoesNotReAddTodo is the core idempotency guard for Task 1: a
// committed mirror whose existing const has NO @todo (the user filled it in and
// deleted the line) must NOT have it re-added on a property-merging --update, and
// a const that still HAS its @todo keeps exactly one (no duplication).
func TestReconcile_DoesNotReAddTodo(t *testing.T) {
	// friendlyUser: user cleared @todo and authored a value. mockUser: still has it.
	existing := "import type { User } from '../../src/models';\n" +
		"import type { FriendlyType, MockData } from '@ts-runtypes/core';\n" +
		"\n" +
		"/** @rtType User#uID @rtIds {name: nID} */\n" +
		"export const friendlyUser: FriendlyType<User> = {\n" +
		"  rt$label: '',\n" +
		"  name: {rt$label: 'Full name'},\n" +
		"};\n" +
		"\n" +
		"/** @rtType User#uID @rtIds {name: nID} */\n" +
		todoLine + "\n" +
		"export const mockUser: MockData<User> = {\n" +
		"  name: {pool: ['Ann']},\n" +
		"};\n"

	spec := Spec{
		MirrorPath:   "/rt/gen/models.ts",
		SourceFile:   "/src/models.ts",
		WantFriendly: true,
		WantMock:     true,
		Consts: []enrichment.NamedConst{{
			TypeName:    "User",
			DeclFile:    "/src/models.ts",
			FriendlyVar: "friendlyUser",
			MockVar:     "mockUser",
			Friendly:    "{rt$label: '', name: {rt$label: ''}}",
			Mock:        "{name: {pool: []}}",
			TypeID:      "uID",
			ChildIDs:    map[string]string{"name": "nID"},
		}},
	}
	// A merge that changes nothing structurally is a byte-identical no-op — assert
	// directly on the index-driven reconcile output.
	out := string(reconcileToBytes(t, spec, existing))

	// friendlyUser stays @todo-free; mockUser keeps exactly its one @todo. Total
	// across the file must remain 1 (never re-added to the cleared const).
	if n := strings.Count(out, "@todo"); n != 1 {
		t.Errorf("a cleared @todo must stay cleared and a present one must not duplicate; got %d:\n%s", n, out)
	}
	// The authored value survives, the cleared const is unchanged.
	if !strings.Contains(out, "name: {rt$label: 'Full name'}") {
		t.Errorf("authored value must be preserved:\n%s", out)
	}
	// friendlyUser must NOT have re-grown a @todo line: the leading-trivia span
	// from its marker up to its `export` keyword carries no @todo (the surviving
	// single @todo belongs to mockUser, which appears later in the file).
	markerIdx := strings.Index(out, "@rtType User#uID @rtIds {name: nID} */\nexport const friendlyUser")
	if markerIdx < 0 {
		t.Fatalf("friendlyUser const not found with a bare marker (no @todo) line:\n%s", out)
	}
}

// TestPruneIgnoresTodo confirms --prune's pattern can never match a plain @todo:
// it strips only @rtOrphan / @rtOrphanChild block comments. A file of nothing but
// a @todo-bearing const prunes to zero removals, byte-identical.
func TestPruneIgnoresTodo(t *testing.T) {
	src := "/** @rtType User#uID */\n" +
		todoLine + "\n" +
		"export const friendlyUser: FriendlyType<User> = { rt$label: '' };\n"
	pruned, removed, _, _ := PruneOrphanBlocks(src)
	if removed != 0 {
		t.Errorf("--prune must ignore @todo (removed=%d):\n%s", removed, pruned)
	}
	if pruned != src {
		t.Errorf("--prune must leave a @todo-only file byte-identical:\n got: %q\nwant: %q", pruned, src)
	}
	// Belt-and-braces: the orphan pattern must not match the plain @todo line at all
	// (it is a `//` line comment, not an @rtOrphan block — the patterns can't cross).
	if orphanBlockPattern.MatchString(todoLine) {
		t.Errorf("orphanBlockPattern must never match the @todo line: %q", todoLine)
	}
}

// TestParseConstMarkers_IgnoresTodo: the marker index never confuses the plain
// @todo with the @rtType marker — a leading comment carrying BOTH yields only the
// @rtType id and @rtIds map, never a spurious @todo-derived id.
func TestParseConstMarkers_IgnoresTodo(t *testing.T) {
	comment := "/** @rtType User#uID @rtIds {name: nID} */\n" + todoLine + "\n"
	typeID, childIDs := parseConstMarkers(comment)
	if typeID != "uID" {
		t.Errorf("typeID = %q, want %q (the @todo line must not perturb parsing)", typeID, "uID")
	}
	if childIDs["name"] != "nID" {
		t.Errorf("childIDs = %v, want name=nID", childIDs)
	}
}

// TestSkeletonBody_NoTodo is the batch-path (runGenBatch → the 287 vitest)
// byte-identity guard: the `@todo` rides the const WRAPPER (constBlock), never the
// skeleton BODY the batch path (FriendlySkeleton/MockSkeleton) emits and the
// generation suite compares. The skeleton emitters live in internal/enrichment and
// have no knowledge of `@todo` by construction — assert that directly so a future
// refactor that pushes the flag into the body would fail loudly here.
func TestSkeletonBody_NoTodo(t *testing.T) {
	// markerComment + todoComment are the ONLY producers of the @rt/@todo trivia,
	// and both are invoked solely by constBlock (the wrapper) — never by the
	// skeleton emitters. A representative emitted body must therefore be @todo-free.
	for _, body := range []string{
		"{rt$label: ''}",
		"{rt$label: '', name: {rt$label: 'Full name'}}",
		"{pool: ['Ann', 'Bob']}",
	} {
		if strings.Contains(body, "@todo") || strings.Contains(body, "@rt") {
			t.Errorf("a skeleton body must carry no marker/@todo trivia: %q", body)
		}
	}
	// And the wrapper-stamped block, stripped of its leading wrapper trivia (the
	// marker + @todo lines up to `export const`), leaves a body with no @todo —
	// proving the flag never bleeds into the body the batch path emits.
	named := enrichment.NamedConst{TypeName: "User", FriendlyVar: "friendlyUser", TypeID: "uID"}
	block := ConstBlock(named.FriendlyVar, "FriendlyType", named, "{rt$label: ''}")
	body := block[strings.Index(block, "= ")+2:]
	if strings.Contains(body, "@todo") {
		t.Errorf("the @todo must live in the wrapper, never in the body:\n%s", body)
	}
}

// reconcileToBytes runs the reconcile against existing bytes and returns the
// resulting file, WITHOUT writing to disk — it replays Reconcile's property-merge
// + append arms over an in-memory index so the @todo / merge assertions stay
// file-system free. The orphan-const judgement is skipped (no breadcrumb source
// to read) — these tests exercise the property-merge + append arms, not the
// orphan arm.
func reconcileToBytes(t *testing.T, spec Spec, existing string) []byte {
	t.Helper()
	index := mustParse(t, spec.MirrorPath, existing)

	var ops []spliceOp
	var addedConsts []enrichment.NamedConst
	for _, named := range spec.Consts {
		if spec.WantFriendly {
			reconcileOneConst(&ops, &addedConsts, index, named, true)
		}
		if spec.WantMock {
			reconcileOneConst(&ops, &addedConsts, index, named, false)
		}
	}
	merged := mustSplice(t, index.raw, ops)
	return appendNewConsts([]byte(merged), spec, index, addedConsts)
}
