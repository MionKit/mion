package resolver_test

import (
	"testing"

	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// Collection-shape tests. Each scenario has paired *_Static / *_Reflect
// tests per the marker test coverage rule (CLAUDE.md) and shares an
// assertion helper. Exercises the modifier-and-default fields populated
// by serialize.go's appendProperty / projectSignatureInto / projectTuple
// — readonly, visibility, abstract, static, isSafeName, position,
// default — none of which had end-to-end coverage before.

// ---- F23 — object with optional / readonly / unsafe name ---------------------

// weirdPropName is the post-TS-lex form of the source-level
// `"weird prop name \n?>'\\\t\r"` literal: a real newline, `?>'`, a real
// backslash, a tab, and a CR. Chosen to stress JSON encoding (control
// chars), JS source-literal round-trip, and the safe-name regex
// (rejects on the space alone, never mind the control chars).
const weirdPropName = "weird prop name \n?>'\\\t\r"

func TestF23_ObjectShapes_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
interface O {
  readonly id: number;
  nick?: string;
  "weird prop name \n?>'\\\t\r": boolean;
}
getRunTypeId<O>();
`
	r, root := resolveInline(t, code)
	assertF23ObjectShapes(t, r, root)
}

func TestF23_ObjectShapes_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
interface O {
  readonly id: number;
  nick?: string;
  "weird prop name \n?>'\\\t\r": boolean;
}
declare const value: O;
getRunTypeId(value);
`
	r, root := resolveInline(t, code)
	assertF23ObjectShapes(t, r, root)
}

func assertF23ObjectShapes(t *testing.T, r *resolver.Session, root *reflection.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != reflection.KindObjectLiteral {
		t.Fatalf("expected KindObjectLiteral, got %+v", root)
	}

	idMember := findMember(types, root, "id")
	if idMember == nil {
		t.Fatalf("missing 'id' property; types=%+v", root.Children)
	}
	if !idMember.Readonly {
		t.Fatalf("id expected Readonly=true, got %+v", idMember)
	}
	if !idMember.IsSafeName {
		t.Fatalf("id expected IsSafeName=true, got %+v", idMember)
	}
	if idMember.Optional {
		t.Fatalf("id expected Optional=false, got %+v", idMember)
	}

	nickMember := findMember(types, root, "nick")
	if nickMember == nil {
		t.Fatalf("missing 'nick' property; types=%+v", root.Children)
	}
	if !nickMember.Optional {
		t.Fatalf("nick expected Optional=true, got %+v", nickMember)
	}
	if !nickMember.IsSafeName {
		t.Fatalf("nick expected IsSafeName=true, got %+v", nickMember)
	}
	if nickMember.Readonly {
		t.Fatalf("nick expected Readonly=false, got %+v", nickMember)
	}

	weirdMember := findMember(types, root, weirdPropName)
	if weirdMember == nil {
		t.Fatalf("missing weird-name property; types=%+v", root.Children)
	}
	if weirdMember.IsSafeName {
		t.Fatalf("weird name expected IsSafeName=false, got %+v", weirdMember)
	}
	if weirdMember.Name != weirdPropName {
		t.Fatalf("expected Name=%q, got %q", weirdPropName, weirdMember.Name)
	}
}

// ---- F24 — class property modifiers -----------------------------------------

func TestF24_ClassPropertyModifiers_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
class U {
  public id = 0;
  private secret = "";
  protected hint = 0;
  readonly tag = "t";
  static count = 0;
}
getRunTypeId<U>();
`
	r, root := resolveInline(t, code)
	assertF24ClassPropertyModifiers(t, r, root)
}

func TestF24_ClassPropertyModifiers_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
class U {
  public id = 0;
  private secret = "";
  protected hint = 0;
  readonly tag = "t";
  static count = 0;
}
declare const value: U;
getRunTypeId(value);
`
	r, root := resolveInline(t, code)
	assertF24ClassPropertyModifiers(t, r, root)
}

func assertF24ClassPropertyModifiers(t *testing.T, r *resolver.Session, root *reflection.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != reflection.KindClass {
		t.Fatalf("expected KindClass, got %+v", root)
	}

	idMember := findMember(types, root, "id")
	if idMember == nil || idMember.Kind != reflection.KindProperty {
		t.Fatalf("id expected KindProperty, got %+v", idMember)
	}
	if idMember.Visibility == nil || *idMember.Visibility != 0 {
		t.Fatalf("id expected Visibility=public(0), got %+v", idMember.Visibility)
	}

	secretMember := findMember(types, root, "secret")
	if secretMember == nil || secretMember.Visibility == nil || *secretMember.Visibility != 2 {
		t.Fatalf("secret expected Visibility=private(2), got %+v", secretMember)
	}

	hintMember := findMember(types, root, "hint")
	if hintMember == nil || hintMember.Visibility == nil || *hintMember.Visibility != 1 {
		t.Fatalf("hint expected Visibility=protected(1), got %+v", hintMember)
	}

	tagMember := findMember(types, root, "tag")
	if tagMember == nil || !tagMember.Readonly {
		t.Fatalf("tag expected Readonly=true, got %+v", tagMember)
	}

	countMember := findMember(types, root, "count")
	if countMember == nil || !countMember.IsStatic {
		t.Fatalf("count expected IsStatic=true, got %+v", countMember)
	}
}

// ---- F25 — class method modifiers -------------------------------------------

func TestF25_ClassMethodModifiers_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
abstract class S {
  abstract greet(): void;
  static factory(): void {}
  private hidden(): void {}
}
getRunTypeId<S>();
`
	r, root := resolveInline(t, code)
	assertF25ClassMethodModifiers(t, r, root)
}

func TestF25_ClassMethodModifiers_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
abstract class S {
  abstract greet(): void;
  static factory(): void {}
  private hidden(): void {}
}
declare const value: S;
getRunTypeId(value);
`
	r, root := resolveInline(t, code)
	assertF25ClassMethodModifiers(t, r, root)
}

func assertF25ClassMethodModifiers(t *testing.T, r *resolver.Session, root *reflection.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != reflection.KindClass {
		t.Fatalf("expected KindClass, got %+v", root)
	}

	greetMember := findMember(types, root, "greet")
	if greetMember == nil || greetMember.Kind != reflection.KindMethod {
		t.Fatalf("greet expected KindMethod, got %+v", greetMember)
	}
	if !greetMember.IsAbstract {
		t.Fatalf("greet expected IsAbstract=true, got %+v", greetMember)
	}

	factoryMember := findMember(types, root, "factory")
	if factoryMember == nil || !factoryMember.IsStatic {
		t.Fatalf("factory expected IsStatic=true, got %+v", factoryMember)
	}

	hiddenMember := findMember(types, root, "hidden")
	if hiddenMember == nil || hiddenMember.Visibility == nil || *hiddenMember.Visibility != 2 {
		t.Fatalf("hidden expected Visibility=private(2), got %+v", hiddenMember)
	}
}

// ---- F26 — tuple labeled/rest/optional/position -----------------------------
//
// Direct labeled tuple. Members carry Position, Name (from label),
// Optional bit, and Flags=["rest"] on the variadic tail.

func TestF26_TupleLabeled_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<[a: number, b?: string, ...rest: boolean[]]>();
`
	r, root := resolveInline(t, code)
	assertF26TupleLabeled(t, r, root)
}

func TestF26_TupleLabeled_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
declare const value: [a: number, b?: string, ...rest: boolean[]];
getRunTypeId(value);
`
	r, root := resolveInline(t, code)
	assertF26TupleLabeled(t, r, root)
}

func assertF26TupleLabeled(t *testing.T, r *resolver.Session, root *reflection.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != reflection.KindTuple {
		t.Fatalf("expected KindTuple, got %+v", root)
	}
	if len(root.Children) != 3 {
		t.Fatalf("expected 3 tuple members, got %d", len(root.Children))
	}

	first := deref(types, root.Children[0])
	if first == nil || first.Kind != reflection.KindTupleMember {
		t.Fatalf("member[0] expected KindTupleMember, got %+v", first)
	}
	if first.Name != "a" {
		t.Fatalf("member[0].Name expected 'a', got %q", first.Name)
	}
	if first.Position == nil || *first.Position != 0 {
		t.Fatalf("member[0].Position expected 0, got %+v", first.Position)
	}

	second := deref(types, root.Children[1])
	if second == nil || !second.Optional {
		t.Fatalf("member[1] expected Optional=true, got %+v", second)
	}
	if second.Name != "b" {
		t.Fatalf("member[1].Name expected 'b', got %q", second.Name)
	}
	if second.Position == nil || *second.Position != 1 {
		t.Fatalf("member[1].Position expected 1, got %+v", second.Position)
	}

	third := deref(types, root.Children[2])
	if third == nil {
		t.Fatalf("member[2] missing")
	}
	if third.Position == nil || *third.Position != 2 {
		t.Fatalf("member[2].Position expected 2, got %+v", third.Position)
	}
	if !containsFlag(third.Flags, "rest") {
		t.Fatalf("member[2] expected flags to contain 'rest', got %+v", third.Flags)
	}
}

// ---- F27 — readonly index signature -----------------------------------------

func TestF27_ReadonlyIndexSignature_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
interface M {
  readonly [k: string]: number;
}
getRunTypeId<M>();
`
	r, root := resolveInline(t, code)
	assertF27ReadonlyIndexSignature(t, r, root)
}

func TestF27_ReadonlyIndexSignature_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
interface M {
  readonly [k: string]: number;
}
declare const value: M;
getRunTypeId(value);
`
	r, root := resolveInline(t, code)
	assertF27ReadonlyIndexSignature(t, r, root)
}

func assertF27ReadonlyIndexSignature(t *testing.T, r *resolver.Session, root *reflection.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != reflection.KindObjectLiteral {
		t.Fatalf("expected KindObjectLiteral, got %+v", root)
	}

	var idx *reflection.RunType
	for _, ref := range root.Children {
		member := deref(types, ref)
		if member != nil && member.Kind == reflection.KindIndexSignature {
			idx = member
			break
		}
	}
	if idx == nil {
		t.Fatalf("expected KindIndexSignature child; got children=%+v", root.Children)
	}
	if !idx.Readonly {
		t.Fatalf("index signature expected Readonly=true, got %+v", idx)
	}
	keyType := deref(types, idx.Index)
	if keyType == nil || keyType.Kind != reflection.KindString {
		t.Fatalf("index key expected KindString, got %+v", keyType)
	}
	valueType := deref(types, idx.Child)
	if valueType == nil || valueType.Kind != reflection.KindNumber {
		t.Fatalf("index value expected KindNumber, got %+v", valueType)
	}
}

// ---- F28 — parameter defaults + position ------------------------------------
//
// Exercises Parameter.DefaultVal (literal + nonLiteralDefault marker) and
// Parameter.Position through the function-type projection. The function
// is itself a KindFunction node (single call signature on an object
// literal triggers the function dispatch), so we walk root.Parameters.

func TestF28_ParameterDefaults_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type Fn = (a: number, b?: string, c?: number, d?: number) => void;
getRunTypeId<Fn>();
`
	r, root := resolveInline(t, code)
	assertF28ParameterDefaults(t, r, root, false)
}

func TestF28_ParameterDefaults_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
function fn(a: number, b: string = "x", c: number = 5, d: number = (() => 7)()): void {}
getRunTypeId(fn);
`
	r, root := resolveInline(t, code)
	assertF28ParameterDefaults(t, r, root, true)
}

func assertF28ParameterDefaults(t *testing.T, r *resolver.Session, root *reflection.RunType, expectDefaults bool) {
	t.Helper()
	types := dump(r)
	if root.Kind != reflection.KindFunction {
		t.Fatalf("expected KindFunction, got %+v", root)
	}
	if len(root.Parameters) != 4 {
		t.Fatalf("expected 4 parameters, got %d", len(root.Parameters))
	}
	for i, ref := range root.Parameters {
		param := deref(types, ref)
		if param == nil || param.Kind != reflection.KindParameter {
			t.Fatalf("parameter[%d] expected KindParameter, got %+v", i, param)
		}
		if param.Position == nil || *param.Position != i {
			t.Fatalf("parameter[%d].Position expected %d, got %+v", i, i, param.Position)
		}
	}
	if !expectDefaults {
		// Static form has no runtime values — DefaultVal fields stay nil.
		return
	}
	paramA := deref(types, root.Parameters[0])
	if paramA.DefaultVal != nil {
		t.Fatalf("parameter[0] expected no default, got %v", paramA.DefaultVal)
	}
	paramB := deref(types, root.Parameters[1])
	if paramB.DefaultVal != "x" {
		t.Fatalf("parameter[1].DefaultVal expected 'x', got %v", paramB.DefaultVal)
	}
	paramC := deref(types, root.Parameters[2])
	if v, ok := paramC.DefaultVal.(int64); !ok || v != 5 {
		// parseNumberLiteral may produce int64 or float64 — accept either.
		if v, ok := paramC.DefaultVal.(float64); !ok || v != 5 {
			t.Fatalf("parameter[2].DefaultVal expected 5, got %v (%T)", paramC.DefaultVal, paramC.DefaultVal)
		}
	}
	paramD := deref(types, root.Parameters[3])
	if paramD.DefaultVal != nil {
		t.Fatalf("parameter[3] expected DefaultVal=nil for non-literal, got %v", paramD.DefaultVal)
	}
	if !containsFlag(paramD.Flags, "nonLiteralDefault") {
		t.Fatalf("parameter[3] expected flags to contain 'nonLiteralDefault', got %+v", paramD.Flags)
	}
}

func containsFlag(flags []string, want string) bool {
	for _, f := range flags {
		if f == want {
			return true
		}
	}
	return false
}
