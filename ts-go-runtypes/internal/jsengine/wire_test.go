package jsengine

import "testing"

// TestGenerateSeed_Pinned hardcodes the FNV-1a/32 derivation: any change
// to how the seed is computed silently regenerates every seeded pattern
// pool in every build, so it must fail loudly here and be a deliberate
// decision. (Unpinned pools mix a random session key, so only the pinned
// runKey lane needs byte-stability.)
func TestGenerateSeed_Pinned(t *testing.T) {
	if got := generateSeed(0, "^a$", "", 100); got != 2982888647 {
		t.Fatalf("seed(0, ^a$, '', 100) = %d, want 2982888647", got)
	}
	if got := generateSeed(42, "^a$", "", 100); got != 195833635 {
		t.Fatalf("seed(42, ^a$, '', 100) = %d, want 195833635", got)
	}
	base := generateSeed(0, "^a$", "", 100)
	if generateSeed(1, "^a$", "", 100) == base {
		t.Fatal("seed must depend on the run key")
	}
	if generateSeed(0, "^b$", "", 100) == base {
		t.Fatal("seed must depend on source")
	}
	if generateSeed(0, "^a$", "i", 100) == base {
		t.Fatal("seed must depend on flags")
	}
	if generateSeed(0, "^a$", "", 5) == base {
		t.Fatal("seed must depend on count")
	}
}

// TestSeedKeyFromStrings_Pinned pins the mock.seed basis mixing — the
// literal seeds written at createMockDataFn call sites must fold into the
// same run key forever, or every seeded pool silently changes.
func TestSeedKeyFromStrings_Pinned(t *testing.T) {
	if got := SeedKeyFromStrings([]string{"7"}); got != 3219528770 {
		t.Fatalf("SeedKeyFromStrings([7]) = %d, want 3219528770", got)
	}
	if SeedKeyFromStrings([]string{"7"}) == SeedKeyFromStrings([]string{"8"}) {
		t.Fatal("distinct seeds must mix to distinct keys")
	}
	if SeedKeyFromStrings([]string{"7", "8"}) == SeedKeyFromStrings([]string{"7"}) {
		t.Fatal("the basis must fold every seed in")
	}
}

func TestGenerateBudget_Clamps(t *testing.T) {
	if count, attempts := generateBudget(3, 7); count != 3 || attempts != 21 {
		t.Fatalf("budget(3,7) = (%d,%d), want (3,21)", count, attempts)
	}
	if count, attempts := generateBudget(0, 0); count != 1 || attempts != 1 {
		t.Fatalf("degenerate knobs must clamp to one draw for one sample, got (%d,%d)", count, attempts)
	}
}

// TestGenerateJob_Wire pins the one true generate wire job both
// transports send.
func TestGenerateJob_Wire(t *testing.T) {
	request := GenerateRequest{Source: "^a$", Flags: "", Count: 100, Retries: 10, MinLength: 2, MaxLength: 8}
	job := generateJobFor(request, 0)
	if job.Op != "generate" || job.Count != 100 || job.MaxAttempts != 1000 || job.Seed != 2982888647 {
		t.Fatalf("unexpected wire job: %+v", job)
	}
	if job.MinLength != 2 || job.MaxLength != 8 {
		t.Fatalf("length bounds must pass through, got %+v", job)
	}
}

// TestResolveRunKey — a pinned SeedKey wins; nil falls back to the
// engine's session key.
func TestResolveRunKey(t *testing.T) {
	pinned := uint32(42)
	if got := resolveRunKey(GenerateRequest{SeedKey: &pinned}, 7); got != 42 {
		t.Fatalf("pinned SeedKey must win, got %d", got)
	}
	if got := resolveRunKey(GenerateRequest{}, 7); got != 7 {
		t.Fatalf("nil SeedKey must use the session key, got %d", got)
	}
}
