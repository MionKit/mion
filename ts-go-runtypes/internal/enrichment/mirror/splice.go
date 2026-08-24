package mirror

import (
	"fmt"
	"sort"
)

// spliceOp is one byte-range edit against the ORIGINAL file bytes:
//
//   - replace: start < end, text non-empty — swap raw[start:end] for text.
//   - delete:  start < end, text empty     — drop raw[start:end].
//   - insert:  start == end                — insert text at the offset.
//
// Offsets are raw byte offsets into the original bytes (AST Pos/End are byte
// offsets), so no char/byte conversion is needed.
type spliceOp struct {
	start int
	end   int
	text  string
}

// applySplices applies ops to raw and returns the rewritten bytes. Ops are
// sorted strictly DESCENDING by start (tie-break: descending end) and applied
// back-to-front so each op's offsets stay valid against the still-untouched
// prefix — every op indexes the ORIGINAL bytes. Touching ranges (one op's end ==
// the next's start) are NEVER merged; they apply independently. It errors on any
// pair of OVERLAPPING ranges (a later op's start strictly inside an earlier op's
// [start,end)) — that signals an emit bug, not a recoverable case.
//
// An empty op list returns raw unchanged (the caller detects the no-op by
// comparing bytes).
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

	// Overlap guard: error on any overlapping pair (touching ranges are fine).
	if lower, upper, overlap := findSpliceOverlap(sorted); overlap {
		return nil, fmt.Errorf("gen --update: overlapping splice ops [%d,%d) and [%d,%d) — internal error (all ops: %s)",
			lower.start, lower.end, upper.start, upper.end, describeSpliceOps(ops))
	}
	// Bounds sanity.
	for _, op := range sorted {
		if op.start < 0 || op.end > len(raw) || op.start > op.end {
			return nil, fmt.Errorf("gen --update: splice op out of bounds [%d,%d) over %d bytes — internal error", op.start, op.end, len(raw))
		}
	}

	// Assemble ascending: with the ops validated non-overlapping, reverse the
	// descending list to ascending and stitch raw[prev:op.start] + op.text,
	// advancing prev to op.end. Each op still indexes the ORIGINAL bytes.
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

// findSpliceOverlap scans a DESCENDING-sorted op list for the first overlapping
// pair: a lower-start op whose end reaches strictly past the next higher-start
// op's start. Touching ranges (lower.end == upper.start) are NOT overlaps.
// Returns the offending (lower, upper) pair and overlap=true on the first hit.
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

// describeSpliceOps renders the op list for error/debug output (ascending by
// start). Unused in the happy path; kept for diagnostics.
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
