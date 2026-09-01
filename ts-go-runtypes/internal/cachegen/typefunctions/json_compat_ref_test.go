package typefunctions

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// Regression: isJsonCompatible must resolve a raw KindRef before walking it.
// Map/Set inner types (mapKeyValueTypes / setItemType) arrive here as
// unresolved refs; before the fix, jsonCompatRecursive had no KindRef arm so
// the ref fell through to `return false` AND was memoized under the ref's id
// (= the target type's structural id), poisoning that type's verdict for every
// later caller sharing the FactsTable. The visible symptom was an unrelated
// merged-prop union (e.g. {a:string;b:number} | {a:boolean;c:Date}) wrongly
// sub-wrapping prop `a`.
func TestIsJsonCompatible_RawRefDoesNotPoison(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	ctx := jsonCompatCtx(t, []*reflection.RunType{str})
	ctx.walker.facts = NewFactsTable()

	ref := &reflection.RunType{Kind: reflection.KindRef, ID: "str"}
	if !isJsonCompatible(ref, ctx) {
		t.Fatalf("isJsonCompatible(ref->string) = false, want true — a raw ref must resolve, not fall through")
	}
	// The cache for the string id must hold the CORRECT verdict (true), not the
	// poisoned false a fall-through ref would have stored.
	if verdict, known := ctx.walker.factsLookup(factJsonCompat, "str"); !known || !verdict {
		t.Fatalf("factJsonCompat[str] = (%v, known=%v), want (true, true) — ref poisoned the cache", verdict, known)
	}
	// A later direct check of the string reads the (correct) cached verdict.
	if !isJsonCompatible(str, ctx) {
		t.Fatalf("isJsonCompatible(string) = false after the ref check — poisoned")
	}
}
