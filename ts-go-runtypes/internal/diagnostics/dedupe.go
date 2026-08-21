package diagnostics

import "strings"

// Dedupe drops repeats of the SAME diagnostic — identical code, family,
// severity, args, site and related list — keeping the first occurrence and
// preserving order otherwise.
//
// # Why this is needed above the walker's own latch
//
// Walker.EmitDiagnostic already dedupes per code per WALK, but a walk is
// per-CACHE-FAMILY: the resolver fans out one Walker (and one DiagSink shard)
// per family, so a type demanded by several families is walked several times
// and each walk's latch is blind to its siblings. Each walk then emits against
// EVERY provenance site of the root type, so a class touched by the JSON
// encoder and decoder families reports twice at BOTH call sites — four
// diagnostics where the user should see two.
//
// That hits any code emitted from a family-shared emit path (CLS001, the
// FMT00x format codes, …). The per-family-prefixed codes (PJ001 / SJ001 /
// TB001 …) never collided only because their codes differ by family, not
// because the pipeline deduped them.
//
// # Why identical-args is the right key
//
// Args are the positional substitution values the JS catalog renders the
// message from, so two diagnostics agreeing on code + args + site render
// BYTE-IDENTICAL user-facing lines. Collapsing them loses nothing. Two
// diagnostics at one site with DIFFERENT args say different things (e.g. two
// offending property names) and both survive.
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

// dedupeKey renders a Diagnostic's full identity as a string map key. Every
// field the wire carries participates, so the key collapses only diagnostics
// that would render identically. \x00 separates fields and \x01 separates the
// repeated ones — neither appears in a code, a path or a message.
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

// writeSite appends a Site's fields to the key being built. Line/col are
// written as bytes of the int rather than formatted — the key is opaque, so
// the cheapest unambiguous encoding wins.
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
