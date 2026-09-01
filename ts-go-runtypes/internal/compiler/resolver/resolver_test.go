package resolver_test

import (
	"path/filepath"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

func fixturesDir(t *testing.T) string {
	t.Helper()
	abs, err := filepath.Abs("../../testfixtures")
	if err != nil {
		t.Fatalf("abs: %v", err)
	}
	return abs
}

// setup builds a Session against the on-disk testfixtures/ directory via
// the tsconfig path. Retained for the file-loading regression tests
// (TestScanFile_F17_*) — the rest of the suite uses setupInline.
func setup(t *testing.T) *resolver.Session {
	t.Helper()
	p, err := program.New(program.Options{
		Cwd:            fixturesDir(t),
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

func typeByID(types []*reflection.RunType, id string) *reflection.RunType {
	for _, t := range types {
		if t.ID == id {
			return t
		}
	}
	return nil
}

// deref walks a single ref slot to the actual RunType entry in `runTypes`.
func deref(types []*reflection.RunType, ref *reflection.RunType) *reflection.RunType {
	if ref == nil {
		return nil
	}
	if ref.Kind == reflection.KindRef {
		return typeByID(types, ref.ID)
	}
	return ref
}

func dump(r *resolver.Session) []*reflection.RunType {
	return r.Dispatch(protocol.Request{Op: protocol.OpDump}).RunTypes
}

// findMember walks an objectLiteral / class root and returns the named member.
func findMember(types []*reflection.RunType, root *reflection.RunType, name string) *reflection.RunType {
	for _, ref := range root.Children {
		m := deref(types, ref)
		if m != nil && m.Name == name {
			return m
		}
	}
	return nil
}

// resolveFile drives scanFiles on file and returns the RunType entry for the
// first site. Used by both file-loading (setup) and inline (setupInline)
// flows — both end up with a relative file name reachable from the
// resolver's cwd.
func resolveFile(t *testing.T, r *resolver.Session, file string) *reflection.RunType {
	t.Helper()
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{file}})
	if resp.Error != "" {
		t.Fatalf("scanFiles %s: %s", file, resp.Error)
	}
	if len(resp.Sites) == 0 {
		t.Fatalf("scanFiles %s returned no sites", file)
	}
	id := resp.Sites[0].ID
	tn := typeByID(dump(r), id)
	if tn == nil {
		t.Fatalf("type %q missing", id)
	}
	return tn
}

// ---- F1 — annotation primitive -----------------------------------------------

func TestF1_AnnotationPrimitive_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<string>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != reflection.KindString {
		t.Fatalf("expected KindString, got %d", tn.Kind)
	}
}

func TestF1_AnnotationPrimitive_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
const userName: string = 'mario';
getRunTypeId(userName);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != reflection.KindString {
		t.Fatalf("expected KindString, got %d", tn.Kind)
	}
}

// ---- F2 — annotation object alias `User` -------------------------------------

func TestF2_AnnotationObject_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type User = {id: number; name: string};
getRunTypeId<User>();
`
	r, root := resolveInline(t, code)
	assertF2User(t, r, root)
}

func TestF2_AnnotationObject_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type User = {id: number; name: string};
const u = {id: 1, name: 'm'} as User;
getRunTypeId(u);
`
	r, root := resolveInline(t, code)
	assertF2User(t, r, root)
}

func assertF2User(t *testing.T, r *resolver.Session, root *reflection.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != reflection.KindObjectLiteral {
		t.Fatalf("expected objectLiteral, got %+v", root)
	}
	if root.TypeName != "User" {
		t.Fatalf("expected typeName=User, got %q", root.TypeName)
	}
	id := findMember(types, root, "id")
	name := findMember(types, root, "name")
	if id == nil || name == nil {
		t.Fatalf("missing id/name members; types=%+v", root.Children)
	}
	if id.Kind != reflection.KindPropertySignature || name.Kind != reflection.KindPropertySignature {
		t.Fatalf("expected propertySignature kind, got id=%d name=%d", id.Kind, name.Kind)
	}
	idT := deref(types, id.Child)
	nameT := deref(types, name.Child)
	if idT == nil || idT.Kind != reflection.KindNumber {
		t.Fatalf("id.type expected number, got %+v", idT)
	}
	if nameT == nil || nameT.Kind != reflection.KindString {
		t.Fatalf("name.type expected string, got %+v", nameT)
	}
}

// ---- F3 — discriminated union ------------------------------------------------

func TestF3_Union_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type Result = {ok: true; value: number} | {ok: false; error: string};
getRunTypeId<Result>();
`
	_, root := resolveInline(t, code)
	assertF3Union(t, root)
}

func TestF3_Union_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type Result = {ok: true; value: number} | {ok: false; error: string};
declare const x: Result;
getRunTypeId(x);
`
	_, root := resolveInline(t, code)
	assertF3Union(t, root)
}

func assertF3Union(t *testing.T, root *reflection.RunType) {
	t.Helper()
	if root.Kind != reflection.KindUnion {
		t.Fatalf("expected union, got %+v", root)
	}
	if len(root.Children) != 2 {
		t.Fatalf("expected 2 union members, got %d", len(root.Children))
	}
}

// ---- F4 — inferred literal (number) ------------------------------------------
//
// F4 is fundamentally about *inference*: the value `42` is typed as the literal
// `42` at the declared-type level, but TS widens literal types during generic
// type-parameter inference. So `getRunTypeId(x)` where `const x = 42` lands
// on `KindNumber`. The static `getRunTypeId<42>()` form asks for the literal
// type directly and gets `KindLiteral`.

func TestF4_InferredLiteral_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
const x = 42;
getRunTypeId(x);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != reflection.KindNumber {
		t.Fatalf("expected KindNumber (widened during inference), got kind=%d", tn.Kind)
	}
}

func TestF4_InferredLiteral_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<42>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != reflection.KindLiteral {
		t.Fatalf("expected KindLiteral, got %d", tn.Kind)
	}
}

// ---- F5 — inferred function with inferred return -----------------------------

func TestF5_InferredFunction_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<(a: number, b: number) => number>();
`
	r, root := resolveInline(t, code)
	assertF5Function(t, r, root)
}

func TestF5_InferredFunction_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
const add = (a: number, b: number) => a + b;
getRunTypeId(add);
`
	r, root := resolveInline(t, code)
	assertF5Function(t, r, root)
}

func assertF5Function(t *testing.T, r *resolver.Session, root *reflection.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != reflection.KindFunction {
		t.Fatalf("expected function, got %+v", root)
	}
	if len(root.Parameters) != 2 {
		t.Fatalf("expected 2 params, got %d", len(root.Parameters))
	}
	a := deref(types, root.Parameters[0])
	if a == nil || a.Kind != reflection.KindParameter || a.Name != "a" {
		t.Fatalf("first param expected parameter:a, got %+v", a)
	}
	aType := deref(types, a.Child)
	if aType == nil || aType.Kind != reflection.KindNumber {
		t.Fatalf("param a type expected number, got %+v", aType)
	}
	ret := deref(types, root.Return)
	if ret == nil || ret.Kind != reflection.KindNumber {
		t.Fatalf("return expected number, got %+v", ret)
	}
}

// ---- F6 — router shape inferred from generic R -----------------------

func TestF6_RouterInference_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<{sayHello: (name: string) => string}>();
`
	r, root := resolveInline(t, code)
	assertF6Router(t, r, root)
}

func TestF6_RouterInference_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
const sayHello = (name: string): string => 'Hello ' + name;
const routes = {sayHello};
getRunTypeId(routes);
`
	r, root := resolveInline(t, code)
	assertF6Router(t, r, root)
}

func assertF6Router(t *testing.T, r *resolver.Session, root *reflection.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != reflection.KindObjectLiteral {
		t.Fatalf("expected objectLiteral, got %+v", root)
	}
	sayHello := findMember(types, root, "sayHello")
	if sayHello == nil {
		t.Fatalf("missing sayHello member")
	}
	var fn *reflection.RunType
	switch sayHello.Kind {
	case reflection.KindMethodSignature:
		fn = sayHello
	case reflection.KindPropertySignature:
		fn = deref(types, sayHello.Child)
	default:
		t.Fatalf("sayHello has unexpected kind %d", sayHello.Kind)
	}
	if fn == nil {
		t.Fatalf("sayHello has no function shape")
	}
	if len(fn.Parameters) != 1 {
		t.Fatalf("expected 1 param, got %d", len(fn.Parameters))
	}
	pname := deref(types, fn.Parameters[0])
	if pname == nil || pname.Name != "name" {
		t.Fatalf("expected param name=name, got %+v", pname)
	}
	pT := deref(types, pname.Child)
	if pT == nil || pT.Kind != reflection.KindString {
		t.Fatalf("name param expected string, got %+v", pT)
	}
	ret := deref(types, fn.Return)
	if ret == nil || ret.Kind != reflection.KindString {
		t.Fatalf("return expected string, got %+v", ret)
	}
}

// ---- F7 — inferred generic ---------------------------------------------------
//
// The generic-wrap pattern only makes sense in reflection form: the
// inferred return type is what we want to capture. The static-form
// counterpart spells the resulting shape directly.

func TestF7_InferredGeneric_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<{a: number; b: string}>();
`
	r, root := resolveInline(t, code)
	assertF7Object(t, r, root)
}

func TestF7_InferredGeneric_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
function wrap<T>(x: T): T {
  return x;
}
getRunTypeId(wrap({a: 1, b: 'x'}));
`
	r, root := resolveInline(t, code)
	assertF7Object(t, r, root)
}

func assertF7Object(t *testing.T, r *resolver.Session, root *reflection.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != reflection.KindObjectLiteral {
		t.Fatalf("expected objectLiteral, got %+v", root)
	}
	a := findMember(types, root, "a")
	b := findMember(types, root, "b")
	if a == nil || b == nil {
		t.Fatalf("missing a/b properties")
	}
	if deref(types, a.Child).Kind != reflection.KindNumber {
		t.Fatalf("a expected number, got %+v", deref(types, a.Child))
	}
	if deref(types, b.Child).Kind != reflection.KindString {
		t.Fatalf("b expected string, got %+v", deref(types, b.Child))
	}
}

// ---- F8 — factory inference --------------------------------------------------

func TestF8_FactoryInference_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<{id: number; name: string}>();
`
	r, root := resolveInline(t, code)
	assertF8IdName(t, r, root)
}

func TestF8_FactoryInference_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
const makeUser = (id: number, name: string) => ({id, name});
const u = makeUser(1, 'm');
getRunTypeId(u);
`
	r, root := resolveInline(t, code)
	assertF8IdName(t, r, root)
}

func assertF8IdName(t *testing.T, r *resolver.Session, root *reflection.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != reflection.KindObjectLiteral {
		t.Fatalf("expected objectLiteral, got %+v", root)
	}
	id := findMember(types, root, "id")
	name := findMember(types, root, "name")
	if id == nil || deref(types, id.Child).Kind != reflection.KindNumber {
		t.Fatalf("id expected number, got %+v", id)
	}
	if name == nil || deref(types, name.Child).Kind != reflection.KindString {
		t.Fatalf("name expected string, got %+v", name)
	}
}

// ---- Dedup -------------------------------------------------------------------

func TestDedupAcrossQueries(t *testing.T) {
	const primitive = `import {getRunTypeId} from '@mionjs/run-types';
const userName: string = 'mario';
getRunTypeId(userName);
`
	const inferred = `import {getRunTypeId} from '@mionjs/run-types';
const x = 42;
getRunTypeId(x);
`
	r := setupInline(t, map[string]string{
		"a.ts": primitive,
		"b.ts": inferred,
	})
	r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"b.ts"}})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if len(resp.Added) != 0 {
		t.Fatalf("expected no new types on dedup, got %d", len(resp.Added))
	}
}

// ---- F12 — array (`string[]`) ------------------------------------------------

func TestF12_Array_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<string[]>();
`
	r, root := resolveInline(t, code)
	assertF12Array(t, r, root)
}

func TestF12_Array_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
const xs: string[] = ['a', 'b'];
getRunTypeId(xs);
`
	r, root := resolveInline(t, code)
	assertF12Array(t, r, root)
}

func assertF12Array(t *testing.T, r *resolver.Session, root *reflection.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != reflection.KindArray {
		t.Fatalf("expected array, got %+v", root)
	}
	elem := deref(types, root.Child)
	if elem == nil || elem.Kind != reflection.KindString {
		t.Fatalf("array element expected string, got %+v", elem)
	}
}

// ---- F13 — tuple (`[number, string?]`) ---------------------------------------

func TestF13_Tuple_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<[number, string?]>();
`
	r, root := resolveInline(t, code)
	assertF13Tuple(t, r, root)
}

func TestF13_Tuple_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
const tup: [number, string?] = [1];
getRunTypeId(tup);
`
	r, root := resolveInline(t, code)
	assertF13Tuple(t, r, root)
}

func assertF13Tuple(t *testing.T, r *resolver.Session, root *reflection.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != reflection.KindTuple {
		t.Fatalf("expected tuple, got %+v", root)
	}
	if len(root.Children) != 2 {
		t.Fatalf("expected 2 tuple members, got %d", len(root.Children))
	}
	first := deref(types, root.Children[0])
	second := deref(types, root.Children[1])
	if first == nil || first.Kind != reflection.KindTupleMember || deref(types, first.Child).Kind != reflection.KindNumber {
		t.Fatalf("first member expected tupleMember:number, got %+v", first)
	}
	if second == nil || second.Kind != reflection.KindTupleMember {
		t.Fatalf("second member expected tupleMember, got %+v", second)
	}
	if !second.Optional {
		t.Fatalf("second member expected optional=true")
	}
	if deref(types, second.Child).Kind != reflection.KindString {
		t.Fatalf("second member type expected string, got %+v", deref(types, second.Child))
	}
}

// ---- F14 — promise (`Promise<number>`) ---------------------------------------

func TestF14_Promise_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<Promise<number>>();
`
	r, root := resolveInline(t, code)
	assertF14Promise(t, r, root)
}

func TestF14_Promise_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
declare const p: Promise<number>;
getRunTypeId(p);
`
	r, root := resolveInline(t, code)
	assertF14Promise(t, r, root)
}

func assertF14Promise(t *testing.T, r *resolver.Session, root *reflection.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != reflection.KindPromise {
		t.Fatalf("expected promise, got %+v", root)
	}
	val := deref(types, root.Child)
	if val == nil || val.Kind != reflection.KindNumber {
		t.Fatalf("promise value expected number, got %+v", val)
	}
}

// ---- F15 — class -------------------------------------------------------------

func TestF15_Class_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
class User {
  id: number = 0;
  greet(): void {}
}
getRunTypeId<User>();
`
	r, root := resolveInline(t, code)
	assertF15Class(t, r, root)
}

func TestF15_Class_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
class User {
  id: number = 0;
  greet(): void {}
}
declare const u: User;
getRunTypeId(u);
`
	r, root := resolveInline(t, code)
	assertF15Class(t, r, root)
}

func assertF15Class(t *testing.T, r *resolver.Session, root *reflection.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != reflection.KindClass {
		t.Fatalf("expected class, got %+v", root)
	}
	if root.TypeName != "User" {
		t.Fatalf("expected class typeName=User, got %q", root.TypeName)
	}
	id := findMember(types, root, "id")
	greet := findMember(types, root, "greet")
	if id == nil || id.Kind != reflection.KindProperty {
		t.Fatalf("id expected class property, got %+v", id)
	}
	if greet == nil || greet.Kind != reflection.KindMethod {
		t.Fatalf("greet expected class method, got %+v", greet)
	}
}

// ---- F16 — index signature ---------------------------------------------------

func TestF16_IndexSignature_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
interface M {
  [k: string]: number;
}
getRunTypeId<M>();
`
	r, root := resolveInline(t, code)
	assertF16Index(t, r, root)
}

func TestF16_IndexSignature_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
interface M {
  [k: string]: number;
}
declare const m: M;
getRunTypeId(m);
`
	r, root := resolveInline(t, code)
	assertF16Index(t, r, root)
}

func assertF16Index(t *testing.T, r *resolver.Session, root *reflection.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != reflection.KindObjectLiteral {
		t.Fatalf("expected objectLiteral, got %+v", root)
	}
	var idx *reflection.RunType
	for _, ref := range root.Children {
		m := deref(types, ref)
		if m != nil && m.Kind == reflection.KindIndexSignature {
			idx = m
			break
		}
	}
	if idx == nil {
		t.Fatalf("expected at least one indexSignature, got types=%+v", root.Children)
	}
	if deref(types, idx.Index).Kind != reflection.KindString {
		t.Fatalf("index expected string, got %+v", deref(types, idx.Index))
	}
	if deref(types, idx.Child).Kind != reflection.KindNumber {
		t.Fatalf("value expected number, got %+v", deref(types, idx.Child))
	}
}
