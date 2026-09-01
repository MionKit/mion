package typefunctions

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// layoutCtx mirrors jsonCompatCtx (jsoncompat_test.go:12) — a hollow
// walker with just a RefTable so buildFlatLayout's ResolveRef calls
// succeed.
func layoutCtx(t *testing.T, runTypes []*reflection.RunType) *EmitContext {
	t.Helper()
	refTable := make(map[string]*reflection.RunType, len(runTypes))
	for _, rt := range runTypes {
		if rt == nil || rt.ID == "" {
			continue
		}
		refTable[rt.ID] = rt
	}
	return &EmitContext{walker: &Walker{RefTable: refTable}}
}

// TestBuildFlatLayout_AtomicOnly — `string | number | boolean` has no
// object members; AtomicNeedsTuple stays false because every member
// is JSON-natural.
func TestBuildFlatLayout_AtomicOnly(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	num := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	boolean := &reflection.RunType{ID: "bln", Kind: reflection.KindBoolean}
	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("str"), makeRef("num"), makeRef("bln")},
		SafeUnionChildren: []*reflection.RunType{makeRef("str"), makeRef("num"), makeRef("bln")},
	}
	ctx := layoutCtx(t, []*reflection.RunType{str, num, boolean, union})

	layout := buildFlatLayout(union, ctx)

	if len(layout.ObjectMembers) != 0 {
		t.Fatalf("expected 0 ObjectMembers, got %d", len(layout.ObjectMembers))
	}
	if len(layout.AtomicMembers) != 3 {
		t.Fatalf("expected 3 AtomicMembers, got %d", len(layout.AtomicMembers))
	}
	for i, m := range layout.AtomicMembers {
		if m.OriginalIndex != i {
			t.Errorf("AtomicMembers[%d].OriginalIndex = %d, want %d", i, m.OriginalIndex, i)
		}
	}
	if layout.AtomicNeedsTuple {
		t.Errorf("expected AtomicNeedsTuple=false for all-JSON-natural union, got true")
	}
	if len(layout.MergedProps) != 0 {
		t.Errorf("expected 0 MergedProps, got %d", len(layout.MergedProps))
	}
}

// TestBuildFlatLayout_MixedAtomicAndObject — `string | {a: number}`.
// One of each bucket. Both members are JSON-compatible so the union
// round-trips raw: AtomicNeedsTuple stays false (no envelope, identity
// decode) even though an object branch exists — the record-union
// optimisation. A non-JSON-compatible member (Date, bigint) would flip
// it back to true; see TestBuildFlatLayout_ClassWithSubKindFallsBackToAtomic.
func TestBuildFlatLayout_MixedAtomicAndObject(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	num := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	propA := &reflection.RunType{ID: "pa", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("num")}
	obj := &reflection.RunType{ID: "obj", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pa")}}
	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("str"), makeRef("obj")},
		SafeUnionChildren: []*reflection.RunType{makeRef("str"), makeRef("obj")},
	}
	ctx := layoutCtx(t, []*reflection.RunType{str, num, propA, obj, union})

	layout := buildFlatLayout(union, ctx)

	if len(layout.AtomicMembers) != 1 || layout.AtomicMembers[0].Resolved.ID != "str" {
		t.Fatalf("expected single AtomicMembers={str}, got %+v", layout.AtomicMembers)
	}
	if layout.AtomicMembers[0].OriginalIndex != 0 {
		t.Errorf("expected str at OriginalIndex 0, got %d", layout.AtomicMembers[0].OriginalIndex)
	}
	if len(layout.ObjectMembers) != 1 || layout.ObjectMembers[0].Resolved.ID != "obj" {
		t.Fatalf("expected single ObjectMembers={obj}, got %+v", layout.ObjectMembers)
	}
	if layout.AtomicNeedsTuple {
		t.Errorf("expected AtomicNeedsTuple=false (both members JSON-compatible ⇒ round-trips raw), got true")
	}
	if len(layout.MergedProps) != 1 || layout.MergedProps[0].Name != "a" {
		t.Fatalf("expected MergedProps=[{a}], got %+v", layout.MergedProps)
	}
}

// TestBuildFlatLayout_SharedShapeAllRequired —
// `{a: string, b: number} | {a: string, b: number}`. Degenerate
// shared-shape union: every merged prop appears in every member and
// no declaration is optional → Required=true on every prop. No
// candidate is bigint/Date so NeedsSubWrap stays false.
func TestBuildFlatLayout_SharedShapeAllRequired(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	num := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	paA := &reflection.RunType{ID: "paA", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("str")}
	pbA := &reflection.RunType{ID: "pbA", Kind: reflection.KindProperty, Name: "b", IsSafeName: true, Child: makeRef("num")}
	paB := &reflection.RunType{ID: "paB", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("str")}
	pbB := &reflection.RunType{ID: "pbB", Kind: reflection.KindProperty, Name: "b", IsSafeName: true, Child: makeRef("num")}
	objA := &reflection.RunType{ID: "obA", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("paA"), makeRef("pbA")}}
	objB := &reflection.RunType{ID: "obB", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("paB"), makeRef("pbB")}}
	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("obA"), makeRef("obB")},
		SafeUnionChildren: []*reflection.RunType{makeRef("obA"), makeRef("obB")},
	}
	ctx := layoutCtx(t, []*reflection.RunType{str, num, paA, pbA, paB, pbB, objA, objB, union})

	layout := buildFlatLayout(union, ctx)

	if len(layout.MergedProps) != 2 {
		t.Fatalf("expected 2 MergedProps, got %d", len(layout.MergedProps))
	}
	for _, mp := range layout.MergedProps {
		if !mp.Required {
			t.Errorf("merged prop %q: expected Required=true, got false", mp.Name)
		}
		if mp.NeedsSubWrap {
			t.Errorf("merged prop %q: expected NeedsSubWrap=false (single-candidate after dedupe), got true", mp.Name)
		}
		// child refs share the same ID across the two members → candidates dedupe to 1.
		if len(mp.Candidates) != 1 {
			t.Errorf("merged prop %q: expected 1 candidate after dedupe, got %d", mp.Name, len(mp.Candidates))
		}
	}
}

// TestBuildFlatLayout_MultiCandidateNeedsSubWrap —
// `{a: string} | {a: bigint}`. Merged prop `a` has two candidates
// (different child IDs); bigint isn't JSON-natural so NeedsSubWrap=true.
func TestBuildFlatLayout_MultiCandidateNeedsSubWrap(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	big := &reflection.RunType{ID: "big", Kind: reflection.KindBigInt}
	paStr := &reflection.RunType{ID: "paS", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("str")}
	paBig := &reflection.RunType{ID: "paB", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("big")}
	objS := &reflection.RunType{ID: "obS", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("paS")}}
	objB := &reflection.RunType{ID: "obB", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("paB")}}
	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("obS"), makeRef("obB")},
		SafeUnionChildren: []*reflection.RunType{makeRef("obS"), makeRef("obB")},
	}
	ctx := layoutCtx(t, []*reflection.RunType{str, big, paStr, paBig, objS, objB, union})

	layout := buildFlatLayout(union, ctx)

	if len(layout.MergedProps) != 1 {
		t.Fatalf("expected 1 MergedProp, got %d", len(layout.MergedProps))
	}
	mp := layout.MergedProps[0]
	if len(mp.Candidates) != 2 {
		t.Fatalf("expected 2 candidates (string + bigint), got %d", len(mp.Candidates))
	}
	if !mp.NeedsSubWrap {
		t.Errorf("expected NeedsSubWrap=true (bigint candidate), got false")
	}
	if !mp.Required {
		t.Errorf("expected Required=true (every member declares `a` non-optionally), got false")
	}
}

// TestBuildFlatLayout_SameTypeIDCandidatesDeduped —
// `{a: string} | {a: string}`. Both members carry the same canonical
// child ref → candidates collapse to 1.
func TestBuildFlatLayout_SameTypeIDCandidatesDeduped(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	pa1 := &reflection.RunType{ID: "pa1", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("str")}
	pa2 := &reflection.RunType{ID: "pa2", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("str")}
	objA := &reflection.RunType{ID: "obA", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pa1")}}
	objB := &reflection.RunType{ID: "obB", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pa2")}}
	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("obA"), makeRef("obB")},
		SafeUnionChildren: []*reflection.RunType{makeRef("obA"), makeRef("obB")},
	}
	ctx := layoutCtx(t, []*reflection.RunType{str, pa1, pa2, objA, objB, union})

	layout := buildFlatLayout(union, ctx)

	if len(layout.MergedProps) != 1 {
		t.Fatalf("expected 1 MergedProp, got %d", len(layout.MergedProps))
	}
	if len(layout.MergedProps[0].Candidates) != 1 {
		t.Errorf("expected 1 candidate (deduped by ChildRef.ID=str), got %d", len(layout.MergedProps[0].Candidates))
	}
}

// TestBuildFlatLayout_OptionalOnOneMember —
// `{a: string} | {a?: string}`. The optional declaration drives
// Required=false even though every member carries the prop.
func TestBuildFlatLayout_OptionalOnOneMember(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	paReq := &reflection.RunType{ID: "paR", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("str")}
	paOpt := &reflection.RunType{ID: "paO", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Optional: true, Child: makeRef("str")}
	objR := &reflection.RunType{ID: "obR", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("paR")}}
	objO := &reflection.RunType{ID: "obO", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("paO")}}
	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("obR"), makeRef("obO")},
		SafeUnionChildren: []*reflection.RunType{makeRef("obR"), makeRef("obO")},
	}
	ctx := layoutCtx(t, []*reflection.RunType{str, paReq, paOpt, objR, objO, union})

	layout := buildFlatLayout(union, ctx)

	if len(layout.MergedProps) != 1 {
		t.Fatalf("expected 1 MergedProp, got %d", len(layout.MergedProps))
	}
	if layout.MergedProps[0].Required {
		t.Errorf("expected Required=false (one member is optional), got true")
	}
}

// TestBuildFlatLayout_IndexSigFallsBackToAtomic —
// `{[k: string]: number} | {b: boolean}`. An indexed object can't be
// merged (its dynamic keys would collide with the merged-set
// discriminator) so it lands in AtomicMembers; the second object is
// the sole ObjectMember.
func TestBuildFlatLayout_IndexSigFallsBackToAtomic(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	num := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	boolean := &reflection.RunType{ID: "bln", Kind: reflection.KindBoolean}
	idxSig := &reflection.RunType{ID: "idx", Kind: reflection.KindIndexSignature, IndexT: makeRef("str"), Child: makeRef("num")}
	propB := &reflection.RunType{ID: "pb", Kind: reflection.KindProperty, Name: "b", IsSafeName: true, Child: makeRef("bln")}
	objIdx := &reflection.RunType{ID: "obI", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("idx")}}
	objB := &reflection.RunType{ID: "obB", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pb")}}
	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("obI"), makeRef("obB")},
		SafeUnionChildren: []*reflection.RunType{makeRef("obI"), makeRef("obB")},
	}
	ctx := layoutCtx(t, []*reflection.RunType{str, num, boolean, idxSig, propB, objIdx, objB, union})

	layout := buildFlatLayout(union, ctx)

	if len(layout.AtomicMembers) != 1 || layout.AtomicMembers[0].Resolved.ID != "obI" {
		t.Fatalf("expected indexed object in AtomicMembers, got %+v", layout.AtomicMembers)
	}
	if layout.AtomicMembers[0].OriginalIndex != 0 {
		t.Errorf("expected OriginalIndex=0 (preserves SafeUnionChildren position), got %d", layout.AtomicMembers[0].OriginalIndex)
	}
	if len(layout.ObjectMembers) != 1 || layout.ObjectMembers[0].Resolved.ID != "obB" {
		t.Fatalf("expected non-indexed object in ObjectMembers, got %+v", layout.ObjectMembers)
	}
	// Record member + plain object member, both JSON-compatible ⇒ the union
	// round-trips raw with no `[armIndex, value]` / `[-1, merged]` envelope.
	if layout.AtomicNeedsTuple {
		t.Errorf("expected AtomicNeedsTuple=false (record + object, both JSON-compatible), got true")
	}
}

// TestBuildFlatLayout_ClassWithSubKindFallsBackToAtomic — Date / Map /
// Set / etc carry a non-default SubKind and don't expose a stable
// per-name property surface, so they land in AtomicMembers.
func TestBuildFlatLayout_ClassWithSubKindFallsBackToAtomic(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	propB := &reflection.RunType{ID: "pb", Kind: reflection.KindProperty, Name: "b", IsSafeName: true, Child: makeRef("str")}
	date := &reflection.RunType{ID: "dat", Kind: reflection.KindClass, SubKind: reflection.SubKindDate}
	obj := &reflection.RunType{ID: "obj", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pb")}}
	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("dat"), makeRef("obj")},
		SafeUnionChildren: []*reflection.RunType{makeRef("dat"), makeRef("obj")},
	}
	ctx := layoutCtx(t, []*reflection.RunType{str, propB, date, obj, union})

	layout := buildFlatLayout(union, ctx)

	if len(layout.AtomicMembers) != 1 || layout.AtomicMembers[0].Resolved.ID != "dat" {
		t.Fatalf("expected Date in AtomicMembers, got %+v", layout.AtomicMembers)
	}
	if len(layout.ObjectMembers) != 1 || layout.ObjectMembers[0].Resolved.ID != "obj" {
		t.Fatalf("expected obj in ObjectMembers, got %+v", layout.ObjectMembers)
	}
	if !layout.AtomicNeedsTuple {
		t.Errorf("expected AtomicNeedsTuple=true (object branch present), got false")
	}
}

// TestBuildFlatLayout_MethodMemberMarksStrippedCandidate — the binary
// union arm-desync repro (`{kind:'t1', f0?: string} | {kind:'t2', f0: () =>
// number}`): a method-like MEMBER kind is a DataOnly-dropped slot exactly
// like a property whose value is function-typed, so a surviving same-name
// candidate from a sibling member must get the value guard
// (HasStrippedCandidate) — a value from the method member still carries the
// key holding a function, and the surviving serString codec must not run on
// it. Covers both spellings: the method-signature member AND the
// property-with-function-child twin.
func TestBuildFlatLayout_MethodMemberMarksStrippedCandidate(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	fn := &reflection.RunType{ID: "fn", Kind: reflection.KindFunction}
	f0Opt := &reflection.RunType{ID: "f0o", Kind: reflection.KindProperty, Name: "f0", IsSafeName: true, Optional: true, Child: makeRef("str")}
	f0Method := &reflection.RunType{ID: "f0m", Kind: reflection.KindMethodSignature, Name: "f0", IsSafeName: true}
	f1Opt := &reflection.RunType{ID: "f1o", Kind: reflection.KindProperty, Name: "f1", IsSafeName: true, Optional: true, Child: makeRef("str")}
	f1FnProp := &reflection.RunType{ID: "f1f", Kind: reflection.KindProperty, Name: "f1", IsSafeName: true, Child: makeRef("fn")}
	objA := &reflection.RunType{ID: "obA", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("f0o"), makeRef("f1o")}}
	objB := &reflection.RunType{ID: "obB", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("f0m"), makeRef("f1f")}}
	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("obA"), makeRef("obB")},
		SafeUnionChildren: []*reflection.RunType{makeRef("obA"), makeRef("obB")},
	}
	ctx := layoutCtx(t, []*reflection.RunType{str, fn, f0Opt, f0Method, f1Opt, f1FnProp, objA, objB, union})

	layout := buildFlatLayout(union, ctx)

	if len(layout.MergedProps) != 2 {
		t.Fatalf("expected 2 MergedProps (f0, f1), got %d", len(layout.MergedProps))
	}
	for _, mp := range layout.MergedProps {
		if len(mp.Candidates) != 1 {
			t.Errorf("MergedProps[%s]: expected the function candidate dropped (1 surviving), got %d", mp.Name, len(mp.Candidates))
		}
		if !mp.HasStrippedCandidate {
			t.Errorf("MergedProps[%s].HasStrippedCandidate = false, want true (sibling member declares it function-typed)", mp.Name)
		}
		if mp.Required {
			t.Errorf("MergedProps[%s].Required = true, want false (stripped sibling can omit it)", mp.Name)
		}
	}
}
