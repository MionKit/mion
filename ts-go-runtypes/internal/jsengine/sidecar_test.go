//go:build !js

package jsengine

import (
	"os/exec"
	"slices"
	"strings"
	"testing"
	"time"
)

// newTestEngine returns a sidecar engine on the host's real node,
// skipping when none is installed (the repo's dev/CI hosts always have
// one — the skip is for exotic environments only).
func newTestEngine(t *testing.T) *sidecarEngine {
	t.Helper()
	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("no node in PATH")
	}
	return NewSidecar("").(*sidecarEngine)
}

func TestSidecar_OffendersRoundTrip(t *testing.T) {
	engine := newTestEngine(t)
	result, err := engine.TestPattern("^[a-z-]+$", "", []string{"my-slug", "NOPE", "ok"})
	if err != nil {
		t.Fatalf("TestPattern: %v", err)
	}
	if result.CompileError != "" {
		t.Fatalf("unexpected compile error: %q", result.CompileError)
	}
	if len(result.Offenders) != 1 || result.Offenders[0] != "NOPE" {
		t.Fatalf("expected offenders [NOPE], got %v", result.Offenders)
	}
}

// TestSidecar_LookbehindValidates pins the headline capability: JS-only
// regex syntax RE2 cannot compile is now really validated.
func TestSidecar_LookbehindValidates(t *testing.T) {
	engine := newTestEngine(t)
	good, err := engine.TestPattern("(?<=x)y", "", []string{"xy"})
	if err != nil || good.CompileError != "" || len(good.Offenders) != 0 {
		t.Fatalf("lookbehind with matching sample: result=%+v err=%v", good, err)
	}
	bad, err := engine.TestPattern("(?<=x)y", "", []string{"zz"})
	if err != nil || len(bad.Offenders) != 1 {
		t.Fatalf("lookbehind with mismatching sample: result=%+v err=%v", bad, err)
	}
}

func TestSidecar_InvalidSyntaxCompileError(t *testing.T) {
	engine := newTestEngine(t)
	result, err := engine.TestPattern("^[a-z+$", "", []string{"a"})
	if err != nil {
		t.Fatalf("TestPattern: %v", err)
	}
	if result.CompileError == "" {
		t.Fatal("expected a CompileError for invalid regex syntax")
	}
}

func TestSidecar_EmptySamplesIsCompileCheck(t *testing.T) {
	engine := newTestEngine(t)
	ok, err := engine.TestPattern("^a$", "", nil)
	if err != nil || ok.CompileError != "" {
		t.Fatalf("valid pattern, no samples: result=%+v err=%v", ok, err)
	}
	broken, err := engine.TestPattern("(unclosed", "", nil)
	if err != nil || broken.CompileError == "" {
		t.Fatalf("broken pattern, no samples: result=%+v err=%v", broken, err)
	}
}

// TestSidecar_JSAuthority pins the divergence classes where JS regex
// semantics disagree with RE2 on patterns BOTH can compile — the reason
// the engine, not RE2, is the validation authority:
//   - without the u flag, JS matches UTF-16 code units, so `^.$` rejects
//     an astral emoji (RE2 matches whole runes and would accept it);
//   - JS `\s` includes U+FEFF (RE2's would reject it).
func TestSidecar_JSAuthority(t *testing.T) {
	engine := newTestEngine(t)
	dot, err := engine.TestPattern("^.$", "", []string{"😀"})
	if err != nil {
		t.Fatalf("TestPattern: %v", err)
	}
	if len(dot.Offenders) != 1 {
		t.Fatalf("`^.$` vs astral emoji: JS (code units) must reject it, got offenders %v", dot.Offenders)
	}
	space, err := engine.TestPattern("^\\s$", "", []string{"\uFEFF"})
	if err != nil {
		t.Fatalf("TestPattern: %v", err)
	}
	if len(space.Offenders) != 0 {
		t.Fatalf("`^\\s$` vs U+FEFF: JS accepts it, got offenders %v", space.Offenders)
	}
}

func TestSidecar_MemoizesVerdicts(t *testing.T) {
	engine := newTestEngine(t)
	for range 3 {
		if _, err := engine.TestPattern("^a+$", "", []string{"aaa"}); err != nil {
			t.Fatalf("TestPattern: %v", err)
		}
	}
	if _, err := engine.TestPattern("^a+$", "i", []string{"aaa"}); err != nil {
		t.Fatalf("TestPattern: %v", err)
	}
	engine.mu.Lock()
	defer engine.mu.Unlock()
	if len(engine.memo) != 2 {
		t.Fatalf("expected 2 memo entries (flags are key-relevant), got %d", len(engine.memo))
	}
	if engine.nextID != 2 {
		t.Fatalf("expected exactly 2 sidecar round-trips, got %d", engine.nextID)
	}
}

// seedKey returns a pinned SeedKey pointer for request literals.
func seedKey(value uint32) *uint32 { return &value }

// TestSidecar_GenerateRoundTrip uses the validate op as the oracle:
// every generated value, fed back as a sample, must produce zero
// offenders.
func TestSidecar_GenerateRoundTrip(t *testing.T) {
	engine := newTestEngine(t)
	result, err := engine.GeneratePattern(GenerateRequest{Source: "^[a-z]{3}-[0-9]{2}$", Count: 8, Retries: 10})
	if err != nil {
		t.Fatalf("GeneratePattern: %v", err)
	}
	if result.CompileError != "" || result.GenerateError != "" {
		t.Fatalf("unexpected errors in result: %+v", result)
	}
	if len(result.Values) != 8 {
		t.Fatalf("expected 8 values, got %d: %v", len(result.Values), result.Values)
	}
	verdict, err := engine.TestPattern("^[a-z]{3}-[0-9]{2}$", "", result.Values)
	if err != nil {
		t.Fatalf("TestPattern oracle: %v", err)
	}
	if len(verdict.Offenders) != 0 {
		t.Fatalf("generated values must all match their own pattern, offenders: %v", verdict.Offenders)
	}
}

// TestSidecar_GenerateSeededDeterministic runs two INDEPENDENT engines
// (two child processes, no shared memo, different random session keys)
// with the SAME pinned SeedKey: the lists must be identical — the
// mock.seed reproducibility lane.
func TestSidecar_GenerateSeededDeterministic(t *testing.T) {
	first := newTestEngine(t)
	second := newTestEngine(t)
	request := GenerateRequest{Source: "^[a-f0-9]{8}$", Count: 6, Retries: 10, SeedKey: seedKey(1234)}
	a, err := first.GeneratePattern(request)
	if err != nil {
		t.Fatalf("GeneratePattern (first engine): %v", err)
	}
	b, err := second.GeneratePattern(request)
	if err != nil {
		t.Fatalf("GeneratePattern (second engine): %v", err)
	}
	if !slices.Equal(a.Values, b.Values) {
		t.Fatalf("same SeedKey must generate identical pools:\n first: %v\nsecond: %v", a.Values, b.Values)
	}
	if len(a.Values) == 0 {
		t.Fatal("expected at least one generated value")
	}
}

// TestSidecar_GenerateUnpinnedVariesPerEngine — no SeedKey means the
// engine's own random session key: two engines (two "builds") draw
// DIFFERENT pools, while one engine stays stable across repeat asks
// (memo + fixed session key — the within-session guarantee watch mode
// relies on). The 2^-32 chance of two equal session keys is accepted.
func TestSidecar_GenerateUnpinnedVariesPerEngine(t *testing.T) {
	first := newTestEngine(t)
	second := newTestEngine(t)
	request := GenerateRequest{Source: "^[a-f0-9]{12}$", Count: 6, Retries: 10}
	a, err := first.GeneratePattern(request)
	if err != nil {
		t.Fatalf("GeneratePattern (first engine): %v", err)
	}
	again, err := first.GeneratePattern(request)
	if err != nil {
		t.Fatalf("GeneratePattern (first engine, repeat): %v", err)
	}
	if !slices.Equal(a.Values, again.Values) {
		t.Fatalf("one session must stay stable:\n first: %v\nrepeat: %v", a.Values, again.Values)
	}
	b, err := second.GeneratePattern(request)
	if err != nil {
		t.Fatalf("GeneratePattern (second engine): %v", err)
	}
	if slices.Equal(a.Values, b.Values) {
		t.Fatalf("unpinned pools must differ across engines (fresh builds), both: %v", a.Values)
	}
}

func TestSidecar_GenerateMemoized(t *testing.T) {
	engine := newTestEngine(t)
	for range 3 {
		if _, err := engine.GeneratePattern(GenerateRequest{Source: "^x{2}$", Count: 4, Retries: 10}); err != nil {
			t.Fatalf("GeneratePattern: %v", err)
		}
	}
	if _, err := engine.GeneratePattern(GenerateRequest{Source: "^x{2}$", Count: 5, Retries: 10}); err != nil {
		t.Fatalf("GeneratePattern: %v", err)
	}
	engine.mu.Lock()
	defer engine.mu.Unlock()
	if len(engine.memo) != 2 {
		t.Fatalf("expected 2 memo entries (count is key-relevant), got %d", len(engine.memo))
	}
	if engine.nextID != 2 {
		t.Fatalf("expected exactly 2 sidecar round-trips, got %d", engine.nextID)
	}
}

// TestSidecar_GenerateUnsupportedConstruct pins the FMT005 lane: the
// pattern compiles under new RegExp but randexp throws on it.
func TestSidecar_GenerateUnsupportedConstruct(t *testing.T) {
	engine := newTestEngine(t)
	result, err := engine.GeneratePattern(GenerateRequest{Source: "(?<=x)y", Count: 5, Retries: 10})
	if err != nil {
		t.Fatalf("GeneratePattern: %v", err)
	}
	if result.CompileError != "" {
		t.Fatalf("lookbehind compiles in JS, unexpected CompileError: %q", result.CompileError)
	}
	if result.GenerateError == "" {
		t.Fatal("expected a GenerateError for a construct randexp cannot handle")
	}
}

// TestSidecar_GenerateBudgetExhausted: a 1-char language with minLength 5
// filters every draw, so the whole count×retries budget (3×7=21) yields
// nothing.
func TestSidecar_GenerateBudgetExhausted(t *testing.T) {
	engine := newTestEngine(t)
	result, err := engine.GeneratePattern(GenerateRequest{Source: "^a$", Count: 3, Retries: 7, MinLength: 5})
	if err != nil {
		t.Fatalf("GeneratePattern: %v", err)
	}
	if !strings.Contains(result.GenerateError, "21 attempts") {
		t.Fatalf("expected the exhausted 21-attempt budget in the error, got %q", result.GenerateError)
	}
	if len(result.Values) != 0 {
		t.Fatalf("expected no values, got %v", result.Values)
	}
}

func TestSidecar_GenerateCompileError(t *testing.T) {
	engine := newTestEngine(t)
	result, err := engine.GeneratePattern(GenerateRequest{Source: "^[a-z+$", Count: 3, Retries: 10})
	if err != nil {
		t.Fatalf("GeneratePattern: %v", err)
	}
	if result.CompileError == "" || result.GenerateError != "" {
		t.Fatalf("invalid syntax must be a CompileError (FMT002 lane), got %+v", result)
	}
}

func TestSidecar_GenerateRespectsBounds(t *testing.T) {
	engine := newTestEngine(t)
	result, err := engine.GeneratePattern(GenerateRequest{Source: "^x+$", Count: 3, Retries: 20, MinLength: 2, MaxLength: 4})
	if err != nil {
		t.Fatalf("GeneratePattern: %v", err)
	}
	if len(result.Values) == 0 {
		t.Fatalf("expected values within bounds, got none (%+v)", result)
	}
	for _, value := range result.Values {
		if len(value) < 2 || len(value) > 4 {
			t.Fatalf("value %q violates the [2,4] length bounds", value)
		}
	}
}

func TestResolveRuntime_Precedence(t *testing.T) {
	if got, err := resolveRuntime("/explicit/runtime"); err != nil || got != "/explicit/runtime" {
		t.Fatalf("explicit path must win verbatim, got %q err=%v", got, err)
	}
	t.Setenv(EnvRuntime, "/env/runtime")
	if got, err := resolveRuntime(""); err != nil || got != "/env/runtime" {
		t.Fatalf("env override must win over PATH probe, got %q err=%v", got, err)
	}
	t.Setenv(EnvRuntime, "")
	if _, err := exec.LookPath("node"); err == nil {
		if got, err := resolveRuntime(""); err != nil || !strings.Contains(got, "node") {
			t.Fatalf("PATH probe should find node, got %q err=%v", got, err)
		}
	}
}

// TestSidecar_SpawnFailureIsSticky pins the failure semantics: a broken
// runtime errors on first use and every later call fails fast without
// re-spawning.
func TestSidecar_SpawnFailureIsSticky(t *testing.T) {
	engine := NewSidecar("/nonexistent/definitely-not-a-js-runtime").(*sidecarEngine)
	if _, err := engine.TestPattern("^a$", "", nil); err == nil {
		t.Fatal("expected a spawn error")
	}
	if _, err := engine.TestPattern("^b$", "", nil); err == nil {
		t.Fatal("expected the sticky dead-engine error")
	}
	engine.mu.Lock()
	defer engine.mu.Unlock()
	if engine.dead == nil {
		t.Fatal("engine should be marked dead")
	}
}

// TestSidecar_MalformedOutputKillsEngine uses /bin/echo as the "runtime":
// it prints the bundle path (not JSON) and exits, so the response parse
// fails and the engine goes dead.
func TestSidecar_MalformedOutputKillsEngine(t *testing.T) {
	echo, err := exec.LookPath("echo")
	if err != nil {
		t.Skip("no echo in PATH")
	}
	engine := NewSidecar(echo).(*sidecarEngine)
	if _, err := engine.TestPattern("^a$", "", nil); err == nil {
		t.Fatal("expected a protocol error from non-JSON output")
	}
	if _, err := engine.TestPattern("^b$", "", nil); err == nil {
		t.Fatal("expected the sticky dead-engine error")
	}
}

// TestSidecar_TimeoutKillsEngine uses a runtime that never answers
// (sleep ignores stdin) under a shortened deadline.
func TestSidecar_TimeoutKillsEngine(t *testing.T) {
	sleep, err := exec.LookPath("sleep")
	if err != nil {
		t.Skip("no sleep in PATH")
	}
	engine := NewSidecar(sleep).(*sidecarEngine)
	engine.timeout = 200 * time.Millisecond
	start := time.Now()
	if _, err := engine.TestPattern("^a$", "", nil); err == nil {
		t.Fatal("expected a timeout error")
	}
	if elapsed := time.Since(start); elapsed > 3*time.Second {
		t.Fatalf("timeout took %v, deadline not applied", elapsed)
	}
	if _, err := engine.TestPattern("^b$", "", nil); err == nil {
		t.Fatal("expected the sticky dead-engine error")
	}
}
