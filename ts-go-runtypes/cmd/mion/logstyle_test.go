package main

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
)

// TestResolveLogStyle_FlagWinsOverTsconfig: the flag overrides the tsconfig key, and neither set groups.
func TestResolveLogStyle_FlagWinsOverTsconfig(t *testing.T) {
	for _, testCase := range []struct {
		flag, tsconfig string
		grouped        bool
	}{
		{"", "", true},
		{"", "lines", false},
		{"grouped", "lines", true},
		{"lines", "grouped", false},
	} {
		cfg := sessionConfig{opts: resolver.Options{TsconfigLogStyle: testCase.tsconfig}}
		if got := resolveLogStyle("compile", testCase.flag, cfg); got != testCase.grouped {
			t.Errorf("flag %q, tsconfig %q: grouped = %v, want %v", testCase.flag, testCase.tsconfig, got, testCase.grouped)
		}
	}
}
