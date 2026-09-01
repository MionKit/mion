package resolver_test

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// Circular-type tests adapted from circularRefs.spec.ts
// (ref: packages/run-types/src/nodes/collection/circularRefs.spec.ts).
// The reference spec exercises RT validation behaviour; this suite exercises only
// the structural projection — that our serializer walks every shape without
// infinite recursion, lands one canonical RunType per recursive type in the
// cache, and that the back-edge closes via id equality (the wire-level
// equivalent of runtime referential equality).
//
// Each scenario has paired *_Static / *_Reflect tests per the marker test
// coverage rule (CLAUDE.md).

// ---- F29 — Circular object with optional self-reference ---------------------
//
//	interface Circular {
//	    n: number;
//	    s: string;
//	    c?: Circular;
//	    d?: Date;
//	}

func TestF29_CircularObject_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
interface Circular {
  n: number;
  s: string;
  c?: Circular;
  d?: Date;
}
getRunTypeId<Circular>();
`
	r, root := resolveInline(t, code)
	assertF29CircularObject(t, r, root)
}

func TestF29_CircularObject_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
interface Circular {
  n: number;
  s: string;
  c?: Circular;
  d?: Date;
}
declare const value: Circular;
getRunTypeId(value);
`
	r, root := resolveInline(t, code)
	assertF29CircularObject(t, r, root)
}

func assertF29CircularObject(t *testing.T, r *resolver.Session, root *reflection.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != reflection.KindObjectLiteral {
		t.Fatalf("expected KindObjectLiteral, got %+v", root)
	}
	rootID := root.ID
	if got := countByID(types, rootID); got != 1 {
		t.Fatalf("expected Circular to appear exactly once in cache, got %d", got)
	}
	// Circular references itself via `c?: Circular`, so the serializer's
	// back-edge detection must flag the canonical node (T1).
	if !root.IsCircular {
		t.Fatalf("expected Circular root to have IsCircular=true (self-referential via 'c')")
	}

	nMember := findMember(types, root, "n")
	if nMember == nil || deref(types, nMember.Child).Kind != reflection.KindNumber {
		t.Fatalf("n expected number, got %+v", nMember)
	}
	sMember := findMember(types, root, "s")
	if sMember == nil || deref(types, sMember.Child).Kind != reflection.KindString {
		t.Fatalf("s expected string, got %+v", sMember)
	}

	cMember := findMember(types, root, "c")
	if cMember == nil {
		t.Fatalf("missing 'c' property; types=%+v", root.Children)
	}
	if !cMember.Optional {
		t.Fatalf("c expected Optional=true, got %+v", cMember)
	}
	back := deref(types, cMember.Child)
	if back == nil {
		t.Fatalf("c.child did not resolve")
	}
	if back.ID != rootID {
		t.Fatalf("expected c.child to close cycle on rootID=%s, got %s", rootID, back.ID)
	}

	dMember := findMember(types, root, "d")
	if dMember == nil || !dMember.Optional {
		t.Fatalf("d expected optional, got %+v", dMember)
	}
	if dt := deref(types, dMember.Child); dt == nil || dt.Kind != reflection.KindClass || dt.TypeName != "Date" {
		t.Fatalf("d.child expected KindClass Date, got %+v", dt)
	}
}

// ---- F30 — Circular array + union -------------------------------------------
//
//	type CuArray = (CuArray | Date | number | string)[];
//
// Union projection exists in serialize.go (TypeFlagsUnion branch) and the
// recursion path runs through Array → Union → CuArray. This test asserts the
// cycle still closes through the union member that loops back. Union is
// otherwise out of scope for top-level coverage and gets its own ticket
// later — here we only verify the cycle-safety property.

func TestF30_CircularArrayUnion_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type CuArray = (CuArray | Date | number | string)[];
getRunTypeId<CuArray>();
`
	r, root := resolveInline(t, code)
	assertF30CircularArrayUnion(t, r, root)
}

func TestF30_CircularArrayUnion_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type CuArray = (CuArray | Date | number | string)[];
declare const value: CuArray;
getRunTypeId(value);
`
	r, root := resolveInline(t, code)
	assertF30CircularArrayUnion(t, r, root)
}

func assertF30CircularArrayUnion(t *testing.T, r *resolver.Session, root *reflection.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != reflection.KindArray {
		t.Fatalf("expected outer KindArray, got %+v", root)
	}
	rootID := root.ID
	if got := countByID(types, rootID); got != 1 {
		t.Fatalf("expected CuArray to appear exactly once in cache, got %d", got)
	}

	union := deref(types, root.Child)
	if union == nil || union.Kind != reflection.KindUnion {
		t.Fatalf("expected element KindUnion, got %+v", union)
	}

	// Walk the union; one constituent must close back on rootID, and the
	// expected scalars / Date must all appear.
	wantKinds := map[reflection.ReflectionKind]bool{
		reflection.KindNumber: false,
		reflection.KindString: false,
	}
	var hasDate, hasBackEdge bool
	for _, ref := range union.Children {
		member := deref(types, ref)
		if member == nil {
			continue
		}
		if member.ID == rootID {
			hasBackEdge = true
			continue
		}
		if member.Kind == reflection.KindClass && member.TypeName == "Date" {
			hasDate = true
			continue
		}
		if _, ok := wantKinds[member.Kind]; ok {
			wantKinds[member.Kind] = true
		}
	}
	if !hasBackEdge {
		t.Fatalf("expected one union member to close cycle on rootID=%s; union=%+v", rootID, union.Children)
	}
	if !hasDate {
		t.Fatalf("expected Date constituent in union; union=%+v", union.Children)
	}
	for kind, found := range wantKinds {
		if !found {
			t.Fatalf("expected union to contain kind=%d", kind)
		}
	}
}

// ---- F31 — Circular object with tuple ---------------------------------------
//
//	interface CircularTuple {
//	    tuple: [bigint, CircularTuple?];
//	}

func TestF31_CircularTuple_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
interface CircularTuple {
  tuple: [bigint, CircularTuple?];
}
getRunTypeId<CircularTuple>();
`
	r, root := resolveInline(t, code)
	assertF31CircularTuple(t, r, root)
}

func TestF31_CircularTuple_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
interface CircularTuple {
  tuple: [bigint, CircularTuple?];
}
declare const value: CircularTuple;
getRunTypeId(value);
`
	r, root := resolveInline(t, code)
	assertF31CircularTuple(t, r, root)
}

func assertF31CircularTuple(t *testing.T, r *resolver.Session, root *reflection.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != reflection.KindObjectLiteral {
		t.Fatalf("expected KindObjectLiteral, got %+v", root)
	}
	rootID := root.ID
	if got := countByID(types, rootID); got != 1 {
		t.Fatalf("expected CircularTuple to appear exactly once in cache, got %d", got)
	}

	tupleProp := findMember(types, root, "tuple")
	if tupleProp == nil {
		t.Fatalf("missing 'tuple' property; types=%+v", root.Children)
	}
	tuple := deref(types, tupleProp.Child)
	if tuple == nil || tuple.Kind != reflection.KindTuple {
		t.Fatalf("tuple.child expected KindTuple, got %+v", tuple)
	}
	if len(tuple.Children) != 2 {
		t.Fatalf("expected 2 tuple members, got %d", len(tuple.Children))
	}

	first := deref(types, tuple.Children[0])
	if first == nil || first.Kind != reflection.KindTupleMember {
		t.Fatalf("first member expected KindTupleMember, got %+v", first)
	}
	if first.Position == nil || *first.Position != 0 {
		t.Fatalf("first member expected Position=0, got %+v", first.Position)
	}
	if firstType := deref(types, first.Child); firstType == nil || firstType.Kind != reflection.KindBigInt {
		t.Fatalf("first member.child expected KindBigInt, got %+v", firstType)
	}

	second := deref(types, tuple.Children[1])
	if second == nil || second.Kind != reflection.KindTupleMember {
		t.Fatalf("second member expected KindTupleMember, got %+v", second)
	}
	if !second.Optional {
		t.Fatalf("second member expected Optional=true, got %+v", second)
	}
	if second.Position == nil || *second.Position != 1 {
		t.Fatalf("second member expected Position=1, got %+v", second.Position)
	}
	back := deref(types, second.Child)
	if back == nil {
		t.Fatalf("second tuple member child did not resolve")
	}
	if back.ID != rootID {
		t.Fatalf("expected second tuple member to close cycle on rootID=%s, got %s", rootID, back.ID)
	}
}

// ---- F32 — Circular object with index property ------------------------------
//
//	interface CircularIndex {
//	    index: {[key: string]: CircularIndex};
//	}

func TestF32_CircularIndex_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
interface CircularIndex {
  index: {[key: string]: CircularIndex};
}
getRunTypeId<CircularIndex>();
`
	r, root := resolveInline(t, code)
	assertF32CircularIndex(t, r, root)
}

func TestF32_CircularIndex_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
interface CircularIndex {
  index: {[key: string]: CircularIndex};
}
declare const value: CircularIndex;
getRunTypeId(value);
`
	r, root := resolveInline(t, code)
	assertF32CircularIndex(t, r, root)
}

func assertF32CircularIndex(t *testing.T, r *resolver.Session, root *reflection.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != reflection.KindObjectLiteral {
		t.Fatalf("expected KindObjectLiteral, got %+v", root)
	}
	rootID := root.ID
	if got := countByID(types, rootID); got != 1 {
		t.Fatalf("expected CircularIndex to appear exactly once in cache, got %d", got)
	}

	indexProp := findMember(types, root, "index")
	if indexProp == nil {
		t.Fatalf("missing 'index' property; types=%+v", root.Children)
	}
	indexObj := deref(types, indexProp.Child)
	if indexObj == nil || indexObj.Kind != reflection.KindObjectLiteral {
		t.Fatalf("index.child expected KindObjectLiteral, got %+v", indexObj)
	}

	var indexSig *reflection.RunType
	for _, ref := range indexObj.Children {
		member := deref(types, ref)
		if member != nil && member.Kind == reflection.KindIndexSignature {
			indexSig = member
			break
		}
	}
	if indexSig == nil {
		t.Fatalf("expected one KindIndexSignature on index object; children=%+v", indexObj.Children)
	}
	if idxKey := deref(types, indexSig.Index); idxKey == nil || idxKey.Kind != reflection.KindString {
		t.Fatalf("index signature key expected KindString, got %+v", idxKey)
	}
	back := deref(types, indexSig.Child)
	if back == nil {
		t.Fatalf("index signature value did not resolve")
	}
	if back.ID != rootID {
		t.Fatalf("expected index signature value to close cycle on rootID=%s, got %s", rootID, back.ID)
	}
}

// ---- F33 — Circular object with deep nested anonymous objects ---------------
//
//	interface CircularDeep {
//	    deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
//	}
//
// Cycle path: CircularDeep → deep1 → ObjectLiteral → deep2 → ObjectLiteral →
// deep3 → ObjectLiteral → deep4 (optional) → CircularDeep. Each intermediate
// inline-object layer is a distinct anonymous shape, but the root must still
// appear exactly once.

func TestF33_CircularDeep_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
interface CircularDeep {
  deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
}
getRunTypeId<CircularDeep>();
`
	r, root := resolveInline(t, code)
	assertF33CircularDeep(t, r, root)
}

func TestF33_CircularDeep_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
interface CircularDeep {
  deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
}
declare const value: CircularDeep;
getRunTypeId(value);
`
	r, root := resolveInline(t, code)
	assertF33CircularDeep(t, r, root)
}

func assertF33CircularDeep(t *testing.T, r *resolver.Session, root *reflection.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != reflection.KindObjectLiteral {
		t.Fatalf("expected KindObjectLiteral, got %+v", root)
	}
	rootID := root.ID
	if got := countByID(types, rootID); got != 1 {
		t.Fatalf("expected CircularDeep to appear exactly once in cache, got %d", got)
	}

	deep1 := walkProp(t, types, root, "deep1", false)
	deep2 := walkProp(t, types, deep1, "deep2", false)
	deep3 := walkProp(t, types, deep2, "deep3", false)
	deep4Member := findMember(types, deep3, "deep4")
	if deep4Member == nil {
		t.Fatalf("missing 'deep4' property; types=%+v", deep3.Children)
	}
	if !deep4Member.Optional {
		t.Fatalf("deep4 expected Optional=true, got %+v", deep4Member)
	}
	back := deref(types, deep4Member.Child)
	if back == nil {
		t.Fatalf("deep4.child did not resolve")
	}
	if back.ID != rootID {
		t.Fatalf("expected deep4.child to close cycle on rootID=%s, got %s", rootID, back.ID)
	}
}

// walkProp drills from `parent` into the named property's resolved child
// object. Fails the test on a missing property or a non-object-literal
// child. Used by the F33 deep-walk assertion.
func walkProp(t *testing.T, types []*reflection.RunType, parent *reflection.RunType, name string, expectOptional bool) *reflection.RunType {
	t.Helper()
	member := findMember(types, parent, name)
	if member == nil {
		t.Fatalf("missing %q property on %s; children=%+v", name, parent.ID, parent.Children)
	}
	if expectOptional && !member.Optional {
		t.Fatalf("%s.%s expected Optional=true, got %+v", parent.ID, name, member)
	}
	child := deref(types, member.Child)
	if child == nil || child.Kind != reflection.KindObjectLiteral {
		t.Fatalf("%s.%s child expected KindObjectLiteral, got %+v", parent.ID, name, child)
	}
	return child
}

// ---- F34 — Interface with nested circular + multiple circular --------------
//
// Adapted from the `Interface with nested circular + multiple circular`
// describe in interface.spec.ts:763. Three interleaved recursive shapes:
//
//	interface ICircularDeep {
//	    name: string;
//	    big: bigint;
//	    embedded: { hello: string; child?: ICircularDeep };  // back-edge via inline
//	}
//
//	interface ICircularDate {
//	    date: Date;
//	    month: number;
//	    year: number;
//	    embedded?: ICircularDate;   // self back-edge
//	    deep?: ICircularDeep;       // cross-reference
//	}
//
//	interface RootCircular {
//	    isRoot: true;               // literal
//	    ciChild: ICircularDeep;
//	    ciRoort?: RootCircular;     // self back-edge (note: `ciRoort` is the upstream typo, preserved)
//	    ciDate: ICircularDate;
//	}
//
// Each named interface must appear exactly once in the cache; every
// back-edge must close on its expected canonical id.

func TestF34_NestedAndMultipleCircular_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
interface ICircularDeep {
  name: string;
  big: bigint;
  embedded: {
    hello: string;
    child?: ICircularDeep;
  };
}
interface ICircularDate {
  date: Date;
  month: number;
  year: number;
  embedded?: ICircularDate;
  deep?: ICircularDeep;
}
interface RootCircular {
  isRoot: true;
  ciChild: ICircularDeep;
  ciRoort?: RootCircular;
  ciDate: ICircularDate;
}
getRunTypeId<RootCircular>();
`
	r, root := resolveInline(t, code)
	assertF34NestedAndMultipleCircular(t, r, root)
}

func TestF34_NestedAndMultipleCircular_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
interface ICircularDeep {
  name: string;
  big: bigint;
  embedded: {
    hello: string;
    child?: ICircularDeep;
  };
}
interface ICircularDate {
  date: Date;
  month: number;
  year: number;
  embedded?: ICircularDate;
  deep?: ICircularDeep;
}
interface RootCircular {
  isRoot: true;
  ciChild: ICircularDeep;
  ciRoort?: RootCircular;
  ciDate: ICircularDate;
}
declare const value: RootCircular;
getRunTypeId(value);
`
	r, root := resolveInline(t, code)
	assertF34NestedAndMultipleCircular(t, r, root)
}

func assertF34NestedAndMultipleCircular(t *testing.T, r *resolver.Session, root *reflection.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != reflection.KindObjectLiteral {
		t.Fatalf("expected RootCircular KindObjectLiteral, got %+v", root)
	}
	// TypeName is only populated for `type X = ...` aliases, not `interface
	// X { ... }` declarations (see serialize.go projectType, line 361).
	// Identity is verified via canonical id uniqueness below instead.
	rootID := root.ID

	// ----- root: isRoot literal `true` -----
	isRoot := findMember(types, root, "isRoot")
	if isRoot == nil {
		t.Fatalf("missing 'isRoot' on RootCircular; children=%+v", root.Children)
	}
	isRootChild := deref(types, isRoot.Child)
	if isRootChild == nil || isRootChild.Kind != reflection.KindLiteral {
		t.Fatalf("isRoot.child expected KindLiteral, got %+v", isRootChild)
	}
	if v, ok := isRootChild.Literal.(bool); !ok || !v {
		t.Fatalf("isRoot literal expected true, got %#v", isRootChild.Literal)
	}

	// ----- root → ciChild → ICircularDeep -----
	ciChild := findMember(types, root, "ciChild")
	if ciChild == nil {
		t.Fatalf("missing 'ciChild'; children=%+v", root.Children)
	}
	icDeep := deref(types, ciChild.Child)
	if icDeep == nil || icDeep.Kind != reflection.KindObjectLiteral {
		t.Fatalf("ciChild.child expected KindObjectLiteral, got %+v", icDeep)
	}
	icDeepID := icDeep.ID
	if got := countByID(types, icDeepID); got != 1 {
		t.Fatalf("expected ICircularDeep to appear exactly once in cache, got %d", got)
	}

	// ----- root → ciRoort? → RootCircular (self back-edge) -----
	ciRoort := findMember(types, root, "ciRoort")
	if ciRoort == nil {
		t.Fatalf("missing 'ciRoort'; children=%+v", root.Children)
	}
	if !ciRoort.Optional {
		t.Fatalf("ciRoort expected Optional=true, got %+v", ciRoort)
	}
	ciRoortBack := deref(types, ciRoort.Child)
	if ciRoortBack == nil || ciRoortBack.ID != rootID {
		t.Fatalf("expected ciRoort.child to close cycle on rootID=%s, got %+v", rootID, ciRoortBack)
	}

	// ----- root → ciDate → ICircularDate -----
	ciDate := findMember(types, root, "ciDate")
	if ciDate == nil {
		t.Fatalf("missing 'ciDate'; children=%+v", root.Children)
	}
	icDate := deref(types, ciDate.Child)
	if icDate == nil || icDate.Kind != reflection.KindObjectLiteral {
		t.Fatalf("ciDate.child expected KindObjectLiteral, got %+v", icDate)
	}
	icDateID := icDate.ID
	if got := countByID(types, icDateID); got != 1 {
		t.Fatalf("expected ICircularDate to appear exactly once in cache, got %d", got)
	}
	if rootID == icDeepID || rootID == icDateID || icDeepID == icDateID {
		t.Fatalf("expected three distinct canonical ids; root=%s icDeep=%s icDate=%s", rootID, icDeepID, icDateID)
	}

	// ----- ICircularDeep internals: name/string, big/bigint, embedded → inline obj -----
	if name := findMember(types, icDeep, "name"); name == nil || deref(types, name.Child).Kind != reflection.KindString {
		t.Fatalf("ICircularDeep.name expected string, got %+v", name)
	}
	if big := findMember(types, icDeep, "big"); big == nil || deref(types, big.Child).Kind != reflection.KindBigInt {
		t.Fatalf("ICircularDeep.big expected bigint, got %+v", big)
	}
	embedded := findMember(types, icDeep, "embedded")
	if embedded == nil {
		t.Fatalf("missing 'embedded' on ICircularDeep; children=%+v", icDeep.Children)
	}
	embeddedObj := deref(types, embedded.Child)
	if embeddedObj == nil || embeddedObj.Kind != reflection.KindObjectLiteral {
		t.Fatalf("embedded.child expected KindObjectLiteral, got %+v", embeddedObj)
	}
	if hello := findMember(types, embeddedObj, "hello"); hello == nil || deref(types, hello.Child).Kind != reflection.KindString {
		t.Fatalf("embedded.hello expected string, got %+v", hello)
	}
	child := findMember(types, embeddedObj, "child")
	if child == nil {
		t.Fatalf("missing 'child' on embedded; children=%+v", embeddedObj.Children)
	}
	if !child.Optional {
		t.Fatalf("embedded.child expected Optional=true, got %+v", child)
	}
	childBack := deref(types, child.Child)
	if childBack == nil || childBack.ID != icDeepID {
		t.Fatalf("expected embedded.child to close cycle on icDeepID=%s, got %+v", icDeepID, childBack)
	}

	// ----- ICircularDate internals: date/Date, month/number, year/number,
	//       embedded?/ICircularDate (self back-edge), deep?/ICircularDeep -----
	if date := findMember(types, icDate, "date"); date == nil {
		t.Fatalf("missing 'date' on ICircularDate; children=%+v", icDate.Children)
	} else if dt := deref(types, date.Child); dt == nil || dt.Kind != reflection.KindClass || dt.TypeName != "Date" {
		t.Fatalf("date.child expected KindClass Date, got %+v", dt)
	}
	if month := findMember(types, icDate, "month"); month == nil || deref(types, month.Child).Kind != reflection.KindNumber {
		t.Fatalf("month expected number, got %+v", month)
	}
	if year := findMember(types, icDate, "year"); year == nil || deref(types, year.Child).Kind != reflection.KindNumber {
		t.Fatalf("year expected number, got %+v", year)
	}
	dateEmbedded := findMember(types, icDate, "embedded")
	if dateEmbedded == nil || !dateEmbedded.Optional {
		t.Fatalf("ICircularDate.embedded expected optional, got %+v", dateEmbedded)
	}
	if dateEmbeddedBack := deref(types, dateEmbedded.Child); dateEmbeddedBack == nil || dateEmbeddedBack.ID != icDateID {
		t.Fatalf("expected ICircularDate.embedded to close cycle on icDateID=%s, got %+v", icDateID, dateEmbeddedBack)
	}
	deep := findMember(types, icDate, "deep")
	if deep == nil || !deep.Optional {
		t.Fatalf("ICircularDate.deep expected optional, got %+v", deep)
	}
	if deepCross := deref(types, deep.Child); deepCross == nil || deepCross.ID != icDeepID {
		t.Fatalf("expected ICircularDate.deep to cross-reference icDeepID=%s, got %+v", icDeepID, deepCross)
	}
}
