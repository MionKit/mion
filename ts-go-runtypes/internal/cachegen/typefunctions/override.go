package typefunctions

import (
	"sort"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/operations"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// overrideOpKeyForTag maps a simple family tag to the op NAME RunType.Overrides is keyed by ("val" → "validate").
// The name, not the marker token, is the hash identity, so marker renames never move an overridden type.
// "" means an internal primitive and skips the check; composite JSON tags resolve in json_composite.go.
func overrideOpKeyForTag(tag string) string {
	op, ok := operations.ByFamilyTag(tag)
	if !ok || !op.Public {
		return ""
	}
	return op.Name
}

// composedByOverride reports whether a primitive demand exists only for a JSON composite this type overrides.
func composedByOverride(runType *reflection.RunType, composedBy string) bool {
	return composedBy != "" && runType != nil && runType.Overrides[composedBy] != ""
}

// overrideHashForTag returns the cfn body hash an override registered for this (family tag, type).
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

// buildRedirectEntry renders the cfn-redirect entry for an overridden (family, type): a KindTypeFn entry
// whose factory returns the user's custom pure function instead of the Go-emitted structural body. That
// module rides SoftDeps so initFromTuple registers it before the redirect materializes, and usePureFn (not
// getPureFn) throws on a missing module, so an emitter bug fails loudly instead of degrading to the family
// identity. Mirrors collectJsonCompositeEntry's arg assembly; the redirect is never disk-cached, being
// trivial to re-derive under a content-addressed cfn key.
func buildRedirectEntry(entryKey string, tag string, runType *reflection.RunType, cfnKey string, opts RenderOpts) *entrymodules.Entry {
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

// AssertOverrideCfn verifies the invariant every cfn redirect relies on: the override module it forwards to
// via `utl.usePureFn` actually rendered. A miss is an emitter bug (the unguarded usePureFn would throw at
// runtime), so it surfaces as an OVR002 Error at collect time, in sorted-key order. Mirrors
// AssertCompositeSoftDeps. An override's id looks like any other pure fn's, so membership in overrideIDs is
// the only thing telling the two apart; there is no prefix to scan for.
func AssertOverrideCfn(graph entrymodules.Graph, overrideIDs map[string]bool, diagSink *[]diagnostics.Diagnostic) {
	if diagSink == nil || len(overrideIDs) == 0 {
		return
	}
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
			if !overrideIDs[dep] {
				continue
			}
			if target, ok := graph[dep]; ok && target != nil && target.Kind != entrymodules.KindMissing {
				continue
			}
			*diagSink = append(*diagSink, diagnostics.New(diagnostics.CodeOverrideMissingCfn, diagnostics.Site{}, entry.Key, dep))
		}
	}
}
