package program

import (
	"path/filepath"
	"testing"
)

// TestCommonDir pins the common-ancestor math the srcDir inference rides on.
func TestCommonDir(t *testing.T) {
	cases := []struct {
		name  string
		paths []string
		want  string
	}{
		{"single file", []string{"/p/src/a.ts"}, "/p/src"},
		{"same dir", []string{"/p/src/a.ts", "/p/src/b.ts"}, "/p/src"},
		{"nested", []string{"/p/src/a.ts", "/p/src/sub/b.ts"}, "/p/src"},
		{"split src+test", []string{"/p/src/a.ts", "/p/test/b.ts"}, "/p"},
		{"no shared root beyond fs root", []string{"/a/x.ts", "/b/y.ts"}, ""},
		{"empty", nil, ""},
	}
	for _, tc := range cases {
		if got := commonDir(tc.paths); got != tc.want {
			t.Errorf("%s: commonDir(%v) = %q, want %q", tc.name, tc.paths, got, tc.want)
		}
	}
}

// TestIsWithin: a rootDir at or below cwd is honored, one above (the tsconfig.test.json `../..` case) is rejected.
func TestIsWithin(t *testing.T) {
	cases := []struct {
		base, target string
		want         bool
	}{
		{"/p", "/p", true},
		{"/p", "/p/src", true},
		{"/p/", "/p/src", true},
		{"/p", "/p/src/deep", true},
		{"/p/pkg", "/p", false},   // rootDir above cwd (../..)
		{"/p", "/other", false},   // sibling
		{"/p", "/p-extra", false}, // prefix-but-not-child
		{"", "/p", false},
	}
	for _, tc := range cases {
		if got := isWithin(tc.base, tc.target); got != tc.want {
			t.Errorf("isWithin(%q, %q) = %v, want %v", tc.base, tc.target, got, tc.want)
		}
	}
}

// TestInferSrcDir pins the preference order both the resolver and the enrich CLI read the default genDir from.
func TestInferSrcDir(t *testing.T) {
	cases := []struct {
		name, rootDir, baseUrl string
		files                  []string
		want                   string
	}{
		{"rootDir under cwd wins", "lib", "", []string{"/p/src/a.ts"}, "/p/lib"},
		{"rootDir above cwd falls to common dir", "..", "", []string{"/p/src/a.ts"}, "/p/src"},
		{"no rootDir uses the common source folder", "", "", []string{"/p/src/a.ts", "/p/src/sub/b.ts"}, "/p/src"},
		{"node_modules files do not widen it", "", "", []string{"/p/src/a.ts", "/p/node_modules/x/index.d.ts"}, "/p/src"},
		{"baseUrl when files share no root", "", "base", nil, "/p/base"},
		{"cwd as the last resort", "", "", nil, "/p"},
	}
	for _, tc := range cases {
		if got := InferSrcDir("/p", tc.rootDir, tc.baseUrl, tc.files); filepath.ToSlash(got) != tc.want {
			t.Errorf("%s: InferSrcDir = %q, want %q", tc.name, got, tc.want)
		}
	}
	var nilConfig *InferredConfig
	if got := nilConfig.SrcDir("/p"); got != "/p" {
		t.Errorf("nil config SrcDir = %q, want the cwd", got)
	}
}
