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
		if !set.Downgraded(errorDiag(CodeVLSymbolRoot)) {
			t.Fatal("the wildcard covers every RuntimeError code")
		}
		if set.Downgraded(errorDiag(CodeTypeIdCollision)) {
			t.Fatal("the wildcard never reaches a fatal Error: MKR014 emits no site, so not halting buys nothing")
		}
	}
}

// The wildcard spares every LevelError code, and the rule is now the LEVEL, not
// the pure-fn family: the fatal set spans four families, and pure-fn itself is
// mostly NOT fatal (a purity violation ships the compiled body, so it is a
// RuntimeError and a consumer may stand it down).
func TestResolveDowngrade_WildcardSparesFatal(t *testing.T) {
	set, _ := ResolveDowngrade([]string{DowngradeAll})
	for _, code := range []string{
		CodeDestructuredParam,       // purefn: no entry, no rewrite
		CodeMarkerFreeTypeParameter, // marker: no site, no injected id
		CodeBatchElementNotReadable, // batch: no batch id spliced
		CodeTsconfigLoadFailed,      // config: nothing runs at all
	} {
		if set.Downgraded(errorDiag(code)) {
			t.Errorf("%s produced no output, so the wildcard must not downgrade it", code)
		}
	}
	if !set.Downgraded(errorDiag(CodePurityThis)) {
		t.Fatal("a purity violation ships the compiled body, so it is downgradeable")
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

func TestResolveDowngrade_RejectsFatalCode(t *testing.T) {
	_, err := ResolveDowngrade([]string{CodeMarkerFreeTypeParameter})
	if err == nil {
		t.Fatal("a fatal Error cannot be downgraded, so listing one is an error")
	}
	if !strings.Contains(err.Error(), "cannot produce output") {
		t.Errorf("the message says why, got %q", err)
	}
	if _, err := ResolveDowngrade([]string{CodePurityThis}); err != nil {
		t.Fatalf("a RuntimeError code IS listable, pure-fn family included: %v", err)
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
		t.Fatal("only a RuntimeError is ever downgraded")
	}
}

// Suppressible follows the LEVEL. A RuntimeError may be silenced (the author can
// mean the broken type, e.g. a suite that checks what a throwing validator does);
// a fatal Error may not, because the call throws whether or not it is silenced.
func TestSuppressible(t *testing.T) {
	for code, want := range map[string]bool{
		CodeVLSymbolRoot:            true,  // alwaysThrow entry ships
		CodePurityThis:              true,  // the impure body ships compiled
		CodeMarkerUntrustedPackage:  true,  // accept-everything entry ships
		CodeTypeIdCollision:         false, // no site, no injected id
		CodeMarkerFreeTypeParameter: false, // same
		CodeDestructuredParam:       false, // no pure-fn entry, no rewrite
		CodeBatchElementNotReadable: false, // no batch id spliced
		CodeExpectErrorUnused:       false, // the check that keeps directives honest
		"VL2":                       false, // not a code at all
	} {
		if got := Suppressible(code); got != want {
			t.Errorf("Suppressible(%q) = %v, want %v", code, got, want)
		}
	}
}
