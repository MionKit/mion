package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/cachegen/operations"
	_ "github.com/mionkit/ts-runtypes/internal/cachegen/typefunctions/formats/all"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/constants"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// inlinemode_test.go covers the inlining policy end to end. DEFAULT mode
// applies the name rule: unnamed compounds inline into their parents (no
// per-child cache entry, the loop hoists to a context fn) while named
// compounds keep the external dependency-call path. allInternal is
// name-blind (everything except circular inlines). Cross-family
// `val_<member>` edges keep rendering the member entries an inlined union's
// discriminators need, and the walk-stack cycle guard keeps unflagged
// circular re-entries terminating.

// setupInlineModeAllInternal is setupInline with InlineMode allInternal.
func setupInlineModeAllInternal(t testing.TB, sources map[string]string) *resolver.Session {
	t.Helper()
	return setupInlineWith(t, sources, func(programOpts *program.Options, resolverOpts *resolver.Options) {
		programOpts.SingleThreaded = true
		resolverOpts.SingleThreaded = true
		resolverOpts.InlineMode = constants.InlineModeAllInternal
	})
}

// pairedArraySource exercises both marker forms (static + reflection) per
// the marker test coverage rule, over a parent embedding an UNNAMED array.
const pairedArraySource = `import {createValidateFn, getRunTypeId} from '@ts-runtypes/core';
type Parent = {tags: string[]};
export const isParent = createValidateFn<Parent>();
export const staticId = getRunTypeId<Parent>();
const p = {tags: ['a']} as Parent;
export const reflectedId = getRunTypeId(p);
`

// valEntryKeys returns the entryModules keys belonging to the validate
// family (prefix `<plainValidateHash>_`).
func valEntryKeys(resp protocol.Response) []string {
	prefix := operations.PlainHash("validate") + "_"
	var keys []string
	for name := range resp.EntryModules {
		if strings.HasPrefix(name, prefix) {
			keys = append(keys, name)
		}
	}
	return keys
}

func TestInlineMode_Default_UnnamedArrayDropsChildEntry(t *testing.T) {
	// DEFAULT mode (no option set): the unnamed string[] child inlines —
	// exactly ONE val entry (the parent), whose body hoists the element
	// loop into a context fn.
	r := setupInline(t, map[string]string{"a.ts": pairedArraySource})
	resp := scanWithModules(t, r, []string{"a.ts"})
	keys := valEntryKeys(resp)
	if len(keys) != 1 {
		t.Fatalf("default should emit ONE val entry (the parent), got %v", keys)
	}
	parent := resp.EntryModules[keys[0]]
	if !strings.Contains(parent, "ctxFn0(") {
		t.Errorf("parent body should hoist the array loop to a context fn:\n%s", parent)
	}
	if strings.Contains(parent, ".fn(v.tags)") {
		t.Errorf("parent must not emit an external dep call for the unnamed array:\n%s", parent)
	}
}

const namedAliasArraySource = `import {createValidateFn, getRunTypeId} from '@ts-runtypes/core';
type Tags = string[];
type Parent = {tags: Tags};
export const isParent = createValidateFn<Parent>();
export const staticId = getRunTypeId<Parent>();
const p = {tags: ['a']} as Parent;
export const reflectedId = getRunTypeId(p);
`

func TestInlineMode_Default_NamedArrayStaysExternal(t *testing.T) {
	r := setupInline(t, map[string]string{"a.ts": namedAliasArraySource})
	resp := scanWithModules(t, r, []string{"a.ts"})
	keys := valEntryKeys(resp)
	if len(keys) != 2 {
		t.Fatalf("default: named alias array must stay a separate external entry (parent + Tags), got %v", keys)
	}
	combined := strings.Join(moduleSources(resp), "\n")
	if !strings.Contains(combined, ".fn(v.tags)") {
		t.Errorf("parent should call the named array through the external dep path:\n%s", combined)
	}
}

func TestInlineMode_AllInternal_NamedArrayInlines(t *testing.T) {
	// allInternal is name-blind: even the named alias inlines — one entry.
	r := setupInlineModeAllInternal(t, map[string]string{"a.ts": namedAliasArraySource})
	resp := scanWithModules(t, r, []string{"a.ts"})
	keys := valEntryKeys(resp)
	if len(keys) != 1 {
		t.Fatalf("allInternal: named alias array must inline (one entry), got %v", keys)
	}
}

// The highest-severity allInternal risk: an inlined unnamed UNION still
// discriminates members via cross-family `val_<member>` lookups at runtime.
// Those edges must keep riding SoftDeps so resolveCrossFamilyEdges renders
// the member validate entries even though no site demands them directly.
func TestInlineMode_Default_InlinedUnionKeepsCrossFamilyValMembers(t *testing.T) {
	source := `import {createBinaryEncoderFn} from '@ts-runtypes/core';
export const enc = createBinaryEncoderFn<{u: {a: {n: number}} | {a: {s: string}}}>();
`
	r := setupInline(t, map[string]string{"a.ts": source})
	resp := scanWithModules(t, r, []string{"a.ts"})
	valKeys := valEntryKeys(resp)
	if len(valKeys) < 2 {
		t.Fatalf("inlined union's member val_ entries must render via the cross-family fixpoint, got %v (modules: %v)", valKeys, moduleNames(resp))
	}
	// The tb parent's body must resolve those members through getRT —
	// the cross-family guard survives inlining.
	var tbParent string
	tbPrefix := operations.PlainHash("toBinary") + "_"
	for name, source := range resp.EntryModules {
		if strings.HasPrefix(name, tbPrefix) {
			tbParent = source
			break
		}
	}
	if tbParent == "" {
		t.Fatalf("missing toBinary parent entry; modules: %v", moduleNames(resp))
	}
	// The body rides inside a single-quoted JS string, so the getRT quotes
	// are escaped (`getRT(\'nPZ_x\')`) in the module source.
	sawMemberLookup := false
	for _, key := range valKeys {
		if strings.Contains(tbParent, `utl.getRT(\'`+key+`\')`) {
			sawMemberLookup = true
			break
		}
	}
	if !sawMemberLookup {
		t.Errorf("tb parent should resolve val_<member> via getRT for union discrimination:\n%s", tbParent)
	}
}

func moduleSources(resp protocol.Response) []string {
	sources := make([]string, 0, len(resp.EntryModules))
	for _, source := range resp.EntryModules {
		sources = append(sources, source)
	}
	return sources
}

// The cycle the serializer's IsCircular flag can MISS: an optional `a?: U`
// property wraps the named circular alias in an ANONYMOUS `U | undefined`
// union, which union flattening re-enters without ever dispatching the
// flagged node. The walker's inlineWouldCycle guard must force the revisit
// external (a self-call), or the inline expansion recurses until OOM —
// this exact shape froze the full-suite dump when allInternal first landed.
func TestInlineMode_Default_CircularAliasThroughOptionalPropTerminates(t *testing.T) {
	source := `import {createJsonEncoderFn} from '@ts-runtypes/core';
type U = Date | number | string | {a?: U; b?: string} | U[];
export const enc = createJsonEncoderFn<U>(undefined, {strategy: 'mutate'});
`
	r := setupInline(t, map[string]string{"a.ts": source})
	resp := scanWithModules(t, r, []string{"a.ts"})
	if len(resp.EntryModules) == 0 {
		t.Fatalf("circular alias union must render (cycle broken by the walk-stack guard), got zero modules")
	}
}
