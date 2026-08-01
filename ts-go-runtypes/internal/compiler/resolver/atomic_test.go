package resolver_test

import (
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/cachegen/operations"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// filterDiagsByFamily returns the subset of diags belonging to the given
// family. Test helper for asserting on per-family diagnostic counts.
func filterDiagsByFamily(diags []diagnostics.Diagnostic, family diagnostics.Family) []diagnostics.Diagnostic {
	var out []diagnostics.Diagnostic
	for _, d := range diags {
		if d.Family == family {
			out = append(out, d)
		}
	}
	return out
}

// atomicFixturesDir is a separate test-fixtures tree so the per-atomic
// tests are isolated from the broader F1–F16 suite. Retained for the
// two file-loading regression tests (TestAtomic_String_*).
func atomicFixturesDir(t *testing.T) string {
	t.Helper()
	abs, err := filepath.Abs("../../testfixtures/atomic")
	if err != nil {
		t.Fatalf("abs: %v", err)
	}
	return abs
}

func atomicSetup(t *testing.T) *resolver.Session {
	t.Helper()
	p, err := program.New(program.Options{
		Cwd:            atomicFixturesDir(t),
		TsconfigPath:   "tsconfig.json",
		SingleThreaded: true,
	})
	if err != nil {
		t.Fatalf("program.New: %v", err)
	}
	r, err := resolver.New(p, resolver.Options{})
	if err != nil {
		t.Fatalf("resolver.New: %v", err)
	}
	t.Cleanup(r.Close)
	return r
}

// atomicResolve runs scanFiles on a fixture and returns the RunType entry for
// its first (and only) call site.
func atomicResolve(t *testing.T, r *resolver.Session, file string) *protocol.RunType {
	t.Helper()
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{file}})
	if resp.Error != "" {
		t.Fatalf("scanFiles %s: %s", file, resp.Error)
	}
	if len(resp.Sites) == 0 {
		t.Fatalf("scanFiles %s returned no sites", file)
	}
	id := resp.Sites[0].ID
	dump := r.Dispatch(protocol.Request{Op: protocol.OpDump}).RunTypes
	for _, n := range dump {
		if n.ID == id {
			return n
		}
	}
	t.Fatalf("type %q not found in dump for %s", id, file)
	return nil
}

// hashIDPattern is the regex hash ids are expected to satisfy: starts with a
// letter, then alphanumerics, default length 6.
var hashIDPattern = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_]{2,15}$`)

func assertHashID(t *testing.T, id string) {
	t.Helper()
	if !hashIDPattern.MatchString(id) {
		t.Fatalf("id %q does not look like a hash id", id)
	}
}

// =========================================================================
// Primitive kinds — id is just the kind number, no payload.
//
// Per the marker test coverage rule (CLAUDE.md), every scenario gets two
// paired tests: a *_Static using `getRunTypeId<T>()` and a *_Reflect using
// `getRunTypeId(v)`. Both must resolve to the same atomic Kind; the
// hash equivalence between the two forms is asserted by TestAtomic_String
// (file-based) and TestAtomic_FormEquivalence below.
// =========================================================================

// TestAtomic_String_* are kept file-based as the regression tests that
// exercise the on-disk tsconfig + osvfs path. Both forms share a Kind and
// a hash because both resolve to the same `string` primitive type.
func TestAtomic_String_Static(t *testing.T) {
	tn := atomicResolve(t, atomicSetup(t), "string_static.ts")
	if tn.Kind != protocol.KindString {
		t.Fatalf("expected KindString, got %d", tn.Kind)
	}
	assertHashID(t, tn.ID)
}

func TestAtomic_String_Reflect(t *testing.T) {
	tn := atomicResolve(t, atomicSetup(t), "string.ts")
	if tn.Kind != protocol.KindString {
		t.Fatalf("expected KindString, got %d", tn.Kind)
	}
	assertHashID(t, tn.ID)
}

func TestAtomic_Number_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<number>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindNumber {
		t.Fatalf("expected KindNumber, got %d", tn.Kind)
	}
}

func TestAtomic_Number_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
const v: number = 42;
getRunTypeId(v);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindNumber {
		t.Fatalf("expected KindNumber, got %d", tn.Kind)
	}
}

func TestAtomic_Boolean_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<boolean>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindBoolean {
		t.Fatalf("expected KindBoolean, got %d", tn.Kind)
	}
}

func TestAtomic_Boolean_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
declare const v: boolean;
getRunTypeId(v);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindBoolean {
		t.Fatalf("expected KindBoolean, got %d", tn.Kind)
	}
}

func TestAtomic_BigInt_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<bigint>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindBigInt {
		t.Fatalf("expected KindBigInt, got %d", tn.Kind)
	}
}

func TestAtomic_BigInt_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
const v: bigint = 1n;
getRunTypeId(v);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindBigInt {
		t.Fatalf("expected KindBigInt, got %d", tn.Kind)
	}
}

func TestAtomic_Symbol_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<symbol>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindSymbol {
		t.Fatalf("expected KindSymbol, got %d", tn.Kind)
	}
}

func TestAtomic_Symbol_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
const v: symbol = Symbol('x');
getRunTypeId(v);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindSymbol {
		t.Fatalf("expected KindSymbol, got %d", tn.Kind)
	}
}

func TestAtomic_Null_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<null>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindNull {
		t.Fatalf("expected KindNull, got %d", tn.Kind)
	}
}

func TestAtomic_Null_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
const v: null = null;
getRunTypeId(v);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindNull {
		t.Fatalf("expected KindNull, got %d", tn.Kind)
	}
}

func TestAtomic_Undefined_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<undefined>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindUndefined {
		t.Fatalf("expected KindUndefined, got %d", tn.Kind)
	}
}

func TestAtomic_Undefined_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
const v: undefined = undefined;
getRunTypeId(v);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindUndefined {
		t.Fatalf("expected KindUndefined, got %d", tn.Kind)
	}
}

func TestAtomic_Void_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<void>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindVoid {
		t.Fatalf("expected KindVoid, got %d", tn.Kind)
	}
}

func TestAtomic_Void_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
declare const v: void;
getRunTypeId(v);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindVoid {
		t.Fatalf("expected KindVoid, got %d", tn.Kind)
	}
}

func TestAtomic_Any_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<any>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindAny {
		t.Fatalf("expected KindAny, got %d", tn.Kind)
	}
}

func TestAtomic_Any_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
const v: any = 1;
getRunTypeId(v);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindAny {
		t.Fatalf("expected KindAny, got %d", tn.Kind)
	}
}

func TestAtomic_Unknown_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<unknown>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindUnknown {
		t.Fatalf("expected KindUnknown, got %d", tn.Kind)
	}
}

func TestAtomic_Unknown_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
const v: unknown = 1;
getRunTypeId(v);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindUnknown {
		t.Fatalf("expected KindUnknown, got %d", tn.Kind)
	}
}

func TestAtomic_Never_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<never>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindNever {
		t.Fatalf("expected KindNever, got %d", tn.Kind)
	}
}

func TestAtomic_Never_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
declare const v: never;
getRunTypeId(v);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindNever {
		t.Fatalf("expected KindNever, got %d", tn.Kind)
	}
}

func TestAtomic_Object_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<object>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindObject {
		t.Fatalf("expected KindObject, got %d", tn.Kind)
	}
}

func TestAtomic_Object_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
const v: object = {};
getRunTypeId(v);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindObject {
		t.Fatalf("expected KindObject, got %d", tn.Kind)
	}
}

// =========================================================================
// Regexp — two reflection outcomes:
//
//   KindRegexp (instance type, kind 12) — produced when the resolver cannot
//   trace the call to a regex-literal source. Examples: an explicit `RegExp`
//   type, a `declare const`, a `let`-bound regex.
//
//   KindLiteral{regexp: {source, flags}} (literal kind 13) — produced when the
//   resolver traces the call to a regex-literal source. Renders at runtime as
//   `/abc/i`. Triggered by inline regex literals, `as const`
//   wraps, and (transitively) `const`-binding chains reachable via `typeof`
//   in static form or via direct identifier reference in reflect form.
// =========================================================================

func TestAtomic_Regexp_Static_RegExpType(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<RegExp>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindRegexp {
		t.Fatalf("expected KindRegexp, got %d", tn.Kind)
	}
	if tn.ClassRef == nil || tn.ClassRef.Builtin != "RegExp" {
		t.Fatalf("expected ClassRef.Builtin=RegExp, got %+v", tn.ClassRef)
	}
}

func TestAtomic_Regexp_Reflect_DeclareConst(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
declare const re: RegExp;
getRunTypeId(re);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindRegexp {
		t.Fatalf("expected KindRegexp, got %d", tn.Kind)
	}
}

// RegExp has no literal type in TS, so the regexp-literal feature was removed:
// `typeof /abc/i`, `typeof /xyz/`, and `RegExp` are the SAME type and now resolve
// to the SAME KindRegexp id (id ≡ f(T)). Paired reflection + static forms per the
// marker-coverage rule.
func TestAtomic_Regexp_LiteralConvergesWithAnyRegExp(t *testing.T) {
	r := setupInline(t, map[string]string{
		"reflectAbc.ts": `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId(/abc/i);
`,
		"staticAbc.ts": `import {getRunTypeId} from '@ts-runtypes/core';
const re = /abc/i;
getRunTypeId<typeof re>();
`,
		"staticXyz.ts": `import {getRunTypeId} from '@ts-runtypes/core';
const re = /xyz/;
getRunTypeId<typeof re>();
`,
		"staticRegExp.ts": `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<RegExp>();
`,
	})
	reflectAbc := resolveFile(t, r, "reflectAbc.ts")
	staticAbc := resolveFile(t, r, "staticAbc.ts")
	staticXyz := resolveFile(t, r, "staticXyz.ts")
	staticRegExp := resolveFile(t, r, "staticRegExp.ts")
	if reflectAbc.Kind != protocol.KindRegexp {
		t.Fatalf("expected getRunTypeId(/abc/i) → KindRegexp, got %d", reflectAbc.Kind)
	}
	if staticAbc.ID != staticRegExp.ID || staticXyz.ID != staticRegExp.ID || reflectAbc.ID != staticRegExp.ID {
		t.Fatalf("regexp ids must converge to RegExp: reflect(/abc/i)=%q static(typeof /abc/i)=%q static(typeof /xyz/)=%q static(RegExp)=%q",
			reflectAbc.ID, staticAbc.ID, staticXyz.ID, staticRegExp.ID)
	}
}

// =========================================================================
// Literal kinds — kind 13 + literal payload.
// =========================================================================

func TestAtomic_LiteralString_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<'hello'>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindLiteral {
		t.Fatalf("expected KindLiteral, got %d", tn.Kind)
	}
	if tn.Literal != "hello" {
		t.Fatalf("expected literal=\"hello\", got %v (%T)", tn.Literal, tn.Literal)
	}
}

// `as const` preserves the literal at the generic call site.
func TestAtomic_LiteralString_Reflect_AsConst(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
const v = 'hello' as const;
getRunTypeId(v);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindLiteral {
		t.Fatalf("expected KindLiteral, got %d", tn.Kind)
	}
	if tn.Literal != "hello" {
		t.Fatalf("expected literal=\"hello\", got %v (%T)", tn.Literal, tn.Literal)
	}
}

// Plain `const` — TS widens the literal type during generic inference.
func TestAtomic_LiteralString_Reflect_PlainConst(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
const v = 'hello';
getRunTypeId(v);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindString {
		t.Fatalf("expected KindString (widened), got %d", tn.Kind)
	}
}

func assertLiteralNumber42(t *testing.T, tn *protocol.RunType) {
	t.Helper()
	if tn.Kind != protocol.KindLiteral {
		t.Fatalf("expected KindLiteral, got %d", tn.Kind)
	}
	switch v := tn.Literal.(type) {
	case int64:
		if v != 42 {
			t.Fatalf("expected 42, got %d", v)
		}
	case float64:
		if v != 42 {
			t.Fatalf("expected 42, got %v", v)
		}
	default:
		t.Fatalf("expected numeric literal, got %v (%T)", tn.Literal, tn.Literal)
	}
}

func TestAtomic_LiteralNumber_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<42>();
`
	_, tn := resolveInline(t, code)
	assertLiteralNumber42(t, tn)
}

func TestAtomic_LiteralNumber_Reflect_AsConst(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
const v = 42 as const;
getRunTypeId(v);
`
	_, tn := resolveInline(t, code)
	assertLiteralNumber42(t, tn)
}

func TestAtomic_LiteralNumber_Reflect_PlainConst(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
const v = 42;
getRunTypeId(v);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindNumber {
		t.Fatalf("expected KindNumber (widened), got %d", tn.Kind)
	}
}

func TestAtomic_LiteralBoolean_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<true>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindLiteral {
		t.Fatalf("expected KindLiteral, got %d", tn.Kind)
	}
	if v, ok := tn.Literal.(bool); !ok || v != true {
		t.Fatalf("expected literal=true, got %v (%T)", tn.Literal, tn.Literal)
	}
}

func TestAtomic_LiteralBoolean_Reflect_AsConst(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
const v = true as const;
getRunTypeId(v);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindLiteral {
		t.Fatalf("expected KindLiteral, got %d", tn.Kind)
	}
	if v, ok := tn.Literal.(bool); !ok || v != true {
		t.Fatalf("expected literal=true, got %v (%T)", tn.Literal, tn.Literal)
	}
}

func TestAtomic_LiteralBoolean_Reflect_PlainConst(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
const v = true;
getRunTypeId(v);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindBoolean {
		t.Fatalf("expected KindBoolean (widened), got %d", tn.Kind)
	}
}

func TestAtomic_LiteralBigInt_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<1n>();
`
	_, tn := resolveInline(t, code)
	assertBigintLiteral(t, tn)
}

func TestAtomic_LiteralBigInt_Reflect_AsConst(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
const v = 1n as const;
getRunTypeId(v);
`
	_, tn := resolveInline(t, code)
	assertBigintLiteral(t, tn)
}

func TestAtomic_LiteralBigInt_Reflect_PlainConst(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
const v = 1n;
getRunTypeId(v);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindBigInt {
		t.Fatalf("expected KindBigInt (widened), got %d", tn.Kind)
	}
}

func assertBigintLiteral(t *testing.T, tn *protocol.RunType) {
	t.Helper()
	if tn.Kind != protocol.KindLiteral {
		t.Fatalf("expected KindLiteral, got %d", tn.Kind)
	}
	hasBigintFlag := false
	for _, f := range tn.Flags {
		if f == "bigint" {
			hasBigintFlag = true
		}
	}
	if !hasBigintFlag {
		t.Fatalf("expected flags to include 'bigint', got %v", tn.Flags)
	}
}

// LiteralSymbol only has the reflect form: there is no syntax to spell a
// unique-symbol literal in a type-argument position without first naming
// it via `typeof`, which itself requires a value binding to point at.
func TestAtomic_LiteralSymbol_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
const sym: unique symbol = Symbol('hello');
getRunTypeId(sym);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindLiteral {
		t.Fatalf("expected KindLiteral, got %d", tn.Kind)
	}
	hasSymbolFlag := false
	for _, f := range tn.Flags {
		if f == "symbol" {
			hasSymbolFlag = true
		}
	}
	if !hasSymbolFlag {
		t.Fatalf("expected flags to include 'symbol', got %v", tn.Flags)
	}
	m, ok := tn.Literal.(map[string]any)
	if !ok {
		t.Fatalf("expected literal to be a map, got %T", tn.Literal)
	}
	// The reference validates symbol literals against the runtime `.description`
	// of the constructed symbol (literal.ts:103), so the resolver carries
	// the description argument from the `Symbol(<desc>)` call site —
	// NOT the binding name. For `const sym = Symbol('hello')` the
	// description is `'hello'`. Previously this field held the binding
	// identifier `'sym'` which produced RT code that never matched the
	// runtime symbol's actual description.
	if name, _ := m["symbol"].(string); name != "hello" {
		t.Fatalf("expected literal.symbol=hello (description argument), got %v", m["symbol"])
	}
}

func TestAtomic_LiteralSymbol_Static(t *testing.T) {
	// Static counterpart: spell the unique-symbol type via `typeof sym` in
	// the type argument position. The binding still has to exist.
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
const sym: unique symbol = Symbol('hello');
getRunTypeId<typeof sym>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindLiteral {
		t.Fatalf("expected KindLiteral, got %d", tn.Kind)
	}
	hasSymbolFlag := false
	for _, f := range tn.Flags {
		if f == "symbol" {
			hasSymbolFlag = true
		}
	}
	if !hasSymbolFlag {
		t.Fatalf("expected flags to include 'symbol', got %v", tn.Flags)
	}
}

// =========================================================================
// Enums — kind 22 with enum + values + indexType.
// =========================================================================

func TestAtomic_EnumNumeric_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
enum Color {
  Red = 0,
  Green = 1,
  Blue = 2,
}
getRunTypeId<Color>();
`
	assertEnumNumeric(t, code)
}

func TestAtomic_EnumNumeric_Reflect(t *testing.T) {
	// `const v = Color.Red` (no annotation) — declared type widens to the
	// parent enum `Color`. The counterintuitive trap `const v: Color = …`
	// would narrow to the literal `Color.Red` instead.
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
enum Color {
  Red = 0,
  Green = 1,
  Blue = 2,
}
const v = Color.Red;
getRunTypeId(v);
`
	assertEnumNumeric(t, code)
}

func assertEnumNumeric(t *testing.T, code string) {
	t.Helper()
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindEnum {
		t.Fatalf("expected KindEnum, got %d", tn.Kind)
	}
	if tn.TypeName != "Color" {
		t.Fatalf("expected typeName=Color, got %q", tn.TypeName)
	}
	if len(tn.EnumVal) != 3 {
		t.Fatalf("expected 3 members, got %d (%v)", len(tn.EnumVal), tn.EnumVal)
	}
	if tn.IndexT == nil || tn.IndexT.Kind != protocol.KindNumber {
		t.Fatalf("expected indexType=number, got %+v", tn.IndexT)
	}
}

func TestAtomic_EnumString_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
enum Color {
  Red = 'red',
  Green = 'green',
  Blue = 'blue',
}
getRunTypeId<Color>();
`
	assertEnumString(t, code)
}

func TestAtomic_EnumString_Reflect(t *testing.T) {
	// `const v = Color.Red` (no annotation) — see TestAtomic_EnumNumeric_Reflect.
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
enum Color {
  Red = 'red',
  Green = 'green',
  Blue = 'blue',
}
const v = Color.Red;
getRunTypeId(v);
`
	assertEnumString(t, code)
}

func assertEnumString(t *testing.T, code string) {
	t.Helper()
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindEnum {
		t.Fatalf("expected KindEnum, got %d", tn.Kind)
	}
	if len(tn.EnumVal) != 3 {
		t.Fatalf("expected 3 members, got %d", len(tn.EnumVal))
	}
	if v, ok := tn.EnumVal["Red"].(string); !ok || v != "red" {
		t.Fatalf("expected Red=\"red\", got %v", tn.EnumVal["Red"])
	}
	if tn.IndexT == nil || tn.IndexT.Kind != protocol.KindString {
		t.Fatalf("expected indexType=string, got %+v", tn.IndexT)
	}
}

// =========================================================================
// Date — class instance with ClassRef.Builtin="Date".
// =========================================================================

func TestAtomic_Date_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<Date>();
`
	assertDateType(t, code)
}

func TestAtomic_Date_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
const v: Date = new Date();
getRunTypeId(v);
`
	assertDateType(t, code)
}

func assertDateType(t *testing.T, code string) {
	t.Helper()
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindClass {
		t.Fatalf("expected KindClass, got %d", tn.Kind)
	}
	if tn.TypeName != "Date" {
		t.Fatalf("expected typeName=Date, got %q", tn.TypeName)
	}
	if tn.ClassRef == nil || tn.ClassRef.Builtin != "Date" {
		t.Fatalf("expected ClassRef.Builtin=Date, got %+v", tn.ClassRef)
	}
	if tn.SubKind != protocol.SubKindDate {
		t.Fatalf("expected SubKind=SubKindDate(%d), got %d", protocol.SubKindDate, tn.SubKind)
	}
}

// =========================================================================
// Map<K,V> — class instance with SubKindMap and synthetic
// mapKey/mapValue parameter wrappers on Arguments.
// =========================================================================

func TestAtomic_Map_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<Map<string, number>>();
`
	assertMapType(t, code)
}

func TestAtomic_Map_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
const v: Map<string, number> = new Map();
getRunTypeId(v);
`
	assertMapType(t, code)
}

func assertMapType(t *testing.T, code string) {
	t.Helper()
	r, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindClass {
		t.Fatalf("expected KindClass, got %d", tn.Kind)
	}
	if tn.TypeName != "Map" {
		t.Fatalf("expected typeName=Map, got %q", tn.TypeName)
	}
	if tn.ClassRef == nil || tn.ClassRef.Builtin != "Map" {
		t.Fatalf("expected ClassRef.Builtin=Map, got %+v", tn.ClassRef)
	}
	if tn.SubKind != protocol.SubKindMap {
		t.Fatalf("expected SubKind=SubKindMap(%d), got %d", protocol.SubKindMap, tn.SubKind)
	}
	if len(tn.Arguments) != 2 {
		t.Fatalf("expected 2 Arguments wrappers, got %d", len(tn.Arguments))
	}
	dump := r.Dispatch(protocol.Request{Op: protocol.OpDump}).RunTypes
	keyWrapper := lookupNode(dump, tn.Arguments[0].ID)
	valueWrapper := lookupNode(dump, tn.Arguments[1].ID)
	if keyWrapper == nil || keyWrapper.Kind != protocol.KindParameter || keyWrapper.SubKind != protocol.SubKindMapKey {
		t.Fatalf("expected key wrapper KindParameter+SubKindMapKey, got %+v", keyWrapper)
	}
	if valueWrapper == nil || valueWrapper.Kind != protocol.KindParameter || valueWrapper.SubKind != protocol.SubKindMapValue {
		t.Fatalf("expected value wrapper KindParameter+SubKindMapValue, got %+v", valueWrapper)
	}
}

// =========================================================================
// Set<T> — class instance with SubKindSet and a synthetic setItem
// parameter wrapper on Arguments.
// =========================================================================

func TestAtomic_Set_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<Set<string>>();
`
	assertSetType(t, code)
}

func TestAtomic_Set_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
const v: Set<string> = new Set();
getRunTypeId(v);
`
	assertSetType(t, code)
}

func assertSetType(t *testing.T, code string) {
	t.Helper()
	r, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindClass {
		t.Fatalf("expected KindClass, got %d", tn.Kind)
	}
	if tn.TypeName != "Set" {
		t.Fatalf("expected typeName=Set, got %q", tn.TypeName)
	}
	if tn.ClassRef == nil || tn.ClassRef.Builtin != "Set" {
		t.Fatalf("expected ClassRef.Builtin=Set, got %+v", tn.ClassRef)
	}
	if tn.SubKind != protocol.SubKindSet {
		t.Fatalf("expected SubKind=SubKindSet(%d), got %d", protocol.SubKindSet, tn.SubKind)
	}
	if len(tn.Arguments) != 1 {
		t.Fatalf("expected 1 Arguments wrapper, got %d", len(tn.Arguments))
	}
	dump := r.Dispatch(protocol.Request{Op: protocol.OpDump}).RunTypes
	itemWrapper := lookupNode(dump, tn.Arguments[0].ID)
	if itemWrapper == nil || itemWrapper.Kind != protocol.KindParameter || itemWrapper.SubKind != protocol.SubKindSetItem {
		t.Fatalf("expected item wrapper KindParameter+SubKindSetItem, got %+v", itemWrapper)
	}
}

// =========================================================================
// Non-serialisable global (Error) — class with SubKindNonSerializable.
// =========================================================================

func TestAtomic_NonSerializable_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<Error>();
`
	assertErrorType(t, code)
}

func TestAtomic_NonSerializable_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
const v: Error = new Error();
getRunTypeId(v);
`
	assertErrorType(t, code)
}

func assertErrorType(t *testing.T, code string) {
	t.Helper()
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindClass {
		t.Fatalf("expected KindClass, got %d", tn.Kind)
	}
	if tn.TypeName != "Error" {
		t.Fatalf("expected typeName=Error, got %q", tn.TypeName)
	}
	if tn.SubKind != protocol.SubKindNonSerializable {
		t.Fatalf("expected SubKind=SubKindNonSerializable(%d), got %d", protocol.SubKindNonSerializable, tn.SubKind)
	}
	if tn.ClassRef == nil || tn.ClassRef.Builtin != "Error" {
		t.Fatalf("expected ClassRef.Builtin=Error, got %+v", tn.ClassRef)
	}
}

func lookupNode(dump []*protocol.RunType, id string) *protocol.RunType {
	for _, node := range dump {
		if node.ID == id {
			return node
		}
	}
	return nil
}

// =========================================================================
// Structural dedup — two distinct snippets with the same atomic type share
// the same hash id; different shapes get different ids.
// =========================================================================

func TestAtomic_StructuralDedup(t *testing.T) {
	const widened = `import {getRunTypeId} from '@ts-runtypes/core';
const v: string = 'hello';
getRunTypeId(v);
`
	const literal = `import {getRunTypeId} from '@ts-runtypes/core';
const v: 'hello' = 'hello';
getRunTypeId(v);
`
	r := setupInline(t, map[string]string{
		"widened.ts": widened,
		"literal.ts": literal,
	})
	a := resolveFile(t, r, "widened.ts")
	b := resolveFile(t, r, "literal.ts")
	if a.ID == b.ID {
		t.Fatalf("expected different ids for string vs \"hello\" literal")
	}
	a2 := resolveFile(t, r, "widened.ts")
	if a.ID != a2.ID {
		t.Fatalf("expected stable id on re-resolve, got %q vs %q", a.ID, a2.ID)
	}
}

// TestAtomic_FormEquivalence proves the static and reflect forms collapse
// to the same cache entry for an equivalent `T`. This is the cross-form
// hash-equivalence assertion required by the marker test coverage rule.
func TestAtomic_FormEquivalence(t *testing.T) {
	const staticForm = `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<string>();
`
	const reflectForm = `import {getRunTypeId} from '@ts-runtypes/core';
const v: string = 'hello';
getRunTypeId(v);
`
	r := setupInline(t, map[string]string{
		"static.ts":  staticForm,
		"reflect.ts": reflectForm,
	})
	a := resolveFile(t, r, "static.ts")
	b := resolveFile(t, r, "reflect.ts")
	if a.ID != b.ID {
		t.Fatalf("expected same hash for static vs reflect form of `string`, got %q vs %q", a.ID, b.ID)
	}
}

// TestAtomic_EnumNumeric_FormEquivalence_Annotated pins the resolver's
// reflect-form annotation-honoring behavior. All three forms — annotated
// reflect (`const v: Color = Color.Red`), unannotated reflect
// (`const v = Color.Red`), and static `getRunTypeId<Color>()` — must
// produce the same hash, because the annotation walk inside scanCall reads
// the declared type when one is present. Regression check: before the
// annotation walk landed, the annotated-reflect form narrowed to the
// literal enum member and diverged from the other two.
func TestAtomic_EnumNumeric_FormEquivalence_Annotated(t *testing.T) {
	const annotatedReflect = `import {getRunTypeId} from '@ts-runtypes/core';
enum Color { Red = 0, Green = 1, Blue = 2 }
const v: Color = Color.Red;
getRunTypeId(v);
`
	const unannotatedReflect = `import {getRunTypeId} from '@ts-runtypes/core';
enum Color { Red = 0, Green = 1, Blue = 2 }
const v = Color.Red;
getRunTypeId(v);
`
	const staticForm = `import {getRunTypeId} from '@ts-runtypes/core';
enum Color { Red = 0, Green = 1, Blue = 2 }
getRunTypeId<Color>();
`
	r := setupInline(t, map[string]string{
		"annotated.ts":   annotatedReflect,
		"unannotated.ts": unannotatedReflect,
		"static.ts":      staticForm,
	})
	annotated := resolveFile(t, r, "annotated.ts")
	unannotated := resolveFile(t, r, "unannotated.ts")
	static := resolveFile(t, r, "static.ts")
	if annotated.ID != unannotated.ID {
		t.Fatalf("annotated vs unannotated reflect diverge: %q vs %q", annotated.ID, unannotated.ID)
	}
	if annotated.ID != static.ID {
		t.Fatalf("annotated reflect vs static diverge: %q vs %q", annotated.ID, static.ID)
	}
}

// TestResolver_FunctionCallArgDiagnostic pins the marker scanner's
// function-call-argument-in-reflect-form warning. The validator still
// works (T comes from the inferred return type), but the call expression
// argument is an anti-pattern: the function would be invoked at runtime
// purely to satisfy type inference, with side effects / exceptions /
// async work firing for nothing. The diagnostic nudges users toward
// `createValidateFn<ReturnType<typeof fn>>()`.
func TestResolver_FunctionCallArgDiagnostic(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
function makeUser(): {id: number} { return {id: 1}; }
getRunTypeId(makeUser());
`
	r := setupInline(t, map[string]string{"call.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	markerDiags := filterDiagsByFamily(resp.Diagnostics, diagnostics.FamilyMarker)
	if len(markerDiags) != 1 {
		t.Fatalf("expected 1 marker diagnostic, got %d (%+v)", len(markerDiags), markerDiags)
	}
	d := markerDiags[0]
	if d.Code != diagnostics.CodeMarkerFunctionCallArg {
		t.Fatalf("expected code %s, got %q", diagnostics.CodeMarkerFunctionCallArg, d.Code)
	}
	if d.Severity != diagnostics.SeverityWarning {
		t.Fatalf("expected severity warning (%d), got %d", diagnostics.SeverityWarning, d.Severity)
	}
	if len(d.Args) != 1 || d.Args[0] != "makeUser" {
		t.Fatalf("expected args=[makeUser], got %v", d.Args)
	}
	// Site still emitted so the validator works.
	if len(resp.Sites) != 1 {
		t.Fatalf("expected 1 site (validator still works), got %d", len(resp.Sites))
	}
}

// TestResolver_NoFunctionCallArgDiagnostic_ForIdentifier verifies the
// diagnostic is silent for the legitimate identifier-argument case.
func TestResolver_NoFunctionCallArgDiagnostic_ForIdentifier(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
const user: {id: number} = {id: 1};
getRunTypeId(user);
`
	r := setupInline(t, map[string]string{"id.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"id.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	markerDiags := filterDiagsByFamily(resp.Diagnostics, diagnostics.FamilyMarker)
	if len(markerDiags) != 0 {
		t.Fatalf("expected 0 marker diagnostics for identifier arg, got %d (%+v)", len(markerDiags), markerDiags)
	}
}

// TestResolver_EncoderOptionsShareTypeID pins the design contract:
// the encoder `strategy` is NOT folded into the runtype id. All
// strategy call sites against the same `T` must resolve to the SAME id
// (= tuple[0] = f(T)) — different encoder shapes share one canonical
// typeid. What differs is the injected `fnId` (= tuple[1] = the strategy
// token), which the demand pipeline expands to the cache families that
// strategy composes. The dispatch is now COMPTIME via the fnId, not a
// runtime family-prefix guess. Folding the strategy into the id would
// break the invariant that `getRunTypeId<T>()` and
// `createJsonEncoderFn<T>(undefined, {strategy: 'mutate'})` share one id.
func TestResolver_EncoderOptionsShareTypeID(t *testing.T) {
	const dts = `declare module '@ts-runtypes/core' {
  export type InjectTypeFnArgs<T, Fn extends string> = string & {readonly __rtInjectTypeFnArgsBrand?: T; readonly __rtInjectTypeFnArgsFn?: Fn};
  export type CompTimeArgs<T> = T & {readonly __rtCompTimeArgsBrand?: never};
  export type CompTimeFnArgs<T> = T & {readonly __rtCompTimeFnArgsBrand?: never};
  export type JsonEncoderOptions = {strategy?: 'clone' | 'mutate' | 'direct'};
  export function createJsonEncoderFn<T>(val?: T, options?: CompTimeFnArgs<JsonEncoderOptions>, id?: InjectTypeFnArgs<T, 'jsonEncoder'>): (v: unknown) => string | undefined;
}
`
	const code = `import {createJsonEncoderFn} from '@ts-runtypes/core';
createJsonEncoderFn<string>();
createJsonEncoderFn<string>(undefined, {strategy: 'mutate'});
createJsonEncoderFn<string>(undefined, {strategy: 'direct'});
`
	r := setupInline(t, map[string]string{"runtypes.d.ts": dts, "call.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	if len(resp.Sites) != 3 {
		t.Fatalf("expected 3 sites, got %d", len(resp.Sites))
	}
	ids := map[string]int{}
	fnIDs := map[string]bool{}
	for i, site := range resp.Sites {
		if site.ID == "" {
			t.Fatalf("site %d has empty id", i)
		}
		ids[site.ID]++
		fnIDs[site.FnId] = true
	}
	// The id (tuple[0]) is f(T) and shared across all three strategy shapes.
	if len(ids) != 1 {
		t.Fatalf("expected 1 shared id across the three encoder shapes, got %d distinct ids (%+v)", len(ids), ids)
	}
	// The fnId (tuple[1]) is now the opaque COMPOSITE fnHash the scanner
	// computes per (jsonEncoder, strategy) — the no-options call defaults to
	// clone, the others carry their literal strategy. Assert equality to
	// operations.FnHashFor (NOT a hardcoded hash) so the test stays correct
	// across version-isolated hashes.
	encoderOp, _ := operations.ByName("jsonEncoder")
	for _, strategy := range []string{"clone", "mutate", "direct"} {
		want := operations.FnHashFor(encoderOp, nil, strategy, false)
		if !fnIDs[want] {
			t.Errorf("expected a site with fnId %q (jsonEncoder/%s), got %v", want, strategy, fnIDs)
		}
	}
}

// TestResolver_CompTimeArgs_NonLiteralDiagnostic pins the CTA001
// diagnostic for a CompTimeArgs<T>-branded parameter filled with a
// value the Go scanner cannot statically evaluate (a function-call
// result here). The new marker family replaces the legacy MKR002
// "options must be literal" check — broader, since any branded param
// is covered, not just options-named ones.
func TestResolver_CompTimeArgs_NonLiteralDiagnostic(t *testing.T) {
	const dts = `declare module '@ts-runtypes/core' {
  export type InjectRunTypeId<T> = string & {readonly __rtInjectRunTypeIdBrand?: T};
  export type CompTimeArgs<T> = T & {readonly __rtCompTimeArgsBrand?: never};
  export interface ValidateOptions {noLiterals?: boolean; noIsArrayCheck?: boolean}
  export function createValidateFn<T>(val?: T, options?: CompTimeArgs<ValidateOptions>, id?: InjectRunTypeId<T>): (v: unknown) => boolean;
}
`
	const code = `import {createValidateFn} from '@ts-runtypes/core';
declare function getOptions(): {noLiterals: true};
createValidateFn<string>(undefined, getOptions());
`
	r := setupInline(t, map[string]string{"runtypes.d.ts": dts, "call.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	markerDiags := filterDiagsByFamily(resp.Diagnostics, diagnostics.FamilyMarker)
	if len(markerDiags) != 1 {
		t.Fatalf("expected 1 marker diagnostic, got %d (%+v)", len(markerDiags), markerDiags)
	}
	d := markerDiags[0]
	// A bare function call inside a CompTimeArgs slot is a forbidden
	// construct (CTA003) — the validator sees `getOptions()` as a call
	// expression at the top level and rejects it, not as a "non-literal
	// identifier-chain leaf" (CTA001).
	if d.Code != diagnostics.CodeCompTimeArgsForbiddenConstruct {
		t.Fatalf("expected code %s, got %q", diagnostics.CodeCompTimeArgsForbiddenConstruct, d.Code)
	}
	if d.Severity != diagnostics.SeverityError {
		t.Fatalf("expected severity error (%d), got %d", diagnostics.SeverityError, d.Severity)
	}
}

// TestResolver_CompTimeArgs_LiteralAccepted pins the positive case for
// CompTimeArgs<T>: a direct object literal at the call site must pass
// the CompTimeArgs gate (no CTA001/002/003 violations). Unrelated
// marker codes (e.g. MKR004 fires when `{noLiterals: true}` lands on
// a non-literal type — by design) are filtered out so this test stays
// focused on its subject. The fixture uses a literal type for the
// noLiterals call so MKR004 doesn't fire here; non-literal call sites
// are covered by TestResolver_ValidateOptions_NoLiteralsNoop.
func TestResolver_CompTimeArgs_LiteralAccepted(t *testing.T) {
	const dts = `declare module '@ts-runtypes/core' {
  export type InjectRunTypeId<T> = string & {readonly __rtInjectRunTypeIdBrand?: T};
  export type CompTimeArgs<T> = T & {readonly __rtCompTimeArgsBrand?: never};
  export interface ValidateOptions {noLiterals?: boolean; noIsArrayCheck?: boolean}
  export function createValidateFn<T>(val?: T, options?: CompTimeArgs<ValidateOptions>, id?: InjectRunTypeId<T>): (v: unknown) => boolean;
}
`
	const code = `import {createValidateFn} from '@ts-runtypes/core';
createValidateFn<'a'>(undefined, {noLiterals: true});
createValidateFn<string>(undefined, {});
`
	r := setupInline(t, map[string]string{"runtypes.d.ts": dts, "call.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	markerDiags := filterDiagsByFamily(resp.Diagnostics, diagnostics.FamilyMarker)
	for _, d := range markerDiags {
		// CTA gate only — MKR is a different subject (anti-patterns).
		if strings.HasPrefix(d.Code, "CTA") {
			t.Fatalf("expected no CTA diagnostics for literal options, got %+v", d)
		}
	}
}

// TestResolver_CompTimeArgs_UnionBrandFallback pins the brand-property
// fallback path in DetectAny — `CompTimeArgs<A | B>` distributes its
// intersection over the union, so the alias name `CompTimeArgs` is lost
// after type resolution, but the brand property survives on every
// member. The fallback recognises the marker via the property name.
func TestResolver_CompTimeArgs_UnionBrandFallback(t *testing.T) {
	const dts = `declare module '@ts-runtypes/core' {
  export type InjectRunTypeId<T> = string & {readonly __rtInjectRunTypeIdBrand?: T};
  export type CompTimeArgs<T> = T & {readonly __rtCompTimeArgsBrand?: never};
  export type JsonEncoderOptions = {strategy?: 'clone' | 'mutate'; stripExtras?: boolean} | {strategy: 'direct'};
  export function createJsonEncoderFn<T>(val?: T, options?: CompTimeArgs<JsonEncoderOptions>, id?: InjectRunTypeId<T>): (v: unknown) => string | undefined;
}
`
	const code = `import {createJsonEncoderFn} from '@ts-runtypes/core';
declare function getOptions(): {strategy: 'mutate'};
createJsonEncoderFn<string>(undefined, getOptions());
`
	r := setupInline(t, map[string]string{"runtypes.d.ts": dts, "call.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	markerDiags := filterDiagsByFamily(resp.Diagnostics, diagnostics.FamilyMarker)
	if len(markerDiags) != 1 {
		t.Fatalf("expected 1 marker diagnostic (CTA003 for function call inside CompTimeArgs), got %d (%+v)", len(markerDiags), markerDiags)
	}
	if markerDiags[0].Code != diagnostics.CodeCompTimeArgsForbiddenConstruct {
		t.Fatalf("expected code %s, got %q", diagnostics.CodeCompTimeArgsForbiddenConstruct, markerDiags[0].Code)
	}
}

// TestResolver_CompTimeArgs_ConstChainAccepted pins the relaxation
// from the legacy MKR002 path: a module-scope `const` whose
// initializer is itself a literal must pass the CompTimeArgs check.
// Under the old MKR002 rule any identifier was rejected; the new rule
// accepts const-of-literal chains so users can DRY their option
// objects.
func TestResolver_CompTimeArgs_ConstChainAccepted(t *testing.T) {
	const dts = `declare module '@ts-runtypes/core' {
  export type InjectRunTypeId<T> = string & {readonly __rtInjectRunTypeIdBrand?: T};
  export type CompTimeArgs<T> = T & {readonly __rtCompTimeArgsBrand?: never};
  export interface ValidateOptions {noLiterals?: boolean; noIsArrayCheck?: boolean}
  export function createValidateFn<T>(val?: T, options?: CompTimeArgs<ValidateOptions>, id?: InjectRunTypeId<T>): (v: unknown) => boolean;
}
`
	const code = `import {createValidateFn} from '@ts-runtypes/core';
const opts = {noLiterals: true as const};
createValidateFn<string>(undefined, opts);
`
	r := setupInline(t, map[string]string{"runtypes.d.ts": dts, "call.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	markerDiags := filterDiagsByFamily(resp.Diagnostics, diagnostics.FamilyMarker)
	if len(markerDiags) != 0 {
		t.Fatalf("expected 0 marker diagnostics for const-bound literal, got %d (%+v)", len(markerDiags), markerDiags)
	}
}

// PureFunction marker test fixture — used by every PureFunction
// test below. Declares a `withValidator` wrapper whose first parameter
// is branded `PureFunction<(v: unknown) => boolean>` so the scanner
// dispatches to the purity walker for that argument.
const pureFunctionDts = `declare module '@ts-runtypes/core' {
  export type InjectRunTypeId<T> = string & {readonly __rtInjectRunTypeIdBrand?: T};
  export type PureFunction<F> = F & {readonly __rtPureFunctionBrand?: never};
  export function withValidator<T>(validate: PureFunction<(v: unknown) => boolean>, val?: T, id?: InjectRunTypeId<T>): (v: unknown) => boolean;
}
`

// TestResolver_PureFunction_InlineArrowAccepted pins the positive case
// for the PureFunction marker: an inline arrow whose body only uses
// allow-listed globals and its own parameter produces no diagnostics.
func TestResolver_PureFunction_InlineArrowAccepted(t *testing.T) {
	const code = `import {withValidator} from '@ts-runtypes/core';
withValidator<string>((v) => typeof v === 'string');
`
	r := setupInline(t, map[string]string{"runtypes.d.ts": pureFunctionDts, "call.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	markerDiags := filterDiagsByFamily(resp.Diagnostics, diagnostics.FamilyMarker)
	if len(markerDiags) != 0 {
		t.Fatalf("expected 0 marker diagnostics for inline pure arrow, got %d (%+v)", len(markerDiags), markerDiags)
	}
}

// TestResolver_PureFunction_NonLiteralEmitsPFN001 pins PFN001 for an
// imported identifier — not a literal function definition, can't be
// inlined by the AOT compiler.
func TestResolver_PureFunction_NonLiteralEmitsPFN001(t *testing.T) {
	const code = `import {withValidator} from '@ts-runtypes/core';
declare const isString: (v: unknown) => boolean;
withValidator<string>(isString);
`
	r := setupInline(t, map[string]string{"runtypes.d.ts": pureFunctionDts, "call.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	markerDiags := filterDiagsByFamily(resp.Diagnostics, diagnostics.FamilyMarker)
	if len(markerDiags) != 1 {
		t.Fatalf("expected 1 marker diagnostic (PFN001), got %d (%+v)", len(markerDiags), markerDiags)
	}
	if markerDiags[0].Code != diagnostics.CodePureFunctionNotLiteral {
		t.Fatalf("expected code %s, got %q", diagnostics.CodePureFunctionNotLiteral, markerDiags[0].Code)
	}
}

// TestResolver_PureFunction_PurityViolationsPropagate pins that the
// purity walker (PFE9006–PFE9011) fires when the inline function body
// breaks a rule — here, `await` inside the arrow triggers PFE9007.
// The PureFunction marker reuses the purefns.CheckPurity engine
// unchanged, so any PFE the extractor emits should reach the resolver.
func TestResolver_PureFunction_PurityViolationsPropagate(t *testing.T) {
	const code = `import {withValidator} from '@ts-runtypes/core';
withValidator<string>(async (v) => { await Promise.resolve(); return typeof v === 'string'; });
`
	r := setupInline(t, map[string]string{"runtypes.d.ts": pureFunctionDts, "call.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	// All PFE diagnostics live under FamilyPureFn — not FamilyMarker.
	pfeDiags := filterDiagsByFamily(resp.Diagnostics, diagnostics.FamilyPureFn)
	if len(pfeDiags) == 0 {
		t.Fatalf("expected at least one PFE diagnostic for `await`, got 0 (all: %+v)", resp.Diagnostics)
	}
	awaitSeen := false
	for _, d := range pfeDiags {
		if d.Code == "PFE9007" {
			awaitSeen = true
		}
	}
	if !awaitSeen {
		t.Fatalf("expected PFE9007 (`await` violation), got %+v", pfeDiags)
	}
}

// TestResolver_PureFunction_ClosureViolation pins PFE9011 — the
// inline arrow captures `outer` from the surrounding module scope.
// The purity walker treats this as closing over an outer binding,
// which prevents AOT inlining.
func TestResolver_PureFunction_ClosureViolation(t *testing.T) {
	const code = `import {withValidator} from '@ts-runtypes/core';
const outer = 42;
withValidator<number>((v) => v === outer);
`
	r := setupInline(t, map[string]string{"runtypes.d.ts": pureFunctionDts, "call.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	pfeDiags := filterDiagsByFamily(resp.Diagnostics, diagnostics.FamilyPureFn)
	closureSeen := false
	for _, d := range pfeDiags {
		if d.Code == "PFE9011" {
			closureSeen = true
		}
	}
	if !closureSeen {
		t.Fatalf("expected PFE9011 (closure over outer binding) for `outer`, got %+v (all diags: %+v)", pfeDiags, resp.Diagnostics)
	}
}

// Phase 4 regression: marker validation must run for calls that do NOT
// have an `InjectRunTypeId` trailing parameter. Previously scanCall
// returned early when the trailing slot wasn't InjectRunTypeId, so any
// CompTimeArgs / PureFunction marker on an earlier slot was silently
// skipped. The restructured scanCall walks all params unconditionally.

// markerOnlyDts declares a wrapper function `noInjectWrapper` whose
// trailing slot is the value (not InjectRunTypeId) and whose leading
// slot is CompTimeArgs<string>. Used by the two tests below to confirm
// the marker validation fires even without an injection slot.
const markerOnlyDts = `declare module '@ts-runtypes/core' {
  export type CompTimeArgs<T> = T & {readonly __rtCompTimeArgsBrand?: never};
  export type PureFunction<F> = F & {readonly __rtPureFunctionBrand?: never};
  export function noInjectWrapper(label: CompTimeArgs<string>, value: number): number;
  export function pureOnlyWrapper(fn: PureFunction<(v: unknown) => boolean>): void;
}
`

func TestResolver_CompTimeArgs_RunsWithoutInjectionMarker(t *testing.T) {
	const code = `import {noInjectWrapper} from '@ts-runtypes/core';
declare function getLabel(): string;
noInjectWrapper(getLabel(), 1);
`
	r := setupInline(t, map[string]string{"runtypes.d.ts": markerOnlyDts, "call.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	markerDiags := filterDiagsByFamily(resp.Diagnostics, diagnostics.FamilyMarker)
	if len(markerDiags) != 1 {
		t.Fatalf("expected 1 CTA diagnostic for non-literal arg without injection slot, got %d (%+v)", len(markerDiags), markerDiags)
	}
	if markerDiags[0].Code != diagnostics.CodeCompTimeArgsForbiddenConstruct {
		t.Fatalf("expected %s, got %q", diagnostics.CodeCompTimeArgsForbiddenConstruct, markerDiags[0].Code)
	}
}

func TestResolver_PureFunction_RunsWithoutInjectionMarker(t *testing.T) {
	const code = `import {pureOnlyWrapper} from '@ts-runtypes/core';
declare const isString: (v: unknown) => boolean;
pureOnlyWrapper(isString);
`
	r := setupInline(t, map[string]string{"runtypes.d.ts": markerOnlyDts, "call.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	markerDiags := filterDiagsByFamily(resp.Diagnostics, diagnostics.FamilyMarker)
	if len(markerDiags) != 1 {
		t.Fatalf("expected 1 PFN001 diagnostic for non-literal fn without injection slot, got %d (%+v)", len(markerDiags), markerDiags)
	}
	if markerDiags[0].Code != diagnostics.CodePureFunctionNotLiteral {
		t.Fatalf("expected %s, got %q", diagnostics.CodePureFunctionNotLiteral, markerDiags[0].Code)
	}
}

// Phase 4 regression: when a function carries BOTH an InjectRunTypeId
// trailing slot AND a CompTimeArgs on an earlier slot, scanCall must
// emit both a Site (for injection) AND a CTA diagnostic (for the
// invalid non-literal arg). The two passes were previously coupled —
// MKR003 / argsCount early-returns dropped accumulated diagnostics.
func TestResolver_TrailingInjectionStillEmitsSite(t *testing.T) {
	const dts = `declare module '@ts-runtypes/core' {
  export type InjectRunTypeId<T> = string & {readonly __rtInjectRunTypeIdBrand?: T};
  export type CompTimeArgs<T> = T & {readonly __rtCompTimeArgsBrand?: never};
  export interface ValidateOptions {noLiterals?: boolean}
  export function createValidateFn<T>(val?: T, options?: CompTimeArgs<ValidateOptions>, id?: InjectRunTypeId<T>): (v: unknown) => boolean;
}
`
	const code = `import {createValidateFn} from '@ts-runtypes/core';
declare function getOptions(): {noLiterals: true};
createValidateFn<string>(undefined, getOptions());
`
	r := setupInline(t, map[string]string{"runtypes.d.ts": dts, "call.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	if len(resp.Sites) != 1 {
		t.Fatalf("expected 1 Site for injection, got %d", len(resp.Sites))
	}
	markerDiags := filterDiagsByFamily(resp.Diagnostics, diagnostics.FamilyMarker)
	if len(markerDiags) != 1 {
		t.Fatalf("expected 1 CTA diagnostic alongside the Site, got %d (%+v)", len(markerDiags), markerDiags)
	}
	if markerDiags[0].Code != diagnostics.CodeCompTimeArgsForbiddenConstruct {
		t.Fatalf("expected %s, got %q", diagnostics.CodeCompTimeArgsForbiddenConstruct, markerDiags[0].Code)
	}
}

// TestResolver_ValidateOptions_DoNotChangeID is the ValidateOptions refactor
// guard: for the same TS type T, the resolved Site.ID must be IDENTICAL
// across every option combination. The marker scanner used to fold
// `noLiterals` / `noIsArrayCheck` into the typeid (via type-swap for
// literals + `SerializeArrayWithFlags` for arrays) — both paths are
// gone now, replaced by per-call-site `Site.Options` that drive the
// emitter's variant fan-out under the SAME structural id.
//
// Covers three flavours of T:
//   - literal `'a'`   ± `noLiterals`
//   - array  `string[]` ± `noIsArrayCheck`
//   - composite `{tag: 'a'; list: string[]}` with both options
//
// Each case asserts that every call site for the same T produces the
// same `Site.ID`. The Site.Options field carries the option tuple
// (sorted, name-keyed) — the emitter consumes it to materialise the
// variant factory keyed `<tag><variantSuffix>_<id>`.
func TestResolver_ValidateOptions_DoNotChangeID(t *testing.T) {
	const dts = `declare module '@ts-runtypes/core' {
  export type InjectRunTypeId<T> = string & {readonly __rtInjectRunTypeIdBrand?: T};
  export type CompTimeArgs<T> = T & {readonly __rtCompTimeArgsBrand?: never};
  export interface ValidateOptions {noLiterals?: boolean; noIsArrayCheck?: boolean}
  export function createValidateFn<T>(val?: T, options?: CompTimeArgs<ValidateOptions>, id?: InjectRunTypeId<T>): (v: unknown) => boolean;
}
`
	cases := []struct {
		name string
		code string
	}{
		{
			name: "literal 'a' ± noLiterals",
			code: `import {createValidateFn} from '@ts-runtypes/core';
createValidateFn<'a'>();
createValidateFn<'a'>(undefined, {noLiterals: true});
const v: 'a' = 'a';
createValidateFn(v);
createValidateFn(v, {noLiterals: true});
`,
		},
		{
			name: "array string[] ± noIsArrayCheck",
			code: `import {createValidateFn} from '@ts-runtypes/core';
createValidateFn<string[]>();
createValidateFn<string[]>(undefined, {noIsArrayCheck: true});
const v: string[] = [];
createValidateFn(v);
createValidateFn(v, {noIsArrayCheck: true});
`,
		},
		{
			name: "composite with nested literal AND array + both options",
			code: `import {createValidateFn} from '@ts-runtypes/core';
type Composite = {tag: 'a'; list: string[]};
createValidateFn<Composite>();
createValidateFn<Composite>(undefined, {noLiterals: true});
createValidateFn<Composite>(undefined, {noIsArrayCheck: true});
createValidateFn<Composite>(undefined, {noLiterals: true, noIsArrayCheck: true});
`,
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			r := setupInline(t, map[string]string{"runtypes.d.ts": dts, "call.ts": c.code})
			resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
			if resp.Error != "" {
				t.Fatalf("scanFiles: %s", resp.Error)
			}
			if len(resp.Sites) < 2 {
				t.Fatalf("expected at least 2 Sites, got %d", len(resp.Sites))
			}
			first := resp.Sites[0].ID
			for i, s := range resp.Sites {
				if s.ID != first {
					t.Errorf("Site[%d].ID = %q, want %q (fnId=%q)", i, s.ID, first, s.FnId)
				}
			}
		})
	}
}

// TestResolver_ValidateOptions_NoLiteralsNoop pins the build-time
// Warning emitted when an option lands on a type where it has no
// effect (e.g. `{noLiterals: true}` on plain `string`,
// `{noIsArrayCheck: true}` on an object literal). The variant factory
// is still materialised (always-emit invariant — the JS side can't
// tell whether an option is meaningful for a given T), so the
// diagnostic is the only build-time signal.
func TestResolver_ValidateOptions_NoLiteralsNoop(t *testing.T) {
	const dts = `declare module '@ts-runtypes/core' {
  export type InjectRunTypeId<T> = string & {readonly __rtInjectRunTypeIdBrand?: T};
  export type CompTimeArgs<T> = T & {readonly __rtCompTimeArgsBrand?: never};
  export interface ValidateOptions {noLiterals?: boolean; noIsArrayCheck?: boolean}
  export function createValidateFn<T>(val?: T, options?: CompTimeArgs<ValidateOptions>, id?: InjectRunTypeId<T>): (v: unknown) => boolean;
}
`
	const code = `import {createValidateFn} from '@ts-runtypes/core';
createValidateFn<string>(undefined, {noLiterals: true});
createValidateFn<{a: string}>(undefined, {noIsArrayCheck: true});
`
	r := setupInline(t, map[string]string{"runtypes.d.ts": dts, "call.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	var nl, na bool
	for _, d := range resp.Diagnostics {
		switch d.Code {
		case diagnostics.CodeValidateOptionsNoLiteralsNoop:
			nl = true
		case diagnostics.CodeValidateOptionsNoArrayNoop:
			na = true
		}
	}
	if !nl {
		t.Errorf("expected %s for {noLiterals:true} on non-literal type, got: %+v", diagnostics.CodeValidateOptionsNoLiteralsNoop, resp.Diagnostics)
	}
	if !na {
		t.Errorf("expected %s for {noIsArrayCheck:true} on non-array type, got: %+v", diagnostics.CodeValidateOptionsNoArrayNoop, resp.Diagnostics)
	}
}

// TestResolver_SchemaForm_ConvergesAndObservesOptions pins the schema-form
// path AFTER the CompTimeRunType ref-tracing was removed: the value-first schema
// form is now an ordinary `createValidateFn` OVERLOAD taking a `RunType<T>` first arg
// (`createValidateFn(array(string()))`). It must resolve to the SAME structural id as
// the marker form (`createValidateFn<string[]>()`) — `T` is inferred from the
// schema's `RunType<T>` and reflected off the trailing `InjectTypeFnArgs<T, 'val'>`,
// no `schema.id` read, no builder ref-trace — AND its options ride the call's own
// slot, folded into the injected fnId variant suffix. The createValidateFn call IS the
// injection marker, so the nested `array(string())` builder is skipped (enclosed);
// the Site sits on the createValidateFn call.
func TestResolver_SchemaForm_ConvergesAndObservesOptions(t *testing.T) {
	const dts = `declare module '@ts-runtypes/core' {
  export type InjectRunTypeId<T> = string & {readonly __rtInjectRunTypeIdBrand?: T};
  export type InjectTypeFnArgs<T, Fn extends string> = string & {readonly __rtInjectTypeFnArgsBrand?: T; readonly __rtInjectTypeFnArgsFn?: Fn};
  export type CompTimeArgs<T> = T & {readonly __rtCompTimeArgsBrand?: never};
  export type CompTimeFnArgs<T> = T & {readonly __rtCompTimeFnArgsBrand?: never};
  export interface ValidateOptions {noLiterals?: boolean; noIsArrayCheck?: boolean}
  export interface RunType<T = unknown> {id: string; readonly __rtType?: {t: T}}
  export function createValidateFn<T>(schema: RunType<T>, options?: CompTimeFnArgs<ValidateOptions>, id?: InjectTypeFnArgs<T, 'val'>): (v: unknown) => boolean;
  export function createValidateFn<T>(val?: T, options?: CompTimeFnArgs<ValidateOptions>, id?: InjectTypeFnArgs<T, 'val'>): (v: unknown) => boolean;
  export function string(id?: InjectRunTypeId<string>): RunType<string>;
  export function array<T>(item: CompTimeArgs<RunType<T>>, id?: InjectRunTypeId<T[]>): RunType<T[]>;
}
`
	const code = `import {createValidateFn, array, string} from '@ts-runtypes/core';
createValidateFn<string[]>();
createValidateFn(array(string()));
createValidateFn(array(string()), {noIsArrayCheck: true});
`
	r := setupInline(t, map[string]string{"runtypes.d.ts": dts, "call.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	// One Site per createValidateFn call — the nested array(string()) builders are
	// skipped (enclosed by the createValidateFn injection marker).
	if len(resp.Sites) != 3 {
		t.Fatalf("expected 3 Sites (one per createValidateFn call), got %d: %+v", len(resp.Sites), resp.Sites)
	}
	markerID := resp.Sites[0].ID
	for i, s := range resp.Sites {
		if s.ID != markerID {
			t.Errorf("Site[%d].ID = %q, want %q — schema and marker forms must converge on one id", i, s.ID, markerID)
		}
		if s.Pos == 0 {
			t.Errorf("Site[%d] has Pos 0 — every surviving Site must drive a real rewrite", i)
		}
	}
	// The options bag rides the schema-overload call's own slot, folded into
	// the injected FnId — now the opaque validate variant fnHash for the
	// noIsArrayCheck option set (NOT the readable `valNA` token). Assert equality
	// to operations.FnHashFor so the test stays correct across versions.
	validateOp, _ := operations.ByName("validate")
	wantVariant := operations.FnHashFor(validateOp, []string{"noIsArrayCheck"}, "", false)
	variant := resp.Sites[2]
	if variant.FnId != wantVariant {
		t.Errorf("schema-form options not observed: Site[2].FnId = %q, want %q (validate/noIsArrayCheck)", variant.FnId, wantVariant)
	}
}

// TestResolver_ValidateOptions_AsConstExtracted pins the wrapper-unwrap
// asymmetry fix: `{noLiterals: true} as const` passes the options slot's
// CompTimeArgs validation (which unwraps `as`/parens/`satisfies`), so the
// option EXTRACTION must read it too — before the fix the extractor saw
// the AsExpression node, silently read zero options, and the MKR004 noop
// warning below never fired.
func TestResolver_ValidateOptions_AsConstExtracted(t *testing.T) {
	const dts = `declare module '@ts-runtypes/core' {
  export type InjectRunTypeId<T> = string & {readonly __rtInjectRunTypeIdBrand?: T};
  export type CompTimeArgs<T> = T & {readonly __rtCompTimeArgsBrand?: never};
  export interface ValidateOptions {noLiterals?: boolean; noIsArrayCheck?: boolean}
  export function createValidateFn<T>(val?: T, options?: CompTimeArgs<ValidateOptions>, id?: InjectRunTypeId<T>): (v: unknown) => boolean;
}
`
	const code = `import {createValidateFn} from '@ts-runtypes/core';
createValidateFn<string>(undefined, {noLiterals: true} as const);
`
	r := setupInline(t, map[string]string{"runtypes.d.ts": dts, "call.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	for _, d := range resp.Diagnostics {
		if d.Code == diagnostics.CodeValidateOptionsNoLiteralsNoop {
			return
		}
	}
	t.Fatalf("expected %s for as-const {noLiterals:true} on a non-literal type (option must be extracted through the wrapper), got: %+v",
		diagnostics.CodeValidateOptionsNoLiteralsNoop, resp.Diagnostics)
}
