package resolver_test

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// noopCorpusSource interns a wide spread of real checker-produced shapes —
// primitives, optionals, literals, enums-ish unions, Dates/Maps/Sets,
// bigints, template literals, tuples, index signatures, function props,
// nested named objects, classes, mixed unions, circular types,
// format-branded strings (transforming, validate-only, and inside a union —
// the fmt predicate's arms), objects whose sole property is a
// DataOnly-stripped value that JSON.stringify leaks as data (a
// non-serializable native / a Promise), and an all-stripped union — so the
// agreement test below can pin the noop predicates against the emitters across
// the whole reachable node set (every interned child counts, not just the
// roots). The leak objects guard the prepare (mutate) predicate's property arm:
// pj `delete`s the leaking key from the live object (real code), so the object
// is NOT identity on encode even though every other family drops the slot with
// empty code. The all-stripped union (every member projects to `never`) guards
// unionJsonNoop: its DataOnly projection is `never`, so the emitter keeps the
// members and alwaysThrows — NOT the identity — on pj / rj / cjr.
const noopCorpusSource = `import {getRunTypeId} from '@mionjs/run-types';
type TypeFormat<Base, Name extends string, Params> = Base & {
  readonly __rtFormatName?: Name;
  readonly __rtFormatParams?: Params;
};
type FmtTrim = {name: TypeFormat<string, 'stringFormat', {transform: {trim: true}}>};
type FmtLenOnly = {code: TypeFormat<string, 'stringFormat', {maxLength: 8}>};
type FmtInUnion = {u: TypeFormat<string, 'stringFormat', {transform: {lowercase: true}}> | number};
type FmtArr = {tags: TypeFormat<string, 'stringFormat', {transform: {uppercase: true}}>[]};
type Compat = {a: string; b?: number; c: boolean | null};
interface Nested {inner: Compat; tags: string[]}
type Stamped = {at: Date; name: string};
type WithBig = {n: bigint};
type WithMap = {m: Map<string, number>};
type WithSet = {s: Set<string>};
type WithFn = {name: string; onClick: () => void};
type WithTmpl = {route: ` + "`/api/${string}`" + `};
type Tup = [string, number, boolean?];
type TupDate = [string, Date];
type Idx = {[key: string]: number};
type UAtomic = 'a' | 'b' | 3 | null;
type UMixed = string | Date;
type UObjects = Compat | Stamped;
type Circ = {a: string; deep?: {b: string; c: number}; d?: Circ[]};
type CircDate = {at: Date; next?: CircDate};
class Account {id: number = 0; name: string = ''}
type WithUndef = {u: undefined; v: void};
type DeepNest = {l1: {l2: {l3: Nested[]}}};
type LitOnly = 'only';
type LitObj = {k: 'a'; n: 3};
type LitTup = ['x', 1];
type TmplKeyRec = {[key: ` + "`k${string}`" + `]: number};
type RecAtomic = {[key: string]: number};
type WithNever = {name: string; bad: never};
type WithLeakNative = {a: ArrayBuffer};
type WithLeakPromise = {p: Promise<number>; b: number};
type AllStrippedUnion = ArrayBuffer | SharedArrayBuffer;
type WithNonEnum = {a: string; /** @nonEnumerable */ hidden?: string};
class ErrSub extends Error {code: number = 0}
getRunTypeId<WithNonEnum>();
getRunTypeId<ErrSub>();
getRunTypeId<WithLeakNative>();
getRunTypeId<WithLeakPromise>();
getRunTypeId<AllStrippedUnion>();
getRunTypeId<LitOnly>();
getRunTypeId<LitObj>();
getRunTypeId<LitTup>();
getRunTypeId<TmplKeyRec>();
getRunTypeId<RecAtomic>();
getRunTypeId<WithNever>();
getRunTypeId<FmtTrim>();
getRunTypeId<FmtLenOnly>();
getRunTypeId<FmtInUnion>();
getRunTypeId<FmtArr>();
getRunTypeId<Compat>();
getRunTypeId<Nested>();
getRunTypeId<Stamped>();
getRunTypeId<WithBig>();
getRunTypeId<WithMap>();
getRunTypeId<WithSet>();
getRunTypeId<WithFn>();
getRunTypeId<WithTmpl>();
getRunTypeId<Tup>();
getRunTypeId<TupDate>();
getRunTypeId<Idx>();
getRunTypeId<UAtomic>();
getRunTypeId<UMixed>();
getRunTypeId<UObjects>();
getRunTypeId<Circ>();
getRunTypeId<CircDate>();
getRunTypeId<Account>();
getRunTypeId<WithUndef>();
getRunTypeId<DeepNest>();
`

// reachesCycle reports whether rt can reach a node twice on one path (or a
// serializer-flagged IsCircular node). Cyclic types are excluded from the
// ground-truth comparison: their compile externalizes the re-entry even under
// allInternal, so the gate-disabled body never collapses — the cycle arm is
// covered by the typefns unit tests and the JS round-trip suites instead.
func reachesCycle(rt *reflection.RunType, refTable map[string]*reflection.RunType, onPath map[string]bool) bool {
	if rt == nil {
		return false
	}
	if rt.Kind == reflection.KindRef {
		rt = refTable[rt.ID]
		if rt == nil {
			return false
		}
	}
	if rt.IsCircular {
		return true
	}
	if rt.ID != "" {
		if onPath[rt.ID] {
			return true
		}
		onPath[rt.ID] = true
		defer delete(onPath, rt.ID)
	}
	children := make([]*reflection.RunType, 0, 4+len(rt.Children)+len(rt.SafeUnionChildren))
	children = append(children, rt.Child, rt.Index, rt.IndexT)
	children = append(children, rt.Children...)
	children = append(children, rt.SafeUnionChildren...)
	for _, child := range children {
		if reachesCycle(child, refTable, onPath) {
			return true
		}
	}
	return false
}

// TestNoopPredicate_SoundAgainstEmitters is the mechanical soundness pin for
// the dispatch gate's predicates: for every acyclic interned type in the
// corpus and every predicate-bearing family (pj / rj / pjs / fmt), a verdict
// of "noop" must agree with the ground truth — the gate-disabled,
// fully-inlined compile collapsing to a noop body
// (typefunctions.NoopPredicateAgreement). A
// sound-but-conservative miss (verdict false, body noop — e.g. absorbed
// unsupported leaves) is logged, never fatal; the reverse direction IS the
// data-corruption direction and fails the build.
func TestNoopPredicate_SoundAgainstEmitters(t *testing.T) {
	r := setupInline(t, map[string]string{"corpus.ts": noopCorpusSource})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"corpus.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	allTypes := dump(r)
	refTable := make(map[string]*reflection.RunType, len(allTypes))
	for _, rt := range allTypes {
		if rt != nil && rt.ID != "" {
			refTable[rt.ID] = rt
		}
	}
	emitters := map[string]typefunctions.Emitter{
		"prepareForJson":             typefunctions.PrepareForJsonEmitter{},
		"restoreFromJson":            typefunctions.RestoreFromJsonEmitter{},
		"prepareForJsonSafe":         typefunctions.PrepareForJsonSafeEmitter{},
		"formatTransform":            typefunctions.FormatTransformEmitter{},
		"validate":                   typefunctions.ValidateEmitter{},
		"validationErrors":           typefunctions.ValidationErrorsEmitter{},
		"stringifyJson":              typefunctions.StringifyJsonEmitter{},
		"compactForJson":             typefunctions.CompactForJsonEmitter{},
		"compactFromJson":            typefunctions.CompactFromJsonEmitter{},
		"toBinary":                   typefunctions.ToBinaryEmitter{},
		"fromBinary":                 typefunctions.FromBinaryEmitter{},
		"hasUnknownKeys":             typefunctions.HasUnknownKeysEmitter{},
		"cloneExactShape":            typefunctions.CloneExactShapeEmitter{},
		"unknownKeyErrors":           typefunctions.UnknownKeyErrorsEmitter{},
		"unknownKeysToUndefined":     typefunctions.UnknownKeysToUndefinedEmitter{},
		"unknownKeysToUndefinedWire": typefunctions.UnknownKeysToUndefinedWireEmitter{},
	}
	facts := typefunctions.NewFactsTable()
	checked, skippedCyclic, conservativeMisses := 0, 0, 0
	for _, rt := range allTypes {
		if rt == nil || rt.ID == "" {
			continue
		}
		if reachesCycle(rt, refTable, map[string]bool{}) {
			skippedCyclic++
			continue
		}
		for familyName, emitter := range emitters {
			verdict, groundTruth, comparable := typefunctions.NoopPredicateAgreement(emitter, rt, refTable, facts)
			if !comparable {
				continue
			}
			checked++
			if verdict && !groundTruth {
				t.Errorf("%s: predicate claims noop but the compiled body is NOT identity — UNSOUND (type %s kind=%d name=%q)", familyName, rt.ID, rt.Kind, rt.TypeName)
			}
			if !verdict && groundTruth {
				conservativeMisses++
			}
		}
	}
	if checked == 0 {
		t.Fatal("corpus produced no comparable (emitter, type) pairs — harness wiring broke")
	}
	t.Logf("noop predicate agreement: %d pairs checked, %d cyclic types skipped, %d conservative misses (sound)", checked, skippedCyclic, conservativeMisses)
}
