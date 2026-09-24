package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
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
		Emitter:          StripUnknownKeysWireEmitter{},
		ContextItems:     newOrderedItems(),
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
	out := emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: stripSnippet})
	if !strings.Contains(out.Code, "=== 'a'") || !strings.Contains(out.Code, "=== 'b'") {
		t.Errorf("strip allowlist missing 'a' or 'b' check: %s", out.Code)
	}
	if !strings.Contains(out.Code, "delete v[") {
		t.Errorf("strip snippet not emitted: %s", out.Code)
	}
	if out.Type != CodeS {
		t.Errorf("strip code type = %v, want CodeS", out.Type)
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

	out := emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: stripSnippet})
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

	out := emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: stripSnippet})
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

	out := emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: stripSnippet})
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

	out := emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: stripSnippet})
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

	out := emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: ukuSnippet, JsonWireFormat: true})
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

	out := emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: ukuSnippet, JsonWireFormat: true})
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
	// `[-1, merged]` wrapper gate. The non-wire strip assertions hold
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
	out := emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: ukuSnippet})
	if !strings.Contains(out.Code, "typeof v === 'object'") {
		t.Errorf("strip emit missing plain-object gate: %s", out.Code)
	}
	if !strings.Contains(out.Code, "!Array.isArray(v)") {
		t.Errorf("strip emit missing !Array.isArray gate: %s", out.Code)
	}
	if !strings.Contains(out.Code, "v !== null") {
		t.Errorf("strip emit missing v !== null guard: %s", out.Code)
	}

	// JsonWireFormat path keeps its own wrapper gate and does NOT add
	// the plain-object gate (v[1] is already the inner merged object
	// post-wrapper-check).
	ctx = unionUnknownKeysCtx(t, union, []*reflection.RunType{str, big, arr, pa, obj, union})
	out = emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: ukuSnippet, JsonWireFormat: true})
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

	out := emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: stripSnippet})
	for _, name := range []string{"'a'", "'b'"} {
		if !strings.Contains(out.Code, name) {
			t.Errorf("allowlist missing %s: %s", name, out.Code)
		}
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

	// The descent is a statement appended after the root loop, INSIDE the plain-object gate that loop already carries.
	ctx := unionUnknownKeysCtx(t, union, all)
	out := emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: ukuSnippet})
	if !strings.Contains(out.Code, "v.inner") {
		t.Errorf("emit never reaches the nested object: %s", out.Code)
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
	out := emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: ukuSnippet})
	if strings.Contains(out.Code, "v.data") {
		t.Errorf("an ambiguous merged prop must not be descended into: %s", out.Code)
	}
}

// TestUnionUnknownKeys_WireFormatClassMemberArm — ukuWire on `string | BaseErr`
// with BaseErr a named class. The class rides its own `[idx, value]` arm, so
// the decoder strip must reach into `v[1]` under that index with the class's
// declared keys; before, a class-only union had no object branch and the whole
// emit was empty, so undeclared keys survived `strip` inside a union while a
// bare `BaseErr` dropped them.
func TestUnionUnknownKeys_WireFormatClassMemberArm(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	pt := &reflection.RunType{ID: "pt", Kind: reflection.KindProperty, Name: "type", IsSafeName: true, Child: makeRef("str")}
	cls := &reflection.RunType{ID: "bas", Kind: reflection.KindClass, TypeName: "BaseErr", Children: []*reflection.RunType{makeRef("pt")}}
	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("str"), makeRef("bas")},
		SafeUnionChildren: []*reflection.RunType{makeRef("str"), makeRef("bas")},
	}
	ctx := unionUnknownKeysCtx(t, union, []*reflection.RunType{str, pt, cls, union})

	out := emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: ukuSnippet, JsonWireFormat: true})
	if !strings.Contains(out.Code, "v[0] === 1") {
		t.Errorf("wire-format emit must gate the class arm on its member index: %s", out.Code)
	}
	if !strings.Contains(out.Code, "v[1]") {
		t.Errorf("wire-format emit must sweep v[1] for the class member, got: %s", out.Code)
	}
	// the runtime-shape families see a live instance with no wire index, so the
	// class's declared props join the merged allowlist: `type` is declared,
	// anything else is unknown, exactly as for a bare BaseErr
	plain := emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: stripSnippet})
	if !strings.Contains(plain.Code, "=== 'type'") {
		t.Errorf("runtime-shape emit must allowlist the class member's declared props, got: %s", plain.Code)
	}
}

// TestUnknownKeys_UnionWalksItsArrayMember: `{a: string}[] | number` has no object member, so the
// merged allowlist is empty, and the object inside the ARRAY member is still the union's business.
// Pinned end-to-end in packages/run-types/test/features/unknownKeyFamiliesAgree.test.ts.
func TestUnknownKeys_UnionWalksItsArrayMember(t *testing.T) {
	dump := protocol.Dump{RunTypes: buildAtomicMemberFixture(), Sites: []protocol.Site{ukuwSite(0, "uArr")}}
	out := renderUkuwToString(t, dump)
	line := extractInitLine(out, ukuwKey("uArr"))
	if line == "" {
		t.Fatalf("no stripUnknownKeysWire entry for the union in:\n%s", out)
	}
	// The union's own entry calls the array member's entry, which is the descent.
	if !strings.Contains(line, ukuwKey("arr")+".fn(v") {
		t.Errorf("the union must walk its array member, got:\n%s", line)
	}
	if extractInitLine(out, ukuwKey("arr")) == "" {
		t.Errorf("the array member must be compiled, got:\n%s", out)
	}
}
