package sourcerewrite

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"unicode/utf16"

	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// applyComputed is the reference applier the FE mirrors: prepend the import
// block, then apply each point/span edit against the ORIGINAL source via the
// same EditBuffer Apply uses. If ComputeEdits' output run through this
// reproduces Apply's output, the edit list is a faithful description of the
// rewrite and the two transform modes cannot diverge.
func applyComputed(file, source, importBlock string, edits []protocol.Edit) (string, *protocol.SourceMap) {
	// Mirror Apply's no-rewrite short-circuit: nothing to apply → original
	// source, nil map (the FE plugin returns null in this case).
	if importBlock == "" && len(edits) == 0 {
		return source, nil
	}
	units := utf16.Encode([]rune(source))
	eb := newEditBuffer(units)
	for _, edit := range edits {
		if edit.Start == edit.End {
			eb.appendLeft(edit.Start, edit.Text)
		} else {
			eb.update(edit.Start, edit.End, edit.Text)
		}
	}
	if importBlock != "" {
		eb.prepend(importBlock)
	}
	return eb.string(), eb.generateMap(file, source)
}

// TestComputeEdits_MatchesApply runs every fixture through ComputeEdits +
// applyComputed and asserts the result is byte-identical to Apply — the
// structural parity that lets 'go' and 'edits' modes share one Go transform.
func TestComputeEdits_MatchesApply(t *testing.T) {
	paths, err := filepath.Glob(filepath.Join("testdata", "*.json"))
	if err != nil {
		t.Fatalf("glob testdata: %v", err)
	}
	if len(paths) == 0 {
		t.Fatal("no fixture testdata/*.json found — run: go run ./cmd/gen-sourcerewrite-fixtures")
	}
	for _, path := range paths {
		name := filepath.Base(path)
		t.Run(name, func(t *testing.T) {
			raw, err := os.ReadFile(path)
			if err != nil {
				t.Fatalf("read %s: %v", path, err)
			}
			var tc fixtureCase
			if err := json.Unmarshal(raw, &tc); err != nil {
				t.Fatalf("unmarshal %s: %v", path, err)
			}

			wantCode, wantMap := Apply(tc.File, tc.Code, tc.Sites, tc.Replacements)
			importBlock, edits := ComputeEdits(tc.Code, tc.Sites, tc.Replacements)
			gotCode, gotMap := applyComputed(tc.File, tc.Code, importBlock, edits)

			if gotCode != wantCode {
				t.Errorf("code mismatch\n got: %q\nwant: %q", gotCode, wantCode)
			}
			if (wantMap == nil) != (gotMap == nil) {
				t.Fatalf("map presence mismatch: got nil=%v, want nil=%v", gotMap == nil, wantMap == nil)
			}
			if wantMap != nil && gotMap.Mappings != wantMap.Mappings {
				t.Errorf("mappings mismatch\n got: %q\nwant: %q", gotMap.Mappings, wantMap.Mappings)
			}
			// The no-rewrite short-circuit: no sites and no replacements yields
			// an empty edit set and no import block (Apply returns a nil map).
			if len(tc.Sites) == 0 && len(tc.Replacements) == 0 {
				if importBlock != "" || edits != nil {
					t.Errorf("expected empty edits for no-rewrite case, got importBlock=%q edits=%v", importBlock, edits)
				}
			}
		})
	}
}

// TestComputeEdits_Offsets_UTF16 pins the code-unit contract: a 4-byte astral
// character (🦄, one surrogate PAIR = 2 UTF-16 units) before the site must shift
// the edit offset by UTF-16 units, not bytes or runes.
func TestComputeEdits_Offsets_UTF16(t *testing.T) {
	// "🦄x" then a zero-width site at the BYTE offset of 'x'. 🦄 is 4 UTF-8
	// bytes and 2 UTF-16 units, so byte 4 → char 2.
	source := "🦄x"
	byteOfX := len("🦄") // 4
	sites := []protocol.Site{{File: "u.ts", Pos: byteOfX, ID: "abc"}}
	_, edits := ComputeEdits(source, sites, nil)
	if len(edits) != 1 {
		t.Fatalf("expected 1 edit, got %d", len(edits))
	}
	if edits[0].Start != 2 || edits[0].End != 2 {
		t.Errorf("astral offset not converted to UTF-16 units: got Start=%d, want 2", edits[0].Start)
	}
}

// TestSourceHash_Vectors pins FNV-1a/32 canonical test vectors. The FE hasher
// (packages/ts-runtypes-devtools/src/apply-edits.ts) must produce these EXACT
// strings over the same UTF-8 bytes, or the consistency guard would false-fire.
func TestSourceHash_Vectors(t *testing.T) {
	cases := map[string]string{
		"":       "811c9dc5", // FNV-1a/32 offset basis
		"a":      "e40c292c",
		"foobar": "bf9cf968",
	}
	for input, want := range cases {
		if got := SourceHash(input); got != want {
			t.Errorf("SourceHash(%q) = %q, want %q", input, got, want)
		}
	}
	// UTF-8 bytes, not code points: a multibyte source still hashes over its
	// encoded bytes so the FE's Buffer.from(code, 'utf8') matches.
	if a, b := SourceHash("café"), SourceHash("café"); a != b {
		t.Errorf("SourceHash not deterministic: %q vs %q", a, b)
	}
}
