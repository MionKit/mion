package diagnostics

import (
	"sort"
	"strings"
)

// Dedupe keeps the first of repeats that are identical in code, family, severity, args, site and
// related list, and preserves order otherwise.
//
// Needed above Walker.EmitDiagnostic's own latch, which dedupes per code per WALK while a walk is
// per-CACHE-FAMILY: a type demanded by several families is walked several times, each walk blind to
// its siblings and emitting against EVERY provenance site, so a family-shared emit path (today the
// FMT00x codes) reports four times where the user should see two.
//
// Args are what the JS catalog renders the message from, so agreeing on code + args + site means
// BYTE-IDENTICAL lines and collapsing loses nothing; different args say different things and both
// survive.
func Dedupe(list []Diagnostic) []Diagnostic {
	if len(list) < 2 {
		return list
	}
	seen := make(map[string]bool, len(list))
	out := make([]Diagnostic, 0, len(list))
	for _, diagnostic := range list {
		key := dedupeKey(diagnostic)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, diagnostic)
	}
	if len(out) == len(list) {
		return list
	}
	return out
}

// dedupeKey renders a Diagnostic's full identity as a map key: every field the wire carries
// participates, so only diagnostics that render identically collapse. \x00 separates fields and
// \x01 the repeated ones, neither of which appears in a code, a path or a message.
func dedupeKey(diagnostic Diagnostic) string {
	var key strings.Builder
	key.WriteString(diagnostic.Code)
	key.WriteByte(0)
	key.WriteByte(byte(diagnostic.Family))
	key.WriteByte(byte(diagnostic.Severity))
	writeSite(&key, diagnostic.Site)
	for _, arg := range diagnostic.Args {
		key.WriteByte(1)
		key.WriteString(arg)
	}
	for _, related := range diagnostic.Related {
		key.WriteByte(1)
		writeSite(&key, related.Site)
		key.WriteString(related.Message)
	}
	return key.String()
}

// writeSite appends a Site's fields to the key; line/col go in as raw int bytes because the key is
// opaque and the cheapest unambiguous encoding wins.
func writeSite(key *strings.Builder, site Site) {
	key.WriteByte(0)
	key.WriteString(site.FilePath)
	key.WriteByte(0)
	writeInt(key, site.StartLine)
	writeInt(key, site.StartCol)
	writeInt(key, site.EndLine)
	writeInt(key, site.EndCol)
}

func writeInt(key *strings.Builder, value int) {
	unsigned := uint64(value)
	for shift := 0; shift < 64; shift += 8 {
		key.WriteByte(byte(unsigned >> shift))
	}
}

// Sort orders diagnostics by file, line, column. Stable, so two findings at one position keep the
// order the lane produced them in.
func Sort(diags []Diagnostic) {
	sort.SliceStable(diags, func(i, j int) bool {
		left, right := diags[i].Site, diags[j].Site
		if left.FilePath != right.FilePath {
			return left.FilePath < right.FilePath
		}
		if left.StartLine != right.StartLine {
			return left.StartLine < right.StartLine
		}
		return left.StartCol < right.StartCol
	})
}
