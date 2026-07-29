package jsengine

import "testing"

// TestGenerateSeed_Pinned hardcodes the FNV-1a/32 derivation: any change
// to how the seed is computed silently regenerates every pattern's
// samples in every cache, so it must fail loudly here and be a deliberate
// decision.
func TestGenerateSeed_Pinned(t *testing.T) {
	if got := generateSeed("^a$", "", 100); got != 3699491935 {
		t.Fatalf("seed(^a$, '', 100) = %d, want 3699491935", got)
	}
	base := generateSeed("^a$", "", 100)
	if generateSeed("^b$", "", 100) == base {
		t.Fatal("seed must depend on source")
	}
	if generateSeed("^a$", "i", 100) == base {
		t.Fatal("seed must depend on flags")
	}
	if generateSeed("^a$", "", 5) == base {
		t.Fatal("seed must depend on count")
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
	job := generateJobFor("^a$", "", 100, 10, 2, 8)
	if job.Op != "generate" || job.Count != 100 || job.MaxAttempts != 1000 || job.Seed != 3699491935 {
		t.Fatalf("unexpected wire job: %+v", job)
	}
	if job.MinLength != 2 || job.MaxLength != 8 {
		t.Fatalf("length bounds must pass through, got %+v", job)
	}
}
