package mirror

import (
	"fmt"
	"sort"
)

// spliceOp is one edit against the ORIGINAL file bytes: replace or delete when start < end, insert when start == end.
// Offsets are raw byte offsets, as AST Pos/End are, so no char/byte conversion is needed.
type spliceOp struct {
	start int
	end   int
	text  string
}

// applySplices returns raw rewritten by ops, every op indexing the ORIGINAL bytes; an empty list returns raw unchanged.
// Touching ranges are never merged, they apply independently, and an OVERLAPPING pair errors: it signals an emit bug.
func applySplices(raw []byte, ops []spliceOp) ([]byte, error) {
	if len(ops) == 0 {
		return raw, nil
	}
	sorted := make([]spliceOp, len(ops))
	copy(sorted, ops)
	sort.SliceStable(sorted, func(left, right int) bool {
		if sorted[left].start != sorted[right].start {
			return sorted[left].start > sorted[right].start
		}
		return sorted[left].end > sorted[right].end
	})

	// Touching ranges are fine, only an overlap is an error.
	if lower, upper, overlap := findSpliceOverlap(sorted); overlap {
		return nil, fmt.Errorf("mion enrich --update: overlapping splice ops [%d,%d) and [%d,%d) — internal error (all ops: %s)",
			lower.start, lower.end, upper.start, upper.end, describeSpliceOps(ops))
	}
	// Bounds sanity.
	for _, op := range sorted {
		if op.start < 0 || op.end > len(raw) || op.start > op.end {
			return nil, fmt.Errorf("mion enrich --update: splice op out of bounds [%d,%d) over %d bytes — internal error", op.start, op.end, len(raw))
		}
	}

	// Assemble ascending, which is valid because the ops are non-overlapping and each still indexes the ORIGINAL bytes.
	out := make([]byte, 0, len(raw))
	prev := 0
	for i := len(sorted) - 1; i >= 0; i-- {
		op := sorted[i]
		out = append(out, raw[prev:op.start]...)
		out = append(out, op.text...)
		prev = op.end
	}
	out = append(out, raw[prev:]...)
	return out, nil
}

// findSpliceOverlap returns the first pair in a DESCENDING-sorted list whose ranges overlap; touching ranges do not.
func findSpliceOverlap(descending []spliceOp) (lower, upper spliceOp, overlap bool) {
	for i := 0; i+1 < len(descending); i++ {
		upper = descending[i]   // higher start
		lower = descending[i+1] // lower start
		if lower.end > upper.start {
			return lower, upper, true
		}
	}
	return spliceOp{}, spliceOp{}, false
}

// describeSpliceOps renders the op list ascending by start, for the error path only.
func describeSpliceOps(ops []spliceOp) string {
	sorted := make([]spliceOp, len(ops))
	copy(sorted, ops)
	sort.SliceStable(sorted, func(left, right int) bool { return sorted[left].start < sorted[right].start })
	out := ""
	for _, op := range sorted {
		out += fmt.Sprintf("[%d,%d)=%q ", op.start, op.end, op.text)
	}
	return out
}
