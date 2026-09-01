package resolver_test

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// Function-family tests. The serializer already produces KindFunction /
// KindMethod / KindMethodSignature / KindCallSignature with Parameters
// and Return populated; F28 in collection_test.go covers parameter
// defaults + position. The cases here close the gaps the survey turned
// up: rest parameters (the one substantive serializer fix in this PR),
// return-type walking, and method / methodSignature / callSignature
// full-shape assertions.
//
// Each scenario has paired *_Static / *_Reflect tests per the marker
// test coverage rule (CLAUDE.md) and shares an assertion helper.

// ---- F35 — rest-only function ----------------------------------------------
//
//	(...args: string[]) => void
//
// The rest flag emission in projectSignatureInto is the one new serializer
// path; F35 is the most direct exercise of it.

func TestF35_RestOnlyFunction_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type Fn = (...args: string[]) => void;
getRunTypeId<Fn>();
`
	r, root := resolveInline(t, code)
	assertF35RestOnlyFunction(t, r, root)
}

func TestF35_RestOnlyFunction_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
function fn(...args: string[]): void {}
getRunTypeId(fn);
`
	r, root := resolveInline(t, code)
	assertF35RestOnlyFunction(t, r, root)
}

func assertF35RestOnlyFunction(t *testing.T, r *resolver.Session, root *reflection.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != reflection.KindFunction {
		t.Fatalf("expected KindFunction, got %+v", root)
	}
	if len(root.Parameters) != 1 {
		t.Fatalf("expected 1 parameter, got %d", len(root.Parameters))
	}
	param := deref(types, root.Parameters[0])
	if param == nil || param.Kind != reflection.KindParameter {
		t.Fatalf("parameter expected KindParameter, got %+v", param)
	}
	if param.Name != "args" {
		t.Fatalf("expected param.Name=args, got %q", param.Name)
	}
	if param.Position == nil || *param.Position != 0 {
		t.Fatalf("expected position=0, got %+v", param.Position)
	}
	if !containsFlag(param.Flags, "rest") {
		t.Fatalf("expected param.Flags to contain 'rest', got %+v", param.Flags)
	}
	// Rest preserves the array shape; consumers infer the element via array.child.
	child := deref(types, param.Child)
	if child == nil || child.Kind != reflection.KindArray {
		t.Fatalf("expected param.Child=KindArray, got %+v", child)
	}
	if elem := deref(types, child.Child); elem == nil || elem.Kind != reflection.KindString {
		t.Fatalf("expected array element=KindString, got %+v", elem)
	}
	// Void return.
	ret := deref(types, root.Return)
	if ret == nil || ret.Kind != reflection.KindVoid {
		t.Fatalf("expected Return=KindVoid, got %+v", ret)
	}
}

// ---- F36 — mixed function (positional + optional + rest + return) -----------
//
//	(a: number, b?: string, ...rest: boolean[]) => string

func TestF36_MixedFunction_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type Fn = (a: number, b?: string, ...rest: boolean[]) => string;
getRunTypeId<Fn>();
`
	r, root := resolveInline(t, code)
	assertF36MixedFunction(t, r, root)
}

func TestF36_MixedFunction_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
function fn(a: number, b?: string, ...rest: boolean[]): string { return ""; }
getRunTypeId(fn);
`
	r, root := resolveInline(t, code)
	assertF36MixedFunction(t, r, root)
}

func assertF36MixedFunction(t *testing.T, r *resolver.Session, root *reflection.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != reflection.KindFunction {
		t.Fatalf("expected KindFunction, got %+v", root)
	}
	if len(root.Parameters) != 3 {
		t.Fatalf("expected 3 parameters, got %d", len(root.Parameters))
	}

	a := deref(types, root.Parameters[0])
	if a.Name != "a" || a.Position == nil || *a.Position != 0 {
		t.Fatalf("param[0] expected name=a position=0, got %+v", a)
	}
	if a.Optional {
		t.Fatalf("param[0] expected Optional=false, got %+v", a)
	}
	if containsFlag(a.Flags, "rest") {
		t.Fatalf("param[0] should not be rest, got flags=%+v", a.Flags)
	}
	if at := deref(types, a.Child); at == nil || at.Kind != reflection.KindNumber {
		t.Fatalf("param[0].Child expected KindNumber, got %+v", at)
	}

	b := deref(types, root.Parameters[1])
	if b.Name != "b" || b.Position == nil || *b.Position != 1 {
		t.Fatalf("param[1] expected name=b position=1, got %+v", b)
	}
	if !b.Optional {
		t.Fatalf("param[1] expected Optional=true, got %+v", b)
	}
	if bt := deref(types, b.Child); bt == nil || bt.Kind != reflection.KindString {
		t.Fatalf("param[1].Child expected KindString, got %+v", bt)
	}

	rest := deref(types, root.Parameters[2])
	if rest.Name != "rest" || rest.Position == nil || *rest.Position != 2 {
		t.Fatalf("param[2] expected name=rest position=2, got %+v", rest)
	}
	if !containsFlag(rest.Flags, "rest") {
		t.Fatalf("param[2] expected flags to contain 'rest', got %+v", rest.Flags)
	}
	restArr := deref(types, rest.Child)
	if restArr == nil || restArr.Kind != reflection.KindArray {
		t.Fatalf("param[2].Child expected KindArray, got %+v", restArr)
	}
	if elem := deref(types, restArr.Child); elem == nil || elem.Kind != reflection.KindBoolean {
		t.Fatalf("rest element expected KindBoolean, got %+v", elem)
	}

	ret := deref(types, root.Return)
	if ret == nil || ret.Kind != reflection.KindString {
		t.Fatalf("Return expected KindString, got %+v", ret)
	}
}

// ---- F37 — function with Promise<object> return -----------------------------
//
//	(x: number) => Promise<{ok: boolean}>

func TestF37_PromiseReturn_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type Fn = (x: number) => Promise<{ok: boolean}>;
getRunTypeId<Fn>();
`
	r, root := resolveInline(t, code)
	assertF37PromiseReturn(t, r, root)
}

func TestF37_PromiseReturn_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
async function fn(x: number): Promise<{ok: boolean}> { return {ok: true}; }
getRunTypeId(fn);
`
	r, root := resolveInline(t, code)
	assertF37PromiseReturn(t, r, root)
}

func assertF37PromiseReturn(t *testing.T, r *resolver.Session, root *reflection.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != reflection.KindFunction {
		t.Fatalf("expected KindFunction, got %+v", root)
	}
	if len(root.Parameters) != 1 {
		t.Fatalf("expected 1 parameter, got %d", len(root.Parameters))
	}
	if x := deref(types, root.Parameters[0]); x == nil || x.Name != "x" {
		t.Fatalf("param[0] expected name=x, got %+v", x)
	}
	ret := deref(types, root.Return)
	if ret == nil || ret.Kind != reflection.KindPromise {
		t.Fatalf("Return expected KindPromise, got %+v", ret)
	}
	resolved := deref(types, ret.Child)
	if resolved == nil || resolved.Kind != reflection.KindObjectLiteral {
		t.Fatalf("Promise resolved type expected KindObjectLiteral, got %+v", resolved)
	}
	ok := findMember(types, resolved, "ok")
	if ok == nil {
		t.Fatalf("missing 'ok' property; children=%+v", resolved.Children)
	}
	if okChild := deref(types, ok.Child); okChild == nil || okChild.Kind != reflection.KindBoolean {
		t.Fatalf("ok.child expected KindBoolean, got %+v", okChild)
	}
}

// ---- F38 — class method full shape -----------------------------------------
//
//	class Service { greet(name: string, opts?: {tag: string}): string { … } }

func TestF38_ClassMethodFullShape_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
class Service {
  greet(name: string, opts?: {tag: string}): string { return ""; }
}
getRunTypeId<Service>();
`
	r, root := resolveInline(t, code)
	assertF38ClassMethodFullShape(t, r, root)
}

func TestF38_ClassMethodFullShape_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
class Service {
  greet(name: string, opts?: {tag: string}): string { return ""; }
}
declare const value: Service;
getRunTypeId(value);
`
	r, root := resolveInline(t, code)
	assertF38ClassMethodFullShape(t, r, root)
}

func assertF38ClassMethodFullShape(t *testing.T, r *resolver.Session, root *reflection.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != reflection.KindClass {
		t.Fatalf("expected KindClass, got %+v", root)
	}
	greet := findMember(types, root, "greet")
	if greet == nil {
		t.Fatalf("missing 'greet' method; children=%+v", root.Children)
	}
	if greet.Kind != reflection.KindMethod {
		t.Fatalf("greet expected KindMethod, got kind=%d", greet.Kind)
	}
	if len(greet.Parameters) != 2 {
		t.Fatalf("greet expected 2 params, got %d", len(greet.Parameters))
	}
	name := deref(types, greet.Parameters[0])
	if name.Name != "name" || name.Position == nil || *name.Position != 0 {
		t.Fatalf("greet.param[0] expected name=name position=0, got %+v", name)
	}
	if nt := deref(types, name.Child); nt == nil || nt.Kind != reflection.KindString {
		t.Fatalf("greet.param[0].Child expected KindString, got %+v", nt)
	}
	opts := deref(types, greet.Parameters[1])
	if opts.Name != "opts" || !opts.Optional || opts.Position == nil || *opts.Position != 1 {
		t.Fatalf("greet.param[1] expected name=opts optional position=1, got %+v", opts)
	}
	optsObj := deref(types, opts.Child)
	if optsObj == nil || optsObj.Kind != reflection.KindObjectLiteral {
		t.Fatalf("greet.param[1].Child expected KindObjectLiteral, got %+v", optsObj)
	}
	tag := findMember(types, optsObj, "tag")
	if tag == nil {
		t.Fatalf("missing 'tag' on opts; children=%+v", optsObj.Children)
	}
	if tagChild := deref(types, tag.Child); tagChild == nil || tagChild.Kind != reflection.KindString {
		t.Fatalf("opts.tag.child expected KindString, got %+v", tagChild)
	}
	ret := deref(types, greet.Return)
	if ret == nil || ret.Kind != reflection.KindString {
		t.Fatalf("greet.Return expected KindString, got %+v", ret)
	}
}

// ---- F39 — interface method-signature full shape ----------------------------
//
//	interface I { greet(name: string): string; }

func TestF39_MethodSignatureFullShape_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
interface I { greet(name: string): string; }
getRunTypeId<I>();
`
	r, root := resolveInline(t, code)
	assertF39MethodSignatureFullShape(t, r, root)
}

func TestF39_MethodSignatureFullShape_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
interface I { greet(name: string): string; }
declare const value: I;
getRunTypeId(value);
`
	r, root := resolveInline(t, code)
	assertF39MethodSignatureFullShape(t, r, root)
}

func assertF39MethodSignatureFullShape(t *testing.T, r *resolver.Session, root *reflection.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != reflection.KindObjectLiteral {
		t.Fatalf("expected KindObjectLiteral, got %+v", root)
	}
	greet := findMember(types, root, "greet")
	if greet == nil {
		t.Fatalf("missing 'greet'; children=%+v", root.Children)
	}
	if greet.Kind != reflection.KindMethodSignature {
		t.Fatalf("greet expected KindMethodSignature, got kind=%d", greet.Kind)
	}
	if len(greet.Parameters) != 1 {
		t.Fatalf("greet expected 1 param, got %d", len(greet.Parameters))
	}
	name := deref(types, greet.Parameters[0])
	if name.Name != "name" || name.Position == nil || *name.Position != 0 {
		t.Fatalf("greet.param[0] expected name=name position=0, got %+v", name)
	}
	if nt := deref(types, name.Child); nt == nil || nt.Kind != reflection.KindString {
		t.Fatalf("greet.param[0].Child expected KindString, got %+v", nt)
	}
	ret := deref(types, greet.Return)
	if ret == nil || ret.Kind != reflection.KindString {
		t.Fatalf("greet.Return expected KindString, got %+v", ret)
	}
}

// ---- F40 — call signature in mixed object -----------------------------------
//
//	interface Tagged { (x: number): string; tag: "tagged"; }
//
// An object with BOTH a call signature AND other properties keeps the
// KindObjectLiteral dispatch and emits the call sig as a KindCallSignature
// child alongside the property children — distinct from the "single call
// sig + no properties → KindFunction" path that F35/F36/F37 exercise.

func TestF40_CallSignatureInMixedObject_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
interface Tagged { (x: number): string; tag: "tagged"; }
getRunTypeId<Tagged>();
`
	r, root := resolveInline(t, code)
	assertF40CallSignature(t, r, root)
}

// Reflect form omitted on purpose — constructing a callable-with-properties
// value at the source level is awkward and produces a different shape
// (TypeScript widens `tag` to string). The static form covers the
// canonical interface shape; the marker-coverage parity is preserved by
// F35–F39 reflect tests already exercising the marker.DetectAny path.

func assertF40CallSignature(t *testing.T, r *resolver.Session, root *reflection.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != reflection.KindObjectLiteral {
		t.Fatalf("expected KindObjectLiteral, got %+v", root)
	}
	var callSig *reflection.RunType
	for _, ref := range root.Children {
		member := deref(types, ref)
		if member != nil && member.Kind == reflection.KindCallSignature {
			callSig = member
			break
		}
	}
	if callSig == nil {
		t.Fatalf("expected a KindCallSignature child; got children=%+v", root.Children)
	}
	if len(callSig.Parameters) != 1 {
		t.Fatalf("callSig expected 1 param, got %d", len(callSig.Parameters))
	}
	if x := deref(types, callSig.Parameters[0]); x == nil || x.Name != "x" || x.Position == nil || *x.Position != 0 {
		t.Fatalf("callSig.param[0] expected name=x position=0, got %+v", x)
	}
	if ret := deref(types, callSig.Return); ret == nil || ret.Kind != reflection.KindString {
		t.Fatalf("callSig.Return expected KindString, got %+v", ret)
	}

	tag := findMember(types, root, "tag")
	if tag == nil {
		t.Fatalf("missing 'tag' property; children=%+v", root.Children)
	}
	tagChild := deref(types, tag.Child)
	if tagChild == nil || tagChild.Kind != reflection.KindLiteral {
		t.Fatalf("tag.child expected KindLiteral, got %+v", tagChild)
	}
	if v, ok := tagChild.Literal.(string); !ok || v != "tagged" {
		t.Fatalf("tag literal expected \"tagged\", got %#v", tagChild.Literal)
	}
}
