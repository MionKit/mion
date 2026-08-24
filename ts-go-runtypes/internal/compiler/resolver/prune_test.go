package resolver_test

import (
	"sort"
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/cachegen/operations"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// prune_test.go pins the emission-side completion of noop elision
// (pruneUnreachableTypeFnEntries): the demand machinery renders a short-form
// entry for every primitive a composite site demands, but once the composite
// elides its binding the orphan must not be EMITTED either — only modules the
// plugin can actually reach (rewrite-injected bindings + their transitive
// import closure) leave the resolver.

// TestPrune_ElidedPrimitivesNotEmitted — a plain JSON-compatible DTO through
// createJsonDecoderFn (default strip): rj is identity, the jdST composite
// elides it, and the rj module must disappear from the payload while the live
// ukuw half stays imported.
func TestPrune_ElidedPrimitivesNotEmitted(t *testing.T) {
	resp := scopeScan(t, `import {createJsonDecoderFn} from '@ts-runtypes/core';
type PlainDTO = {a: string; b?: number};
export const dec = createJsonDecoderFn<PlainDTO>();
`)
	if hasFamilyEntry(resp, "restoreFromJson") {
		t.Errorf("noop rj entry must be pruned once the composite elides it, got %v", familyEntryKeys(resp, "restoreFromJson"))
	}
	if !hasFamilyEntry(resp, "unknownKeysToUndefinedWire") {
		t.Error("ukuw does real work for an object DTO — its module must survive the prune")
	}
	if !hasFamilyEntry(resp, "jsonDecoder") {
		t.Error("the jdST composite is the injected binding — it must always be emitted")
	}
	if all := allEntrySources(resp); strings.Contains(all, "rjFn") {
		t.Errorf("no emitted module may still bind rjFn:\n%s", all)
	}
}

// compositeEntryKeys returns the sorted EntryModules basenames keyed under a
// JSON composite op's STRATEGY-qualified fnHash prefix (composites are keyed
// by FnHashFor(op, nil, strategy), not the default-variant PlainHash that
// familyEntryKeys derives).
func compositeEntryKeys(t *testing.T, resp protocol.Response, opName, strategy string) []string {
	t.Helper()
	op, ok := operations.ByName(opName)
	if !ok {
		t.Fatalf("unknown operation %q", opName)
	}
	prefix := operations.FnHashFor(op, nil, strategy, false) + "_"
	var keys []string
	for basename := range resp.EntryModules {
		if strings.HasPrefix(basename, prefix) {
			keys = append(keys, basename)
		}
	}
	sort.Strings(keys)
	return keys
}

// TestPrune_CollapsedCompositeShortFormEmitted — when EVERY primitive of a
// composite elides, the composite itself is the noop short-form: the mutate
// encoder and preserve decoder of a plain JSON-compatible DTO ship one tiny
// tuple each (`'<TypeName>',,true` tail, no factory, no imports), the runtime
// substitutes native JSON.stringify / JSON.parse, and the orphaned pj / rj
// primitives are pruned.
func TestPrune_CollapsedCompositeShortFormEmitted(t *testing.T) {
	resp := scopeScan(t, `import {createJsonEncoderFn, createJsonDecoderFn} from '@ts-runtypes/core';
type PlainDTO = {a: string; b?: number};
export const enc = createJsonEncoderFn<PlainDTO>(undefined, {strategy: 'mutate'});
export const dec = createJsonDecoderFn<PlainDTO>(undefined, {strategy: 'preserve'});
`)
	if hasFamilyEntry(resp, "prepareForJson") {
		t.Errorf("noop pj entry must be pruned once the composite collapses, got %v", familyEntryKeys(resp, "prepareForJson"))
	}
	if hasFamilyEntry(resp, "restoreFromJson") {
		t.Errorf("noop rj entry must be pruned once the composite collapses, got %v", familyEntryKeys(resp, "restoreFromJson"))
	}
	for opName, strategy := range map[string]string{"jsonEncoder": "mutate", "jsonDecoder": "preserve"} {
		keys := compositeEntryKeys(t, resp, opName, strategy)
		if len(keys) != 1 {
			t.Fatalf("expected exactly one %s/%s composite entry, got %v", opName, strategy, keys)
		}
		module := entryModule(resp, keys[0])
		if !strings.Contains(module, "'PlainDTO',,true]") {
			t.Errorf("the collapsed %s composite must be the noop short-form:\n%s", opName, module)
		}
		if strings.Contains(module, "import ") {
			t.Errorf("the collapsed %s composite must carry no imports:\n%s", opName, module)
		}
	}
	if all := allEntrySources(resp); strings.Contains(all, "JSON.stringify") || strings.Contains(all, "JSON.parse") {
		t.Errorf("no emitted module may still carry a native-JSON body — that moved into the runtime noop:\n%s", all)
	}
}

// TestPrune_DirectStrategyTwoLayerCollapse — jeDI over an atomic root used to
// ship two dead modules (an sj entry whose body was `return JSON.stringify(v)`
// plus the composite `return sjFn(v)` binding it). The sj Finalize byte-match
// marks the primitive noop, the composite collapses to the short form, and the
// orphaned sj module is pruned. The object-root control keeps both halves live
// (sj really strips extras + fixes member order there).
func TestPrune_DirectStrategyTwoLayerCollapse(t *testing.T) {
	resp := scopeScan(t, `import {createJsonEncoderFn} from '@ts-runtypes/core';
export const encStr = createJsonEncoderFn<string>(undefined, {strategy: 'direct'});
`)
	if hasFamilyEntry(resp, "stringifyJson") {
		t.Errorf("noop sj entry must be pruned once the composite collapses, got %v", familyEntryKeys(resp, "stringifyJson"))
	}
	keys := compositeEntryKeys(t, resp, "jsonEncoder", "direct")
	if len(keys) != 1 {
		t.Fatalf("expected exactly one jeDI composite entry, got %v", keys)
	}
	if module := entryModule(resp, keys[0]); !strings.Contains(module, ",true]") {
		t.Errorf("the collapsed jeDI composite must be the noop short-form:\n%s", module)
	}

	control := scopeScan(t, `import {createJsonEncoderFn} from '@ts-runtypes/core';
type PlainDTO = {a: string; b?: number};
export const encObj = createJsonEncoderFn<PlainDTO>(undefined, {strategy: 'direct'});
`)
	if !hasFamilyEntry(control, "stringifyJson") {
		t.Error("sj does real work for an object root — its module must survive the prune")
	}
	if all := allEntrySources(control); !strings.Contains(all, "sjFn") {
		t.Error("the jeDI composite must keep its sjFn binding for an object root")
	}
}

// TestPrune_LivePrimitivesStayEmitted is the control: a Date-bearing DTO
// keeps its rj entry (real `new Date(v)` rebuild) referenced by the composite
// and therefore emitted.
func TestPrune_LivePrimitivesStayEmitted(t *testing.T) {
	resp := scopeScan(t, `import {createJsonDecoderFn} from '@ts-runtypes/core';
type Stamped = {a: string; at: Date};
export const dec = createJsonDecoderFn<Stamped>();
`)
	if !hasFamilyEntry(resp, "restoreFromJson") {
		t.Error("rj must stay emitted when the decoder needs the Date rebuild")
	}
	if all := allEntrySources(resp); !strings.Contains(all, "rjFn") {
		t.Error("the jdST composite must keep its rjFn binding for a Date-bearing DTO")
	}
}

// TestPrune_KeepsDirectlyDemandedNoopRoots — a rewrite-injected binding must
// always resolve, even when its entry is the noop short-form: createValidateFn
// over `any` collapses to identity, but the site imports `__rt_<val>_<id>`
// directly, so the module must survive the prune.
func TestPrune_KeepsDirectlyDemandedNoopRoots(t *testing.T) {
	resp := scopeScan(t, `import {createValidateFn} from '@ts-runtypes/core';
export const isAnything = createValidateFn<any>();
`)
	keys := familyEntryKeys(resp, "validate")
	if len(keys) != 1 {
		t.Fatalf("expected exactly the demanded val entry to survive, got %v", keys)
	}
	if module := entryModule(resp, keys[0]); !strings.Contains(module, ",true]") {
		t.Errorf("the surviving val entry for `any` must be the noop short-form:\n%s", module)
	}
	if resp.Sites[0].FnId+"_"+resp.Sites[0].ID != keys[0] {
		t.Errorf("surviving key %q must be the site's own injected binding %q", keys[0], resp.Sites[0].FnId+"_"+resp.Sites[0].ID)
	}
}

// TestPrune_ReflectionAndPureFnModulesUntouched — non-typefn kinds are
// unconditional roots: a reflection-only file keeps its facade + runtype
// bundle payload.
func TestPrune_ReflectionAndPureFnModulesUntouched(t *testing.T) {
	resp := scopeScan(t, `import {getRunTypeId} from '@ts-runtypes/core';
export const id = getRunTypeId<{a: string}>();
`)
	if entryModule(resp, "runtypes") == "" {
		t.Error("the runtype data bundle must never be pruned")
	}
	if resp.Sites[0].ID == "" || entryModule(resp, resp.Sites[0].ID) == "" {
		t.Error("the reflection facade for the demanded root must never be pruned")
	}
}

// TestPrune_AlwaysThrowPrimitiveSurvives — an unsupported root (symbol) makes
// rj an alwaysThrow entry, which is live, not noop: the composite keeps its
// binding and the module must stay emitted so createJsonDecoderFn<symbol>()
// throws with the RJ code at factory-creation time instead of silently
// decoding garbage.
func TestPrune_AlwaysThrowPrimitiveSurvives(t *testing.T) {
	resp := scopeScan(t, `import {createJsonDecoderFn} from '@ts-runtypes/core';
export const dec = createJsonDecoderFn<symbol>();
`)
	if !hasFamilyEntry(resp, "restoreFromJson") {
		t.Error("the alwaysThrow rj entry must survive the prune — it is live, not noop")
	}
	if all := allEntrySources(resp); !strings.Contains(all, "rjFn") {
		t.Error("the jdST composite must keep its rjFn binding to the alwaysThrow entry")
	}
}

// TestPrune_MixedSitesDoNotCrossContaminate — two decoder sites in one file,
// one over a plain DTO (rj noop → elided) and one over a Date-bearing DTO
// (rj live): exactly the live rj survives, keyed to the Date-bearing type,
// proving liveness is per-entry rather than per-family.
func TestPrune_MixedSitesDoNotCrossContaminate(t *testing.T) {
	resp := scopeScan(t, `import {createJsonDecoderFn} from '@ts-runtypes/core';
type PlainDTO = {a: string; b?: number};
type Stamped = {a: string; at: Date};
export const decPlain = createJsonDecoderFn<PlainDTO>();
export const decStamped = createJsonDecoderFn<Stamped>();
`)
	keys := familyEntryKeys(resp, "restoreFromJson")
	if len(keys) != 1 {
		t.Fatalf("expected exactly the Date-bearing rj entry to survive, got %v", keys)
	}
	var stampedID string
	for _, runType := range resp.RunTypes {
		if runType != nil && runType.TypeName == "Stamped" {
			stampedID = runType.ID
		}
	}
	if stampedID == "" {
		t.Fatal("Stamped runtype missing from the response")
	}
	if want := operations.PlainHash("restoreFromJson") + "_" + stampedID; keys[0] != want {
		t.Errorf("surviving rj key %q must belong to the Date-bearing type (%q)", keys[0], want)
	}
}
