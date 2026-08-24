package diagnostics

import "testing"

func site(file string, line, col int) Site {
	return Site{FilePath: file, StartLine: line, StartCol: col}
}

func diag(code string, where Site, args ...string) Diagnostic {
	return Diagnostic{Code: code, Family: FamilyRunType, Severity: SeverityWarning, Args: args, Site: where}
}

// The bug this exists for: several cache families walk the same type, each
// emits against every provenance site, so one class touched by two families
// reports twice at both of its call sites.
func TestDedupe_CollapsesPerFamilyRepeats(t *testing.T) {
	encoderSite := site("cls.ts", 3, 45)
	decoderSite := site("cls.ts", 4, 45)
	list := []Diagnostic{
		diag(CodeCLSStructuralFallback, encoderSite, "Pet"),
		diag(CodeCLSStructuralFallback, decoderSite, "Pet"),
		diag(CodeCLSStructuralFallback, encoderSite, "Pet"),
		diag(CodeCLSStructuralFallback, decoderSite, "Pet"),
	}
	got := Dedupe(list)
	if len(got) != 2 {
		t.Fatalf("expected one diagnostic per call site, got %d: %+v", len(got), got)
	}
	if got[0].Site != encoderSite || got[1].Site != decoderSite {
		t.Fatalf("expected first-wins order (encoder then decoder), got %+v", got)
	}
}

// The negative case that keeps Dedupe honest: same code, same position,
// DIFFERENT args says two different things (two offending members), so both
// must survive — collapsing them would swallow a real second finding.
func TestDedupe_KeepsSameSiteDifferentArgs(t *testing.T) {
	where := site("members.ts", 10, 4)
	list := []Diagnostic{
		diag(CodeCLSStructuralFallback, where, "Pet"),
		diag(CodeCLSStructuralFallback, where, "Owner"),
	}
	if got := Dedupe(list); len(got) != 2 {
		t.Fatalf("expected both arg variants to survive, got %d: %+v", len(got), got)
	}
}

// Neither may a differing code, severity, family or related list collapse.
func TestDedupe_KeepsDistinctIdentities(t *testing.T) {
	where := site("x.ts", 1, 1)
	related := Related{Site: site("first.ts", 2, 2), Message: "first registered here"}
	base := diag(CodeCLSStructuralFallback, where, "Pet")

	otherCode := base
	otherCode.Code = CodeFMTInvalidParams
	otherSeverity := base
	otherSeverity.Severity = SeverityError
	otherFamily := base
	otherFamily.Family = FamilyMarker
	withRelated := base
	withRelated.Related = []Related{related}

	list := []Diagnostic{base, otherCode, otherSeverity, otherFamily, withRelated}
	if got := Dedupe(list); len(got) != len(list) {
		t.Fatalf("expected every distinct identity to survive, got %d of %d: %+v", len(got), len(list), got)
	}
}

// An empty or single-entry list is returned untouched (the common case —
// no allocation, no copy).
func TestDedupe_ShortInputUntouched(t *testing.T) {
	if got := Dedupe(nil); got != nil {
		t.Fatalf("expected nil to pass through, got %+v", got)
	}
	one := []Diagnostic{diag(CodeCLSStructuralFallback, site("a.ts", 1, 1), "Pet")}
	if got := Dedupe(one); len(got) != 1 {
		t.Fatalf("expected the single entry to pass through, got %+v", got)
	}
}

// Distinct positions must not collide through the packed int encoding — a
// line/col swap is the shape a naive concatenation would fold together.
func TestDedupe_KeepsTransposedPositions(t *testing.T) {
	list := []Diagnostic{
		diag(CodeCLSStructuralFallback, site("a.ts", 1, 23), "Pet"),
		diag(CodeCLSStructuralFallback, site("a.ts", 23, 1), "Pet"),
	}
	if got := Dedupe(list); len(got) != 2 {
		t.Fatalf("expected transposed line/col to stay distinct, got %d: %+v", len(got), got)
	}
}
