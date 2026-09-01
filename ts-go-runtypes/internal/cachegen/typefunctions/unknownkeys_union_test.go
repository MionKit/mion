package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// unionUnknownKeysCtx — shim EmitContext for direct helper tests.
// Mirrors layoutCtx in union_flat_layout_test.go.
func unionUnknownKeysCtx(t *testing.T, root *reflection.RunType, runTypes []*reflection.RunType) *EmitContext {
	t.Helper()
	refTable := make(map[string]*reflection.RunType, len(runTypes))
	for _, rt := range runTypes {
		if rt == nil || rt.ID == "" {
			continue
		}
		refTable[rt.ID] = rt
	}
	walker := &Walker{
		RefTable:         refTable,
		RTFnHash:         "test",
		localVarCounters: make(map[string]int),
		// CodeE shapes hoist their scan loop through createFnInContext,
		// which needs the emitter Args + a live ContextItems set.
		Emitter:      HasUnknownKeysEmitter{},
		ContextItems: newOrderedItems(),
	}
	// Seed the root frame the way a real compile does. The union arm is only
	// ever reached from inside compileNode(root), and the descent it now emits
	// calls CompileChild, which pushes onto this stack.
	walker.RootType = root
	walker.Stack = []StackItem{{Vλl: "v", RT: root}}
	return &EmitContext{walker: walker, Vλl: "v"}
}

// stripSnippet — the public stripUnknownKeys snippet for assertions.
var stripSnippet = func(_ *EmitContext, accessor, keyVar string) string {
	return "delete " + accessor + "[" + keyVar + "]"
}

// ukuSnippet — the wireFormat=true ukuWire snippet.
var ukuSnippet = func(_ *EmitContext, accessor, keyVar string) string {
	return accessor + "[" + keyVar + "] = undefined"
}

// hasSnippet — returns true on hit; helper wraps in IIFE returning false.
var hasSnippet = func(_ *EmitContext, _ string, _ string) string { return "return true" }

// TestUnionUnknownKeys_DisjointKeys — `{a: string} | {b: number}`.
// Allowlist `{a, b}`; the for-loop guard rejects anything else.
func TestUnionUnknownKeys_DisjointKeys(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	num := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	pa := &reflection.RunType{ID: "pa", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("str")}
	pb := &reflection.RunType{ID: "pb", Kind: reflection.KindProperty, Name: "b", IsSafeName: true, Child: makeRef("num")}
	obA := &reflection.RunType{ID: "obA", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pa")}}
	obB := &reflection.RunType{ID: "obB", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pb")}}
	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("obA"), makeRef("obB")},
		SafeUnionChildren: []*reflection.RunType{makeRef("obA"), makeRef("obB")},
	}
	ctx := unionUnknownKeysCtx(t, union, []*reflection.RunType{str, num, pa, pb, obA, obB, union})

	// strip
	out := emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: stripSnippet, CodeShape: CodeS})
	if !strings.Contains(out.Code, "=== 'a'") || !strings.Contains(out.Code, "=== 'b'") {
		t.Errorf("strip allowlist missing 'a' or 'b' check: %s", out.Code)
	}
	if !strings.Contains(out.Code, "delete v[") {
		t.Errorf("strip snippet not emitted: %s", out.Code)
	}
	if out.Type != CodeS {
		t.Errorf("strip CodeShape = %v, want CodeS", out.Type)
	}

	// hasUnknownKeys
	ctx = unionUnknownKeysCtx(t, union, []*reflection.RunType{str, num, pa, pb, obA, obB, union})
	out = emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: hasSnippet, CodeShape: CodeE})
	if !strings.HasPrefix(out.Code, "ctxFn0(") {
		t.Errorf("has emit should call the hoisted context fn: %s", out.Code)
	}
	lines := ctx.walker.ContextLines()
	if !strings.Contains(lines, "return true") || !strings.Contains(lines, "return false") {
		t.Errorf("has ctxFn missing true/false returns: %s", lines)
	}
	if out.Type != CodeE {
		t.Errorf("has CodeShape = %v, want CodeE", out.Type)
	}
}

// TestUnionUnknownKeys_OverlappingKeys — `{a: string, b: number} |
// {a: bigint, c: boolean}`. Merged allowlist `{a, b, c}`.
func TestUnionUnknownKeys_OverlappingKeys(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	num := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	big := &reflection.RunType{ID: "big", Kind: reflection.KindBigInt}
	boolean := &reflection.RunType{ID: "bln", Kind: reflection.KindBoolean}
	paA := &reflection.RunType{ID: "paA", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("str")}
	pbA := &reflection.RunType{ID: "pbA", Kind: reflection.KindProperty, Name: "b", IsSafeName: true, Child: makeRef("num")}
	paB := &reflection.RunType{ID: "paB", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("big")}
	pcB := &reflection.RunType{ID: "pcB", Kind: reflection.KindProperty, Name: "c", IsSafeName: true, Child: makeRef("bln")}
	obA := &reflection.RunType{ID: "obA", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("paA"), makeRef("pbA")}}
	obB := &reflection.RunType{ID: "obB", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("paB"), makeRef("pcB")}}
	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("obA"), makeRef("obB")},
		SafeUnionChildren: []*reflection.RunType{makeRef("obA"), makeRef("obB")},
	}
	ctx := unionUnknownKeysCtx(t, union, []*reflection.RunType{str, num, big, boolean, paA, pbA, paB, pcB, obA, obB, union})

	out := emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: stripSnippet, CodeShape: CodeS})
	for _, name := range []string{"'a'", "'b'", "'c'"} {
		if !strings.Contains(out.Code, name) {
			t.Errorf("merged allowlist missing %s: %s", name, out.Code)
		}
	}
}

// TestUnionUnknownKeys_MixedAtomicAndObject — `string | {a: number}`.
// Allowlist `{a}`; the atomic branch contributes no keys.
func TestUnionUnknownKeys_MixedAtomicAndObject(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	num := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	pa := &reflection.RunType{ID: "pa", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("num")}
	obj := &reflection.RunType{ID: "obj", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pa")}}
	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("str"), makeRef("obj")},
		SafeUnionChildren: []*reflection.RunType{makeRef("str"), makeRef("obj")},
	}
	ctx := unionUnknownKeysCtx(t, union, []*reflection.RunType{str, num, pa, obj, union})

	out := emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: stripSnippet, CodeShape: CodeS})
	if !strings.Contains(out.Code, "=== 'a'") {
		t.Errorf("allowlist missing 'a': %s", out.Code)
	}
}

// TestUnionUnknownKeys_IndexSigCarveOut — `{[k: string]: number} |
// {b: boolean}`. Index-sig member → emit is a no-op for the whole union.
func TestUnionUnknownKeys_IndexSigCarveOut(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	num := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	boolean := &reflection.RunType{ID: "bln", Kind: reflection.KindBoolean}
	idxSig := &reflection.RunType{ID: "idx", Kind: reflection.KindIndexSignature, IndexT: makeRef("str"), Child: makeRef("num")}
	pb := &reflection.RunType{ID: "pb", Kind: reflection.KindProperty, Name: "b", IsSafeName: true, Child: makeRef("bln")}
	objIdx := &reflection.RunType{ID: "obI", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("idx")}}
	objB := &reflection.RunType{ID: "obB", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pb")}}
	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("obI"), makeRef("obB")},
		SafeUnionChildren: []*reflection.RunType{makeRef("obI"), makeRef("obB")},
	}
	ctx := unionUnknownKeysCtx(t, union, []*reflection.RunType{str, num, boolean, idxSig, pb, objIdx, objB, union})

	out := emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: stripSnippet, CodeShape: CodeS})
	if out.Code != "" {
		t.Errorf("index-sig carve-out expected empty emit, got: %s", out.Code)
	}
}

// TestUnionUnknownKeys_AtomicOnlyUnion — `string | number | boolean`.
// No object members → emit is empty (atomics have no keys).
func TestUnionUnknownKeys_AtomicOnlyUnion(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	num := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	boolean := &reflection.RunType{ID: "bln", Kind: reflection.KindBoolean}
	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("str"), makeRef("num"), makeRef("bln")},
		SafeUnionChildren: []*reflection.RunType{makeRef("str"), makeRef("num"), makeRef("bln")},
	}
	ctx := unionUnknownKeysCtx(t, union, []*reflection.RunType{str, num, boolean, union})

	out := emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: stripSnippet, CodeShape: CodeS})
	if out.Code != "" {
		t.Errorf("atomic-only union expected empty emit, got: %s", out.Code)
	}
}

// TestUnionUnknownKeys_WireFormatObjectBranch — ukuWire codegen on an
// ENVELOPING union `{a: string} | {b: bigint}` (the bigint member is
// non-JSON-compatible, so the encoder wraps as `[-1, merged]`) MUST
// contain the wrapper-peel and reach into v[1]. A round-trips-raw union
// carries no envelope and is covered by
// TestUnionUnknownKeys_WireFormatRoundTripsRawStripsBareV.
func TestUnionUnknownKeys_WireFormatObjectBranch(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	big := &reflection.RunType{ID: "big", Kind: reflection.KindBigInt}
	pa := &reflection.RunType{ID: "pa", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("str")}
	pb := &reflection.RunType{ID: "pb", Kind: reflection.KindProperty, Name: "b", IsSafeName: true, Child: makeRef("big")}
	obA := &reflection.RunType{ID: "obA", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pa")}}
	obB := &reflection.RunType{ID: "obB", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pb")}}
	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("obA"), makeRef("obB")},
		SafeUnionChildren: []*reflection.RunType{makeRef("obA"), makeRef("obB")},
	}
	ctx := unionUnknownKeysCtx(t, union, []*reflection.RunType{str, big, pa, pb, obA, obB, union})

	out := emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: ukuSnippet, CodeShape: CodeS, JsonWireFormat: true})
	if !strings.Contains(out.Code, "Array.isArray(v)") {
		t.Errorf("wire-format emit missing Array.isArray gate: %s", out.Code)
	}
	if !strings.Contains(out.Code, "v[0] === -1") {
		t.Errorf("wire-format emit missing object-branch discriminator: %s", out.Code)
	}
	if !strings.Contains(out.Code, "in v[1]") {
		t.Errorf("wire-format emit must walk v[1], got: %s", out.Code)
	}
	if !strings.Contains(out.Code, "v[1][") {
		t.Errorf("wire-format emit must assign into v[1][k], got: %s", out.Code)
	}
}

// TestUnionUnknownKeys_WireFormatRoundTripsRawStripsBareV — ukuWire on a
// round-trips-raw pure-object union `{a: string} | {b: number}` carries NO
// `[-1, merged]` envelope (every member is JSON-compatible), so the encoder
// emits the bare object. ukuWire must therefore strip `v` DIRECTLY — gated on
// a plain-object check, no wrapper-peel, no v[1] reach-in — so the decoder-
// safety strip still fires on the bare wire.
func TestUnionUnknownKeys_WireFormatRoundTripsRawStripsBareV(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	num := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	pa := &reflection.RunType{ID: "pa", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("str")}
	pb := &reflection.RunType{ID: "pb", Kind: reflection.KindProperty, Name: "b", IsSafeName: true, Child: makeRef("num")}
	obA := &reflection.RunType{ID: "obA", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pa")}}
	obB := &reflection.RunType{ID: "obB", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pb")}}
	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("obA"), makeRef("obB")},
		SafeUnionChildren: []*reflection.RunType{makeRef("obA"), makeRef("obB")},
	}
	ctx := unionUnknownKeysCtx(t, union, []*reflection.RunType{str, num, pa, pb, obA, obB, union})

	out := emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: ukuSnippet, CodeShape: CodeS, JsonWireFormat: true})
	if strings.Contains(out.Code, "v[0] === -1") || strings.Contains(out.Code, "v[1]") {
		t.Errorf("round-trips-raw ukuWire must NOT reach into the envelope, got: %s", out.Code)
	}
	if !strings.Contains(out.Code, "typeof v === 'object'") || !strings.Contains(out.Code, "!Array.isArray(v)") {
		t.Errorf("round-trips-raw ukuWire must gate the bare-object strip, got: %s", out.Code)
	}
	if !strings.Contains(out.Code, "=== 'a'") || !strings.Contains(out.Code, "=== 'b'") {
		t.Errorf("round-trips-raw ukuWire must keep the merged allowlist, got: %s", out.Code)
	}
}

// TestUnionUnknownKeys_NonWireGatesOnPlainObject — `string[] | {a: string}`.
// The non-wire emit MUST gate the merged-allowlist loop on a plain-object
// runtime check. Without it, runtime values that match the array atomic
// member would have their indices clobbered by the merged-allowlist
// strip/uku snippet (and primitive-string members would throw on assign).
// Pins the fix for the stripMutate/Unions failures (uku ran ungated on
// the raw runtime value).
func TestUnionUnknownKeys_NonWireGatesOnPlainObject(t *testing.T) {
	// bigint prop ⇒ the object member is non-JSON-compatible ⇒ the union
	// envelopes, so the JsonWireFormat sub-assertion below still sees the
	// `[-1, merged]` wrapper gate. The non-wire strip/has assertions hold
	// regardless of compatibility.
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	big := &reflection.RunType{ID: "big", Kind: reflection.KindBigInt}
	arr := &reflection.RunType{ID: "arr", Kind: reflection.KindArray, Child: makeRef("str")}
	pa := &reflection.RunType{ID: "pa", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("big")}
	obj := &reflection.RunType{ID: "obj", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pa")}}
	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("arr"), makeRef("obj")},
		SafeUnionChildren: []*reflection.RunType{makeRef("arr"), makeRef("obj")},
	}
	ctx := unionUnknownKeysCtx(t, union, []*reflection.RunType{str, big, arr, pa, obj, union})

	// strip / uku-style (CodeS)
	out := emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: ukuSnippet, CodeShape: CodeS})
	if !strings.Contains(out.Code, "typeof v === 'object'") {
		t.Errorf("strip emit missing plain-object gate: %s", out.Code)
	}
	if !strings.Contains(out.Code, "!Array.isArray(v)") {
		t.Errorf("strip emit missing !Array.isArray gate: %s", out.Code)
	}
	if !strings.Contains(out.Code, "v !== null") {
		t.Errorf("strip emit missing v !== null guard: %s", out.Code)
	}

	// hasUnknownKeys (CodeE) — IIFE must also gate on plain object.
	ctx = unionUnknownKeysCtx(t, union, []*reflection.RunType{str, big, arr, pa, obj, union})
	out = emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: hasSnippet, CodeShape: CodeE})
	hasLines := ctx.walker.ContextLines()
	if !strings.Contains(hasLines, "typeof v === 'object'") || !strings.Contains(hasLines, "!Array.isArray(v)") {
		t.Errorf("has ctxFn missing plain-object gate: %s", hasLines)
	}

	// JsonWireFormat path keeps its own wrapper gate and does NOT add
	// the plain-object gate (v[1] is already the inner merged object
	// post-wrapper-check).
	ctx = unionUnknownKeysCtx(t, union, []*reflection.RunType{str, big, arr, pa, obj, union})
	out = emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: ukuSnippet, CodeShape: CodeS, JsonWireFormat: true})
	if strings.Contains(out.Code, "typeof v === 'object'") {
		t.Errorf("wire-format path must not add plain-object gate (wrapper check already gates): %s", out.Code)
	}
	if !strings.Contains(out.Code, "v[0] === -1") {
		t.Errorf("wire-format path missing wrapper gate: %s", out.Code)
	}
}

// TestUnionUnknownKeys_OptionalDoesntChangeAllowlist —
// `{a?: string} | {b: number}`. The optional flag doesn't change the
// allowlist; still `{a, b}`.
func TestUnionUnknownKeys_OptionalDoesntChangeAllowlist(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	num := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	paOpt := &reflection.RunType{ID: "paO", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Optional: true, Child: makeRef("str")}
	pb := &reflection.RunType{ID: "pb", Kind: reflection.KindProperty, Name: "b", IsSafeName: true, Child: makeRef("num")}
	obA := &reflection.RunType{ID: "obA", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("paO")}}
	obB := &reflection.RunType{ID: "obB", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pb")}}
	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("obA"), makeRef("obB")},
		SafeUnionChildren: []*reflection.RunType{makeRef("obA"), makeRef("obB")},
	}
	ctx := unionUnknownKeysCtx(t, union, []*reflection.RunType{str, num, paOpt, pb, obA, obB, union})

	out := emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: stripSnippet, CodeShape: CodeS})
	for _, name := range []string{"'a'", "'b'"} {
		if !strings.Contains(out.Code, name) {
			t.Errorf("allowlist missing %s: %s", name, out.Code)
		}
	}
}

// TestUnionUnknownKeys_WireCodeEGateNestsScanCtxFn — the JsonWireFormat
// CodeE shape produces TWO chained context fns: the inner allowlist scan
// (ctxFn0) and the outer `[-1, merged]` wrapper gate (ctxFn1) that calls
// it. Declaration order must match allocation order (inner first) so the
// outer body's reference resolves.
func TestUnionUnknownKeys_WireCodeEGateNestsScanCtxFn(t *testing.T) {
	// bigint prop ⇒ non-JSON-compatible member ⇒ the union envelopes, so the
	// wire-format (`[-1, merged]`) CodeE path is exercised.
	big := &reflection.RunType{ID: "big", Kind: reflection.KindBigInt}
	pa := &reflection.RunType{ID: "pa", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("big")}
	obA := &reflection.RunType{ID: "obA", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pa")}}
	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("obA")},
		SafeUnionChildren: []*reflection.RunType{makeRef("obA")},
	}
	ctx := unionUnknownKeysCtx(t, union, []*reflection.RunType{big, pa, obA, union})
	out := emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: hasSnippet, CodeShape: CodeE, JsonWireFormat: true})
	if !strings.HasPrefix(out.Code, "ctxFn1(") {
		t.Errorf("wire CodeE emit should call the outer gate fn: %s", out.Code)
	}
	lines := ctx.walker.ContextLines()
	inner := strings.Index(lines, "const ctxFn0 = ")
	outer := strings.Index(lines, "const ctxFn1 = ")
	if inner < 0 || outer < 0 || inner > outer {
		t.Errorf("inner scan fn must declare before the outer gate fn:\n%s", lines)
	}
	if !strings.Contains(lines, "v[0] === -1) return ctxFn0(") {
		t.Errorf("outer gate body must call the inner scan fn: %s", lines)
	}
}

// TestUnionUnknownKeys_DescendsIntoAMemberObject — `{tag:'n', inner:{x:number}}
// | {tag:'m', other:string}`. The merged root loop only ever answered for the
// union's OWN keys, so an extra key on `inner` came back clean. The descent
// compiles each unambiguous merged prop, so the nested object carries its own
// check.
func TestUnionUnknownKeys_DescendsIntoAMemberObject(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	num := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	px := &reflection.RunType{ID: "px", Kind: reflection.KindProperty, Name: "x", IsSafeName: true, Child: makeRef("num")}
	inner := &reflection.RunType{ID: "inner", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("px")}}
	ptag := &reflection.RunType{ID: "ptag", Kind: reflection.KindProperty, Name: "tag", IsSafeName: true, Child: makeRef("str")}
	pinner := &reflection.RunType{ID: "pinner", Kind: reflection.KindProperty, Name: "inner", IsSafeName: true, Child: makeRef("inner")}
	pother := &reflection.RunType{ID: "pother", Kind: reflection.KindProperty, Name: "other", IsSafeName: true, Child: makeRef("str")}
	obN := &reflection.RunType{ID: "obN", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("ptag"), makeRef("pinner")}}
	obM := &reflection.RunType{ID: "obM", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("ptag"), makeRef("pother")}}
	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("obN"), makeRef("obM")},
		SafeUnionChildren: []*reflection.RunType{makeRef("obN"), makeRef("obM")},
	}
	all := []*reflection.RunType{str, num, px, inner, ptag, pinner, pother, obN, obM, union}

	// hasUnknownKeys (CodeE) — the descent lands inside the hoisted scan fn as
	// an early `return true`, so a hit below the root still answers true.
	ctx := unionUnknownKeysCtx(t, union, all)
	out := emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: hasSnippet, CodeShape: CodeE})
	lines := ctx.walker.ContextLines()
	if !strings.Contains(lines, "v.inner") {
		t.Errorf("has ctxFn never reaches the nested object: %s", lines)
	}
	if out.Type != CodeE {
		t.Errorf("has CodeShape = %v, want CodeE", out.Type)
	}

	// unknownKeyErrors (CodeS) — the descent is a statement appended after the
	// root loop, INSIDE the plain-object gate that loop already carries.
	ctx = unionUnknownKeysCtx(t, union, all)
	ctx.walker.Emitter = UnknownKeyErrorsEmitter{}
	out = emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{
		Snippet:   func(c *EmitContext, _ string, keyVar string) string { return callUnknownKeyErr(c, keyVar) },
		CodeShape: CodeS,
	})
	if !strings.Contains(out.Code, "v.inner") {
		t.Errorf("errors emit never reaches the nested object: %s", out.Code)
	}
	gate := strings.Index(out.Code, "typeof v === 'object'")
	nested := strings.Index(out.Code, "v.inner")
	if gate < 0 || nested < gate {
		t.Errorf("nested descent must sit inside the plain-object gate: %s", out.Code)
	}
}

// TestUnionUnknownKeys_SkipsAnAmbiguousMergedProp — `{tag:'a', data:{x:number}}
// | {tag:'b', data:{y:number}}`. Two members declare `data` with DIFFERENT
// object shapes, so descending either one would report the other's keys as
// undeclared on a perfectly clean value. Knowing which to pick means validating,
// which this family does not do, so the prop is skipped.
func TestUnionUnknownKeys_SkipsAnAmbiguousMergedProp(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	num := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	px := &reflection.RunType{ID: "px", Kind: reflection.KindProperty, Name: "x", IsSafeName: true, Child: makeRef("num")}
	py := &reflection.RunType{ID: "py", Kind: reflection.KindProperty, Name: "y", IsSafeName: true, Child: makeRef("num")}
	dataA := &reflection.RunType{ID: "dataA", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("px")}}
	dataB := &reflection.RunType{ID: "dataB", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("py")}}
	ptag := &reflection.RunType{ID: "ptag", Kind: reflection.KindProperty, Name: "tag", IsSafeName: true, Child: makeRef("str")}
	pdataA := &reflection.RunType{ID: "pdataA", Kind: reflection.KindProperty, Name: "data", IsSafeName: true, Child: makeRef("dataA")}
	pdataB := &reflection.RunType{ID: "pdataB", Kind: reflection.KindProperty, Name: "data", IsSafeName: true, Child: makeRef("dataB")}
	obA := &reflection.RunType{ID: "obA", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("ptag"), makeRef("pdataA")}}
	obB := &reflection.RunType{ID: "obB", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("ptag"), makeRef("pdataB")}}
	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("obA"), makeRef("obB")},
		SafeUnionChildren: []*reflection.RunType{makeRef("obA"), makeRef("obB")},
	}
	ctx := unionUnknownKeysCtx(t, union, []*reflection.RunType{str, num, px, py, dataA, dataB, ptag, pdataA, pdataB, obA, obB, union})
	emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: hasSnippet, CodeShape: CodeE})
	if lines := ctx.walker.ContextLines(); strings.Contains(lines, "v.data") {
		t.Errorf("an ambiguous merged prop must not be descended into: %s", lines)
	}
}
