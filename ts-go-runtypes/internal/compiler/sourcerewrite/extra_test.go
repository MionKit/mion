package sourcerewrite

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// TestApply_ExtraDiff runs the harder differential cases (testdata/extra/cases.json,
// an array) through Apply — CRLF, tabs, heavy multibyte, replacement spans over
// multibyte, deep padding, bundle-module specifiers, clause dedupe,
// EOF-without-newline, and a word run right after an astral code point.
func TestApply_ExtraDiff(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("testdata", "extra", "cases.json"))
	if err != nil {
		t.Skipf("testdata/extra/cases.json absent (run: go run ./cmd/gen-sourcerewrite-fixtures): %v", err)
	}
	var cases []fixtureCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatalf("unmarshal extra_cases.json: %v", err)
	}
	for i, tc := range cases {
		tc := tc
		t.Run(tc.File+"#"+itoa(i), func(t *testing.T) {
			gotCode, gotMap := Apply(tc.File, tc.Code, tc.Sites, tc.Replacements)
			if gotCode != tc.ExpectedCode {
				t.Errorf("code mismatch\n got: %q\nwant: %q", gotCode, tc.ExpectedCode)
			}
			if tc.ExpectedMap == nil {
				if gotMap != nil {
					t.Errorf("expected nil map, got %+v", gotMap)
				}
				return
			}
			if gotMap == nil {
				t.Fatalf("expected map, got nil")
			}
			gotJSON, _ := json.Marshal(gotMap)
			wantJSON, _ := json.Marshal(tc.ExpectedMap)
			if string(gotJSON) != string(wantJSON) {
				t.Errorf("map mismatch\n got: %s\nwant: %s", gotJSON, wantJSON)
			}
		})
	}
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	return string(b)
}
