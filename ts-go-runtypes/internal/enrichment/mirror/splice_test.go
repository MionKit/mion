package mirror

import "testing"

// mustSplice applies ops and fails the test on error — the unit-test convenience
// wrapper now that applySplices returns an error.
func mustSplice(t *testing.T, raw []byte, ops []spliceOp) string {
	t.Helper()
	out, err := applySplices(raw, ops)
	if err != nil {
		t.Fatalf("applySplices error: %v", err)
	}
	return string(out)
}

// TestApplySplices_Replace swaps a middle range, leaving the rest byte-identical.
func TestApplySplices_Replace(t *testing.T) {
	raw := []byte("hello world")
	got := mustSplice(t, raw, []spliceOp{{start: 6, end: 11, text: "there"}})
	if got != "hello there" {
		t.Errorf("replace = %q", got)
	}
}

// TestApplySplices_Delete drops a range (empty text).
func TestApplySplices_Delete(t *testing.T) {
	raw := []byte("hello world")
	got := mustSplice(t, raw, []spliceOp{{start: 5, end: 11, text: ""}})
	if got != "hello" {
		t.Errorf("delete = %q", got)
	}
}

// TestApplySplices_Insert inserts at an offset (start == end).
func TestApplySplices_Insert(t *testing.T) {
	raw := []byte("hello world")
	got := mustSplice(t, raw, []spliceOp{{start: 5, end: 5, text: ","}})
	if got != "hello, world" {
		t.Errorf("insert = %q", got)
	}
}

// TestApplySplices_DescendingOrder applies multiple ops correctly regardless of
// the input order — each op indexes the ORIGINAL bytes.
func TestApplySplices_DescendingOrder(t *testing.T) {
	raw := []byte("0123456789")
	// Input deliberately ascending; the splicer sorts descending internally.
	ops := []spliceOp{
		{start: 0, end: 1, text: "A"},   // replace '0' → 'A'
		{start: 4, end: 4, text: "-"},   // insert '-' before '4'
		{start: 8, end: 10, text: "XY"}, // replace '89' → 'XY'
	}
	got := mustSplice(t, raw, ops)
	want := "A123-4567XY"
	if got != want {
		t.Errorf("multi-op = %q, want %q", got, want)
	}
}

// TestApplySplices_Adjacency keeps touching ranges (end == next start) distinct —
// they are NOT merged.
func TestApplySplices_Adjacency(t *testing.T) {
	raw := []byte("abcdef")
	ops := []spliceOp{
		{start: 0, end: 3, text: "X"}, // replace 'abc' → 'X'
		{start: 3, end: 6, text: "Y"}, // replace 'def' → 'Y' (touches the first at 3)
	}
	got := mustSplice(t, raw, ops)
	if got != "XY" {
		t.Errorf("adjacent = %q, want XY", got)
	}

	// Insertion exactly at another op's boundary is also allowed (touching).
	ops2 := []spliceOp{
		{start: 3, end: 3, text: "|"}, // insert at 3
		{start: 3, end: 6, text: "Y"}, // replace 'def' → 'Y'
	}
	got2 := mustSplice(t, raw, ops2)
	if got2 != "abc|Y" {
		t.Errorf("adjacent insert = %q, want abc|Y", got2)
	}
}

// TestApplySplices_EmptyNoOp returns the original bytes unchanged.
func TestApplySplices_EmptyNoOp(t *testing.T) {
	raw := []byte("unchanged")
	got, err := applySplices(raw, nil)
	if err != nil {
		t.Fatalf("applySplices error: %v", err)
	}
	if string(got) != "unchanged" {
		t.Errorf("empty op list changed bytes: %q", got)
	}
}

// TestFindSpliceOverlap detects strict overlaps but not touching ranges.
func TestFindSpliceOverlap(t *testing.T) {
	// Overlap: [2,6) and [4,8) share [4,6).
	descending := []spliceOp{{start: 4, end: 8}, {start: 2, end: 6}}
	if _, _, overlap := findSpliceOverlap(descending); !overlap {
		t.Errorf("expected overlap for [2,6)/[4,8)")
	}

	// Touching: [3,6) and [0,3) — end == start, not an overlap.
	touching := []spliceOp{{start: 3, end: 6}, {start: 0, end: 3}}
	if _, _, overlap := findSpliceOverlap(touching); overlap {
		t.Errorf("touching ranges should not be flagged as overlap")
	}

	// Disjoint with a gap.
	disjoint := []spliceOp{{start: 5, end: 7}, {start: 0, end: 2}}
	if _, _, overlap := findSpliceOverlap(disjoint); overlap {
		t.Errorf("disjoint ranges flagged as overlap")
	}
}
