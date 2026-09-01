package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/operations"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// noopPredicateTypes builds the shared hand-built corpus for the predicate
// tables — same ref-table style as json_compat_test.go. Returns the ctx plus
// the types keyed by id for direct case lookups.
func noopPredicateTypes(t *testing.T) (*EmitContext, map[string]*reflection.RunType) {
	t.Helper()
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	num := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	undef := &reflection.RunType{ID: "und", Kind: reflection.KindUndefined}
	voidT := &reflection.RunType{ID: "vd", Kind: reflection.KindVoid}
	bigint := &reflection.RunType{ID: "big", Kind: reflection.KindBigInt}
	date := &reflection.RunType{ID: "dat", Kind: reflection.KindClass, SubKind: reflection.SubKindDate}
	mapT := &reflection.RunType{ID: "mp", Kind: reflection.KindClass, SubKind: reflection.SubKindMap}
	fn := &reflection.RunType{ID: "fn", Kind: reflection.KindFunction}

	propA := &reflection.RunType{ID: "pa", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("str")}
	propBig := &reflection.RunType{ID: "pbig", Kind: reflection.KindProperty, Name: "n", IsSafeName: true, Child: makeRef("big")}
	propDate := &reflection.RunType{ID: "pdat", Kind: reflection.KindProperty, Name: "at", IsSafeName: true, Child: makeRef("dat")}
	propFn := &reflection.RunType{ID: "pfn", Kind: reflection.KindProperty, Name: "onClick", IsSafeName: true, Child: makeRef("fn")}

	objCompat := &reflection.RunType{ID: "objCompat", Kind: reflection.KindObjectLiteral, TypeName: "Compat", Children: []*reflection.RunType{makeRef("pa")}}
	objBig := &reflection.RunType{ID: "objBig", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pbig")}}
	objDate := &reflection.RunType{ID: "objDate", Kind: reflection.KindObjectLiteral, TypeName: "Stamped", Children: []*reflection.RunType{makeRef("pa"), makeRef("pdat")}}
	objFnOnly := &reflection.RunType{ID: "objFn", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pfn")}}

	arrCompatObj := &reflection.RunType{ID: "arrCO", Kind: reflection.KindArray, Child: makeRef("objCompat")}
	arrStr := &reflection.RunType{ID: "arrStr", Kind: reflection.KindArray, Child: makeRef("str")}
	arrDate := &reflection.RunType{ID: "arrDat", Kind: reflection.KindArray, Child: makeRef("dat")}

	namedClass := &reflection.RunType{ID: "ncls", Kind: reflection.KindClass, SubKind: reflection.SubKindNone, TypeName: "User", Children: []*reflection.RunType{makeRef("pa")}}
	anonClass := &reflection.RunType{ID: "acls", Kind: reflection.KindClass, SubKind: reflection.SubKindNone, Children: []*reflection.RunType{makeRef("pa")}}

	unionAtomic := &reflection.RunType{ID: "uAt", Kind: reflection.KindUnion, Children: []*reflection.RunType{makeRef("str"), makeRef("num")}}
	unionDate := &reflection.RunType{ID: "uDat", Kind: reflection.KindUnion, Children: []*reflection.RunType{makeRef("str"), makeRef("dat")}}
	unionObjects := &reflection.RunType{ID: "uObj", Kind: reflection.KindUnion, Children: []*reflection.RunType{makeRef("objCompat"), makeRef("objBig")}}

	// The user-reported shape: circular JSON-compatible object —
	// `{a: string; d?: Self[]}` reached through an optional array prop.
	circArr := &reflection.RunType{ID: "circArr", Kind: reflection.KindArray, Child: makeRef("circ")}
	circProp := &reflection.RunType{ID: "circD", Kind: reflection.KindProperty, Name: "d", IsSafeName: true, Optional: true, Child: makeRef("circArr")}
	circ := &reflection.RunType{ID: "circ", Kind: reflection.KindObjectLiteral, TypeName: "ObjCircularArr", IsCircular: true, Children: []*reflection.RunType{makeRef("pa"), makeRef("circD")}}

	// Circular object that ALSO carries a Date — encode stays noop (Date
	// rides toJSON), decode must rebuild.
	circDArr := &reflection.RunType{ID: "circDArr", Kind: reflection.KindArray, Child: makeRef("circDat")}
	circDProp := &reflection.RunType{ID: "circDD", Kind: reflection.KindProperty, Name: "d", IsSafeName: true, Optional: true, Child: makeRef("circDArr")}
	circDat := &reflection.RunType{ID: "circDat", Kind: reflection.KindObjectLiteral, TypeName: "CircWithDate", IsCircular: true, Children: []*reflection.RunType{makeRef("pdat"), makeRef("circDD")}}

	// Arms for the universal-predicate tables: any/unknown (validate /
	// validationErrors), a primitive literal (stringifyJson / toBinary), a
	// never-valued property (the DataOnly dropped-slot rule), an atomic-value
	// record (unknown-keys index arm), a literal-only object + tuple
	// (toBinary's write-nothing compositions), and an object-carrying tuple
	// (the uku/ukuw tuple-noop divergence).
	anyT := &reflection.RunType{ID: "anyT", Kind: reflection.KindAny}
	unkT := &reflection.RunType{ID: "unkT", Kind: reflection.KindUnknown}
	lit := &reflection.RunType{ID: "lit", Kind: reflection.KindLiteral}
	nev := &reflection.RunType{ID: "nev", Kind: reflection.KindNever}
	propNever := &reflection.RunType{ID: "pnev", Kind: reflection.KindProperty, Name: "bad", IsSafeName: true, Child: makeRef("nev")}
	objNever := &reflection.RunType{ID: "objNever", Kind: reflection.KindObjectLiteral, TypeName: "WithNever", Children: []*reflection.RunType{makeRef("pa"), makeRef("pnev")}}
	idxAtomic := &reflection.RunType{ID: "idxA", Kind: reflection.KindIndexSignature, Child: makeRef("num"), Index: makeRef("str")}
	recAtomic := &reflection.RunType{ID: "recA", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("idxA")}}
	propLit := &reflection.RunType{ID: "plit", Kind: reflection.KindProperty, Name: "k", IsSafeName: true, Child: makeRef("lit")}
	objLitOnly := &reflection.RunType{ID: "objLit", Kind: reflection.KindObjectLiteral, TypeName: "LitObj", Children: []*reflection.RunType{makeRef("plit")}}
	pos0 := 0
	tmLit := &reflection.RunType{ID: "tmLit", Kind: reflection.KindTupleMember, Position: &pos0, Child: makeRef("lit")}
	tupLit := &reflection.RunType{ID: "tupLit", Kind: reflection.KindTuple, Children: []*reflection.RunType{makeRef("tmLit")}}
	tmObj := &reflection.RunType{ID: "tmObj", Kind: reflection.KindTupleMember, Position: &pos0, Child: makeRef("objCompat")}
	tupObj := &reflection.RunType{ID: "tupObj", Kind: reflection.KindTuple, Children: []*reflection.RunType{makeRef("tmObj")}}

	// Named-class registry-branch rule (the tb tripwire repro): a NAMED plain
	// user class always compiles wrapToBinaryWithClassSerializer's runtime
	// registry branch, so it can never claim identity — even when every
	// member is a dropped (`p0: never`) or write-nothing (literal) slot.
	// Anonymous classes and interface twins stay structural/noop.
	clsNever := &reflection.RunType{ID: "clsNever", Kind: reflection.KindClass, SubKind: reflection.SubKindNone, TypeName: "C0", Children: []*reflection.RunType{makeRef("pnev")}}
	aclsNever := &reflection.RunType{ID: "aclsNever", Kind: reflection.KindClass, SubKind: reflection.SubKindNone, Children: []*reflection.RunType{makeRef("pnev")}}
	objNeverOnly := &reflection.RunType{ID: "objNeverOnly", Kind: reflection.KindObjectLiteral, TypeName: "I0", Children: []*reflection.RunType{makeRef("pnev")}}
	clsLit := &reflection.RunType{ID: "clsLit", Kind: reflection.KindClass, SubKind: reflection.SubKindNone, TypeName: "C1", Children: []*reflection.RunType{makeRef("plit")}}

	all := []*reflection.RunType{
		str, num, undef, voidT, bigint, date, mapT, fn,
		propA, propBig, propDate, propFn,
		objCompat, objBig, objDate, objFnOnly,
		arrCompatObj, arrStr, arrDate,
		namedClass, anonClass,
		unionAtomic, unionDate, unionObjects,
		circArr, circProp, circ,
		circDArr, circDProp, circDat,
		anyT, unkT, lit, nev, propNever, objNever,
		idxAtomic, recAtomic, propLit, objLitOnly,
		tmLit, tupLit, tmObj, tupObj,
		clsNever, aclsNever, objNeverOnly, clsLit,
	}
	refTable := make(map[string]*reflection.RunType, len(all))
	byID := make(map[string]*reflection.RunType, len(all))
	for _, rt := range all {
		refTable[rt.ID] = rt
		byID[rt.ID] = rt
	}
	walker := &Walker{RefTable: refTable}
	return &EmitContext{walker: walker}, byID
}

// TestNoopType_PrepareVsRestore pins the per-kind arm tables of the two JSON
// transform predicates, including every spot where the encode and decode
// sides diverge (Date/Temporal/undefined noop on encode only; unions share
// the flat-layout roundTripsRaw gate on both halves) and the cycle-as-noop
// fixpoint rule.
func TestNoopType_PrepareVsRestore(t *testing.T) {
	ctx, types := noopPredicateTypes(t)
	cases := []struct {
		id     string
		pjNoop bool
		rjNoop bool
	}{
		{"str", true, true},
		{"und", true, false},  // pj: JSON drops it natively; rj: `v = undefined` rebind
		{"vd", false, false},  // both halves rebind
		{"big", false, false}, // toString / BigInt()
		{"dat", true, false},  // encode rides toJSON; decode rebuilds new Date(v)
		{"mp", false, false},
		{"objCompat", true, true},
		{"objBig", false, false},
		{"objDate", true, false},
		{"objFn", true, true}, // function props are dropped slots on both halves
		{"arrCO", true, true},
		{"arrStr", true, true},
		{"arrDat", true, false},
		{"ncls", false, false}, // named class → class-serializer registry branch
		{"acls", true, true},   // anonymous class → structural walk
		{"uAt", true, true},    // round-trips raw: mutate passes through, decode rides raw
		{"uDat", false, false}, // Date member forces the envelope on both halves
		{"uObj", false, false}, // bigint member forces the [-1, merged] envelope
		{"circ", true, true},   // the user-reported shape — cycle is identity
		{"circDat", true, false},
	}
	for _, c := range cases {
		t.Run(c.id, func(t *testing.T) {
			if got := isNoopForPrepareJson(types[c.id], ctx); got != c.pjNoop {
				t.Errorf("isNoopForPrepareJson(%s) = %v, want %v", c.id, got, c.pjNoop)
			}
			if got := isNoopForRestoreJson(types[c.id], ctx); got != c.rjNoop {
				t.Errorf("isNoopForRestoreJson(%s) = %v, want %v", c.id, got, c.rjNoop)
			}
		})
	}
}

// TestNoopType_PrepareJsonSafe pins the pjs arm table: atomics and
// extra-proof arrays pass through by reference; objects ALWAYS clone (the
// clone is the strip), unions keep their guard chain.
func TestNoopType_PrepareJsonSafe(t *testing.T) {
	ctx, types := noopPredicateTypes(t)
	cases := []struct {
		id   string
		want bool
	}{
		{"str", true},
		{"und", true},
		{"arrStr", true},     // extra-proof element → shared by reference
		{"arrCO", false},     // object elements might carry extras → clone
		{"objCompat", false}, // clone is what strips undeclared keys
		{"ncls", false},
		{"uAt", false},
		{"dat", false}, // pjs eagerly emits toISOString()
	}
	for _, c := range cases {
		t.Run(c.id, func(t *testing.T) {
			if got := isNoopForPrepareJsonSafe(types[c.id], ctx); got != c.want {
				t.Errorf("isNoopForPrepareJsonSafe(%s) = %v, want %v", c.id, got, c.want)
			}
		})
	}
}

// dumpFor wraps hand-built types into the no-sites Dump shape (the
// render-everything unit-test path of CollectFamilyEntries).
func dumpFor(types map[string]*reflection.RunType) protocol.Dump {
	all := make([]*reflection.RunType, 0, len(types))
	for _, rt := range types {
		all = append(all, rt)
	}
	return protocol.Dump{RunTypes: all}
}

// TestDispatchGate_CircularIdentityCollapses renders the user-reported shape
// (`{a: string; d?: Self[]}`, circular, fully JSON-compatible): pre-gate this
// emitted a self-recursive traversal that walked the whole value doing
// nothing (`for (…) {v.d[i0] = X13(v.d[i0])} return v`, isNoop=false). The
// dispatch gate proves the cycle re-entry noop, the loop folds away, and the
// whole entry collapses to the short-form identity tuple.
func TestDispatchGate_CircularIdentityCollapses(t *testing.T) {
	_, types := noopPredicateTypes(t)
	dump := dumpFor(types)
	for _, familyKey := range []string{"prepareForJson", "restoreFromJson"} {
		graph := FamilyByKey(familyKey).Collect(dump, RenderOpts{EmitMode: constants.EmitBoth}, nil)
		key := operations.PlainHash(familyKey) + "_circ"
		entry := graph[key]
		if entry == nil {
			t.Fatalf("%s: no entry for circ", familyKey)
		}
		if !entry.IsNoop {
			t.Errorf("%s: circular JSON-compatible entry must collapse to noop, got body:\n%s", familyKey, entry.ArgsText)
		}
		if len(entry.Deps) != 0 {
			t.Errorf("%s: noop entry must carry no deps, got %v", familyKey, entry.Deps)
		}
	}
}

// TestDispatchGate_KeepsRealTransformDepCalls is the non-eliding control: a
// circular object carrying a Date still emits the real restore body — the
// self dep-call survives (predicate false), and so does the Date rebuild.
func TestDispatchGate_KeepsRealTransformDepCalls(t *testing.T) {
	_, types := noopPredicateTypes(t)
	dump := dumpFor(types)
	graph := FamilyByKey("restoreFromJson").Collect(dump, RenderOpts{EmitMode: constants.EmitBoth}, nil)
	key := operations.PlainHash("restoreFromJson") + "_circDat"
	entry := graph[key]
	if entry == nil {
		t.Fatal("no rj entry for circDat")
	}
	if entry.IsNoop {
		t.Fatal("rj entry for a Date-carrying circular type must not be noop")
	}
	if !strings.Contains(entry.ArgsText, "new Date(") {
		t.Errorf("rj body must rebuild the Date:\n%s", entry.ArgsText)
	}
	if !strings.Contains(entry.ArgsText, key+"(") {
		t.Errorf("rj body must keep the self-recursive call for the live cycle:\n%s", entry.ArgsText)
	}
}

// TestDispatchGate_ElidesNoopExternalChild: an object holding a NAMED
// JSON-compatible child (external under the default name rule) used to emit
// `v.x = <dep>.fn(v.x); return v` plus the import edge. The gate composes
// around the child, the parent collapses to the short form, and no dep is
// recorded.
func TestDispatchGate_ElidesNoopExternalChild(t *testing.T) {
	_, types := noopPredicateTypes(t)
	propNamed := &reflection.RunType{ID: "pnc", Kind: reflection.KindProperty, Name: "x", IsSafeName: true, Child: makeRef("objCompat")}
	parent := &reflection.RunType{ID: "parent", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pnc")}}
	types["pnc"] = propNamed
	types["parent"] = parent
	dump := dumpFor(types)
	graph := FamilyByKey("restoreFromJson").Collect(dump, RenderOpts{EmitMode: constants.EmitBoth}, nil)
	key := operations.PlainHash("restoreFromJson") + "_parent"
	entry := graph[key]
	if entry == nil {
		t.Fatal("no rj entry for parent")
	}
	if !entry.IsNoop {
		t.Errorf("parent of a noop external child must collapse to noop, got:\n%s", entry.ArgsText)
	}
	if len(entry.Deps) != 0 {
		t.Errorf("gated child must not be recorded as a dep, got %v", entry.Deps)
	}
}

// TestJsonComposite_ElidesNoopPrimitives: the composite reads its primitives'
// rendered IsNoop flags — identity primitives lose their binding, their call
// wrapper, and their import edge. When EVERY binding elides the entry itself
// collapses to the noop SHORT FORM (key, typeName, code hole, isNoop=true) —
// the runtime registers the composite's native-JSON noop instead (entryTuple's
// noopStringify for je*, noopParse for jd*).
func TestJsonComposite_ElidesNoopPrimitives(t *testing.T) {
	rjKey := operations.PlainHash("restoreFromJson") + "_obj1"
	ukuwKey := operations.PlainHash("unknownKeysToUndefinedWire") + "_obj1"
	pjKey := operations.PlainHash("prepareForJson") + "_obj1"
	runType := &reflection.RunType{ID: "obj1", Kind: reflection.KindObjectLiteral}

	render := func(tag string, rendered entrymodules.Graph) *entrymodules.Entry {
		t.Helper()
		composite, ok := constants.JsonCompositeByTag(tag)
		if !ok {
			t.Fatalf("unknown composite tag %q", tag)
		}
		entry := collectJsonCompositeEntry(runType, tag, composite, RenderOpts{EmitMode: constants.EmitBoth}, rendered, nil, false)
		if entry == nil {
			t.Fatalf("no composite entry for %q", tag)
		}
		return entry
	}
	noopGraph := entrymodules.Graph{}
	noopGraph.Add(&entrymodules.Entry{Key: rjKey, Kind: entrymodules.KindTypeFn, FamilyTag: "rj", ArgsText: "'" + rjKey + "'", IsNoop: true})
	noopGraph.Add(&entrymodules.Entry{Key: pjKey, Kind: entrymodules.KindTypeFn, FamilyTag: "pj", ArgsText: "'" + pjKey + "'", IsNoop: true})
	noopGraph.Add(&entrymodules.Entry{Key: ukuwKey, Kind: entrymodules.KindTypeFn, FamilyTag: "ukuw", ArgsText: "'" + ukuwKey + "'"})

	jdPRKey := operations.FnHashFor(mustOp(t, "jsonDecoder"), nil, "preserve", false) + "_obj1"
	jeMUKey := operations.FnHashFor(mustOp(t, "jsonEncoder"), nil, "mutate", false) + "_obj1"

	// jdPR: rj noop → every binding elided → the noop short form; no body,
	// no factory, no deps. The bare JSON.parse moved into the runtime noop.
	entry := render("jdPR", noopGraph)
	if entry.ArgsText != "'"+jdPRKey+"','objectLiteral',,true" {
		t.Errorf("jdPR with noop rj must collapse to the noop short form:\n%s", entry.ArgsText)
	}
	if !entry.IsNoop {
		t.Error("jdPR with noop rj must flag Entry.IsNoop")
	}
	if len(entry.SoftDeps) != 0 {
		t.Errorf("jdPR with noop rj must carry no primitive deps, got %v", entry.SoftDeps)
	}

	// jdST: rj noop + ukuw live → a real body keeping only the ukuw binding.
	entry = render("jdST", noopGraph)
	if !strings.Contains(entry.ArgsText, "return ukuwFn(JSON.parse(s));") || strings.Contains(entry.ArgsText, "rjFn") {
		t.Errorf("jdST with noop rj must keep only the ukuw wrap:\n%s", entry.ArgsText)
	}
	if entry.IsNoop {
		t.Error("jdST with a live ukuw must not flag Entry.IsNoop")
	}
	if len(entry.SoftDeps) != 1 || entry.SoftDeps[0] != ukuwKey {
		t.Errorf("jdST deps must name only the live ukuw primitive, got %v", entry.SoftDeps)
	}

	// jeMU: pj noop → the noop short form (runtime noop is JSON.stringify).
	entry = render("jeMU", noopGraph)
	if entry.ArgsText != "'"+jeMUKey+"','objectLiteral',,true" {
		t.Errorf("jeMU with noop pj must collapse to the noop short form:\n%s", entry.ArgsText)
	}
	if !entry.IsNoop {
		t.Error("jeMU with noop pj must flag Entry.IsNoop")
	}

	// Control: a live (non-noop) rj keeps today's binding shape.
	liveGraph := entrymodules.Graph{}
	liveGraph.Add(&entrymodules.Entry{Key: rjKey, Kind: entrymodules.KindTypeFn, FamilyTag: "rj", ArgsText: "'" + rjKey + "'"})
	entry = render("jdPR", liveGraph)
	if !strings.Contains(entry.ArgsText, "return rjFn(JSON.parse(s));") {
		t.Errorf("jdPR with live rj must keep the binding:\n%s", entry.ArgsText)
	}
	if entry.IsNoop {
		t.Error("jdPR with a live rj must not flag Entry.IsNoop")
	}
	if len(entry.SoftDeps) != 1 || entry.SoftDeps[0] != rjKey {
		t.Errorf("jdPR deps must name the live rj primitive, got %v", entry.SoftDeps)
	}
}

// mustOp resolves an operation by name or fails the test.
func mustOp(t *testing.T, name string) operations.Operation {
	t.Helper()
	op, ok := operations.ByName(name)
	if !ok {
		t.Fatalf("unknown operation %q", name)
	}
	return op
}

// TestNoopType_ValidateAndValidationErrors pins the val/verr arm: only
// any/unknown roots are the family identity.
func TestNoopType_ValidateAndValidationErrors(t *testing.T) {
	ctx, types := noopPredicateTypes(t)
	cases := []struct {
		id   string
		want bool
	}{
		{"anyT", true},
		{"unkT", true},
		{"str", false},
		{"objCompat", false},
		{"uAt", false},
	}
	for _, c := range cases {
		t.Run(c.id, func(t *testing.T) {
			if got := isNoopForValidate(types[c.id], ctx); got != c.want {
				t.Errorf("isNoopForValidate(%s) = %v, want %v", c.id, got, c.want)
			}
			if got := isNoopForValidationErrors(types[c.id], ctx); got != c.want {
				t.Errorf("isNoopForValidationErrors(%s) = %v, want %v", c.id, got, c.want)
			}
		})
	}
}

// TestNoopType_StringifyJsonRoot pins the sj root-only arm: native-delegation
// roots only; String(v)-shaped and compound roots stay live.
func TestNoopType_StringifyJsonRoot(t *testing.T) {
	ctx, types := noopPredicateTypes(t)
	cases := []struct {
		id   string
		want bool
	}{
		{"str", true},
		{"anyT", true},
		{"unkT", true},
		{"lit", true},  // primitive literal — JSON.stringify delegation
		{"num", false}, // String(v): NaN/Infinity diverge from native JSON
		{"big", false}, // manual quoting
		{"objCompat", false},
		{"arrStr", false},
	}
	for _, c := range cases {
		t.Run(c.id, func(t *testing.T) {
			if got := isNoopForStringifyJson(types[c.id], ctx); got != c.want {
				t.Errorf("isNoopForStringifyJson(%s) = %v, want %v", c.id, got, c.want)
			}
		})
	}
}

// TestNoopType_CompactFromJson pins the cjr arm — restoreFromJson's rules with
// every object arm forced false (the positional→keyed rebuild). objCompat is
// THE divergence pin: rj lets it round-trip raw, cjr must not.
func TestNoopType_CompactFromJson(t *testing.T) {
	ctx, types := noopPredicateTypes(t)
	cases := []struct {
		id   string
		want bool
	}{
		{"str", true},
		{"arrStr", true},
		{"uAt", true},        // raw-round-trip union (shared restore rule)
		{"objCompat", false}, // rj says true — the delegation trap
		{"arrCO", false},     // array of objects — positional elements
		{"dat", false},
		{"und", false},
		{"lit", true},
	}
	for _, c := range cases {
		t.Run(c.id, func(t *testing.T) {
			if got := isNoopForCompactFromJson(types[c.id], ctx); got != c.want {
				t.Errorf("isNoopForCompactFromJson(%s) = %v, want %v", c.id, got, c.want)
			}
		})
	}
}

// TestNoopType_ToBinary pins the tb arm: literal-only graphs write nothing;
// everything else writes bytes (even undefined writes its sentinel).
func TestNoopType_ToBinary(t *testing.T) {
	ctx, types := noopPredicateTypes(t)
	cases := []struct {
		id   string
		want bool
	}{
		{"lit", true},
		{"objLit", true}, // {k: 'a'} — required literal props write nothing
		{"tupLit", true}, // ['x'] — required literal slots write nothing
		{"str", false},
		{"und", false}, // 1-byte sentinel
		{"objCompat", false},
		{"arrStr", false}, // varint length prefix
		{"uAt", false},    // discriminant byte
		// Named-class registry-branch rule: the emitted body always carries
		// the class-serializer registry check, so a named class never claims
		// identity — the tb tripwire repro (`declare class C0 {p0: never}`).
		{"clsNever", false},
		{"clsLit", false},
		// Anonymous class + interface twins skip the wrapper and stay
		// structural: all-dropped / write-nothing members = identity.
		{"aclsNever", true},
		{"objNeverOnly", true},
	}
	for _, c := range cases {
		t.Run(c.id, func(t *testing.T) {
			if got := isNoopForToBinary(types[c.id], ctx); got != c.want {
				t.Errorf("isNoopForToBinary(%s) = %v, want %v", c.id, got, c.want)
			}
		})
	}
	if isNoopForFromBinary := (FromBinaryEmitter{}).IsNoopType(types["lit"], ctx); isNoopForFromBinary {
		t.Error("fromBinary must never claim noop — even literal roots assign ret")
	}
}

// TestNoopType_CloneExactShape pins the family's dedicated isolation-aware
// predicate: identity only for fully immutable/opaque subtrees. Any mutable
// position — object, class, Date, RegExp, array, tuple, Map/Set, index
// signature — forces a live clone body (sharing it would leak mutable state
// between input and "clone").
func TestNoopType_CloneExactShape(t *testing.T) {
	ctx, types := noopPredicateTypes(t)
	rows := map[string]bool{
		"str":       true,  // immutable primitive
		"big":       true,  // immutable primitive
		"fn":        true,  // opaque — passthrough, overrideCloneExactShape is the escape hatch
		"uAt":       true,  // string | number — every member immutable
		"dat":       false, // Date is mutable (setTime) — re-wrapped
		"mp":        false, // Map is a mutable container — always fresh
		"arrStr":    false, // arrays are mutable containers — fresh via slice
		"arrDat":    false,
		"objCompat": false, // objects always rebuild (that IS the strip)
		"objFn":     false, // declared shape {} — clone is a fresh {}
		"recA":      false, // index-signature object — fresh copy walk
		"uDat":      false, // string | Date — Date member needs a dispatch arm
		"uObj":      false, // object-bearing union — CES001 alwaysThrow, never identity
		"ncls":      false, // class instances rebuild (prototype-preserving)
		"tupObj":    false,
	}
	for id, want := range rows {
		t.Run(id, func(t *testing.T) {
			if got := isNoopForCloneExactShape(types[id], ctx); got != want {
				t.Errorf("isNoopForCloneExactShape(%s) = %v, want %v", id, got, want)
			}
		})
	}
}

// TestNoopType_UnknownKeys pins the shared five-family arm table plus the two
// per-family divergences: uku/ukuw no-op at tuples by design, and ukuw keeps
// the Map/Set arm noop on the wire side.
func TestNoopType_UnknownKeys(t *testing.T) {
	ctx, types := noopPredicateTypes(t)
	specs := map[string]unknownKeysNoopSpec{
		"huk":  hasUnknownKeysNoopSpec,
		"uke":  unknownKeyErrorsNoopSpec,
		"uku":  unknownKeysToUndefinedNoopSpec,
		"ukuw": unknownKeysToUndefinedWireSpec,
	}
	type row struct {
		id   string
		want map[string]bool
	}
	same := func(want bool) map[string]bool {
		return map[string]bool{"huk": want, "uke": want, "uku": want, "ukuw": want}
	}
	rows := []row{
		{"str", same(true)},
		{"objCompat", same(false)}, // named props → the parent allowlist probe
		{"objFn", same(false)},     // function-typed props still count as declared names
		{"recA", same(true)},       // index sig over atomic values — every key is "known"
		{"arrStr", same(true)},
		{"arrCO", same(false)}, // array of keyed objects
		{"uAt", same(true)},    // atomic-only union — nothing to sweep
		{"uObj", same(false)},  // merged allowlist over the object members
		// The tuple divergence: has/errors recurse into slots; uku and
		// ukuw no-op at tuples by design (emitTupleUnknownKeysToUndefined).
		{"tupObj", map[string]bool{"huk": false, "uke": false, "uku": true, "ukuw": true}},
	}
	for _, r := range rows {
		for familyTag, spec := range specs {
			t.Run(r.id+"/"+familyTag, func(t *testing.T) {
				if got := isNoopForUnknownKeys(types[r.id], ctx, spec); got != r.want[familyTag] {
					t.Errorf("isNoopForUnknownKeys(%s, %s) = %v, want %v", r.id, familyTag, got, r.want[familyTag])
				}
			})
		}
	}
}

// lyingNoopEmitter claims every type is noop while emitting a real body — the
// exact predicate bug the renderer's tripwire exists to catch.
type lyingNoopEmitter struct{}

func (lyingNoopEmitter) Args() []ArgSpec                   { return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}} }
func (lyingNoopEmitter) Supports(*reflection.RunType) bool { return true }
func (lyingNoopEmitter) IsRTInlined(*InlineContext) bool   { return true }
func (lyingNoopEmitter) ReturnName() string                { return "v" }
func (lyingNoopEmitter) EmitDependencyCall(*reflection.RunType, string, *EmitContext) string {
	return ""
}
func (lyingNoopEmitter) Emit(*reflection.RunType, *EmitContext, CodeType) RTCode {
	return RTCode{Code: "v.x = 1", Type: CodeS}
}
func (lyingNoopEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" || code == "return v" {
		return "return v", true
	}
	return code, false
}
func (lyingNoopEmitter) IsNoopType(*reflection.RunType, *EmitContext) bool { return true }

// TestNoopVerdict_TripwireDemotesLyingPredicate: the verdict comes from the
// predicate, but a predicate that claims identity over a body that is not
// identity must ship the LIVE body (never the family noop fn) — the
// protective direction of the shape check. Text can only demote noop→live;
// it never produces a noop verdict.
func TestNoopVerdict_TripwireDemotesLyingPredicate(t *testing.T) {
	runType := &reflection.RunType{ID: "lie1", Kind: reflection.KindString}
	refTable := map[string]*reflection.RunType{"lie1": runType}
	// A registered tag is required for key derivation; the emitter under test
	// is still the lying fake — the real fmt emitter is never consulted.
	settings := constants.CacheModuleSettings{Name: "lying", VarPrefix: "fmt", Tag: "fmt"}
	rendered := renderEntryWithDeps(runType, settings, lyingNoopEmitter{}, "fmt_", refTable, RenderOpts{EmitMode: constants.EmitBoth}, "", nil, false)
	if rendered.isNoop {
		t.Fatal("tripwire must demote a lying predicate's verdict to live")
	}
	if !strings.Contains(rendered.argsText, "v.x = 1") {
		t.Fatalf("the live body must ship on a predicate mismatch, got:\n%s", rendered.argsText)
	}
}

// formatPredicateTypes extends the shared corpus with format-carrying and
// fmt-overridden shapes for the fmt predicate table. Formats registry is
// populated by the package-wide formats/all blank import
// (binary_size_estimate_test.go).
func formatPredicateTypes(t *testing.T) (*EmitContext, map[string]*reflection.RunType) {
	t.Helper()
	ctx, types := noopPredicateTypes(t)
	register := func(rt *reflection.RunType) {
		types[rt.ID] = rt
		ctx.walker.RefTable[rt.ID] = rt
	}
	register(&reflection.RunType{ID: "strTrim", Kind: reflection.KindString,
		FormatAnnotation: &reflection.FormatAnnotation{Name: "stringFormat", Params: map[string]any{"transform": map[string]any{"trim": true}}}})
	register(&reflection.RunType{ID: "strLenOnly", Kind: reflection.KindString,
		FormatAnnotation: &reflection.FormatAnnotation{Name: "stringFormat", Params: map[string]any{"maxLength": float64(8)}}})
	register(&reflection.RunType{ID: "strOverride", Kind: reflection.KindString,
		Overrides: map[string]string{"fmt": "cfnabc"}})
	register(&reflection.RunType{ID: "pTrim", Kind: reflection.KindProperty, Name: "name", IsSafeName: true, Child: makeRef("strTrim")})
	register(&reflection.RunType{ID: "pOvr", Kind: reflection.KindProperty, Name: "s", IsSafeName: true, Child: makeRef("strOverride")})
	register(&reflection.RunType{ID: "objTrim", Kind: reflection.KindObjectLiteral, TypeName: "FmtUser", Children: []*reflection.RunType{makeRef("pTrim")}})
	register(&reflection.RunType{ID: "objOvr", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pOvr")}})
	register(&reflection.RunType{ID: "arrTrim", Kind: reflection.KindArray, Child: makeRef("strTrim")})
	register(&reflection.RunType{ID: "uTrim", Kind: reflection.KindUnion, Children: []*reflection.RunType{makeRef("strTrim"), makeRef("num")}})
	// Waste-case shape: Outer{inner: Compat} where the NAMED Compat carries no
	// format — pre-predicate this dep-called into a noop entry.
	register(&reflection.RunType{ID: "pInner", Kind: reflection.KindProperty, Name: "inner", IsSafeName: true, Child: makeRef("objCompat")})
	register(&reflection.RunType{ID: "objOuter", Kind: reflection.KindObjectLiteral, TypeName: "Outer", Children: []*reflection.RunType{makeRef("pInner")}})
	// Control: Outer whose NAMED inner carries a transform.
	register(&reflection.RunType{ID: "pInnerFmt", Kind: reflection.KindProperty, Name: "inner", IsSafeName: true, Child: makeRef("objTrim")})
	register(&reflection.RunType{ID: "objOuterFmt", Kind: reflection.KindObjectLiteral, TypeName: "OuterFmt", Children: []*reflection.RunType{makeRef("pInnerFmt")}})
	return ctx, types
}

// TestNoopType_FormatTransform pins the fmt predicate's arm table: the only
// falsifiers are a transforming format annotation and an fmt override —
// everything else (unions included, the MVP identity arms) is noop.
func TestNoopType_FormatTransform(t *testing.T) {
	ctx, types := formatPredicateTypes(t)
	cases := []struct {
		id   string
		want bool
	}{
		{"str", true},
		{"strTrim", false},     // trim transform
		{"strLenOnly", true},   // validate-only params — no value transform
		{"strOverride", false}, // fmt override → cfn redirect, never identity
		{"objTrim", false},
		{"objOvr", false}, // override reached through a property child
		{"objCompat", true},
		{"objOuter", true}, // named no-format child — the collapse case
		{"objOuterFmt", false},
		{"arrTrim", false},
		{"arrStr", true},
		{"uTrim", true}, // MVP: unions are identity even with formatted members
		{"dat", true},
		{"mp", true},
		{"ncls", true}, // user class with a plain string prop
		{"fn", true},
		{"circ", true}, // cycle with no transform — identity fixpoint
	}
	for _, c := range cases {
		t.Run(c.id, func(t *testing.T) {
			if got := isNoopForFormatTransform(types[c.id], ctx); got != c.want {
				t.Errorf("isNoopForFormatTransform(%s) = %v, want %v", c.id, got, c.want)
			}
		})
	}
}

// TestDispatchGate_FormatIdentityChainCollapses renders the fmt waste-case
// shape end to end: Outer{inner: Compat} (named, no formats) used to emit
// `v.inner = <fmtHash>_<id>.fn(v.inner); return v` plus the import edge while
// Inner's entry was the noop short form — a dead chain. The gate now composes
// around the child and Outer collapses to the short form. The control keeps
// the dep call when the named child really transforms.
func TestDispatchGate_FormatIdentityChainCollapses(t *testing.T) {
	_, types := formatPredicateTypes(t)
	dump := dumpFor(types)
	graph := FamilyByKey("formatTransform").Collect(dump, RenderOpts{EmitMode: constants.EmitBoth}, nil)

	outer := graph[operations.PlainHash("formatTransform")+"_objOuter"]
	if outer == nil {
		t.Fatal("no fmt entry for objOuter")
	}
	if !outer.IsNoop {
		t.Errorf("fmt entry for a no-transform named-child object must collapse to noop, got:\n%s", outer.ArgsText)
	}
	if len(outer.Deps) != 0 {
		t.Errorf("gated fmt child must not be recorded as a dep, got %v", outer.Deps)
	}

	control := graph[operations.PlainHash("formatTransform")+"_objOuterFmt"]
	if control == nil {
		t.Fatal("no fmt entry for objOuterFmt")
	}
	if control.IsNoop {
		t.Error("fmt entry whose named child transforms must stay live")
	}
	if len(control.Deps) != 1 || control.Deps[0] != operations.PlainHash("formatTransform")+"_objTrim" {
		t.Errorf("transforming named child must stay a dep call, got %v", control.Deps)
	}
}

// TestStringifyJson_NativeRootCollapses pins the sj Finalize byte-match:
// roots whose whole body is `return JSON.stringify(v)` (string / any-like
// delegation arms) flag isNoop and emit the short form — the runtime noop IS
// native JSON.stringify — while String(v)-shaped roots (number: NaN/Infinity
// diverge under native stringify) and real compound bodies stay live.
func TestStringifyJson_NativeRootCollapses(t *testing.T) {
	_, types := noopPredicateTypes(t)
	dump := dumpFor(types)
	graph := FamilyByKey("stringifyJson").Collect(dump, RenderOpts{EmitMode: constants.EmitBoth}, nil)

	strEntry := graph[operations.PlainHash("stringifyJson")+"_str"]
	if strEntry == nil {
		t.Fatal("no sj entry for str")
	}
	if !strEntry.IsNoop {
		t.Errorf("sj string root must collapse to the native-stringify noop, got:\n%s", strEntry.ArgsText)
	}

	numEntry := graph[operations.PlainHash("stringifyJson")+"_num"]
	if numEntry == nil {
		t.Fatal("no sj entry for num")
	}
	if numEntry.IsNoop {
		t.Error("sj number root (String(v) — diverges on NaN/Infinity) must stay live")
	}
	if !strings.Contains(numEntry.ArgsText, "return String(v)") {
		t.Errorf("sj number root must keep the String(v) body:\n%s", numEntry.ArgsText)
	}

	objEntry := graph[operations.PlainHash("stringifyJson")+"_objCompat"]
	if objEntry == nil {
		t.Fatal("no sj entry for objCompat")
	}
	if objEntry.IsNoop {
		t.Error("sj object root (declared-member concat, extras stripped) must stay live")
	}
}

// TestJsonComposite_DirectStrategyTwoLayerCollapse: pre-change, jeDI over an
// atomic string shipped TWO dead modules — an sj entry whose body was
// `return JSON.stringify(v)` and the composite `return sjFn(v)` binding it.
// The sj Finalize byte-match marks the primitive noop, the composite elides
// the binding, and the whole thing collapses to one short-form tuple. The
// object-root control keeps the delegation (sj really strips extras there).
func TestJsonComposite_DirectStrategyTwoLayerCollapse(t *testing.T) {
	_, types := noopPredicateTypes(t)
	dump := dumpFor(types)
	rendered := FamilyByKey("stringifyJson").Collect(dump, RenderOpts{EmitMode: constants.EmitBoth}, nil)
	composite, ok := constants.JsonCompositeByTag("jeDI")
	if !ok {
		t.Fatal("unknown composite tag jeDI")
	}

	entry := collectJsonCompositeEntry(types["str"], "jeDI", composite, RenderOpts{EmitMode: constants.EmitBoth}, rendered, nil, false)
	if entry == nil {
		t.Fatal("no jeDI entry for str")
	}
	if !entry.IsNoop {
		t.Errorf("jeDI over an atomic string must collapse to the noop short form, got:\n%s", entry.ArgsText)
	}
	if len(entry.SoftDeps) != 0 {
		t.Errorf("collapsed jeDI must carry no primitive deps, got %v", entry.SoftDeps)
	}

	objEntry := collectJsonCompositeEntry(types["objCompat"], "jeDI", composite, RenderOpts{EmitMode: constants.EmitBoth}, rendered, nil, false)
	if objEntry == nil {
		t.Fatal("no jeDI entry for objCompat")
	}
	if objEntry.IsNoop {
		t.Error("jeDI over an object must keep the live sj delegation")
	}
	if !strings.Contains(objEntry.ArgsText, "return sjFn(v);") {
		t.Errorf("jeDI object body must bind the live sj primitive:\n%s", objEntry.ArgsText)
	}
}

// TestJsonComposite_WrapRootNeverNoop: an undefined/void root keeps the full
// body even when its primitive elided — the `[v]` JSON envelope is real work
// (rootNeedsDataOnlyWrap), and the runtime noop would drop it.
func TestJsonComposite_WrapRootNeverNoop(t *testing.T) {
	pjKey := operations.PlainHash("prepareForJson") + "_und1"
	runType := &reflection.RunType{ID: "und1", Kind: reflection.KindUndefined}
	composite, ok := constants.JsonCompositeByTag("jeMU")
	if !ok {
		t.Fatal("unknown composite tag jeMU")
	}
	noopGraph := entrymodules.Graph{}
	noopGraph.Add(&entrymodules.Entry{Key: pjKey, Kind: entrymodules.KindTypeFn, FamilyTag: "pj", ArgsText: "'" + pjKey + "'", IsNoop: true})
	entry := collectJsonCompositeEntry(runType, "jeMU", composite, RenderOpts{EmitMode: constants.EmitBoth}, noopGraph, nil, false)
	if entry == nil {
		t.Fatal("no composite entry for jeMU")
	}
	if entry.IsNoop {
		t.Error("wrapRoot composite must never flag Entry.IsNoop")
	}
	if !strings.Contains(entry.ArgsText, "return JSON.stringify([v]);") {
		t.Errorf("wrapRoot composite must keep the array-envelope body:\n%s", entry.ArgsText)
	}
}
