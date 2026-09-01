package typefunctions

import (
	"sort"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/operations"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// overrideOpKeyForTag maps a simple (non-composite) family tag to the public
// operation FnKey RunType.Overrides is keyed by ("val" → "val", "tb" → "tb",
// …). Returns "" for tags with no public operation (the internal primitives,
// which are never user-overridable) so the override check is skipped for them.
// Composite JSON tags resolve their op key in json_composite.go.
func overrideOpKeyForTag(tag string) string {
	op, ok := operations.ByFamilyTag(tag)
	if !ok || !op.Public {
		return ""
	}
	return op.FnKey
}

// primitiveCompositeOpKey maps a JSON-composite PRIMITIVE family tag to the
// composite operation op key that owns it. When a type's composite op is
// overridden, the redirect references no primitives, so the primitive entry for
// that type is dead — and for a type the structural emitter can't handle (the
// escape-valve case), emitting it would alwaysThrow on the very type the user
// overrode to avoid. Returns "" for non-primitive tags. The set is closed (the
// operation registry's collision guard pins it): pj/pjs/sj feed the encoder,
// rj/ukuw feed the decoder.
func primitiveCompositeOpKey(tag string) string {
	switch tag {
	case "pj", "pjs", "sj":
		return "jsonEncoder"
	case "rj", "ukuw":
		return "jsonDecoder"
	}
	return ""
}

// compositeOverriddenForPrimitive reports whether the runtype's JSON composite
// op that OWNS this primitive family is overridden — in which case the primitive
// entry must be skipped entirely (the composite redirect names no primitives).
func compositeOverriddenForPrimitive(runType *reflection.RunType, primitiveTag string) bool {
	if runType == nil || len(runType.Overrides) == 0 {
		return false
	}
	opKey := primitiveCompositeOpKey(primitiveTag)
	return opKey != "" && runType.Overrides[opKey] != ""
}

// overrideHashForTag returns the cfn body hash an override registered for this
// (family tag, type), or "" when the type carries no override for that family.
func overrideHashForTag(runType *reflection.RunType, tag string) string {
	if runType == nil || len(runType.Overrides) == 0 {
		return ""
	}
	opKey := overrideOpKeyForTag(tag)
	if opKey == "" {
		return ""
	}
	return runType.Overrides[opKey]
}

// buildRedirectEntry renders the cfn-redirect entry for an overridden
// (family, type): a KindTypeFn entry whose factory returns the user's custom
// pure function instead of the Go-emitted structural body. The body is a
// one-liner — `return utl.usePureFn('cfn::<hash>')` — and the cfn module rides
// SoftDeps so initFromTuple registers it before the redirect materializes.
// usePureFn (not getPureFn) throws on a missing module, so an emitter bug fails
// loudly rather than silently degrading to the family identity.
//
// Mirrors collectJsonCompositeEntry's arg assembly; the redirect is never
// disk-cached (it is trivial to re-derive and the cfn key is content-addressed).
func buildRedirectEntry(entryKey string, tag string, runType *reflection.RunType, cfnHash string, opts RenderOpts) *entrymodules.Entry {
	cfnKey := purefunctions.OverrideNamespace + "::" + cfnHash
	factoryBody := "return utl.usePureFn(" + quoteJS(cfnKey) + ")"
	codeArg := "undefined"
	if opts.EmitMode.EmitsCode() {
		codeArg = quoteJS(factoryBody)
	}
	createRTFnArg := "u"
	if opts.EmitMode.EmitsFactory() {
		createRTFnArg = "function g_" + entryKey + "(utl){" + factoryBody + "}"
	}
	args := holeifyArgs([]string{
		quoteJS(entryKey),
		quoteJS(rtTypeName(runType)),
		codeArg,
		"false",                     // isNoop — an override is never the family identity
		"[]",                        // rtDependencies — the redirect has no same-family children
		"[" + quoteJS(cfnKey) + "]", // pureFnDependencies — the cfn this entry redirects to
		createRTFnArg,
	})
	return &entrymodules.Entry{
		Key:       entryKey,
		Kind:      entrymodules.KindTypeFn,
		FamilyTag: tag,
		ArgsText:  joinArgs(args),
		SoftDeps:  []string{cfnKey},
		IsNoop:    false,
	}
}

// AssertOverrideCfn verifies the invariant every cfn redirect relies on: the
// `cfn::<hash>` module it forwards to via `utl.usePureFn` actually rendered. A
// miss is an emitter bug — the unguarded usePureFn would throw at runtime — so
// it surfaces as an OVR002 Error at collect time. Mirrors AssertCompositeSoftDeps.
// Deterministic order via sorted keys.
func AssertOverrideCfn(graph entrymodules.Graph, diagSink *[]diagnostics.Diagnostic) {
	if diagSink == nil {
		return
	}
	cfnPrefix := purefunctions.OverrideNamespace + "::"
	keys := make([]string, 0, len(graph))
	for key := range graph {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		entry := graph[key]
		if entry == nil || entry.Kind != entrymodules.KindTypeFn {
			continue
		}
		for _, dep := range entry.SoftDeps {
			if !strings.HasPrefix(dep, cfnPrefix) {
				continue
			}
			if target, ok := graph[dep]; ok && target != nil && target.Kind != entrymodules.KindMissing {
				continue
			}
			*diagSink = append(*diagSink, diagnostics.New(diagnostics.CodeOverrideMissingCfn, diagnostics.Site{}, entry.Key, dep))
		}
	}
}
