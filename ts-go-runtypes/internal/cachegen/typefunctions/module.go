package typefunctions

import (
	"fmt"
	"os"
	"sort"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/diskcache"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/operations"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/jsengine"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// PureFnDepUse pairs a pure-fn dep with the call sites that demanded it, so PFE9012 anchors at the user's createX<T>().
// Sites is empty for a transitively-reached child entry, and the resolver falls back to a file-less diagnostic.
type PureFnDepUse struct {
	Dep   protocol.PureFnDep
	Sites []diagnostics.Site
}

// ProvenanceKey addresses one RENDERED ENTRY's provenance: the type id plus the entry's family tag.
// A finding is family-specific, and keyed by id alone a `createValidateFn<T>()` site heard the JSON encoder's findings too.
func ProvenanceKey(typeID, familyTag string) string {
	return typeID + "\x00" + familyTag
}

// RenderOpts threads the per-session disk cache into the per-entry collectors; the zero value disables caching.
// Disk-layer errors never panic: a read failure falls through to a fresh compile, a write failure is logged and ignored.
type RenderOpts struct {
	// Store is the on-disk RT cache. Nil disables caching.
	Store *diskcache.Store
	// Lookup resolves structural ids ↔ short hashes; required when Store is
	// non-nil. The resolver passes its runtype.Cache here.
	Lookup diskcache.HashLookup
	// DiagSink is where the walker appends compile-time diagnostics from root-throw / silent-skip sites.
	// Nil disables emission, which keeps tests that don't care about the per-call-site fan-out quiet.
	DiagSink *[]diagnostics.Diagnostic
	// PureFnDepSink collects every pure-fn dep recorded while rendering a LIVE
	// entry body, paired with the call sites that demanded the entry, so a dep
	// with no registration surfaces PFE9012 at those sites. Noop, alwaysThrow
	// and disk-cache-hit entries contribute nothing (no `utl.getPureFn` call, or
	// no walk at all), so a warm cache validates only what was recomputed. Nil
	// disables collection; the parallel fan-out shards it per goroutine like DiagSink.
	PureFnDepSink *[]PureFnDepUse
	// JSEngine runs the format-pattern checks, the authority for pattern
	// mockSamples (real `new RegExp` semantics). Nil fails them closed with FMT004.
	JSEngine jsengine.Engine
	// PatternSampleCount mirrors the resolver's pattern mockSample knob, and
	// PatternGenFailures the reasons its enrichment pass (which runs BEFORE the
	// collects) could not generate, keyed by `source \x00 flags`. The FMT005 lane
	// reads both to tell disabled (count 0) from failed generation.
	PatternSampleCount int
	PatternGenFailures map[string]formats.PatternGenFailure
	// ProvenanceSites maps each rendered entry (ProvenanceKey: type id + family tag) to the call sites that REACH it,
	// the named type plus all under it; EmitDiagnostic fans one Diagnostic per site, else the warning has no location.
	ProvenanceSites map[string][]diagnostics.Site
	// RootedSites narrows that map to the sites where the id is the type NAMED at
	// the call. A ScopeRoot code is about the root of a marker call, so fanning it
	// over the reaching sites would blame a call whose function is fine.
	RootedSites map[string][]diagnostics.Site
	// InlineMode selects the child-inlining policy: default inlines UNNAMED
	// non-circular compounds and keeps named types external, allInternal inlines
	// everything but circular types. Folded into the disk fingerprint, so the two
	// modes never share cache entries.
	InlineMode constants.InlineMode
	// EmitMode selects what each fn entry ships: EmitCode (body string, factory
	// rebuilt via `new Function` on first lookup), EmitFunctions (live factory,
	// `code` derived lazily), or EmitBoth for runtimes that disallow
	// `new Function` (WorkerD, browser CSP) yet read `.code`.
	EmitMode constants.EmitMode
	// RefTable resolves child ref ids during a collect. The resolver passes the
	// FULL session cache, so a collect whose dump.RunTypes is a per-request
	// projection still resolves children interned while scanning another file.
	// Nil falls back to indexing dump.RunTypes (the unit-test shape).
	RefTable map[string]*reflection.RunType
	// Facts memoizes the canonical-node subtree predicates across every collect of
	// one dispatch. See FactsTable.
	Facts *FactsTable
}

// familyOp recovers the operation emitting entries under a cache-module's family Tag; panics on an unknown tag.
// Every cache key derives from the operation registry, NEVER from settings.Tag, so this lookup is the single bridge.
func familyOp(settings constants.CacheModuleSettings) operations.Operation {
	op, ok := operations.ByFamilyTag(settings.Tag)
	if !ok {
		panic(fmt.Sprintf("typefns: no operation registered for family tag %q", settings.Tag))
	}
	return op
}

// innerPrefix is a family's inner-fn name prefix: the registry's plain (default-variant) fnHash plus `_`.
// It also namespaces the JS cache key, and same-family child deps resolve to it, so a variant root uses plain children.
func innerPrefix(settings constants.CacheModuleSettings) string {
	return operations.PlainHash(familyOp(settings).Name) + "_"
}

// variantKey is an entry's cache key: `<plainFhash>_<id>` for the plain variant, `<variantFhash>_<id>` otherwise.
// The variant fhash folds the option NAMES in: FnHashFor(validate, [numberTypeof]) keys that variant of validate.
func variantKey(settings constants.CacheModuleSettings, suffix string, options []string, id string, rejectCircular bool) string {
	op := familyOp(settings)
	if suffix == "" && !rejectCircular {
		return operations.PlainHash(op.Name) + "_" + id
	}
	return operations.FnHashFor(op, options, "", rejectCircular) + "_" + id
}

// ExtraRoot is one (type id, variant) the cross-family fixpoint asks a family to render beyond its call-site demand.
// The variant fields are empty for a plain edge and carry the referring walker's options when the edge names a variant.
type ExtraRoot struct {
	ID            string
	VariantSuffix string
	Options       []string
}

// variantFactoryName is variantKey with a `g_` prefix, which keeps the factory and cache-key shapes in lockstep.
func variantFactoryName(settings constants.CacheModuleSettings, suffix string, options []string, id string, rejectCircular bool) string {
	return "g_" + variantKey(settings, suffix, options, id, rejectCircular)
}

// CollectFamilyEntries compiles one family's demanded cache entries: one per demanded (root, variant) plus the
// transitive closure of same-family child factories they reference. Each entry's Deps carry BOTH the same-family
// child deps and the cross-family edges, whose foreign entries the resolver's cross-family fixpoint renders.
//
// extraRoots seeds roots beyond the family's own call-site demand, each collected as its own entry plus its
// same-family closure; its variant fields are empty for a plain edge and carry the referring walker's options
// when the edge names a variant entry.
//
// With no dump.Sites and no extraRoots the collector emits a factory for every interned RunType the emitter
// supports, the unit-test (and embedded-API) shape predating demand scoping.
//
// Pure-fn deps are intentionally NOT module deps: a pure fn registers itself at its own `registerPureFnFactory`
// call site when the defining module is imported, always before any factory materializes.
func CollectFamilyEntries(dump protocol.Dump, settings constants.CacheModuleSettings, emitter Emitter, innerPrefix string, opts RenderOpts, extraRoots []ExtraRoot) entrymodules.Graph {
	// Cache entries store every child slot as a ref (`{kind: -1, id: …}`), so
	// without this table the walker would dispatch on the placeholder kind and
	// panic. opts.RefTable (the full session cache) wins when provided, so a
	// collect resolves children the per-request dump.RunTypes may not contain.
	refTable := opts.RefTable
	if refTable == nil {
		refTable = make(map[string]*reflection.RunType, len(dump.RunTypes))
		for _, runType := range dump.RunTypes {
			if runType == nil || runType.ID == "" {
				continue
			}
			refTable[runType.ID] = runType
		}
	}

	graph := make(entrymodules.Graph, len(dump.RunTypes))

	// renderEntry is idempotent via graph dedup; an unsupported child's CodeNS drops the factory (see codetype.go).
	renderEntry := func(runType *reflection.RunType, suffix string, options []string, rejectCircular bool) ([]string, bool) {
		if runType == nil || !emitter.Supports(runType) {
			return nil, false
		}
		entryID := variantKey(settings, suffix, options, runType.ID, rejectCircular)
		if existing, exists := graph[entryID]; exists {
			return existing.Deps, true
		}
		// Option variants and the armed variant change behaviour an override can't express, so emit structurally.
		if !rejectCircular && suffix == "" {
			if cfnID := overrideHashForTag(runType, settings.Tag); cfnID != "" {
				graph.Add(buildRedirectEntry(entryID, settings.Tag, runType, cfnID, opts))
				return nil, true // a redirect has no same-family child deps
			}
		}
		rendered := renderEntryWithDeps(runType, settings, emitter, innerPrefix, refTable, opts, suffix, options, rejectCircular)
		if rendered.argsText == "" {
			return nil, false
		}
		graph.Add(&entrymodules.Entry{
			Key:       entryID,
			Kind:      entrymodules.KindTypeFn,
			FamilyTag: settings.Tag,
			ArgsText:  rendered.argsText,
			// Same-family deps are hard: the body calls them unconditionally, so absence cascades.
			// Cross-family and pure-fn deps are soft (`?.fn(…) ?? true`, or registered first); SoftDeps still imports and binds them.
			Deps:     append([]string(nil), rendered.deps...),
			SoftDeps: append(append([]string(nil), rendered.crossFamilyDeps...), rendered.pureFnDeps...),
			IsNoop:   rendered.isNoop,
		})
		return rendered.deps, true
	}

	// Strip the inner prefix so refTable resolves the child; variants are root-scoped, so every child renders plain.
	queued := make(map[string]bool)
	var childQueue []string
	enqueueChildren := func(deps []string) {
		for _, dep := range deps {
			childHash := strings.TrimPrefix(dep, innerPrefix)
			key := "\x00" + childHash
			if childHash == dep || queued[key] {
				continue
			}
			queued[key] = true
			childQueue = append(childQueue, childHash)
		}
	}

	if len(dump.Sites) > 0 || len(extraRoots) > 0 {
		// Demand-driven: a type only passed to getRunTypeId, or to another family's createX, leaves no entry here.
		demand := collectFamilyDemand(dump.Sites, settings.Tag)
		// Sorted roots keep walk, disk-cache write and diagnostics order stable across runs.
		rootIDs := make([]string, 0, len(demand))
		for rootID := range demand {
			rootIDs = append(rootIDs, rootID)
		}
		sort.Strings(rootIDs)
		for _, rootID := range rootIDs {
			root := refTable[rootID]
			if root == nil {
				continue
			}
			demands := demand[rootID]
			sort.Slice(demands, func(i, j int) bool {
				if demands[i].VariantSuffix != demands[j].VariantSuffix {
					return demands[i].VariantSuffix < demands[j].VariantSuffix
				}
				// Plain before armed, for a deterministic emit order.
				return !demands[i].RejectCircular && demands[j].RejectCircular
			})
			for _, demanded := range demands {
				// The redirect calls no primitive, and structural emit could alwaysThrow on the very type the user overrode.
				if composedByOverride(root, demanded.ComposedBy) {
					continue
				}
				if deps, ok := renderEntry(root, demanded.VariantSuffix, demanded.Options, demanded.RejectCircular); ok {
					enqueueChildren(deps)
				}
			}
		}
		// Extra roots pull their same-family closure like demand roots; sorted for the same determinism.
		sortedExtra := append([]ExtraRoot(nil), extraRoots...)
		sort.Slice(sortedExtra, func(i, j int) bool {
			if sortedExtra[i].ID != sortedExtra[j].ID {
				return sortedExtra[i].ID < sortedExtra[j].ID
			}
			return sortedExtra[i].VariantSuffix < sortedExtra[j].VariantSuffix
		})
		for _, extra := range sortedExtra {
			key := extra.VariantSuffix + "\x00" + extra.ID
			if queued[key] {
				continue
			}
			queued[key] = true
			root := refTable[extra.ID]
			if root == nil {
				continue
			}
			if deps, ok := renderEntry(root, extra.VariantSuffix, extra.Options, false); ok {
				enqueueChildren(deps)
			}
		}
		for len(childQueue) > 0 {
			childHash := childQueue[len(childQueue)-1]
			childQueue = childQueue[:len(childQueue)-1]
			child := refTable[childHash]
			if child == nil {
				continue
			}
			if deps, ok := renderEntry(child, "", nil, false); ok {
				enqueueChildren(deps)
			}
		}
	} else {
		// Unit-test path with no call-site demand; the resolver-level cascade prunes parents of unsupported children.
		for _, runType := range dump.RunTypes {
			if runType == nil || !emitter.Supports(runType) {
				continue
			}
			renderEntry(runType, "", nil, false)
		}
	}

	return graph
}

// collectFamilyDemand groups familyTag's demands per runtype id, deduped so N identical sites yield one entry.
func collectFamilyDemand(sites []protocol.Site, familyTag string) map[string][]protocol.SiteDemand {
	bySuffix := make(map[string]map[string]protocol.SiteDemand)
	// Armed and plain share a suffix, so fold RejectCircular in or the armed entry loses its guard.
	dedupKey := func(demanded protocol.SiteDemand) string {
		if demanded.RejectCircular {
			return demanded.VariantSuffix + "~C"
		}
		return demanded.VariantSuffix
	}
	for _, site := range sites {
		if site.ID == "" || len(site.Demand) == 0 {
			continue
		}
		for _, demanded := range site.Demand {
			if demanded.FamilyTag != familyTag {
				continue
			}
			if bySuffix[site.ID] == nil {
				bySuffix[site.ID] = make(map[string]protocol.SiteDemand)
			}
			key := dedupKey(demanded)
			// A direct demand, or two different composites, clears ComposedBy, so the primitive still renders.
			if existing, exists := bySuffix[site.ID][key]; exists && (existing.ComposedBy == "" || existing.ComposedBy != demanded.ComposedBy) {
				demanded.ComposedBy = ""
			}
			bySuffix[site.ID][key] = demanded
		}
	}
	out := make(map[string][]protocol.SiteDemand, len(bySuffix))
	for id, suffixes := range bySuffix {
		for _, demanded := range suffixes {
			out[id] = append(out[id], demanded)
		}
	}
	return out
}

// entryRender is one (RunType, variant) compiled to its tuple argument text; `argsText` is empty when the entry
// is skipped (a noop with no body, or an unsupported leaf with no per-family diag code). `deps` are the
// same-family dep hashes driving the demand worklist, `crossFamilyDeps` the distinct cross-family RT lookups the
// body reaches. Both land on the module's Deps, and crossFamilyDeps additionally feed the resolver's cross-family
// fixpoint. crossFamilyDeps is populated on a disk-cache hit too, rebuilt from the persisted CrossFamilyRefs.
type entryRender struct {
	argsText        string
	deps            []string
	crossFamilyDeps []string
	// pureFnDeps is the entry's pure-fn dependency ids. They land on the module's
	// SoftDeps so the pure-fn module is imported and its tuple registered by the
	// deps thunk before the body runs. Persisted as diskcache.PureFnRefs and
	// rebuilt verbatim on a warm hit. Live path only: noop / alwaysThrow /
	// redirect entries reach no pure fn.
	pureFnDeps []string
	// isNoop marks the short-form tuple whose runtime fn is the family identity,
	// so downstream consumers can elide references to it.
	isNoop bool
}

// renderEntryWithDeps compiles one RunType into its tuple argument text and the dependency hashes alongside it
// (see entryRender). The outer factory's `g_<key>` name is only the closure's printed name, so consumers see the
// same identity in stack traces. A noop body returns the short-form arg text; an unsupported leaf produces an
// alwaysThrow entry when the emitter registers a diag code, and is skipped silently otherwise.
//
// A non-empty `variantSuffix` renders the entry under the variant cache key and primes the walker with
// `VariantOptions` so the emitter's per-kind dispatch can branch.
//
// With opts.Store and opts.Lookup wired the on-disk entry is tried first. A header structural-id mismatch, or a
// cached child-ref whose structural id no longer maps to the same short hash, is a miss, and the walker runs and
// writes the fresh result back. Read/write errors are non-fatal, so output is produced even with a broken cache.
func renderEntryWithDeps(runType *reflection.RunType, settings constants.CacheModuleSettings, emitter Emitter, innerPrefix string, refTable map[string]*reflection.RunType, opts RenderOpts, variantSuffix string, variantOptions []string, rejectCircular bool) entryRender {
	factoryName := variantFactoryName(settings, variantSuffix, variantOptions, runType.ID, rejectCircular)
	innerName := variantKey(settings, variantSuffix, variantOptions, runType.ID, rejectCircular)

	// An option variant is one cheap extra root, so it stays session-rendered.
	// The armed circular variant shares the PLAIN basename with a different body, so it must never touch that cache.
	cacheTag := settings.Tag
	diskCacheable := !rejectCircular && variantSuffix == ""
	if diskCacheable {
		if cached, ok := tryReadCachedEntry(runType, settings, cacheTag, innerPrefix, opts); ok {
			// The walker never runs, but CrossFamilyRefs and IsNoop were
			// persisted, so a hit returns what a fresh walk would.
			return cached
		}
	}

	// The walk appends to the shared sink, so the tail from here on is exactly
	// what THIS entry produced, which is what gets persisted for a warm build.
	diagStart := 0
	if opts.DiagSink != nil {
		diagStart = len(*opts.DiagSink)
	}

	walker := NewWalker(runType, innerName, emitter)
	walker.inlineCtx.InlineAllInternal = opts.InlineMode.AllInternal()
	walker.RefTable = refTable
	walker.facts = opts.Facts
	// InnerPrefix namespaces child cache keys consistently with the tuple's key slot (innerName below).
	walker.InnerPrefix = innerPrefix
	walker.OverrideOpKey = overrideOpKeyForTag(settings.Tag)
	if len(variantOptions) > 0 {
		walker.VariantOptions = make(map[string]bool, len(variantOptions))
		for _, name := range variantOptions {
			walker.VariantOptions[name] = true
		}
	}
	// Prime the armed circular-guard variant: the skeleton is nil for an acyclic
	// type, where the guard is a no-op, and a non-nil one forces the entry
	// non-noop below so the guarded body always ships.
	var circularSkeleton *CircularSkeleton
	if rejectCircular {
		circularSkeleton = BuildCircularSkeleton(runType, refTable)
		walker.RejectCircular = true
		walker.CircularSkeleton = circularSkeleton
	}
	// EmitDiagnostic fans each recorded code out across every call site
	// referencing this RT.
	walker.DiagSink = opts.DiagSink
	walker.JSEngine = opts.JSEngine
	walker.PatternSampleCount = opts.PatternSampleCount
	walker.PatternGenFailures = opts.PatternGenFailures
	provenanceKey := ProvenanceKey(runType.ID, settings.Tag)
	if opts.ProvenanceSites != nil {
		walker.rootProvenance = opts.ProvenanceSites[provenanceKey]
	}
	if opts.RootedSites != nil {
		walker.rootedProvenance = opts.RootedSites[provenanceKey]
	}
	innerFn, shapeNoop, isUnsupported := walker.Compile()
	if isUnsupported {
		// The parent positions propagated the unsupported leaf rather than
		// absorbing it. Render an alwaysThrow factory keyed by the leaf's
		// per-family diag code, and surface that code at build time too, so the
		// user sees the cause before runtime.
		//
		// With no registered code for the leaf, fall back to a silent skip: the
		// safety net for unknown future kinds, whose runtime cache miss
		// createXxx<T>'s identity fallback catches via the KindMissing stub.
		if leafProvider, ok := emitter.(LeafDiagCodeProvider); ok && walker.UnsupportedLeaf != nil {
			// A callable interface latches the OBJECTLITERAL as the unsupported
			// leaf, and DiagCodeForLeaf maps only the function-ish kinds, so it
			// would resolve to "" and the entry would be SILENTLY SKIPPED — leaving
			// a dangling dep that a JSON composite binds with an unguarded
			// getRT(key).fn. Substitute the
			// call-signature child so it renders as an alwaysThrow, like a bare function.
			diagLeaf := callableLeafSubstitute(walker.UnsupportedLeaf, walker.RefTable)
			if diagCode := leafProvider.DiagCodeForLeaf(diagLeaf); diagCode != "" {
				kindLabel := leafKindLabel(diagLeaf)
				walker.EmitDiagnostic(diagCode, kindLabel)
				argsText := renderAlwaysThrowEntry(runType, innerName, diagCode, kindLabel, walker.throwProvenance())
				if diskCacheable {
					// alwaysThrow entries emit no dep calls, so there are no
					// edges to persist.
					writeCachedEntry(runType, settings, cacheTag, innerPrefix, argsText, nil, nil, nil, false, entryDiagnostics(diagStart, opts), opts)
				}
				return entryRender{argsText: argsText}
			}
		}
		return entryRender{}
	}
	// The noop VERDICT comes from the family's IsNoopType predicate over the TYPE
	// GRAPH, never from the emitted text. The compiled shape survives only as the
	// tripwire below: a predicate claiming identity over a live body would make the
	// runtime substitute the family noop for a real transform (silent data
	// corruption), so a mismatch ships the LIVE body and logs loudly. Hand-built
	// test emitters without a predicate keep the shape verdict.
	isNoop := shapeNoop
	if circularSkeleton != nil {
		// An armed entry always ships the guarded body: the guard prologue must
		// run, so a possibly-identity transform must not collapse it.
		isNoop = false
	} else if predicate, ok := emitter.(NoopTypePredicate); ok {
		predicateCtx := walker.getEmitContext(walker.Vλl)
		isNoop = predicate.IsNoopType(runType, predicateCtx)
		walker.putEmitContext(predicateCtx)
		if isNoop && !shapeNoop {
			fmt.Fprintf(os.Stderr,
				"mion: noop-predicate mismatch for %s_%s (%s): IsNoopType claims identity but the compiled body is not — shipping the live body; fix the predicate arm to mirror the emitter\n",
				settings.Tag, runType.ID, rtTypeName(runType))
			isNoop = false
		}
	}
	// A noop factory ships the SHORT-FORM tail; the JS-side consumer supplies the
	// family identity `fn` and leaves code, the dep lists and createRTFn
	// undefined. A parent's `<hash>.fn(v)` still hits a real function, without the
	// payload of an inlined `return v` body.
	if isNoop {
		args := []string{
			quoteJS(innerName),
			quoteJS(rtTypeName(runType)),
			"undefined", // code — holed below (runtime uses the family noop identity)
			"true",      // isNoop — kept: the signal that selects the noop fn
		}
		argsText := joinArgs(holeifyArgs(args))
		if diskCacheable {
			// A noop body emits no dep calls, so nothing is registered.
			writeCachedEntry(runType, settings, cacheTag, innerPrefix, argsText, nil, nil, nil, true, entryDiagnostics(diagStart, opts), opts)
		}
		return entryRender{argsText: argsText, isNoop: true}
	}
	createRTFn, factoryBody := WrapClosure(factoryName, walker.FnName, innerFn, walker.ContextLines())
	// The `code` arg carries the factory BODY, the text between the
	// `function(utl){ … }` braces, so a consumer holding only the serialized data
	// can rebuild the validator via `new Function('utl', code)(rtUtils)`.
	//
	// The code (slot 2) and createRTFn (slot 6) slots vary by emit mode, and
	// holeifyArgs then empties every default-valued slot, interior ones included.
	// In EmitCode the all-default tail (`false,[],[],u`) holes out, so a dep-less
	// entry ends at the `code` slot; in EmitFunctions the live factory blocks the
	// trailing trim, so the interior slots become holes instead.
	//
	// First arg is the namespaced cache key == the entry-module key, so the
	// JS-side cache slot is distinct from the same runtype's other-family entries.
	codeArg := "undefined"
	if opts.EmitMode.EmitsCode() {
		codeArg = quoteJS(factoryBody)
	}
	createRTFnArg := "u"
	if opts.EmitMode.EmitsFactory() {
		createRTFnArg = createRTFn
	}
	tail := []string{
		quoteJS(innerName),
		quoteJS(rtTypeName(runType)),
		codeArg,
		boolJS(isNoop),
		stringSliceJS(walker.RTDependencies),
		pureFnDepsJS(walker.PureFnDependencies),
		createRTFnArg,
	}
	args := holeifyArgs(tail)
	deps := append([]string(nil), walker.RTDependencies...)
	crossFamilyDeps := append([]string(nil), walker.CrossFamilyDeps...)
	// Only the live path reaches here (noop / alwaysThrow entries and cache hits
	// returned earlier, and none emit getPureFn calls), so this is the complete
	// set a fresh walk contributes. Each dep carries this root's call sites, so a
	// missing one squiggles at the user's createX<T>().
	if opts.PureFnDepSink != nil {
		for _, dep := range walker.PureFnDependencies {
			*opts.PureFnDepSink = append(*opts.PureFnDepSink, PureFnDepUse{Dep: dep, Sites: walker.rootProvenance})
		}
	}
	pureFnDeps := pureFnDepKeys(walker.PureFnDependencies)
	argsText := joinArgs(args)
	if diskCacheable {
		writeCachedEntry(runType, settings, cacheTag, innerPrefix, argsText, deps, crossFamilyDeps, pureFnDeps, false, entryDiagnostics(diagStart, opts), opts)
	}
	return entryRender{argsText: argsText, deps: deps, crossFamilyDeps: crossFamilyDeps, pureFnDeps: pureFnDeps}
}

// entryDiagnostics slices out the findings THIS entry's walk appended to the shared sink, as the code + args
// pairs the cache persists. The site is dropped on purpose: a later build re-attaches its own provenance.
func entryDiagnostics(diagStart int, opts RenderOpts) []diskcache.CachedDiagnostic {
	if opts.DiagSink == nil || len(*opts.DiagSink) <= diagStart {
		return nil
	}
	emitted := (*opts.DiagSink)[diagStart:]
	// One finding can already be fanned out across several call sites; the cache
	// wants each DISTINCT one once, and the replay re-fans it.
	seen := make(map[string]bool, len(emitted))
	out := make([]diskcache.CachedDiagnostic, 0, len(emitted))
	for _, diagnostic := range emitted {
		key := diagnostic.Code + "\x00" + strings.Join(diagnostic.Args, "\x01")
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, diskcache.CachedDiagnostic{Code: diagnostic.Code, Args: append([]string(nil), diagnostic.Args...)})
	}
	return out
}

// pureFnDepKeys projects the walker's recorded deps down to the pure-fn ids the SoftDeps / disk cache carry.
func pureFnDepKeys(deps []protocol.PureFnDep) []string {
	if len(deps) == 0 {
		return nil
	}
	keys := make([]string, len(deps))
	for i, dep := range deps {
		keys[i] = dep.ID
	}
	return keys
}

// tryReadCachedEntry loads a previously cached entryRender from the disk store. ok=false on a miss for any
// reason: no store wired, missing or malformed file, header structural-id mismatch, or a child / cross-family
// ref whose hash has changed since write time.
//
// Deps are rebuilt from ChildRefs by re-namespacing each hash with innerPrefix, cross-family deps the same way
// except each ref carries its OWN prefix. The read-time hash checks make both translations lossless, so a hit
// returns the exact entryRender a fresh walk would have produced.
func tryReadCachedEntry(runType *reflection.RunType, settings constants.CacheModuleSettings, cacheTag string, innerPrefix string, opts RenderOpts) (entryRender, bool) {
	if opts.Store == nil || opts.Lookup == nil || runType == nil || runType.ID == "" {
		return entryRender{}, false
	}
	expectedStructural := opts.Lookup.StructuralForHash(runType.ID)
	if expectedStructural == "" {
		// Not interned in the current build, which should not happen for an entry
		// in the current dump; without the reverse mapping the file can't be verified.
		return entryRender{}, false
	}
	entry, ok, err := opts.Store.ReadRT(runType.ID, cacheTag)
	if err != nil || !ok || entry == nil {
		return entryRender{}, false
	}
	if entry.StructuralID != expectedStructural {
		return entryRender{}, false
	}
	deps := make([]string, 0, len(entry.ChildRefs))
	for _, ref := range entry.ChildRefs {
		currentHash := opts.Lookup.HashForStructural(ref.StructuralID)
		if currentHash == "" || currentHash != ref.Hash {
			// The child was re-hashed (collision extension) or removed, so the
			// cached body's baked hash is stale.
			return entryRender{}, false
		}
		deps = append(deps, innerPrefix+currentHash)
	}
	crossFamilyDeps := make([]string, 0, len(entry.CrossFamilyRefs))
	for _, ref := range entry.CrossFamilyRefs {
		currentHash := opts.Lookup.HashForStructural(ref.StructuralID)
		if currentHash == "" || currentHash != ref.Hash {
			// Same drift rule as ChildRefs: the member's hash changed across
			// builds, so the whole entry is stale.
			return entryRender{}, false
		}
		crossFamilyDeps = append(crossFamilyDeps, ref.Prefix+currentHash)
	}
	// A pure fn's id is the hash of its body, so an id this binary no longer knows
	// is a body that changed since the entry was written. Nothing else here would
	// catch it: the entry's structural id is the type's, ArgsText still bakes the
	// old `utl.getPureFn` id, and AddMissingStubs would quietly degrade the body to
	// a KindMissing stub. purefnids is the whole oracle, because every dep that can
	// land here comes from EmitContext.UsePureFn, whose argument is a generated constant.
	for _, id := range entry.PureFnRefs {
		if !purefnids.Has(id) {
			return entryRender{}, false
		}
	}
	pureFnDeps := append([]string(nil), entry.PureFnRefs...)
	replayCachedDiagnostics(runType, settings.Tag, entry.Diagnostics, opts)
	return entryRender{argsText: entry.ArgsText, deps: deps, crossFamilyDeps: crossFamilyDeps, pureFnDeps: pureFnDeps, isNoop: entry.IsNoop}, true
}

// replayCachedDiagnostics re-emits an entry's persisted findings on a cache hit, or a project's warnings would
// disappear from the second build onward and come back only after a cache wipe.
//
// Provenance comes from the live call sites, never from the cache: the same type can be demanded from elsewhere
// next build, and a stale file:line would point at nothing. An entry whose call sites are gone emits nothing,
// matching a fresh walk, including its per-code scope split (see Walker.diagnosticSites).
func replayCachedDiagnostics(runType *reflection.RunType, familyTag string, cached []diskcache.CachedDiagnostic, opts RenderOpts) {
	if len(cached) == 0 || opts.DiagSink == nil || runType == nil {
		return
	}
	key := ProvenanceKey(runType.ID, familyTag)
	for _, entryDiag := range cached {
		sites := opts.ProvenanceSites[key]
		if diagnostics.ScopeOf(entryDiag.Code) == diagnostics.ScopeRoot {
			sites = opts.RootedSites[key]
		}
		for _, site := range sites {
			*opts.DiagSink = append(*opts.DiagSink, diagnostics.New(entryDiag.Code, site, entryDiag.Args...))
		}
	}
}

// splitNamespacedHash splits a namespaced cache hash into its family prefix (through the first `_`) and the
// bare hash. ok=false with no `_` separator: such an id can't be reconstructed as prefix+hash on read.
func splitNamespacedHash(namespaced string) (prefix string, bareHash string, ok bool) {
	idx := strings.IndexByte(namespaced, '_')
	if idx < 0 {
		return "", "", false
	}
	return namespaced[:idx+1], namespaced[idx+1:], true
}

// writeCachedEntry persists the freshly-rendered entry so the next build can skip the walker for this
// (typeID, fnTag) AND still reconstruct its cross-family edges and noop verdict on a hit. Failures are logged
// to stderr and otherwise ignored: a read-only or full FS shouldn't break the build, and the next run re-attempts.
//
// deps arrive namespaced, so the prefix is stripped to recover each bare hash and its structural id for the
// ChildRefs record; a cross-family dep splits into its own foreign prefix plus hash. An unresolvable ref aborts
// the write cleanly rather than persisting a record the reader can't verify.
func writeCachedEntry(runType *reflection.RunType, settings constants.CacheModuleSettings, cacheTag string, innerPrefix string, argsText string, deps []string, crossFamilyDeps []string, pureFnDeps []string, isNoop bool, entryDiags []diskcache.CachedDiagnostic, opts RenderOpts) {
	if opts.Store == nil || opts.Lookup == nil || runType == nil || runType.ID == "" {
		return
	}
	structural := opts.Lookup.StructuralForHash(runType.ID)
	if structural == "" {
		return
	}
	// A transient finding (FMT007, a match budget that expired under host load) is
	// a verdict about THIS build's machine, not about the type. Persisting it
	// replayed a load spike as a permanent build-halting error until the cache was
	// wiped by hand, and persisting the entry WITHOUT it would let a runaway
	// pattern ship silently. So nothing is written and the next build re-tests it.
	for _, entryDiag := range entryDiags {
		if diagnostics.IsTransient(entryDiag.Code) {
			return
		}
	}
	childRefs := make([]diskcache.ChildRef, 0, len(deps))
	for _, dep := range deps {
		childHash := strings.TrimPrefix(dep, innerPrefix)
		if childHash == dep {
			// A dep that doesn't start with innerPrefix breaks the read-time hash
			// translation, so persist nothing rather than an unverifiable record.
			return
		}
		childStructural := opts.Lookup.StructuralForHash(childHash)
		if childStructural == "" {
			return
		}
		childRefs = append(childRefs, diskcache.ChildRef{
			StructuralID: childStructural,
			Hash:         childHash,
		})
	}
	crossFamilyRefs := make([]diskcache.CrossFamilyRef, 0, len(crossFamilyDeps))
	for _, dep := range crossFamilyDeps {
		prefix, bareHash, ok := splitNamespacedHash(dep)
		if !ok {
			// No `_` separator, so a (prefix, hash) pair can't be recovered.
			// Abort rather than persist an unchecked record.
			return
		}
		crossStructural := opts.Lookup.StructuralForHash(bareHash)
		if crossStructural == "" {
			return
		}
		crossFamilyRefs = append(crossFamilyRefs, diskcache.CrossFamilyRef{
			Prefix:       prefix,
			StructuralID: crossStructural,
			Hash:         bareHash,
		})
	}
	for _, id := range pureFnDeps {
		// Same rule the reader applies, so a record it would refuse is never
		// written. Unreachable via UsePureFn, which only takes generated
		// constants; a hand-written id lands here instead of persisting a
		// reference to a body that does not exist.
		if !purefnids.Has(id) {
			return
		}
	}
	entry := diskcache.RTEntry{
		Format:          diskcache.FormatVersion,
		StructuralID:    structural,
		ArgsText:        argsText,
		IsNoop:          isNoop,
		ChildRefs:       childRefs,
		CrossFamilyRefs: crossFamilyRefs,
		// Persisted verbatim, unlike ChildRefs / CrossFamilyRefs; the drift check
		// is purefnids.Has at both ends.
		PureFnRefs: append([]string(nil), pureFnDeps...),
		// So a warm build reports the same findings a cold one does.
		Diagnostics: entryDiags,
	}
	if err := opts.Store.WriteRT(runType.ID, cacheTag, entry); err != nil {
		// Best-effort: one line per failure is enough to surface an FS-permission
		// misconfiguration without spamming.
		fmt.Fprintln(os.Stderr, "mion: disk-cache write failed:", err)
	}
}

// leafKindLabel returns the short label for an unsupported leaf, passed as the {0} substitution arg for
// root-throw diagnostics. It is family-independent; per-family wording lives in the catalog entry.
func leafKindLabel(leaf *reflection.RunType) string {
	if leaf == nil {
		return "Unsupported"
	}
	switch leaf.Kind {
	case reflection.KindNever:
		return "Never"
	case reflection.KindSymbol:
		return "Symbol"
	case reflection.KindLiteral:
		if literalFlavour(leaf) == litSymbol {
			return "Symbol"
		}
	case reflection.KindPromise:
		return "Promise"
	case reflection.KindRegexp:
		return "RegExp"
	case reflection.KindFunction,
		reflection.KindMethod,
		reflection.KindMethodSignature,
		reflection.KindCallSignature:
		return "Function"
	case reflection.KindClass:
		if leaf.SubKind == reflection.SubKindNonSerializable {
			return "NonSerializableClass"
		}
		return "Class"
	}
	return "Unsupported"
}

// renderAlwaysThrowEntry emits the alwaysThrow tuple tail. Its last argument is the COMPLETE runtime throw
// message, rendered here at build time: the shipped marker package throws it verbatim, with no catalog to
// resolve at runtime. Every interior slot holes out and the runtime derives the throwing factory from the
// message slot (the shape disk cache format v10 introduced).
func renderAlwaysThrowEntry(runType *reflection.RunType, innerName string, diagCode string, kindLabel string, provenance []diagnostics.Site) string {
	args := []string{
		quoteJS(innerName),
		quoteJS(rtTypeName(runType)),
		"undefined", // code
		"false",     // isNoop
		"undefined", // rtDependencies
		"undefined", // pureFnDependencies
		"undefined", // createRTFn
		quoteJS(buildAlwaysThrowMessage(diagCode, kindLabel, provenance)),
	}
	return joinArgs(holeifyArgs(args))
}

// buildAlwaysThrowMessage renders the runtime throw text, `[<code>] <headline> (at <file:line:col>)`.
// The headline is rendered here so the runtime throws the string as-is, no catalog ships in the marker
// package. The site suffix is omitted for an orphaned entry with no known call site.
func buildAlwaysThrowMessage(diagCode, kindLabel string, provenance []diagnostics.Site) string {
	message := "[" + diagCode + "] " + rootThrowHeadline(diagCode, kindLabel)
	if len(provenance) > 0 {
		site := provenance[0]
		message += fmt.Sprintf(" (at %s:%d:%d)", site.FilePath, site.StartLine, site.StartCol)
	}
	return message
}

// rtTypeName resolves an entry's `typeName`: the RunType's declared TypeName, or for an anonymous atomic a
// name derived from the kind. The names mirror the JS-side kind-name table.
func rtTypeName(runType *reflection.RunType) string {
	if runType.TypeName != "" {
		return runType.TypeName
	}
	if runType.Kind == reflection.KindClass {
		switch runType.SubKind {
		case reflection.SubKindDate:
			return "date"
		case reflection.SubKindMap:
			return "map"
		case reflection.SubKindSet:
			return "set"
		}
	}
	switch runType.Kind {
	case reflection.KindAny:
		return "any"
	case reflection.KindUnknown:
		return "unknown"
	case reflection.KindNever:
		return "never"
	case reflection.KindVoid:
		return "void"
	case reflection.KindNull:
		return "null"
	case reflection.KindUndefined:
		return "undefined"
	case reflection.KindString:
		return "string"
	case reflection.KindNumber:
		return "number"
	case reflection.KindBoolean:
		return "boolean"
	case reflection.KindBigInt:
		return "bigint"
	case reflection.KindSymbol:
		return "symbol"
	case reflection.KindObject:
		// KindObject (deepkit's 4) takes the same name as KindObjectLiteral.
		return "objectLiteral"
	case reflection.KindRegexp:
		return "regexp"
	case reflection.KindLiteral:
		return "literal"
	case reflection.KindEnum:
		return "enum"
	case reflection.KindArray:
		return "array"
	case reflection.KindObjectLiteral:
		return "objectLiteral"
	case reflection.KindClass:
		return "class"
	case reflection.KindProperty:
		return "property"
	case reflection.KindPropertySignature:
		return "propertySignature"
	case reflection.KindIndexSignature:
		return "indexSignature"
	case reflection.KindFunction:
		return "function"
	case reflection.KindMethod:
		return "method"
	case reflection.KindMethodSignature:
		return "methodSignature"
	case reflection.KindCallSignature:
		return "callSignature"
	case reflection.KindTuple:
		return "tuple"
	case reflection.KindTupleMember:
		return "tupleMember"
	case reflection.KindUnion:
		return "union"
	case reflection.KindTemplateLiteral:
		return "templateLiteral"
	case reflection.KindPromise:
		return "promise"
	}
	return ""
}

func boolJS(b bool) string {
	if b {
		return "true"
	}
	return "false"
}

// fnEntryArgHoles maps a tail slot index to the rendered values that read back IDENTICALLY as a JS array hole
// once the JS side zips the tuple and re-derives the entry. Holing such a value drops its literal bytes even
// when the slot is INTERIOR: a later non-default slot (the live factory) would otherwise block the trailing
// trim and leave `undefined,false,[],[]` spelled out. Slots absent from the map (the cache key, typeName) are
// never holed. Indices match the full entry tail
// (0 key, 1 typeName, 2 code, 3 isNoop, 4 rtDependencies, 5 pureFnDependencies, 6 createRTFn, 7 alwaysThrowMessage).
var fnEntryArgHoles = map[int][]string{
	2: {"undefined"},       // code — derived from createRTFn in functions mode
	3: {"false"},           // isNoop — a hole reads as not-noop
	4: {"[]", "undefined"}, // rtDependencies — build-only metadata, never iterated
	5: {"[]", "undefined"}, // pureFnDependencies — same
	6: {"u", "undefined"},  // createRTFn — placeholder / derived from code
	7: {"undefined"},       // alwaysThrowMessage — a hole reads as no-throw
}

// holeifyArgs replaces every hole-equivalent slot (see fnEntryArgHoles) with a JS array hole (""), then drops
// the trailing run of holes. INTERIOR defaults are holed in place, so a trailing non-default slot still lands
// at its fixed index. The runtime tolerates a hole at every one of these slots.
func holeifyArgs(args []string) []string {
	out := append([]string(nil), args...)
	for i := range out {
		for _, holeable := range fnEntryArgHoles[i] {
			if out[i] == holeable {
				out[i] = ""
				break
			}
		}
	}
	end := len(out)
	for end > 0 && out[end-1] == "" {
		end--
	}
	return out[:end]
}

// joinArgs concatenates positional args with bare commas: the createRTFn arg is multi-line, so padding would
// not align readably. Also used for path-literal segments, whose common single-segment case the len-1 path
// keeps allocation-free.
func joinArgs(args []string) string {
	switch len(args) {
	case 0:
		return ""
	case 1:
		return args[0]
	}
	total := len(args) - 1
	for _, a := range args {
		total += len(a)
	}
	b := make([]byte, 0, total)
	for i, a := range args {
		if i > 0 {
			b = append(b, ',')
		}
		b = append(b, a...)
	}
	return string(b)
}
