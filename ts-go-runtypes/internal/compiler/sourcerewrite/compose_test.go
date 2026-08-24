package sourcerewrite

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/protocol"
)

func mapFromRows(rows [][]segment, sources []string) *protocol.SourceMap {
	return &protocol.SourceMap{Version: 3, Sources: sources, Mappings: encodeMappings(rows)}
}

// TestMappings_RoundTrip: decode(encode(rows)) reproduces the segments, and a
// real Apply-generated map survives a decode→encode round trip byte-for-byte.
func TestMappings_RoundTrip(t *testing.T) {
	rows := [][]segment{
		{},
		{{genCol: 0, srcIdx: 0, srcLine: 0, srcCol: 0, fields: 4}, {genCol: 7, srcIdx: 0, srcLine: 0, srcCol: 7, fields: 4}},
		{{genCol: 0, srcIdx: 0, srcLine: 1, srcCol: 0, fields: 4}, {genCol: 4, srcIdx: 0, srcLine: 1, srcCol: 4, nameIdx: 2, fields: 5}},
	}
	encoded := encodeMappings(rows)
	got := decodeMappings(encoded)
	if len(got) != len(rows) {
		t.Fatalf("row count: got %d want %d", len(got), len(rows))
	}
	for r := range rows {
		if len(got[r]) != len(rows[r]) {
			t.Fatalf("row %d seg count: got %d want %d", r, len(got[r]), len(rows[r]))
		}
		for s := range rows[r] {
			if got[r][s] != rows[r][s] {
				t.Errorf("row %d seg %d: got %+v want %+v", r, s, got[r][s], rows[r][s])
			}
		}
	}

	// A real boundary map (from Apply) must round-trip its mappings string.
	src := "import {getRunTypeId} from '@ts-runtypes/core';\ntype User = {id: number};\ngetRunTypeId<User>();\n"
	sites := []protocol.Site{{File: "u.ts", Pos: strings.LastIndex(src, ")"), ID: "abc"}}
	_, realMap := Apply("u.ts", src, sites, nil)
	if realMap == nil {
		t.Fatal("expected a map from Apply")
	}
	if reencoded := encodeMappings(decodeMappings(realMap.Mappings)); reencoded != realMap.Mappings {
		t.Errorf("Apply-map round trip mismatch\n got: %q\nwant: %q", reencoded, realMap.Mappings)
	}
}

// TestComposeMaps_RemapsThroughRewrite: B (js→rewritten) composed with A
// (rewritten→original) yields js→original. The call-site line in js must land
// on the ORIGINAL line, not the rewritten one (which is shifted by the import).
func TestComposeMaps_RemapsThroughRewrite(t *testing.T) {
	// A: rewritten (import prepended, line 3 got a binding) → original.
	// row0 injected import (no segments), rows 1..3 map to original 0..2.
	aRows := [][]segment{
		{},
		{{genCol: 0, srcLine: 0, srcCol: 0, fields: 4}},
		{{genCol: 0, srcLine: 1, srcCol: 0, fields: 4}},
		{{genCol: 0, srcLine: 2, srcCol: 0, fields: 4}},
	}
	// B: js → rewritten. js line 3 col 0 maps to a mid-line rewritten position.
	bRows := [][]segment{
		{},
		{{genCol: 0, srcLine: 1, srcCol: 0, fields: 4}},
		{{genCol: 0, srcLine: 2, srcCol: 0, fields: 4}},
		{{genCol: 0, srcLine: 3, srcCol: 12, fields: 4}},
	}
	a := mapFromRows(aRows, []string{"original.ts"})
	a.SourcesContent = []*string{strptr("orig source")}
	b := mapFromRows(bRows, []string{"rewritten.ts"})

	c := ComposeMaps(a, b)
	if len(c.Sources) != 1 || c.Sources[0] != "original.ts" {
		t.Errorf("composed sources = %v, want [original.ts]", c.Sources)
	}
	if c.SourcesContent[0] == nil || *c.SourcesContent[0] != "orig source" {
		t.Errorf("composed sourcesContent not carried from A")
	}
	cRows := decodeMappings(c.Mappings)
	// js row 3 must map to ORIGINAL line 2 (the call site), not rewritten line 3.
	if len(cRows) < 4 || len(cRows[3]) != 1 {
		t.Fatalf("composed row 3 = %+v, want one segment", cRowsAt(cRows, 3))
	}
	if cRows[3][0].srcLine != 2 {
		t.Errorf("js(3,0) mapped to original line %d, want 2", cRows[3][0].srcLine)
	}
	// js row 1 maps to original line 0.
	if cRows[1][0].srcLine != 0 {
		t.Errorf("js(1,0) mapped to original line %d, want 0", cRows[1][0].srcLine)
	}
}

// TestComposeMaps_DropsInjectedAndUnsourced: a B segment pointing at a rewritten
// position A has no origin for (the injected import block) is dropped, as is a
// generated-only (1-field) B segment.
func TestComposeMaps_DropsInjectedAndUnsourced(t *testing.T) {
	aRows := [][]segment{
		{}, // rewritten line 0 = injected import, no original origin
		{{genCol: 0, srcLine: 0, srcCol: 0, fields: 4}},
	}
	bRows := [][]segment{
		{{genCol: 0, srcLine: 0, srcCol: 0, fields: 4}},                         // js0 → rewritten line 0 (injected, A row empty) → DROP
		{{genCol: 0, fields: 1}, {genCol: 5, srcLine: 2, srcCol: 0, fields: 4}}, // 1-field DROP; the 4-field → rewritten line 2 (beyond A) → DROP
	}
	c := ComposeMaps(mapFromRows(aRows, []string{"o.ts"}), mapFromRows(bRows, []string{"r.ts"}))
	cRows := decodeMappings(c.Mappings)
	for r, segs := range cRows {
		if len(segs) != 0 {
			t.Errorf("row %d expected all segments dropped, got %+v", r, segs)
		}
	}
}

func strptr(s string) *string { return &s }

func cRowsAt(rows [][]segment, i int) []segment {
	if i < len(rows) {
		return rows[i]
	}
	return nil
}
