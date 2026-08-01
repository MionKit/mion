package typefunctions

import (
	"sort"
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/ts-runtypes/internal/constants"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// joinEntries flattens a collected family graph back into the legacy
// `init(<args>);` line form, children-before-parents (same-family deps first,
// alphabetical within a level), so the historical body-shape assertions below
// keep reading naturally. The tuple ArgsText IS the old init-call interior, so
// only the wrapper is synthesized here. The global dangling-dep cascade runs
// first — production (resolver.collectEntryModules) always cascades before
// rendering, so a single-family join must too or it would surface parents
// whose dropped children make them unservable.
func joinEntries(t *testing.T, graph entrymodules.Graph) string {
	t.Helper()
	graph.Cascade()
	keys := make([]string, 0, len(graph))
	for key := range graph {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	emitted := make(map[string]bool, len(graph))
	var lines []string
	for len(emitted) < len(graph) {
		progressed := false
		for _, key := range keys {
			if emitted[key] {
				continue
			}
			ready := true
			for _, dep := range graph[key].Deps {
				if dep == key {
					continue
				}
				if _, inGraph := graph[dep]; inGraph && !emitted[dep] {
					ready = false
					break
				}
			}
			if !ready {
				continue
			}
			emitted[key] = true
			progressed = true
			lines = append(lines, "init("+graph[key].ArgsText+");")
		}
		if !progressed {
			// Dep cycle (recursive type): flush the remainder alphabetically.
			for _, key := range keys {
				if !emitted[key] {
					emitted[key] = true
					lines = append(lines, "init("+graph[key].ArgsText+");")
				}
			}
		}
	}
	return strings.Join(lines, "\n") + "\n"
}

// renderToString defaults to EmitMode 'both' so body-shape
// assertions can substring-match against the un-escaped validator body
// embedded in the `function g_<id>(utl){function <id>(v){
// <body>}}` closure. Under the production default (no inline factory)
// the same body lives only inside the JSON-quoted `code` arg-3 string,
// making raw-body assertions unreadable. Tests that care about the
// wire encoding (createRTFn slot token, alwaysThrow, noop shape)
// explicitly call renderToStringDefault.
func renderToString(t *testing.T, dump protocol.Dump) string {
	t.Helper()
	return joinEntries(t, FamilyByKey("validate").Collect(dump, RenderOpts{EmitMode: "both"}, nil))
}

// renderToStringDefault renders with the production-default
// (EmitMode 'code') — the createRTFn slot becomes the `u` alias, the
// body lives only in the quoted `code` string. Used by the few tests that
// assert the wire-shape transition between the two emit modes.
func renderToStringDefault(t *testing.T, dump protocol.Dump) string {
	t.Helper()
	return joinEntries(t, FamilyByKey("validate").Collect(dump, RenderOpts{}, nil))
}

func TestValidateModule_EmptyDump(t *testing.T) {
	graph := FamilyByKey("validate").Collect(protocol.Dump{}, RenderOpts{}, nil)
	if len(graph) != 0 {
		t.Errorf("empty dump must collect zero entries, got %d", len(graph))
	}
}

func TestValidateModule_SingleEntryShape(t *testing.T) {
	dump := protocol.Dump{
		RunTypes: []*protocol.RunType{{ID: "abc123", Kind: protocol.KindString}},
	}
	// Opt-in (EmitMode 'both'): arg-7 carries the full
	// `function g_<hash>(utl){…}` declaration. Used by runtimes
	// without `new Function` and by every body-shape test below.
	out := renderToString(t, dump)
	key := valKey("abc123")
	want := "init(" +
		"'" + key + "'," +
		"'string'," +
		"'function " + key + "(v){return typeof v === \\'string\\'}return " + key + "'," +
		// isNoop (false), rtDependencies ([]) and pureFnDependencies ([]) are
		// interior holes — the live factory that follows blocks a trailing trim.
		",,," +
		"function g_" + key + "(utl){function " + key + "(v){return typeof v === 'string'}return " + key + "}" +
		");"
	if !strings.Contains(out, want) {
		t.Errorf("expected entry line\n  %s\nin rendered module:\n%s", want, out)
	}
}

// TestValidateModule_SingleEntryShape_DefaultEmit pins the
// production-default shape: the all-default tail (isNoop false, empty
// dep lists, the `u` createRTFn placeholder) is trimmed entirely, so
// the entry ends at the quoted `code` arg-3 string and no
// `function g_<hash>(utl){…}` closure leaks into the module. The
// JS-side materializeRTFn rebuilds the factory via `new Function('utl',
// code)` on first lookup.
func TestValidateModule_SingleEntryShape_DefaultEmit(t *testing.T) {
	dump := protocol.Dump{
		RunTypes: []*protocol.RunType{{ID: "abc123", Kind: protocol.KindString}},
	}
	out := renderToStringDefault(t, dump)
	key := valKey("abc123")
	want := "init(" +
		"'" + key + "'," +
		"'string'," +
		"'function " + key + "(v){return typeof v === \\'string\\'}return " + key + "'" +
		");"
	if !strings.Contains(out, want) {
		t.Errorf("expected entry line\n  %s\nin rendered module:\n%s", want, out)
	}
	if strings.Contains(out, "function g_"+key) {
		t.Errorf("default emit must NOT inline the createRTFn closure, but found g_%s in:\n%s", key, out)
	}
}

// TestValidateModule_FunctionsMode pins the 'functions' emit mode: the code
// slot (arg-3) is `undefined` (the body string is dropped) and the createRTFn
// slot carries the live factory — the body ships ONCE, not twice as in 'both'.
func TestValidateModule_FunctionsMode(t *testing.T) {
	dump := protocol.Dump{
		RunTypes: []*protocol.RunType{{ID: "abc123", Kind: protocol.KindString}},
	}
	out := joinEntries(t, FamilyByKey("validate").Collect(dump, RenderOpts{EmitMode: "functions"}, nil))
	key := valKey("abc123")
	want := "init(" +
		"'" + key + "'," +
		"'string'," +
		// code (undefined, dropped in functions mode), isNoop, and both dep
		// lists are interior holes; the live factory follows in the last slot.
		",,,," +
		"function g_" + key + "(utl){function " + key + "(v){return typeof v === 'string'}return " + key + "}" +
		");"
	if !strings.Contains(out, want) {
		t.Errorf("expected functions-mode entry\n  %s\nin rendered module:\n%s", want, out)
	}
	// The body must NOT also appear as a quoted code string (that would be 'both').
	if strings.Contains(out, "'function "+key) {
		t.Errorf("functions mode must drop the quoted code string, but found it in:\n%s", out)
	}
}

// TestValidateModule_AtomicEmitBodies asserts the emit body for each
// atomic kind we ported from the reference implementation. One row per
// kind keeps the regression surface explicit — drift in any single arm
// of ValidateEmitter.Emit lands as a focused failure here.
//
// Bodies must match the corresponding node's emitIsType output
// (ref: packages/run-types/src/nodes/atomic/<name>.ts).
// `return ` prefix is added by the walker / Finalize.
func TestValidateModule_AtomicEmitBodies(t *testing.T) {
	rows := []struct {
		name string
		rt   *protocol.RunType
		body string // expected inner-fn body (post-Finalize)
		noop bool   // true for any/unknown — Finalize collapses to noop, factory is skipped entirely
	}{
		{"number", &protocol.RunType{ID: "num", Kind: protocol.KindNumber}, "return Number.isFinite(v)", false},
		{"boolean", &protocol.RunType{ID: "boo", Kind: protocol.KindBoolean}, "return typeof v === 'boolean'", false},
		{"bigint", &protocol.RunType{ID: "big", Kind: protocol.KindBigInt}, "return typeof v === 'bigint'", false},
		// KindSymbol is unsupported at root. Renderer emits an alwaysThrow
		// factory whose final slot is the VL002 message, rendered here at
		// build time (not a body-bearing validator).
		{"symbol", &protocol.RunType{ID: "sym", Kind: protocol.KindSymbol}, "init('" + valKey("sym") + "','symbol',,,,,," + quoteJS(buildAlwaysThrowMessage("VL002", "Symbol", nil)) + ")", false},
		{"null", &protocol.RunType{ID: "nul", Kind: protocol.KindNull}, "return v === null", false},
		{"undefined", &protocol.RunType{ID: "und", Kind: protocol.KindUndefined}, "return typeof v === 'undefined'", false},
		{"void", &protocol.RunType{ID: "voi", Kind: protocol.KindVoid}, "return v === undefined", false},
		{"never", &protocol.RunType{ID: "nev", Kind: protocol.KindNever}, "return false", false},
		{"any", &protocol.RunType{ID: "any", Kind: protocol.KindAny}, "", true},
		{"unknown", &protocol.RunType{ID: "unk", Kind: protocol.KindUnknown}, "", true},
		{"object", &protocol.RunType{ID: "obj", Kind: protocol.KindObject}, "return (typeof v === 'object' && v !== null)", false},
		{"regexp", &protocol.RunType{ID: "reg", Kind: protocol.KindRegexp}, "return (v instanceof RegExp)", false},
		{"date", &protocol.RunType{ID: "dat", Kind: protocol.KindClass, SubKind: protocol.SubKindDate}, "return (v instanceof Date && !isNaN(v.getTime()))", false},
	}
	for _, row := range rows {
		t.Run(row.name, func(t *testing.T) {
			dump := protocol.Dump{RunTypes: []*protocol.RunType{row.rt}}
			out := renderToString(t, dump)
			if row.noop {
				// Noop factories use the short-form init: only rtFnHash,
				// typeName, code=undefined, isNoop=true — no full body or
				// createRTFn closure. The cache module's init() sees
				// isNoop and pre-sets `fn` to the family identity. Assert
				// both: the short-form `init('<id>',...,undefined,true);`
				// is present, AND no full createRTFn closure leaks in.
				marker := "init('" + valKey(row.rt.ID) + "',"
				if !strings.Contains(out, marker) {
					t.Errorf("noop kind %s expected short-form init line %q in:\n%s", row.name, marker, out)
				}
				if strings.Contains(out, "function g_"+valKey(row.rt.ID)) {
					t.Errorf("noop kind %s should NOT emit a createRTFn closure, but found g_%s in:\n%s", row.name, valKey(row.rt.ID), out)
				}
				return
			}
			if !strings.Contains(out, row.body) {
				t.Errorf("expected body %q for kind %s in:\n%s", row.body, row.name, out)
			}
		})
	}
}

// TestValidateModule_LiteralEmitBodies covers the literal sub-cases
// (ref: literal.ts:88-105). One row per literal flavour: string,
// number, boolean, bigint (via Flags), symbol (via Flags + map),
// regexp (via map).
func TestValidateModule_LiteralEmitBodies(t *testing.T) {
	rows := []struct {
		name string
		rt   *protocol.RunType
		body string
	}{
		{
			"string", &protocol.RunType{ID: "ls", Kind: protocol.KindLiteral, Literal: "a"},
			"return v === 'a'",
		},
		{
			"number int", &protocol.RunType{ID: "li", Kind: protocol.KindLiteral, Literal: int64(2)},
			"return v === 2",
		},
		{
			"number float", &protocol.RunType{ID: "lf", Kind: protocol.KindLiteral, Literal: float64(1.5)},
			"return v === 1.5",
		},
		{
			"boolean", &protocol.RunType{ID: "lb", Kind: protocol.KindLiteral, Literal: true},
			"return v === true",
		},
		{
			"bigint", &protocol.RunType{ID: "lbi", Kind: protocol.KindLiteral, Literal: "1", Flags: []string{"bigint"}},
			"return v === 1n",
		},
		{
			"symbol", &protocol.RunType{ID: "lsy", Kind: protocol.KindLiteral, Literal: map[string]any{"symbol": "hello"}, Flags: []string{"symbol"}},
			"return typeof v === 'symbol' && v.description === 'hello'",
		},
	}
	for _, row := range rows {
		t.Run(row.name, func(t *testing.T) {
			dump := protocol.Dump{RunTypes: []*protocol.RunType{row.rt}}
			out := renderToString(t, dump)
			if !strings.Contains(out, row.body) {
				t.Errorf("expected body %q for literal %s in:\n%s", row.body, row.name, out)
			}
		})
	}
}

// TestValidateModule_EnumEmitBody covers KindEnum's mixed-value chain
// (ref: nodes/atomic/enum.ts:14). Uses the Color enum from
// enum.spec.ts: {Red=0, Green='green', Blue=2}. The Values slice
// carries the resolved values in declaration order; chain order
// follows.
func TestValidateModule_EnumEmitBody(t *testing.T) {
	rt := &protocol.RunType{
		ID:     "enm",
		Kind:   protocol.KindEnum,
		Values: []any{int64(0), "green", int64(2)},
	}
	out := renderToString(t, protocol.Dump{RunTypes: []*protocol.RunType{rt}})
	want := "return (v === 0 || v === 'green' || v === 2)"
	if !strings.Contains(out, want) {
		t.Errorf("expected enum body %q in:\n%s", want, out)
	}
}

// TestValidateModule_ArrayEmitBody covers KindArray's canonical block
// (ref: nodes/member/array.ts:emitIsType). The outer array renders an
// Array.isArray guard, a numbered for-loop, and an inlined child check
// since the child (string) is atomic — no dependency call needed.
func TestValidateModule_ArrayEmitBody(t *testing.T) {
	// emit walks the *protocol.RunType graph as-given (not via cache
	// resolution) so the Child slot here is inlined as a KindString
	// rather than a KindRef sentinel — same shape the renderer sees
	// after the cache materialises children into the parent.
	dump := protocol.Dump{
		RunTypes: []*protocol.RunType{
			{ID: "ar1", Kind: protocol.KindArray, Child: &protocol.RunType{ID: "str", Kind: protocol.KindString}},
		},
	}
	out := renderToString(t, dump)
	for _, fragment := range []string{
		"if (!Array.isArray(v)) return false;",
		"for (let i0 = 0; i0 < v.length; i0++) {",
		"const res0 = typeof v[i0] === 'string';",
		"if (!(res0)) return false;",
		"return true",
	} {
		if !strings.Contains(out, fragment) {
			t.Errorf("expected array body fragment %q in:\n%s", fragment, out)
		}
	}
}

// TestValidateModule_NestedArrayDependencyCall covers `string[][]` — the
// first multi-level case in the suite. The outer array's body must
// invoke the inner array's pre-compiled validator via the dependency-
// call layer:
//
//   - The outer module's `rtDependencies` arg carries the inner
//     hash (non-empty `[…]`).
//   - The outer createRTFn closure has a `const <innerHash> =
//     utl.getRT('<innerHash>')` context-item line.
//   - The outer body contains `<innerHash>.fn(v[i0])` at the element
//     check position.
//   - Both modules render (inner first, outer second — topo sort).
func TestValidateModule_NestedArrayDependencyCall(t *testing.T) {
	// The inner array carries a NAME: under the default name rule named
	// types stay external (dedupe-worthy), which is what keeps this test
	// pinning the dependency-call + topo-order machinery. Unnamed arrays
	// inline since the inlining flip (see the name-rule tests below).
	inner := &protocol.RunType{
		ID:       "inn",
		Kind:     protocol.KindArray,
		TypeName: "Tags",
		Child:    &protocol.RunType{ID: "str", Kind: protocol.KindString},
	}
	outer := &protocol.RunType{
		ID:    "out",
		Kind:  protocol.KindArray,
		Child: &protocol.RunType{ID: "inn", Kind: protocol.KindArray, TypeName: "Tags", Child: &protocol.RunType{ID: "str", Kind: protocol.KindString}},
	}
	// Cache insertion order is parent-first (outer, inner). Renderer
	// must reorder to inner-before-outer so the outer's closure can
	// resolve `utl.getRT('inn')` against an already-registered entry.
	dump := protocol.Dump{RunTypes: []*protocol.RunType{outer, inner}}
	out := renderToString(t, dump)

	innerKey := valKey("inn")
	innerFactory := "init('" + innerKey + "',"
	outerFactory := "init('" + valKey("out") + "',"
	innerIdx := strings.Index(out, innerFactory)
	outerIdx := strings.Index(out, outerFactory)
	if innerIdx < 0 {
		t.Fatalf("inner factory missing in:\n%s", out)
	}
	if outerIdx < 0 {
		t.Fatalf("outer factory missing in:\n%s", out)
	}
	if innerIdx >= outerIdx {
		t.Errorf("inner factory must render before outer (topo sort); got innerIdx=%d outerIdx=%d in:\n%s", innerIdx, outerIdx, out)
	}
	if !strings.Contains(out, "['"+innerKey+"']") {
		t.Errorf("outer factory's rtDependencies arg must contain ['%s'], got:\n%s", innerKey, out)
	}
	if !strings.Contains(out, "const "+innerKey+" = utl.getRT('"+innerKey+"')") {
		t.Errorf("outer factory must register context item resolving the inner hash, got:\n%s", out)
	}
	if !strings.Contains(out, innerKey+".fn(v[i0])") {
		t.Errorf("outer body must call inner via `<hash>.fn(args)`, got:\n%s", out)
	}
}

// TestValidateModule_ArrayNoIsArrayCheck — when a createValidateFn site requests the
// `noIsArrayCheck` ValidateOptions variant for an array runtype, the
// emitter fans out an extra `valNA_<id>` factory whose body omits the
// leading `if (!Array.isArray(v)) return false;` guard. A plain
// createValidateFn site still emits the guarded `val_<id>` factory. Mirrors
// the `comp.opts.noIsArrayCheck` branch in array.ts:emitIsType. (`it` is
// demand-scoped: the scanner attaches each site's structured Demand, so the
// plain `it` entry and the `NA` variant ride distinct SiteDemand entries —
// not the legacy Site.Options back-compat fan-out.)
func TestValidateModule_ArrayNoIsArrayCheck(t *testing.T) {
	dump := protocol.Dump{
		RunTypes: []*protocol.RunType{
			{
				ID:    "an1",
				Kind:  protocol.KindArray,
				Child: &protocol.RunType{ID: "str", Kind: protocol.KindString},
			},
		},
		Sites: []protocol.Site{
			// Plain createValidateFn<T[]>() — demands the guarded `val_an1`.
			{File: "call.ts", Pos: 0, ID: "an1", Demand: []protocol.SiteDemand{{FamilyTag: "val"}}},
			// createValidateFn<T[]>(undefined, {noIsArrayCheck: true}) — demands
			// the `valNA_an1` variant whose body omits the Array.isArray guard.
			{File: "call.ts", Pos: 40, ID: "an1", Demand: []protocol.SiteDemand{{FamilyTag: "val", VariantSuffix: "NA", Options: []string{"noIsArrayCheck"}}}},
		},
	}
	out := renderToString(t, dump)
	plainKey := valKey("an1")
	variantKeyNA := itVariantKey([]string{"noIsArrayCheck"}, "an1")
	// Plain `<itHash>_an1` factory MUST keep the guard — the variant key
	// dispatch is the only path that strips it.
	if !strings.Contains(out, plainKey) {
		t.Errorf("plain validate entry must be emitted, got:\n%s", out)
	}
	// The noIsArrayCheck-variant factory MUST exist alongside the plain one.
	if !strings.Contains(out, variantKeyNA) {
		t.Errorf("variant validate entry %q must be emitted, got:\n%s", variantKeyNA, out)
	}
	// The variant body has the for-loop but no Array.isArray guard.
	// The plain body has both. Find the variant's `init(...)` line and
	// assert the guard is absent from it.
	variantLine := extractInitLine(out, variantKeyNA)
	if variantLine == "" {
		t.Fatalf("no init('%s', …) line found in:\n%s", variantKeyNA, out)
	}
	if strings.Contains(variantLine, "Array.isArray") {
		t.Errorf("valNA variant must omit `Array.isArray(…)` guard, got:\n%s", variantLine)
	}
	if !strings.Contains(variantLine, "for (let i0 = 0;") {
		t.Errorf("valNA variant must still emit element loop, got:\n%s", variantLine)
	}
}

// extractInitLine returns the substring of `out` corresponding to the
// `init('<key>', …);` call for the given cache key. Returns "" when
// no such call is present.
func extractInitLine(out, key string) string {
	needle := "init('" + key + "'"
	start := strings.Index(out, needle)
	if start < 0 {
		return ""
	}
	end := strings.Index(out[start:], ");")
	if end < 0 {
		return out[start:]
	}
	return out[start : start+end+2]
}

// TestValidateModule_InterfaceEmitBody covers KindObjectLiteral —
// the canonical interface check (`typeof v === 'object' && v !== null`)
// AND-chained with each PropertySignature child's check. Atomic
// children inline directly; the resolver normally hands child slots
// as KindRef sentinels which the walker derefs via the RefTable.
func TestValidateModule_InterfaceEmitBody(t *testing.T) {
	stringRT := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	numberRT := &protocol.RunType{ID: "num", Kind: protocol.KindNumber}
	propA := &protocol.RunType{
		ID:         "pA",
		Kind:       protocol.KindPropertySignature,
		Name:       "a",
		IsSafeName: true,
		Child:      &protocol.RunType{ID: "str", Kind: protocol.KindRef},
	}
	propB := &protocol.RunType{
		ID:         "pB",
		Kind:       protocol.KindPropertySignature,
		Name:       "b",
		IsSafeName: true,
		Child:      &protocol.RunType{ID: "num", Kind: protocol.KindRef},
	}
	iface := &protocol.RunType{
		ID:   "if1",
		Kind: protocol.KindObjectLiteral,
		Children: []*protocol.RunType{
			{ID: "pA", Kind: protocol.KindRef},
			{ID: "pB", Kind: protocol.KindRef},
		},
	}
	dump := protocol.Dump{RunTypes: []*protocol.RunType{iface, propA, propB, stringRT, numberRT}}
	out := renderToString(t, dump)
	if !strings.Contains(out, "init('"+valKey("if1")+"',") {
		t.Fatalf("interface factory missing in:\n%s", out)
	}
	want := "(typeof v === 'object' && v !== null && typeof v.a === 'string' && Number.isFinite(v.b))"
	if !strings.Contains(out, want) {
		t.Errorf("expected interface body %q in:\n%s", want, out)
	}
}

// TestValidateModule_OptionalPropertyEmitBody checks the optional guard
// wrap — `(v.<name> === undefined || <childCheck>)`. Mirrors the
// PropertyRunType.emitIsType when src.optional is set.
func TestValidateModule_OptionalPropertyEmitBody(t *testing.T) {
	stringRT := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	propA := &protocol.RunType{
		ID:         "pA",
		Kind:       protocol.KindPropertySignature,
		Name:       "a",
		IsSafeName: true,
		Optional:   true,
		Child:      &protocol.RunType{ID: "str", Kind: protocol.KindRef},
	}
	iface := &protocol.RunType{
		ID:       "if2",
		Kind:     protocol.KindObjectLiteral,
		Children: []*protocol.RunType{{ID: "pA", Kind: protocol.KindRef}},
	}
	out := renderToString(t, protocol.Dump{RunTypes: []*protocol.RunType{iface, propA, stringRT}})
	want := "(v.a === undefined || typeof v.a === 'string')"
	if !strings.Contains(out, want) {
		t.Errorf("expected optional-property body %q in:\n%s", want, out)
	}
}

// TestValidateModule_FunctionPropertyDropped — properties whose wrapped
// value is function-flavoured are dropped from the parent's AND
// chain. Mirrors the `getRTChild → undefined` short-circuit for
// methods. The interface body therefore reduces to the basic
// typeof-object guard + the non-function siblings.
func TestValidateModule_FunctionPropertyDropped(t *testing.T) {
	stringRT := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	fnRT := &protocol.RunType{ID: "fn", Kind: protocol.KindFunction}
	propName := &protocol.RunType{
		ID:         "pN",
		Kind:       protocol.KindPropertySignature,
		Name:       "name",
		IsSafeName: true,
		Child:      &protocol.RunType{ID: "str", Kind: protocol.KindRef},
	}
	propMethod := &protocol.RunType{
		ID:         "pM",
		Kind:       protocol.KindPropertySignature,
		Name:       "method",
		IsSafeName: true,
		Child:      &protocol.RunType{ID: "fn", Kind: protocol.KindRef},
	}
	iface := &protocol.RunType{
		ID:   "if3",
		Kind: protocol.KindObjectLiteral,
		Children: []*protocol.RunType{
			{ID: "pN", Kind: protocol.KindRef},
			{ID: "pM", Kind: protocol.KindRef},
		},
	}
	out := renderToString(t, protocol.Dump{RunTypes: []*protocol.RunType{iface, propName, propMethod, stringRT, fnRT}})
	if strings.Contains(out, "v.method") {
		t.Errorf("function-typed property should be dropped from AND chain, but v.method appears:\n%s", out)
	}
	if !strings.Contains(out, "typeof v.name === 'string'") {
		t.Errorf("non-function sibling should still be checked, got:\n%s", out)
	}
}

// TestValidateModule_IndexSignatureEmitBody covers KindIndexSignature —
// the for-in iteration over the object's own keys with a value-type
// check. Mirrors the IndexSignatureRunType.emitIsType.
func TestValidateModule_IndexSignatureEmitBody(t *testing.T) {
	stringRT := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	idx := &protocol.RunType{
		ID:    "ix",
		Kind:  protocol.KindIndexSignature,
		Child: &protocol.RunType{ID: "str", Kind: protocol.KindRef},
	}
	iface := &protocol.RunType{
		ID:       "if4",
		Kind:     protocol.KindObjectLiteral,
		Children: []*protocol.RunType{{ID: "ix", Kind: protocol.KindRef}},
	}
	out := renderToString(t, protocol.Dump{RunTypes: []*protocol.RunType{iface, idx, stringRT}})
	for _, fragment := range []string{
		"for (const k0 in v)",
		"typeof v[k0] === 'string'",
		"return true",
	} {
		if !strings.Contains(out, fragment) {
			t.Errorf("expected index-signature fragment %q in:\n%s", fragment, out)
		}
	}
}

// TestValidateModule_FunctionTopLevelEmitBody — a free-standing function
// runtype emits the bare `typeof === 'function'` check.
func TestValidateModule_FunctionTopLevelEmitBody(t *testing.T) {
	dump := protocol.Dump{RunTypes: []*protocol.RunType{{ID: "fn1", Kind: protocol.KindFunction}}}
	out := renderToString(t, dump)
	if !strings.Contains(out, "return typeof v === 'function'") {
		t.Errorf("expected function body in:\n%s", out)
	}
}

// TestValidateModule_TupleEmitBody covers KindTuple. Body shape (CodeRB)
// is: Array.isArray guard → length-bound guard (when no rest) → per-
// member check sequence → return true.
func TestValidateModule_TupleEmitBody(t *testing.T) {
	stringRT := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	numberRT := &protocol.RunType{ID: "num", Kind: protocol.KindNumber}
	pos0 := 0
	pos1 := 1
	member0 := &protocol.RunType{
		ID:       "m0",
		Kind:     protocol.KindTupleMember,
		Position: &pos0,
		Child:    &protocol.RunType{ID: "str", Kind: protocol.KindRef},
	}
	member1 := &protocol.RunType{
		ID:       "m1",
		Kind:     protocol.KindTupleMember,
		Position: &pos1,
		Child:    &protocol.RunType{ID: "num", Kind: protocol.KindRef},
	}
	tup := &protocol.RunType{
		ID:   "tp1",
		Kind: protocol.KindTuple,
		Children: []*protocol.RunType{
			{ID: "m0", Kind: protocol.KindRef},
			{ID: "m1", Kind: protocol.KindRef},
		},
	}
	dump := protocol.Dump{RunTypes: []*protocol.RunType{tup, member0, member1, stringRT, numberRT}}
	out := renderToString(t, dump)
	for _, fragment := range []string{
		"if (!Array.isArray(v)) return false;",
		"if (v.length > 2) return false;",
		"(typeof v[0] === 'string')",
		"(Number.isFinite(v[1]))",
		"return true",
	} {
		if !strings.Contains(out, fragment) {
			t.Errorf("expected tuple fragment %q in:\n%s", fragment, out)
		}
	}
}

// TestValidateModule_TupleOptionalMember — optional tuple element wraps
// with `(v[i] === undefined || (childCheck))`.
func TestValidateModule_TupleOptionalMember(t *testing.T) {
	stringRT := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	pos0 := 0
	member0 := &protocol.RunType{
		ID:       "m0",
		Kind:     protocol.KindTupleMember,
		Position: &pos0,
		Optional: true,
		Child:    &protocol.RunType{ID: "str", Kind: protocol.KindRef},
	}
	tup := &protocol.RunType{
		ID:       "tp2",
		Kind:     protocol.KindTuple,
		Children: []*protocol.RunType{{ID: "m0", Kind: protocol.KindRef}},
	}
	out := renderToString(t, protocol.Dump{RunTypes: []*protocol.RunType{tup, member0, stringRT}})
	want := "(v[0] === undefined || (typeof v[0] === 'string'))"
	if !strings.Contains(out, want) {
		t.Errorf("expected optional tuple member %q in:\n%s", want, out)
	}
}

// TestValidateModule_UnionAtomicEmitBody — union of atomic types
// produces an OR-chain.
func TestValidateModule_UnionAtomicEmitBody(t *testing.T) {
	stringRT := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	numberRT := &protocol.RunType{ID: "num", Kind: protocol.KindNumber}
	un := &protocol.RunType{
		ID:   "un1",
		Kind: protocol.KindUnion,
		Children: []*protocol.RunType{
			{ID: "str", Kind: protocol.KindRef},
			{ID: "num", Kind: protocol.KindRef},
		},
	}
	dump := protocol.Dump{RunTypes: []*protocol.RunType{un, stringRT, numberRT}}
	out := renderToString(t, dump)
	want := "(typeof v === 'string' || Number.isFinite(v))"
	if !strings.Contains(out, want) {
		t.Errorf("expected atomic union body %q in:\n%s", want, out)
	}
}

// prop builds an inline (non-ref) property signature wrapping child.
func prop(id, name string, optional bool, child *protocol.RunType) *protocol.RunType {
	return &protocol.RunType{
		ID: id, Kind: protocol.KindPropertySignature, Name: name,
		IsSafeName: true, Optional: optional, Child: child,
	}
}

// TestValidateModule_UnionObjectsShareNullGuard — a union with an object
// member lifts the `typeof === 'object' && !== null` guard to ONE shared
// root guard; the object arm no longer repeats it inside the OR-chain
// (union-validate-dedup). Inline children + a single union root keep the
// rendered output to just the union body, so the guard count is exact.
func TestValidateModule_UnionObjectsShareNullGuard(t *testing.T) {
	obj := &protocol.RunType{
		ID:   "ob1",
		Kind: protocol.KindObjectLiteral,
		Children: []*protocol.RunType{
			prop("pA", "a", false, &protocol.RunType{ID: "s", Kind: protocol.KindString}),
		},
	}
	un := &protocol.RunType{
		ID:   "un2",
		Kind: protocol.KindUnion,
		Children: []*protocol.RunType{
			{ID: "s0", Kind: protocol.KindString},
			obj,
		},
	}
	out := renderToString(t, protocol.Dump{RunTypes: []*protocol.RunType{un}})
	if n := strings.Count(out, "typeof v === 'object' && v !== null"); n != 1 {
		t.Errorf("union object guard must appear exactly once (shared root), got %d in:\n%s", n, out)
	}
	// The arm still carries its own property check (guard-free).
	if !strings.Contains(out, "typeof v.a === 'string'") {
		t.Errorf("object arm must keep its own property check, in:\n%s", out)
	}
}

// TestValidateModule_UnionMultiObjectShareGuard — several object members
// share ONE object guard; each arm keeps only its own property checks.
func TestValidateModule_UnionMultiObjectShareGuard(t *testing.T) {
	objA := &protocol.RunType{ID: "obA", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{
		prop("pA", "a", false, &protocol.RunType{ID: "s", Kind: protocol.KindString}),
	}}
	objB := &protocol.RunType{ID: "obB", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{
		prop("pB", "b", false, &protocol.RunType{ID: "n", Kind: protocol.KindNumber}),
	}}
	un := &protocol.RunType{ID: "un3", Kind: protocol.KindUnion, Children: []*protocol.RunType{
		{ID: "s0", Kind: protocol.KindString}, objA, objB,
	}}
	out := renderToString(t, protocol.Dump{RunTypes: []*protocol.RunType{un}})
	if n := strings.Count(out, "typeof v === 'object' && v !== null"); n != 1 {
		t.Errorf("multi-object union must share ONE object guard, got %d in:\n%s", n, out)
	}
	for _, frag := range []string{"typeof v.a === 'string'", "Number.isFinite(v.b)"} {
		if !strings.Contains(out, frag) {
			t.Errorf("expected arm check %q in:\n%s", frag, out)
		}
	}
}

// TestValidateModule_UnionAllOptionalObjectKeepsBrandGuard — an all-optional
// object member's `[object Object]` brand guard sits AFTER the dropped typeof
// term, so it must survive as the arm's own leading check.
func TestValidateModule_UnionAllOptionalObjectKeepsBrandGuard(t *testing.T) {
	obj := &protocol.RunType{ID: "obO", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{
		prop("pA", "a", true, &protocol.RunType{ID: "s", Kind: protocol.KindString}),
	}}
	un := &protocol.RunType{ID: "un4", Kind: protocol.KindUnion, Children: []*protocol.RunType{
		{ID: "s0", Kind: protocol.KindString}, obj,
	}}
	out := renderToString(t, protocol.Dump{RunTypes: []*protocol.RunType{un}})
	if n := strings.Count(out, "typeof v === 'object' && v !== null"); n != 1 {
		t.Errorf("all-optional object union must share ONE object guard, got %d in:\n%s", n, out)
	}
	if !strings.Contains(out, "=== '[object Object]'") {
		t.Errorf("expected surviving [object Object] brand guard in the arm, in:\n%s", out)
	}
}

// TestValidateModule_UnionNestedObjectKeepsGuard — dropping the object arm's
// guard must NOT strip a NESTED property-object's guard: the nested object's
// parent frame is the outer object, not the union. The shared `v` guard
// appears once; the nested `v.x` object keeps its own.
func TestValidateModule_UnionNestedObjectKeepsGuard(t *testing.T) {
	inner := &protocol.RunType{ID: "inn", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{
		prop("pA", "a", false, &protocol.RunType{ID: "n", Kind: protocol.KindNumber}),
	}}
	outer := &protocol.RunType{ID: "out", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{
		prop("pX", "x", false, inner),
	}}
	un := &protocol.RunType{ID: "un5", Kind: protocol.KindUnion, Children: []*protocol.RunType{
		{ID: "s0", Kind: protocol.KindString}, outer,
	}}
	out := renderToString(t, protocol.Dump{RunTypes: []*protocol.RunType{un}})
	if n := strings.Count(out, "typeof v === 'object' && v !== null"); n != 1 {
		t.Errorf("outer object arm's guard must be dropped: want the shared v-guard once, got %d in:\n%s", n, out)
	}
	if !strings.Contains(out, "typeof v.x === 'object' && v.x !== null") {
		t.Errorf("nested property object must KEEP its own guard, in:\n%s", out)
	}
}

// TestValidateModule_UnionMixedArrayObjectGuardOnce — an array member is
// object-like too, but has no strippable typeof prefix (it uses Array.isArray).
// The object arm is deduped; the array arm is untouched.
func TestValidateModule_UnionMixedArrayObjectGuardOnce(t *testing.T) {
	obj := &protocol.RunType{ID: "obM", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{
		prop("pA", "a", false, &protocol.RunType{ID: "s", Kind: protocol.KindString}),
	}}
	arr := &protocol.RunType{ID: "arrM", Kind: protocol.KindArray, Child: &protocol.RunType{ID: "n", Kind: protocol.KindNumber}}
	un := &protocol.RunType{ID: "un6", Kind: protocol.KindUnion, Children: []*protocol.RunType{obj, arr}}
	out := renderToString(t, protocol.Dump{RunTypes: []*protocol.RunType{un}})
	if n := strings.Count(out, "typeof v === 'object' && v !== null"); n != 1 {
		t.Errorf("mixed array+object union must share ONE object guard, got %d in:\n%s", n, out)
	}
	if !strings.Contains(out, "Array.isArray") {
		t.Errorf("array arm must keep its own Array.isArray path, in:\n%s", out)
	}
}

// TestValidateModule_UnionObjectGuard_ParentNotChildren pins the guard's
// POSITION, not just its count: the shared `typeof===object` guard must live at
// the UNION (parent) level, wrapping the object OR-chain, and must NOT be
// repeated inside any child arm. This catches a regression the plain count==1
// tests miss on their own — if the parent guard were dropped but a single child
// kept its own guard, the total count would still be 1. Here we assert BOTH that
// the parent guard wraps the chain (`guard && (`) AND that it occurs exactly
// once (so no child repeats it).
func TestValidateModule_UnionObjectGuard_ParentNotChildren(t *testing.T) {
	// string | {a: string} | {b: number} — two object members, so the shared
	// parent guard is genuinely load-bearing (each child would otherwise need
	// its own).
	objA := &protocol.RunType{ID: "ogA", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{
		prop("pA", "a", false, &protocol.RunType{ID: "s", Kind: protocol.KindString}),
	}}
	objB := &protocol.RunType{ID: "ogB", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{
		prop("pB", "b", false, &protocol.RunType{ID: "n", Kind: protocol.KindNumber}),
	}}
	un := &protocol.RunType{ID: "unG", Kind: protocol.KindUnion, Children: []*protocol.RunType{
		{ID: "s0", Kind: protocol.KindString}, objA, objB,
	}}
	out := renderToString(t, protocol.Dump{RunTypes: []*protocol.RunType{un}})
	guard := "typeof v === 'object' && v !== null"

	// Parent-level: the shared guard wraps the object OR-chain, i.e. it is
	// immediately followed by ` && (`. Removing the parent guard deletes this
	// exact substring, so the test fails loudly.
	if !strings.Contains(out, guard+" && (") {
		t.Errorf("shared object guard must sit at the union (parent) level wrapping the OR-chain, got:\n%s", out)
	}
	// Children: exactly one guard total, so the sole occurrence is the parent's
	// and no child arm repeats it. Re-introducing a per-arm guard makes this 2.
	if n := strings.Count(out, guard); n != 1 {
		t.Errorf("object guard must appear exactly once (parent only, none in children), got %d in:\n%s", n, out)
	}
	// Belt-and-suspenders: the object OR-chain the parent guard wraps (everything
	// after `guard && (`) is itself guard-free — no child arm carries a typeof
	// object check of its own.
	chain := out[strings.Index(out, guard+" && (")+len(guard+" && ("):]
	if strings.Contains(chain, "typeof v === 'object'") {
		t.Errorf("child object arms must be guard-free (the guard belongs to the parent union), chain was:\n%s", chain)
	}
}

func TestValidateModule_UnsupportedKindSkipped(t *testing.T) {
	// KindIntersection stays unsupported — intersections resolve
	// at compile time into ObjectLiteral / Never, so the emitter never
	// renders an Intersection factory. KindUnion with no children also
	// degenerates to unsupported. The renderer must skip both
	// silently rather than panic so kind-by-kind rollout is possible.
	dump := protocol.Dump{
		RunTypes: []*protocol.RunType{
			{ID: "u1", Kind: protocol.KindUnion}, // no children → unsupported
			{ID: "x1", Kind: protocol.KindIntersection},
			{ID: "s1", Kind: protocol.KindString},
		},
	}
	out := renderToString(t, dump)
	if strings.Contains(out, "'"+valKey("u1")+"'") {
		t.Error("empty KindUnion should be skipped (unsupported), but u1 was rendered")
	}
	if strings.Contains(out, "'"+valKey("x1")+"'") {
		t.Error("KindIntersection should be skipped (unsupported), but x1 was rendered")
	}
	if !strings.Contains(out, "init('"+valKey("s1")+"',") {
		t.Errorf("KindString should be rendered as factory call, got:\n%s", out)
	}
}

// TestValidateModule_CodeNSPropagation covers the bubble-up semantics
// the renderer relies on now that the per-entry `subtreeFullySupported`
// pre-walk is gone. Each row asserts that an unsupported leaf
// somewhere in the subtree causes the top-level factory to be silently
// skipped (no panic, no malformed code), while sibling supported
// entries in the same dump still render normally.
func TestValidateModule_CodeNSPropagation(t *testing.T) {
	stringRT := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	// KindIntersection is unsupported at the leaf — used here as a
	// stand-in for "any future kind without an emit". We could equally
	// well synthesize a brand-new ReflectionKind value; KindIntersection
	// has the advantage of being a real cache shape today.
	unsupportedLeaf := &protocol.RunType{ID: "uns", Kind: protocol.KindIntersection}

	t.Run("array_of_unsupported_skipped", func(t *testing.T) {
		arr := &protocol.RunType{
			ID:    "ar1",
			Kind:  protocol.KindArray,
			Child: &protocol.RunType{ID: "uns", Kind: protocol.KindRef},
		}
		dump := protocol.Dump{RunTypes: []*protocol.RunType{arr, unsupportedLeaf, stringRT}}
		out := renderToString(t, dump)
		if strings.Contains(out, "init('"+valKey("ar1")+"',") {
			t.Errorf("array with unsupported child must be skipped, got:\n%s", out)
		}
		if !strings.Contains(out, "init('"+valKey("str")+"',") {
			t.Errorf("supported sibling must still render, got:\n%s", out)
		}
	})

	t.Run("object_with_one_unsupported_prop_renders_without_it", func(t *testing.T) {
		// v2: property positions ABSORB unsupported children rather than
		// propagating CodeNS to root. The object's emit drops the unsupported
		// property from its AND chain and still renders for the supported
		// siblings.
		propUns := &protocol.RunType{
			ID:         "pU",
			Kind:       protocol.KindPropertySignature,
			Name:       "u",
			IsSafeName: true,
			Child:      &protocol.RunType{ID: "uns", Kind: protocol.KindRef},
		}
		propOk := &protocol.RunType{
			ID:         "pO",
			Kind:       protocol.KindPropertySignature,
			Name:       "o",
			IsSafeName: true,
			Child:      &protocol.RunType{ID: "str", Kind: protocol.KindRef},
		}
		iface := &protocol.RunType{
			ID:   "if1",
			Kind: protocol.KindObjectLiteral,
			Children: []*protocol.RunType{
				{ID: "pU", Kind: protocol.KindRef},
				{ID: "pO", Kind: protocol.KindRef},
			},
		}
		dump := protocol.Dump{RunTypes: []*protocol.RunType{iface, propUns, propOk, unsupportedLeaf, stringRT}}
		out := renderToString(t, dump)
		if !strings.Contains(out, "init('"+valKey("if1")+"',") {
			t.Errorf("object with one unsupported property must still render (absorption), got:\n%s", out)
		}
		// The body must NOT reference the dropped property's accessor.
		if strings.Contains(out, "v.u") {
			t.Errorf("rendered body should not reference dropped property 'u', got:\n%s", out)
		}
		// The supported sibling's accessor must be present.
		if !strings.Contains(out, "v.o") {
			t.Errorf("rendered body should reference surviving property 'o', got:\n%s", out)
		}
	})

	t.Run("union_with_one_unsupported_member_skipped", func(t *testing.T) {
		un := &protocol.RunType{
			ID:   "un1",
			Kind: protocol.KindUnion,
			Children: []*protocol.RunType{
				{ID: "str", Kind: protocol.KindRef},
				{ID: "uns", Kind: protocol.KindRef},
			},
		}
		dump := protocol.Dump{RunTypes: []*protocol.RunType{un, unsupportedLeaf, stringRT}}
		out := renderToString(t, dump)
		if strings.Contains(out, "init('"+valKey("un1")+"',") {
			t.Errorf("union with one unsupported member must be skipped, got:\n%s", out)
		}
	})

	t.Run("nested_array_of_unsupported_skipped", func(t *testing.T) {
		// Outer Array[Array[Unsupported]] — the inner array's child
		// returns CodeNS; inner array propagates; outer array
		// propagates. Net effect: both inner and outer factories
		// silently absent from the rendered module.
		innerArr := &protocol.RunType{
			ID:    "ai",
			Kind:  protocol.KindArray,
			Child: &protocol.RunType{ID: "uns", Kind: protocol.KindRef},
		}
		outerArr := &protocol.RunType{
			ID:    "ao",
			Kind:  protocol.KindArray,
			Child: &protocol.RunType{ID: "ai", Kind: protocol.KindRef},
		}
		dump := protocol.Dump{RunTypes: []*protocol.RunType{outerArr, innerArr, unsupportedLeaf}}
		out := renderToString(t, dump)
		if strings.Contains(out, "init('"+valKey("ao")+"',") {
			t.Errorf("outer array of unsupported must be skipped, got:\n%s", out)
		}
		if strings.Contains(out, "init('"+valKey("ai")+"',") {
			t.Errorf("inner array of unsupported must be skipped, got:\n%s", out)
		}
	})

	t.Run("plain_user_class_with_nonserializable_subkind_throws", func(t *testing.T) {
		// alwaysThrow init() carries the fully rendered VL001 message as its
		// final slot (rendered here in Go at build time, not resolved
		// JS-side).
		ns := &protocol.RunType{ID: "ns1", Kind: protocol.KindClass, SubKind: protocol.SubKindNonSerializable}
		dump := protocol.Dump{RunTypes: []*protocol.RunType{ns, stringRT}}
		out := renderToString(t, dump)
		wantThrow := quoteJS(buildAlwaysThrowMessage("VL001", "NonSerializableClass", nil))
		if !strings.Contains(out, "init('"+valKey("ns1")+"','class',,,,,,"+wantThrow+")") {
			t.Errorf("KindClass+SubKindNonSerializable must emit an alwaysThrow init with the VL001 message, got:\n%s", out)
		}
		// The message rides as a plain string slot, not an embedded throw body.
		if strings.Contains(out, "throw new Error(") {
			t.Errorf("wire format should not embed throw-body strings, got:\n%s", out)
		}
		if !strings.Contains(out, "init('"+valKey("str")+"',") {
			t.Errorf("supported sibling must still render, got:\n%s", out)
		}
	})
}

func TestValidateModule_NilRunTypeSkipped(t *testing.T) {
	dump := protocol.Dump{
		RunTypes: []*protocol.RunType{
			nil,
			{ID: "s1", Kind: protocol.KindString},
			nil,
		},
	}
	out := renderToString(t, dump)
	if !strings.Contains(out, "init('"+valKey("s1")+"',") {
		t.Error("nil entries should be skipped without affecting the real one")
	}
}

func TestValidateModule_DeterministicOutput(t *testing.T) {
	dump := protocol.Dump{
		RunTypes: []*protocol.RunType{
			{ID: "a", Kind: protocol.KindString},
			{ID: "b", Kind: protocol.KindString},
		},
	}
	first := renderToString(t, dump)
	second := renderToString(t, dump)
	if first != second {
		t.Errorf("rendered output is non-deterministic:\nfirst:\n%s\nsecond:\n%s", first, second)
	}
}

func TestValidateModule_TypeNameUsesDeclaredOverride(t *testing.T) {
	dump := protocol.Dump{
		RunTypes: []*protocol.RunType{
			{ID: "x", Kind: protocol.KindString, TypeName: "MyBrandedString"},
		},
	}
	out := renderToString(t, dump)
	if !strings.Contains(out, "'MyBrandedString'") {
		t.Errorf("expected declared TypeName to land as the J typeName arg, got:\n%s", out)
	}
}

func TestQuoteJS_EscapesSpecialChars(t *testing.T) {
	cases := map[string]string{
		"hello":       "'hello'",
		"with'quote":  `'with\'quote'`,
		"back\\slash": `'back\\slash'`,
		"new\nline":   `'new\nline'`,
		"tab\there":   `'tab\there'`,
	}
	for in, want := range cases {
		if got := quoteJS(in); got != want {
			t.Errorf("quoteJS(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestStringSliceJS_EmptyAndPopulated(t *testing.T) {
	if got := stringSliceJS(nil); got != "[]" {
		t.Errorf("nil → %q, want []", got)
	}
	if got := stringSliceJS([]string{}); got != "[]" {
		t.Errorf("empty → %q, want []", got)
	}
	if got := stringSliceJS([]string{"a", "b"}); got != "['a','b']" {
		t.Errorf("two → %q, want ['a','b']", got)
	}
}

func TestPureFnDepsJS_EmptyAndPopulated(t *testing.T) {
	if got := pureFnDepsJS(nil); got != "[]" {
		t.Errorf("nil → %q, want []", got)
	}
	if got := pureFnDepsJS([]protocol.PureFnDep{}); got != "[]" {
		t.Errorf("empty → %q, want []", got)
	}
	// Every dep is fully quoted — per-entry tuples evaluate in their own
	// module scope, so the legacy skeleton `k_<alias>` identifier shortcut
	// is gone (aliases only shorten context-var NAMES inside bodies now).
	deps := []protocol.PureFnDep{
		{Namespace: "rt", FunctionName: "asJSONString", FilePath: "/abs/run-types-pure-fns.ts"},
		{Namespace: "rt", FunctionName: "newRunTypeErr", FilePath: "/abs/run-types-pure-fns.ts"},
	}
	want := "['rt::asJSONString','rt::newRunTypeErr']"
	if got := pureFnDepsJS(deps); got != want {
		t.Errorf("populated → %q, want %q", got, want)
	}
}

func TestValidateModule_PureFnDepsRendered(t *testing.T) {
	deps := pureFnDepsJS([]protocol.PureFnDep{
		{Namespace: "rt", FunctionName: "asJSONString", FilePath: "/some/abs/run-types-pure-fns.ts"},
	})
	if deps != "['rt::asJSONString']" {
		t.Fatalf("projection mismatch: got %q", deps)
	}
	if strings.Contains(deps, "/some/abs/") || strings.Contains(deps, "filePath") {
		t.Fatalf("filePath must NOT leak into emitted JS, got %q", deps)
	}
}

// ---------------------------------------------------------------------------
// Inlining name rule (default mode) + allInternal. Default: UNNAMED
// compounds inline into their parents (blocks hoist to context fns); NAMED
// types and circular types stay external. allInternal: everything except
// circular inlines, names ignored. Walker-level coverage: the dump here has
// no Sites, so every node still renders as its own root — the assertions
// target the PARENT body shape (inline vs dep call). The entry-set drop is
// covered at the resolver layer (inlinemode_test.go).
// ---------------------------------------------------------------------------

func renderAllInternal(t *testing.T, dump protocol.Dump) string {
	t.Helper()
	return joinEntries(t, FamilyByKey("validate").Collect(dump, RenderOpts{EmitMode: "both", InlineMode: constants.InlineModeAllInternal}, nil))
}

// DEFAULT mode: an unnamed inner array inlines — the outer body absorbs the
// element loop as a context fn; no getRT lookup, no dep call.
func TestValidateModule_Default_UnnamedArrayInlines(t *testing.T) {
	outer := &protocol.RunType{
		ID:    "out",
		Kind:  protocol.KindArray,
		Child: &protocol.RunType{ID: "inn", Kind: protocol.KindArray, Child: &protocol.RunType{ID: "str", Kind: protocol.KindString}},
	}
	out := renderToString(t, protocol.Dump{RunTypes: []*protocol.RunType{outer}})
	if strings.Contains(out, "utl.getRT('"+valKey("inn")+"')") {
		t.Errorf("unnamed inner array must inline, not register a getRT lookup:\n%s", out)
	}
	if strings.Contains(out, valKey("inn")+".fn(") {
		t.Errorf("unnamed inner array must inline, not emit a dep call:\n%s", out)
	}
	if !strings.Contains(out, "ctxFn0(v,i0)") {
		t.Errorf("inner loop should hoist to a context fn called with the loop counter:\n%s", out)
	}
	if !strings.Contains(out, "'"+valKey("out")+"','array',") {
		t.Fatalf("outer factory missing:\n%s", out)
	}
}

// allInternal is name-BLIND: even a named alias array inlines.
func TestValidateModule_AllInternal_NamedArrayInlines(t *testing.T) {
	inner := &protocol.RunType{
		ID:       "inn",
		Kind:     protocol.KindArray,
		TypeName: "Tags",
		Child:    &protocol.RunType{ID: "str", Kind: protocol.KindString},
	}
	outer := &protocol.RunType{
		ID:    "out",
		Kind:  protocol.KindArray,
		Child: &protocol.RunType{ID: "inn", Kind: protocol.KindArray, TypeName: "Tags", Child: &protocol.RunType{ID: "str", Kind: protocol.KindString}},
	}
	out := renderAllInternal(t, protocol.Dump{RunTypes: []*protocol.RunType{outer, inner}})
	if strings.Contains(out, valKey("inn")+".fn(") {
		t.Errorf("allInternal must inline even named arrays, got a dep call:\n%s", out)
	}
	if !strings.Contains(out, "ctxFn0(v,i0)") {
		t.Errorf("named inner loop should still hoist to a context fn:\n%s", out)
	}
}

// A circular compound stays external even when unnamed — IsCircular is
// checked before the allInternal arm (self-invocation requires an entry).
func TestValidateModule_AllInternal_CircularStaysExternal(t *testing.T) {
	node := &protocol.RunType{
		ID:         "nod",
		Kind:       protocol.KindObjectLiteral,
		IsCircular: true,
	}
	node.Children = []*protocol.RunType{{
		ID: "prp", Kind: protocol.KindProperty, Name: "next", IsSafeName: true, Optional: true,
		Child: node,
	}}
	out := renderAllInternal(t, protocol.Dump{RunTypes: []*protocol.RunType{node}})
	// The self-reference compiles as a direct self call of the inner fn —
	// the external-path mechanics for circulars — never an inline expansion.
	if !strings.Contains(out, valKey("nod")+"(v.next)") {
		t.Errorf("circular self-reference must stay a (self) dependency call, got:\n%s", out)
	}
}
