package diagnostics

import (
	"strings"
	"testing"
)

// errorDiag builds a diagnostic for a registered code at a throwaway site.
func errorDiag(code string) Diagnostic {
	return New(code, Site{FilePath: "a.ts", StartLine: 1, StartCol: 1})
}

func TestResolveDowngrade_Empty(t *testing.T) {
	set, err := ResolveDowngrade(nil)
	if err != nil {
		t.Fatalf("no value is the strict default, not an error: %v", err)
	}
	if !set.Empty() || set.All() {
		t.Fatal("an unset value downgrades nothing")
	}
	if set.Downgraded(errorDiag(CodeVLSymbolRoot)) {
		t.Fatal("nothing is downgraded by default")
	}
}

func TestResolveDowngrade_NamedCode(t *testing.T) {
	set, err := ResolveDowngrade([]string{CodeVLSymbolRoot})
	if err != nil {
		t.Fatalf("a real code is accepted: %v", err)
	}
	if !set.Downgraded(errorDiag(CodeVLSymbolRoot)) {
		t.Fatal("the named code is downgraded")
	}
	if set.Downgraded(errorDiag(CodeTypeIdCollision)) {
		t.Fatal("an unnamed Error code still fails the build, which is the point")
	}
}

func TestResolveDowngrade_Wildcard(t *testing.T) {
	for _, values := range [][]string{{DowngradeAll}, {"*"}} {
		set, err := ResolveDowngrade(values)
		if err != nil {
			t.Fatalf("%v: %v", values, err)
		}
		if !set.All() {
			t.Fatalf("%v is the wildcard", values)
		}
		if !set.Downgraded(errorDiag(CodeTypeIdCollision)) {
			t.Fatal("the wildcard covers every Error code")
		}
	}
}

// The wildcard reproduces the retired `failOnError: false` exactly, and that
// never stopped a pure-fn error halting either.
func TestResolveDowngrade_WildcardSparesPureFn(t *testing.T) {
	set, _ := ResolveDowngrade([]string{DowngradeAll})
	if set.Downgraded(errorDiag(CodePurityThis)) {
		t.Fatal("a pure-fn error means generation failed, so it is never downgraded")
	}
}

func TestResolveDowngrade_RejectsUnknownCode(t *testing.T) {
	_, err := ResolveDowngrade([]string{"VL2"})
	if err == nil {
		t.Fatal("a typo must be reported, not silently protect nothing")
	}
	if !strings.Contains(err.Error(), "VL2") {
		t.Errorf("the message names the offending code, got %q", err)
	}
}

func TestResolveDowngrade_RejectsPureFnCode(t *testing.T) {
	_, err := ResolveDowngrade([]string{CodePurityThis})
	if err == nil {
		t.Fatal("a pure-fn code cannot be downgraded, so listing one is an error")
	}
}

// A code's severity may soften between releases; a consumer's list entry going
// inert must never break their build.
func TestResolveDowngrade_WarningCodeIsInert(t *testing.T) {
	set, err := ResolveDowngrade([]string{CodeVLMethodDropped})
	if err != nil {
		t.Fatalf("a Warning code is accepted: %v", err)
	}
	if set.Downgraded(errorDiag(CodeVLMethodDropped)) {
		t.Fatal("only Error severity is ever downgraded")
	}
}

func TestSuppressible(t *testing.T) {
	for code, want := range map[string]bool{
		CodeVLSymbolRoot:      true,
		CodeTypeIdCollision:   true,
		CodePurityThis:        false, // pure-fn: generation failed
		CodeExpectErrorUnused: false, // the check that keeps directives honest
		"VL2":                 false, // not a code at all
	} {
		if got := Suppressible(code); got != want {
			t.Errorf("Suppressible(%q) = %v, want %v", code, got, want)
		}
	}
}
