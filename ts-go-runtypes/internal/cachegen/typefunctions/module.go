package typefunctions

import (
	"fmt"
	"os"
	"slices"
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
	// ThrowSitePath spells a call site's file in a runtime error message; nil keeps the site's own spelling.
	ThrowSitePath func(string) string
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
	// ProvenanceSites maps an entry (ProvenanceKey) to the sites whose TYPE reaches it, as throw messages and pure-fn deps name.
	ProvenanceSites map[string][]diagnostics.Site
	// RootedSites keeps the sites that NAME the id, the only ones a walk reports at; ReportReachedFindings covers the rest.
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
		entry := &entrymodules.Entry{
			Key:       entryID,
			Kind:      entrymodules.KindTypeFn,
			FamilyTag: settings.Tag,
			ArgsText:  rendered.argsText,
			// Same-family deps are hard: the body calls them unconditionally, so absence cascades.
			// Cross-family and pure-fn deps are soft (`?.fn(…) ?? true`, or registered first); SoftDeps still imports and binds them.
			Deps:     append([]string(nil), rendered.deps...),
			SoftDeps: append(append([]string(nil), rendered.crossFamilyDeps...), rendered.pureFnDeps...),
			IsNoop:   rendered.isNoop,
		}
		entry.Throw = rendered.throws
		entry.Findings = rendered.findings
		entry.Elided = rendered.elided
		graph.Add(entry)
		// An elided child is rendered for its findings only; pruning drops it from the output again.
		return slices.Concat(rendered.deps, rendered.elided), true
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

// adoptsFindingsOf: a validationErrors union takes its verdict from its validate entry, so that entry's drops are its own.
var adoptsFindingsOf = map[string]map[string]bool{
	"verr": {"val": true, "vst": true, "vuk": true},
	"vest": {"val": true, "vst": true, "vuk": true},
	"veuk": {"val": true, "vst": true, "vuk": true},
}

// ReportReachedFindings reports at each site the throws and findings of the entries its function reaches.
// Runs once after the cross-family fixpoint: findings travel through entries of another family too.
func ReportReachedFindings(graph entrymodules.Graph, opts RenderOpts) {
	if opts.DiagSink == nil {
		return
	}
	reported := map[string]bool{}
	for _, diagnostic := range *opts.DiagSink {
		reported[reachedThrowKey(diagnostic.Code, diagnostic.Args, diagnostic.Site)] = true
	}
	report := func(finding diskcache.CachedDiagnostic, site diagnostics.Site) {
		reportKey := reachedThrowKey(finding.Code, finding.Args, site)
		if !reported[reportKey] {
			reported[reportKey] = true
			*opts.DiagSink = append(*opts.DiagSink, diagnostics.New(finding.Code, site, finding.Args...))
		}
	}
	keys := make([]string, 0, len(graph))
	for key, entry := range graph {
		if entry.Kind == entrymodules.KindTypeFn && entry.Throw == nil {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	for _, key := range keys {
		sites := opts.RootedSites[entryProvenanceKey(graph[key])]
		if len(sites) == 0 {
			continue
		}
		throwing, adopted := reachableFindings(graph, key)
		for _, site := range sites {
			// A foreign throw (the validate entry a JSON union picks its member with) would name the same failure twice.
			var own, foreign []diskcache.CachedDiagnostic
			for _, entry := range throwing {
				if slices.Contains(opts.ProvenanceSites[entryProvenanceKey(entry)], site) {
					own = append(own, *entry.Throw)
				} else {
					foreign = append(foreign, *entry.Throw)
				}
			}
			if len(own) == 0 {
				own = foreign
			}
			for _, finding := range append(own, adopted...) {
				report(finding, site)
			}
		}
	}
}

// entryTypeID strips the `<fnHash>_` prefix off a type-fn entry key, if it has one.
func entryTypeID(entry *entrymodules.Entry) string {
	if _, typeID, ok := splitNamespacedHash(entry.Key); ok {
		return typeID
	}
	return entry.Key
}

func entryProvenanceKey(entry *entrymodules.Entry) string {
	return ProvenanceKey(entryTypeID(entry), entry.FamilyTag)
}

// reachableFindings returns, in walk order, the throws and own- or adopted-family findings reachable from an entry.
func reachableFindings(graph entrymodules.Graph, entryID string) (throwing []*entrymodules.Entry, adoptedFindings []diskcache.CachedDiagnostic) {
	adopted := adoptsFindingsOf[graph[entryID].FamilyTag]
	visited := map[string]bool{entryID: true}
	stack := []string{entryID}
	for len(stack) > 0 {
		current := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		entry, ok := graph[current]
		if !ok {
			continue
		}
		for _, dep := range slices.Concat(entry.Deps, entry.SoftDeps, entry.Elided) {
			if visited[dep] {
				continue
			}
			visited[dep] = true
			depEntry, ok := graph[dep]
			if !ok || depEntry.Kind != entrymodules.KindTypeFn {
				continue
			}
			if depEntry.Throw != nil {
				throwing = append(throwing, depEntry)
				continue
			}
			if depEntry.FamilyTag == graph[entryID].FamilyTag || adopted[depEntry.FamilyTag] {
				for _, finding := range depEntry.Findings {
					// A root-scoped finding is about that entry as a marker's root, never about a site reaching it.
					if diagnostics.ScopeOf(finding.Code) != diagnostics.ScopeRoot {
						adoptedFindings = append(adoptedFindings, finding)
					}
				}
			}
			stack = append(stack, dep)
		}
	}
	return throwing, adoptedFindings
}

func reachedThrowKey(code string, args []string, site diagnostics.Site) string {
	return fmt.Sprintf("%s\x00%s\x00%s:%d:%d", code, strings.Join(args, "\x01"), site.FilePath, site.StartLine, site.StartCol)
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
	// throws is the root code (and its args) of an alwaysThrow entry, so a parent that calls it can report it too.
	throws *diskcache.CachedDiagnostic
	// findings are the entry's own diagnostics, live or from the disk cache, for a site that reaches it across families.
	findings []diskcache.CachedDiagnostic
	// elided are the children the noop gate left out of the body: queued for rendering, never linked as deps.
	elided []string
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
		// Report the alwaysThrow's code at build time too, so the user sees the cause before runtime.
		// A callable interface would otherwise map to no code (see callableLeafSubstitute).
		diagLeaf := callableLeafSubstitute(walker.UnsupportedLeaf, walker.RefTable)
		diagCode := diagnostics.CodeUnsupportedLeafNoCode
		if leafProvider, ok := emitter.(LeafDiagCodeProvider); ok {
			if code := leafProvider.DiagCodeForLeaf(diagLeaf); code != "" {
				diagCode = code
			}
		}
		kindLabel := leafKindLabel(diagLeaf)
		if removeUnknownKeys, ok := emitter.(RemoveUnknownKeysEmitter); ok && diagCode != diagnostics.CodeUnsupportedLeafNoCode {
			kindLabel = removeUnknownKeys.DiagLabelForLeaf(diagLeaf)
		}
		walker.EmitDiagnostic(diagCode, kindLabel)
		// Never disk-cached: the message names this build's call site, which a warm hit would freeze.
		provenance := walker.throwProvenance()
		// Only the first site is named, and the slice is the walker's own.
		if opts.ThrowSitePath != nil && len(provenance) > 0 {
			provenance = slices.Clone(provenance)
			provenance[0].FilePath = opts.ThrowSitePath(provenance[0].FilePath)
		}
		argsText := renderAlwaysThrowEntry(runType, innerName, diagCode, kindLabel, provenance)
		return entryRender{argsText: argsText, throws: &diskcache.CachedDiagnostic{Code: diagCode, Args: []string{kindLabel}}, findings: walker.findings}
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
			writeCachedEntry(runType, settings, cacheTag, innerPrefix, argsText, nil, walker.elidedDependencies, nil, nil, true, walker.findings, opts)
		}
		return entryRender{argsText: argsText, isNoop: true, findings: walker.findings, elided: walker.elidedDependencies}
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
		writeCachedEntry(runType, settings, cacheTag, innerPrefix, argsText, deps, walker.elidedDependencies, crossFamilyDeps, pureFnDeps, false, walker.findings, opts)
	}
	return entryRender{argsText: argsText, deps: deps, crossFamilyDeps: crossFamilyDeps, pureFnDeps: pureFnDeps, findings: walker.findings, elided: walker.elidedDependencies}
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
	if string(entry.StructuralID) != expectedStructural {
		return entryRender{}, false
	}
	deps, ok := liveChildHashes(entry.ChildRefs, innerPrefix, opts)
	if !ok {
		return entryRender{}, false
	}
	elided, ok := liveChildHashes(entry.ElidedRefs, innerPrefix, opts)
	if !ok {
		return entryRender{}, false
	}
	crossFamilyDeps := make([]string, 0, len(entry.CrossFamilyRefs))
	for _, ref := range entry.CrossFamilyRefs {
		currentHash := opts.Lookup.HashForStructural(string(ref.StructuralID))
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
	return entryRender{argsText: entry.ArgsText, deps: deps, crossFamilyDeps: crossFamilyDeps, pureFnDeps: pureFnDeps, isNoop: entry.IsNoop, findings: entry.Diagnostics, elided: elided}, true
}

// liveChildHashes fails when a child was re-hashed (collision extension) or removed: the cached body's baked hash is stale.
func liveChildHashes(refs []diskcache.ChildRef, innerPrefix string, opts RenderOpts) ([]string, bool) {
	hashes := make([]string, 0, len(refs))
	for _, ref := range refs {
		currentHash := opts.Lookup.HashForStructural(string(ref.StructuralID))
		if currentHash == "" || currentHash != ref.Hash {
			return nil, false
		}
		hashes = append(hashes, innerPrefix+currentHash)
	}
	return hashes, true
}

// replayCachedDiagnostics re-emits persisted findings on a cache hit, or warnings would vanish from the second build on.
// Sites come from this build, the rooted ones as in a fresh walk: a cached file:line may point at nothing.
func replayCachedDiagnostics(runType *reflection.RunType, familyTag string, cached []diskcache.CachedDiagnostic, opts RenderOpts) {
	if len(cached) == 0 || opts.DiagSink == nil || runType == nil {
		return
	}
	sites := opts.RootedSites[ProvenanceKey(runType.ID, familyTag)]
	for _, entryDiag := range cached {
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

// writeCachedEntry persists the entry so a hit skips the walker yet rebuilds its cross-family edges and noop verdict.
// Failures are logged and ignored (a read-only or full FS must not break the build); an unresolvable ref aborts the write.
func writeCachedEntry(runType *reflection.RunType, settings constants.CacheModuleSettings, cacheTag string, innerPrefix string, argsText string, deps []string, elided []string, crossFamilyDeps []string, pureFnDeps []string, isNoop bool, entryDiags []diskcache.CachedDiagnostic, opts RenderOpts) {
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
	childRefs, ok := cachedChildRefs(deps, innerPrefix, opts)
	if !ok {
		return
	}
	elidedRefs, ok := cachedChildRefs(elided, innerPrefix, opts)
	if !ok {
		return
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
			StructuralID: diskcache.StructuralText(crossStructural),
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
		StructuralID:    diskcache.StructuralText(structural),
		ArgsText:        argsText,
		IsNoop:          isNoop,
		ChildRefs:       childRefs,
		ElidedRefs:      elidedRefs,
		CrossFamilyRefs: crossFamilyRefs,
		// Persisted verbatim, unlike the other refs; the drift check is purefnids.Has at both ends.
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

// cachedChildRefs fails on a child without innerPrefix or a structural id: it would break the read-time hash translation.
func cachedChildRefs(children []string, innerPrefix string, opts RenderOpts) ([]diskcache.ChildRef, bool) {
	refs := make([]diskcache.ChildRef, 0, len(children))
	for _, child := range children {
		childHash := strings.TrimPrefix(child, innerPrefix)
		if childHash == child {
			return nil, false
		}
		childStructural := opts.Lookup.StructuralForHash(childHash)
		if childStructural == "" {
			return nil, false
		}
		refs = append(refs, diskcache.ChildRef{StructuralID: diskcache.StructuralText(childStructural), Hash: childHash})
	}
	return refs, true
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

// buildAlwaysThrowMessage renders the headline here since no catalog ships in the marker package.
// provenance arrives sorted (resolver buildProvenanceSites), so the named site is stable across edits.
func buildAlwaysThrowMessage(diagCode, kindLabel string, provenance []diagnostics.Site) string {
	message := "[" + diagCode + "] " + rootThrowHeadline(diagCode, kindLabel)
	if len(provenance) == 0 {
		return message
	}
	site := provenance[0]
	message += fmt.Sprintf(" (at %s:%d:%d", site.FilePath, site.StartLine, site.StartCol)
	switch others := len(provenance) - 1; others {
	case 0:
	case 1:
		message += ", and 1 other call site"
	default:
		message += fmt.Sprintf(", and %d other call sites", others)
	}
	return message + ")"
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

// fnEntryArgHoles maps an entry tail slot (0 key, 1 typeName, never holed) to values that read back as a JS array hole.
// Interior slots are holed too, or a later non-default one (the live factory) leaves `undefined,false,[],[]` spelled out.
var fnEntryArgHoles = map[int][]string{
	2: {"undefined"},       // code — derived from createRTFn in functions mode
	3: {"false"},           // isNoop — a hole reads as not-noop
	4: {"[]", "undefined"}, // rtDependencies — build-only metadata, never iterated
	5: {"[]", "undefined"}, // pureFnDependencies — same
	6: {"u", "undefined"},  // createRTFn — placeholder / derived from code
	7: {"undefined"},       // alwaysThrowMessage — a hole reads as no-throw
}

// holeifyArgs holes defaults in place, so a later non-default slot keeps its index, then trims the trailing holes.
// The runtime tolerates a hole at every one of these slots.
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
