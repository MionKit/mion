package resolver

import (
	"context"
	"errors"
	"fmt"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/microsoft/typescript-go/shim/compiler"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/operations"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/runtype"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/apimeta"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/requestbatch"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/sourcerewrite"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// Dispatch routes a request to the correct handler, adding the Metrics block when the request asks for it.
// Every op returns through here, which is why the response's diagnostics are deduped at this ONE choke point: the
// runtype, marker, pure-fn and enrich lanes assemble theirs on different branches, so deduping inside
// collectFamilies would cover only the runtype fan-out. See diagnostics.Dedupe for why the walker's own per-walk
// latch cannot catch these.
func (sess *Session) Dispatch(request protocol.Request) protocol.Response {
	if !request.IncludeMetrics {
		response := sess.dispatch(request, nil)
		response.Diagnostics = sess.settleDiagnostics(response.Diagnostics, request)
		return response
	}
	var memBefore runtime.MemStats
	runtime.ReadMemStats(&memBefore)
	metrics := &protocol.Metrics{RenderMs: map[string]float64{}}
	start := time.Now()
	response := sess.dispatch(request, metrics)
	response.Diagnostics = sess.settleDiagnostics(response.Diagnostics, request)
	metrics.TotalMs = elapsedMs(start)
	var memAfter runtime.MemStats
	runtime.ReadMemStats(&memAfter)
	metrics.AllocBytes = memAfter.TotalAlloc - memBefore.TotalAlloc
	metrics.Mallocs = memAfter.Mallocs - memBefore.Mallocs
	metrics.NumGC = memAfter.NumGC - memBefore.NumGC
	metrics.HeapAlloc = memAfter.HeapAlloc
	metrics.HeapInuse = memAfter.HeapInuse
	if sess.cache != nil {
		metrics.CacheNodes = sess.cache.Size()
	}
	// tsgo checks lazily, so these counters are post-op absolutes covering every check forced so far in this
	// Program's lifetime; the bench harness resets the Program per cycle to keep per-case numbers comparable.
	if sess.Program != nil && sess.Program.TS != nil {
		ts := sess.Program.TS
		metrics.Files = len(ts.SourceFiles())
		metrics.Lines = ts.LineCount()
		metrics.Identifiers = ts.IdentifierCount()
		metrics.Symbols = ts.SymbolCount()
		metrics.Types = ts.TypeCount()
		metrics.Instantiations = ts.InstantiationCount()
	}
	response.Metrics = metrics
	return response
}

func elapsedMs(start time.Time) float64 {
	return float64(time.Since(start).Microseconds()) / 1000.0
}

// collectEntryModules runs the full per-entry pipeline against dump and returns the modules keyed by module
// BASENAME, plus the package's pure-fn artifact.
func (sess *Session) collectEntryModules(dump protocol.Dump, rtOpts typefunctions.RenderOpts, pureFnGraph entrymodules.Graph, metrics *protocol.Metrics) (map[string]string, map[string]string, error) {
	var graph entrymodules.Graph
	if sess.opts.ModuleMode == constants.ModuleModeAllModules {
		graph = runtype.CollectEntriesPerNode(dump, sess.opts.JSONMaxBytes)
	} else {
		graph = runtype.CollectEntries(dump, sess.opts.JSONMaxBytes)
	}

	familyGraphs, err := sess.collectFamilies(dump, rtOpts, metrics)
	if err != nil {
		return nil, nil, err
	}
	for _, familyGraph := range familyGraphs {
		graph.Merge(familyGraph)
	}
	// AFTER the family merge, so each composite can read its primitives' rendered IsNoop flags and elide
	// dead identity bindings.
	graph.Merge(typefunctions.CollectJsonCompositeEntries(dump, rtOpts, graph))
	graph.Merge(pureFnGraph)

	// No circular-guard wiring belongs here: an armed (`{rejectCircularRefs: true}`) entry inlines the guard with a
	// baked skeleton and demands findCycle by body reference, and an unarmed cyclable type ships neither.

	sess.resolveCrossFamilyEdges(graph, dump, rtOpts)
	// Composite prologues bind primitives with an unguarded `utl.getRT(key).fn`, so assert post-fixpoint that every
	// referenced primitive rendered: an invariant breach must fail the build instead of crashing at runtime.
	// ProvenanceSites anchors any breach at the demanding createJsonEncoderFn/Decoder call site.
	typefunctions.AssertCompositeSoftDeps(graph, rtOpts.ProvenanceSites, rtOpts.DiagSink)
	// Same invariant for cfn redirects: an override body a redirect forwards to without its module in the graph
	// fails the build (OVR002) instead of throwing at runtime.
	typefunctions.AssertOverrideCfn(graph, sess.overrideIDs(), rtOpts.DiagSink)

	// Drops every entry whose same-family dep never rendered; the demanded roots that fall out become KindMissing
	// stubs below, so the imports the plugin injected still resolve and the runtime degrades to the identity fn.
	graph.Cascade()
	// Deliver the pure-fn bodies the graph demands from installed packages (the marker package's built-ins
	// included), after Cascade (demand then reflects only surviving entries) and before AddMissingStubs (a served
	// body must be present so it never degrades to a KindMissing stub).
	sess.servePackagePureFns(graph, rtOpts.DiagSink, rtOpts.EmitMode)
	demanded, demandTags := demandedEntryKeys(dump.Sites)
	graph.AddMissingStubs(demanded)
	// allSingle: a dropped demanded key must stay importable at the bundle the site's import points at
	// (Site.Module), so tag its stub. Untagged stubs, the soft-dep fallbacks no site demanded, keep their own module.
	if sess.opts.ModuleMode == constants.ModuleModeAllSingle {
		for key, entry := range graph {
			if entry.Kind == entrymodules.KindMissing && entry.FamilyTag == "" {
				entry.FamilyTag = demandTags[key]
			}
		}
	}
	pruneUnreachableTypeFnEntries(graph, demanded)

	renderStart := time.Now()
	modules, err := entrymodules.RenderGrouped(graph, sess.moduleGrouping())
	if metrics != nil {
		metrics.RenderMs["entryModules"] = elapsedMs(renderStart)
	}
	if err != nil {
		return nil, nil, err
	}
	artifact, err := sess.renderPureFnArtifact(graph, metrics)
	return modules, artifact, err
}

// collectFamilies runs every type-walking family's per-entry collection. Families fan out across goroutines by
// default, since a collect is a checker-free pure function of (dump, RefTable, opts); each goroutine gets a value
// copy of rtOpts with the two dispatch-shared mutable fields sharded, its own DiagSink slice and a fresh FactsTable.
// The join runs per family in registry order, so shard diagnostics land in the sequential order; first error wins.
// The recorded RenderMs values overlap wall-clock, so their sum exceeds the elapsed time.
func (sess *Session) collectFamilies(dump protocol.Dump, rtOpts typefunctions.RenderOpts, metrics *protocol.Metrics) ([]entrymodules.Graph, error) {
	families := typefunctions.Families
	graphs := make([]entrymodules.Graph, len(families))
	if !sess.parallelRenderEnabled() || len(families) < 2 {
		for familyIndex, spec := range families {
			collectStart := time.Now()
			graphs[familyIndex] = spec.Collect(dump, rtOpts, nil)
			if metrics != nil {
				metrics.RenderMs[spec.Key] = elapsedMs(collectStart)
			}
		}
		return graphs, nil
	}

	type familyResult struct {
		err       error
		collectMs float64
	}
	results := make([]familyResult, len(families))
	familyDiagnostics := make([][]diagnostics.Diagnostic, len(families))
	familyPureFnDeps := make([][]typefunctions.PureFnDepUse, len(families))
	factShards := make([]*typefunctions.FactsTable, len(families))
	var waitGroup sync.WaitGroup
	for familyIndex, spec := range families {
		factShards[familyIndex] = typefunctions.NewFactsTable()
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			defer func() {
				if recovered := recover(); recovered != nil {
					results[familyIndex].err = fmt.Errorf("collect %s: %v", spec.Key, recovered)
				}
			}()
			shardOpts := rtOpts
			if rtOpts.DiagSink != nil {
				shardOpts.DiagSink = &familyDiagnostics[familyIndex]
			}
			// Shard the pure-fn dep sink like DiagSink, so concurrent family collects never append to a shared
			// slice; the shards merge back in family order below, matching the serial path.
			if rtOpts.PureFnDepSink != nil {
				shardOpts.PureFnDepSink = &familyPureFnDeps[familyIndex]
			}
			shardOpts.Facts = factShards[familyIndex]
			collectStart := time.Now()
			graphs[familyIndex] = spec.Collect(dump, shardOpts, nil)
			results[familyIndex].collectMs = elapsedMs(collectStart)
		}()
	}
	waitGroup.Wait()
	for familyIndex, spec := range families {
		if results[familyIndex].err != nil {
			return nil, results[familyIndex].err
		}
		if metrics != nil {
			metrics.RenderMs[spec.Key] = results[familyIndex].collectMs
		}
		if rtOpts.DiagSink != nil && len(familyDiagnostics[familyIndex]) > 0 {
			*rtOpts.DiagSink = append(*rtOpts.DiagSink, familyDiagnostics[familyIndex]...)
		}
		if rtOpts.PureFnDepSink != nil && len(familyPureFnDeps[familyIndex]) > 0 {
			*rtOpts.PureFnDepSink = append(*rtOpts.PureFnDepSink, familyPureFnDeps[familyIndex]...)
		}
		rtOpts.Facts.Merge(factShards[familyIndex])
	}
	return graphs, nil
}

// parallelRenderEnabled reports whether family collects may fan out. SingleThreaded means no concurrency at all,
// covering collects too even though they never touch a checker.
func (sess *Session) parallelRenderEnabled() bool {
	return !sess.opts.DisableParallelRender && !sess.opts.SingleThreaded
}

// crossFamilyTarget is what a missing `<fnHash>_<id>` dep routes to: the family
// that renders the entry, plus the variant that fnHash names.
type crossFamilyTarget struct {
	spec          typefunctions.FamilySpec
	variantSuffix string
	options       []string
}

// familyByFnHash maps a family's fnHash to its spec + variant, the reverse lookup the cross-family fixpoint routes
// a missing `<fnHash>_<id>` dep through. Option-carrying hashes route too, because the validationErrors union arm
// delegates its verdict to the validate entry compiled with the SAME ValidateOptions as the body referring to it.
// Only the option axes are enumerated; a json op's per-strategy hashes stay out.
var familyByFnHash = func() map[string]crossFamilyTarget {
	out := make(map[string]crossFamilyTarget, len(typefunctions.Families))
	allVariants := operations.AllFnVariants()
	for _, spec := range typefunctions.Families {
		op, ok := operations.ByFamilyTag(spec.Settings.Tag)
		if !ok {
			continue
		}
		out[operations.PlainHash(op.Name)] = crossFamilyTarget{spec: spec}
		for _, variant := range allVariants {
			// No cross-family edge ever names the armed (rejectCircularRefs) fork: emitters resolve their
			// delegates under the plain fork on purpose (see CrossFamilyVariantHash).
			if variant.Op.Name != op.Name || variant.RejectCircular || len(variant.Options) == 0 {
				continue
			}
			suffix := variantSuffixFor(variant)
			if suffix == "" {
				continue
			}
			out[variant.FnHash] = crossFamilyTarget{spec: spec, variantSuffix: suffix, options: variant.Options}
		}
	}
	return out
}()

// variantSuffixFor names the cache-key suffix an option-axis variant renders under, empty when there is nothing to route.
func variantSuffixFor(variant operations.FnVariant) string {
	switch variant.Op.Axis {
	case operations.AxisValidateOptions:
		return constants.ValidateVariantSuffix(variant.Options)
	case operations.AxisHasUnknownKeysOptions:
		return constants.HasUnknownKeysVariantSuffix(variant.Options)
	default:
		return ""
	}
}

// resolveCrossFamilyEdges renders, to fixpoint, every foreign-family entry the graph's deps reference but no family
// demanded directly: the `<valHash>_<member>` lookups union decoders / validationErrors bodies reach at runtime.
// Each missing edge is routed to its owning family AND variant through the fnHash reverse map, then collected as a
// root plus same-family closure. Sites are stripped from the seed dump so the sub-collect renders ONLY the
// requested roots, with no demand re-render and no duplicate diagnostics.
// Iteration is bounded: each pass renders only keys that were missing, growing monotonically toward the finite
// session type set. The guard cap is defensive; hitting it leaves the rest to the stub pass, which keeps the build.
func (sess *Session) resolveCrossFamilyEdges(graph entrymodules.Graph, dump protocol.Dump, rtOpts typefunctions.RenderOpts) {
	seedDump := protocol.Dump{RunTypes: dump.RunTypes}
	for iteration := 0; iteration < 8; iteration++ {
		missingByFamily := map[string]map[string]typefunctions.ExtraRoot{}
		for _, entry := range graph {
			if entry.Kind != entrymodules.KindTypeFn {
				continue
			}
			// Cross-family edges are always SoftDeps: a hard Dep is same-family, so its own collect
			// rendered it or the cascade dropped it.
			for _, dep := range entry.SoftDeps {
				if dep == "" || dep == entry.Key {
					continue
				}
				if _, ok := graph[dep]; ok {
					continue
				}
				separator := strings.IndexByte(dep, '_')
				if separator < 0 {
					continue
				}
				target, ok := familyByFnHash[dep[:separator]]
				if !ok {
					continue
				}
				if missingByFamily[target.spec.Key] == nil {
					missingByFamily[target.spec.Key] = map[string]typefunctions.ExtraRoot{}
				}
				missingByFamily[target.spec.Key][dep] = typefunctions.ExtraRoot{
					ID:            dep[separator+1:],
					VariantSuffix: target.variantSuffix,
					Options:       target.options,
				}
			}
		}
		if len(missingByFamily) == 0 {
			return
		}
		familyKeys := make([]string, 0, len(missingByFamily))
		for key := range missingByFamily {
			familyKeys = append(familyKeys, key)
		}
		sort.Strings(familyKeys)
		progressed := false
		for _, key := range familyKeys {
			roots := make([]typefunctions.ExtraRoot, 0, len(missingByFamily[key]))
			for _, root := range missingByFamily[key] {
				roots = append(roots, root)
			}
			sort.Slice(roots, func(i, j int) bool {
				if roots[i].ID != roots[j].ID {
					return roots[i].ID < roots[j].ID
				}
				return roots[i].VariantSuffix < roots[j].VariantSuffix
			})
			before := len(graph)
			graph.Merge(typefunctions.FamilyByKey(key).Collect(seedDump, rtOpts, roots))
			if len(graph) > before {
				progressed = true
			}
		}
		// No progress means every remaining edge points at an unsupported type, which the stub pass covers.
		if !progressed {
			return
		}
	}
}

// demandedEntryKeys lists the entry keys user call sites import: the `<fnHash>_<typeId>` key for every createX site
// (a reflection site imports the runtype entry, which always exists for an interned type). A demanded key that did
// not survive collection becomes a resolvable KindMissing module in the stub pass.
// The second return maps each key to its family tag, which allSingle mode uses to place a dropped key's stub inside
// the family bundle the site's import points at.
func demandedEntryKeys(sites []protocol.Site) ([]string, map[string]string) {
	var keys []string
	seen := map[string]bool{}
	tags := map[string]string{}
	for _, site := range sites {
		if site.ID == "" {
			continue
		}
		// A multi-function site (createStandardSchema's <T,'val','verr'>) injects SEVERAL entry bindings at one
		// slot, each imported directly by the plugin, so every fnId is demanded, not just the scalar FnId mirror.
		fnIds := site.FnIds
		if len(fnIds) == 0 {
			fnIds = []string{site.FnId}
		}
		for _, fnId := range fnIds {
			if fnId == "" {
				continue
			}
			key := fnId + "_" + site.ID
			if seen[key] {
				continue
			}
			seen[key] = true
			keys = append(keys, key)
			if tag := siteFamilyTag(site, fnId); tag != "" {
				tags[key] = tag
			}
		}
	}
	sort.Strings(keys)
	return keys, tags
}

// uniqueSiteFiles lists the source files carrying at least one marker site OR an extracted pure-fn registration
// (extraFiles), sorted and deduplicated. OpGenerate returns it as Response.SiteFiles so the plugin gates its
// per-file transform on real scan results instead of textual import sniffing, which covers wrapper call sites
// (markers forwarded by another package, node_modules included) with zero configuration.
// A pure fn is a Replacement, not a Site, so extraFiles is what puts its file in the set.
func uniqueSiteFiles(sites []protocol.Site, extraFiles []string) []string {
	seen := map[string]bool{}
	var files []string
	add := func(file string) {
		if file == "" || seen[file] {
			return
		}
		seen[file] = true
		files = append(files, file)
	}
	for _, site := range sites {
		add(site.File)
	}
	for _, file := range extraFiles {
		add(file)
	}
	sort.Strings(files)
	return files
}

// pureFnReplacementFiles returns the source files carrying a pure-fn registration whose factory argument gets
// rewritten. They need the per-file transform yet never land in the Site-derived file set, a WRAPPED registration
// included, whose consumer file neither imports the marker package by name nor calls the primitive textually; so
// OpGenerate folds them into SiteFiles. Extraction is memoised (pureFnFileCache), so re-running it here is cheap.
func (sess *Session) pureFnReplacementFiles(metrics *protocol.Metrics) []string {
	entries, _, _ := sess.extractProgramPureFns(metrics)
	seen := map[string]bool{}
	var files []string
	for _, entry := range entries {
		if entry.FilePath == "" || entry.FactoryArgEnd <= entry.FactoryArgStart || seen[entry.FilePath] {
			continue
		}
		seen[entry.FilePath] = true
		files = append(files, entry.FilePath)
	}
	return files
}

// pruneUnreachableTypeFnEntries drops every KindTypeFn entry nothing can load: not a rewrite-injected binding
// (`demanded`, each site's own `<FnId>_<ID>`, the only fn keys the plugin imports directly) and not reachable from
// a live module through Deps + SoftDeps. The demand machinery still renders a short-form for every primitive a
// composite site demands, so once the composite elides its binding the orphan, and anything only it pulled in,
// would otherwise stay emitted.
// Non-typefn kinds are unconditional roots: the runtype bundle/facades load via reflection-site bindings and
// pure-fn modules via their own injected registration sites, neither of which rides the fn-site demand list.
func pruneUnreachableTypeFnEntries(graph entrymodules.Graph, demanded []string) {
	live := make(map[string]bool, len(graph))
	stack := make([]string, 0, len(graph))
	enqueue := func(key string) {
		if entry, ok := graph[key]; ok && entry != nil && !live[key] {
			live[key] = true
			stack = append(stack, key)
		}
	}
	for key, entry := range graph {
		if entry != nil && entry.Kind != entrymodules.KindTypeFn {
			enqueue(key)
		}
	}
	for _, key := range demanded {
		enqueue(key)
	}
	for len(stack) > 0 {
		key := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		entry := graph[key]
		if entry == nil {
			continue
		}
		for _, dep := range entry.Deps {
			enqueue(dep)
		}
		for _, dep := range entry.SoftDeps {
			enqueue(dep)
		}
	}
	for key, entry := range graph {
		if entry != nil && entry.Kind == entrymodules.KindTypeFn && !live[key] {
			delete(graph, key)
		}
	}
}

// moduleGrouping returns the entrymodules.Grouping for the resolver's module mode. Nil under default/allModules
// leaves everything per-entry, the runtype bundle shaping its own module via CollectEntries.
// A missing stub with no demanding site keeps its own resolvable module.
func (sess *Session) moduleGrouping() entrymodules.Grouping {
	if sess.opts.ModuleMode != constants.ModuleModeAllSingle {
		return nil
	}
	return func(entry *entrymodules.Entry) string {
		switch entry.Kind {
		case entrymodules.KindTypeFn:
			return constants.FnsBundleDir + "/" + entry.FamilyTag
		case entrymodules.KindMissing:
			if entry.FamilyTag != "" {
				return constants.FnsBundleDir + "/" + entry.FamilyTag
			}
			return ""
		case entrymodules.KindPureFn:
			return constants.PureFnModuleDir
		case entrymodules.KindRunTypeBundle, entrymodules.KindRunTypeFacade:
			return constants.RunTypesBundleBasename
		}
		return ""
	}
}

// siteFamilyTag is the family tag one fnId of a site renders under, "" when the site demands nothing under it.
// Shared by the two callers that must agree on the mapping, stampSiteModules (which bundle the rewrite imports the
// binding FROM) and demandedEntryKeys (which bundle a dropped key's stub goes IN): a disagreement is a broken import.
func siteFamilyTag(site protocol.Site, fnId string) string {
	for _, demand := range site.Demand {
		if demand.FnHash == fnId {
			return demand.FamilyTag
		}
	}
	return ""
}

// stampSiteModules annotates sites with the bundle basename their entry rides in under allSingle mode, and passes
// them through untouched in other modes. The mapping is mode-static (reflection sites point at the runtypes
// bundle, createX sites at their demand family's bundle), so a plain transform scan with no entry-module
// collection stamps identically to the dump path. Stamping returns a copy.
// A multi-fn site spans SEVERAL families, each with its own allSingle bundle, which the scalar Module cannot
// address: every fnId gets a basename in Modules, and Module keeps mirroring FnIds[0] so the single-fn wire is unchanged.
func (sess *Session) stampSiteModules(sites []protocol.Site) []protocol.Site {
	if sess.opts.ModuleMode != constants.ModuleModeAllSingle || len(sites) == 0 {
		return sites
	}
	bundleFor := func(site protocol.Site, fnId string) string {
		if tag := siteFamilyTag(site, fnId); tag != "" {
			return constants.FnsBundleDir + "/" + tag
		}
		return ""
	}
	out := make([]protocol.Site, len(sites))
	copy(out, sites)
	for i := range out {
		if out[i].ID == "" {
			continue
		}
		if out[i].FnId == "" {
			out[i].Module = constants.RunTypesBundleBasename
			continue
		}
		out[i].Module = bundleFor(out[i], out[i].FnId)
		if len(out[i].FnIds) < 2 {
			continue
		}
		modules := make([]string, len(out[i].FnIds))
		for j, fnId := range out[i].FnIds {
			modules[j] = bundleFor(out[i], fnId)
		}
		out[i].Modules = modules
	}
	return out
}

// typeIDFromEntryKey returns the type-id tail of a `<fnHash>_<typeId>` fn-entry key, empty when there is no underscore.
func typeIDFromEntryKey(key string) string {
	if idx := strings.IndexByte(key, '_'); idx >= 0 {
		return key[idx+1:]
	}
	return ""
}

// sameTransformPath matches a wire-tagged file path against a requested one, tolerating the abs-vs-rel skew: scan
// Sites echo the REQUESTED (often relative) path, but pure-fn Replacements carry the program's ABSOLUTE file name.
// Mirrors the JS scan-batcher's projectFile/samePath rule; matching on a separator boundary keeps `a/user.ts` from
// claiming `another-user.ts`. requestedAbs is what makes a file OUTSIDE the working dir work: it is requested as
// `../sibling/src/entry.ts`, which no suffix of an absolute path ends with, so its replacements would all be dropped.
func sameTransformPath(tagged, requested, requestedAbs string) bool {
	if tagged == requested || tagged == requestedAbs {
		return true
	}
	return strings.HasSuffix(tagged, "/"+requested) || strings.HasSuffix(tagged, "\\"+requested)
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

// dispatch is the un-instrumented op switch. metrics may be nil (the
// no-IncludeMetrics fast path); phase recordings are guarded per site.
func (sess *Session) dispatch(request protocol.Request, metrics *protocol.Metrics) protocol.Response {
	before := sess.cache.Size()
	switch request.Op {
	case protocol.OpScanFiles:
		if sess.Program == nil {
			return protocol.Response{Error: "scanFiles: no Program loaded — call setSources first"}
		}
		if len(request.Files) == 0 {
			return protocol.Response{Error: "scanFiles: files is required and must be non-empty"}
		}
		scanStart := time.Now()
		sites, markerDiagnostics, err := sess.dispatchScanFiles(request.Files)
		if err != nil {
			return protocol.Response{Error: err.Error()}
		}
		if metrics != nil {
			metrics.MarkerScanMs = elapsedMs(scanStart)
		}
		// Pure-fn extraction runs on EVERY scanFiles call: a file may add or change a registerPureFnFactory call
		// without producing any new RunType, and each accepted entry yields the Replacement that swaps the
		// factory argument for the entry-module binding. Diagnostics flow unconditionally so editors update as
		// the user types.
		pureFnsStart := time.Now()
		pureFnEntries, pureFnDiagnostics, pureFnReplacements, addedPureFns := sess.extractPureFnsForScan(request.Files)
		if metrics != nil {
			metrics.PureFnsMs = elapsedMs(pureFnsStart)
		}
		// Batch extraction runs on every scan too: the batch id is spliced into the user's source exactly like a
		// pure fn's id, and the BAT0xx diagnostics flow unconditionally.
		batchSites, batchDiagnostics, batchReplacements := sess.extractBatchesForScan(request.Files)
		sess.noteOwnBatches(batchSites)
		// A bundled-API dispatch site (a client built with bundleApi) splices its module binding the same way;
		// MET0xx diagnostics flow with them.
		_, apiDiagnostics, apiReplacements := sess.extractApiSitesForScan(request.Files)
		prepStart := time.Now()
		added := sess.cache.Added(before)
		// The per-cache "did this scan change anything?" signal the Vite plugin's handleHotUpdate consumes.
		addedRunTypes := len(added) > 0
		combinedDiagnostics := append(append(append(append(append([]diagnostics.Diagnostic{}, pureFnDiagnostics...), batchDiagnostics...), apiDiagnostics...), markerDiagnostics...), sess.overrideDiagnostics...)
		combinedDiagnostics = sess.appendLibSelectionDiagnostic(combinedDiagnostics, request.Files)
		// Opt-in enrichment-health pass for the lint surfaces. Runs AFTER cache.Added(before) so the types its
		// content checks intern never leak into this response's added* HMR signals.
		if request.CheckEnrich {
			combinedDiagnostics = append(combinedDiagnostics, sess.checkEnrichFiles(request.Files)...)
		}
		// Opt-in mion route rules, placed here for the same reason: the pass reads types the scan may not
		// otherwise have interned.
		if request.CheckRouterRules {
			combinedDiagnostics = append(combinedDiagnostics, sess.checkRouterRuleFiles(request.Files)...)
		}
		// Override arg-nulling replacements ride the same Replacements channel as pure-fn factory nullings.
		allReplacements := append(append(append(append([]protocol.Replacement(nil), pureFnReplacements...), batchReplacements...), apiReplacements...), sess.collectOverrideReplacements(request.Files)...)
		response := protocol.Response{
			Sites:         sess.stampSiteModules(sites),
			Replacements:  allReplacements,
			AddedRunTypes: addedRunTypes,
			AddedPureFns:  addedPureFns,
			Diagnostics:   combinedDiagnostics,
		}
		// The opt-in build report carries the DELTA for the rescanned files, so the plugin's update-lane callback
		// fires with just the changed sites. nil when the report is off, so a normal HMR scan pays nothing.
		response.PureFnSites = sess.pureFnReportForEntries(pureFnEntries)
		response.BatchSites = sess.batchReportForSites(batchSites)
		// Opt-in: the plugin and bench client read only the added* booleans, so every scan's RunType graphs are wire waste.
		if request.IncludeRunTypes {
			response.Added = added
		}
		if metrics != nil {
			metrics.PrepMs = elapsedMs(prepStart)
		}
		// One sink for every collect in this dispatch, so a single shared throw-site emits one diag per call site.
		// The render opts are built ONLY when collection runs; a plain rewrite scan (no entry modules) skips that work.
		// IncludeRtDiagnostics runs the SAME collection but drops the module payload (lint pass).
		renderEntries := request.IncludeEntryModules || request.IncludeRtDiagnostics
		var rtDiagnostics []diagnostics.Diagnostic
		// rtPureFnDeps accumulates the pure-fn dependencies the family walkers record while rendering bodies
		// below, validated against the program registration set for PFE9012 once the collection finishes.
		// Only wired when entries render, so a plain rewrite scan collects nothing and the validation is a no-op.
		var rtPureFnDeps []typefunctions.PureFnDepUse
		var rtOpts typefunctions.RenderOpts
		if renderEntries {
			rtOptsStart := time.Now()
			rtRooted, rtReaching := sess.buildProvenanceSites()
			rtOpts = sess.rtRenderOpts(&rtDiagnostics, rtRooted, rtReaching)
			rtOpts.PureFnDepSink = &rtPureFnDeps
			if metrics != nil {
				metrics.PrepMs += elapsedMs(rtOptsStart)
			}
		}
		if request.IncludeRunTypes || renderEntries {
			scopedStart := time.Now()
			scoped := sess.scopedDump(request.Files)
			if metrics != nil {
				metrics.ScopedDumpMs = elapsedMs(scopedStart)
			}
			if request.IncludeRunTypes {
				response.RunTypes = scoped.RunTypes
			}
			if renderEntries {
				// The whole-program override cfn entries ride the pure-fn collection so the type-fn redirects
				// resolve their override dep modules. Kept out of the per-file pure-fn signals (replacements /
				// addedPureFns), which track registerPureFnFactory rewrites, not overrides.
				allPureFns := append(append([]purefunctions.Entry(nil), pureFnEntries...), sess.overrideEntries...)
				modules, _, modulesErr := sess.collectEntryModules(scoped, rtOpts, purefunctions.CollectEntries(allPureFns, sess.opts.EmitMode), metrics)
				if modulesErr != nil {
					return protocol.Response{Error: modulesErr.Error()}
				}
				if request.IncludeEntryModules {
					response.EntryModules = modules
				}
			}
		}
		// Flush into the unified response.Diagnostics slice, the only one the Vite plugin's reception loop reads.
		response.Diagnostics = append(response.Diagnostics, rtDiagnostics...)
		// PFE9012: a pure-fn dep an emitted body reaches whose registration is absent from the program is an
		// Error the lint surface and the build must see.
		response.Diagnostics = append(response.Diagnostics, sess.validateProgramPureFnDeps(rtPureFnDeps)...)
		return response
	case protocol.OpDump:
		// Every source file must be scanned for marker calls BEFORE the dump is serialized: the Vite plugin's
		// virtual-module load fires on the first import of any entry module, which can precede the transform
		// (and so the scan) of the user's marker-bearing files.
		scanStart := time.Now()
		if sess.Program != nil {
			sess.scanAllProgramFiles()
		}
		if metrics != nil {
			metrics.MarkerScanMs = elapsedMs(scanStart)
		}
		fullDump := protocol.Dump{
			RunTypes: sess.cache.Dump(),
			Sites:    sess.stampSiteModules(sess.Sites()),
		}
		response := protocol.Response{
			RunTypes: fullDump.RunTypes,
			Sites:    fullDump.Sites,
		}
		// One sink shared across the whole collection, as in the OpScanFiles branch.
		var rtDiagnostics []diagnostics.Diagnostic
		var rtPureFnDeps []typefunctions.PureFnDepUse
		rtRooted, rtReaching := sess.buildProvenanceSites()
		rtOpts := sess.rtRenderOpts(&rtDiagnostics, rtRooted, rtReaching)
		rtOpts.PureFnDepSink = &rtPureFnDeps
		pureFnGraph, pureFnsDiagnostics := sess.collectProgramPureFns(metrics)
		// Marker diagnostics from the eager whole-program scan, surfaced as in OpGenerate: batchcompile
		// consumes this response.
		response.Diagnostics = append(response.Diagnostics, sess.programScanDiagnostics...)
		response.Diagnostics = append(response.Diagnostics, pureFnsDiagnostics...)
		dumpBatchSites, dumpBatchDiagnostics := sess.collectProgramBatches()
		response.Diagnostics = append(response.Diagnostics, dumpBatchDiagnostics...)
		response.BatchSites = sess.batchReportForSites(dumpBatchSites)
		modules, _, modulesErr := sess.collectEntryModules(fullDump, rtOpts, pureFnGraph, metrics)
		if modulesErr != nil {
			return protocol.Response{Error: modulesErr.Error()}
		}
		response.EntryModules = modules
		response.Diagnostics = append(response.Diagnostics, rtDiagnostics...)
		// PFE9012 on the whole-program dump, the path batchcompile drives, so a missing registration fails the build.
		response.Diagnostics = append(response.Diagnostics, sess.validateProgramPureFnDeps(rtPureFnDeps)...)
		return response
	case protocol.OpGenerate:
		// Filesystem-output sibling of OpDump: the same full-program collection, but the modules are WRITTEN
		// under <outDir>/types/ as real files the bundler resolves natively. The root is session config
		// (--gen-dir > tsconfig genDir > inferred <srcDir>/.mion) and is echoed back, so the dependency-free
		// plugin can adopt an inference it cannot compute itself.
		outDir := sess.resolveOutDir()
		if outDir == "" {
			return protocol.Response{Error: "generate: could not resolve an output dir (no --gen-dir, no tsconfig genDir, no inferable srcDir)"}
		}
		if sess.Program != nil {
			sess.scanAllProgramFiles()
		}
		genDump := protocol.Dump{
			RunTypes: sess.cache.Dump(),
			Sites:    sess.stampSiteModules(sess.Sites()),
		}
		var genDiagnostics []diagnostics.Diagnostic
		var genPureFnDeps []typefunctions.PureFnDepUse
		genRooted, genReaching := sess.buildProvenanceSites()
		genOpts := sess.rtRenderOpts(&genDiagnostics, genRooted, genReaching)
		genOpts.PureFnDepSink = &genPureFnDeps
		genPureFnGraph, genPureFnsDiagnostics := sess.collectProgramPureFns(metrics)
		genModules, genArtifact, genModulesErr := sess.collectEntryModules(genDump, genOpts, genPureFnGraph, metrics)
		if genModulesErr != nil {
			return protocol.Response{Error: genModulesErr.Error()}
		}
		manifest, genErr := generateToDisk(outDir, genModules)
		if genErr != nil {
			return protocol.Response{Error: genErr.Error()}
		}
		// The bundleApi lane resolves every dispatch site of the program and writes it under <outDir>/api/.
		// Their files join SiteFiles: a file whose only marker use is `.call()` still needs the transform.
		// With the lane off, a stale api/ tree is removed.
		apiSites, apiSiteDiagnostics := sess.collectProgramApiSites()
		apiGenDiagnostics, apiErr := sess.generateApiBundle(outDir, apiSites)
		if apiErr != nil {
			return protocol.Response{Error: "generate: " + apiErr.Error()}
		}
		// Whole-program batch sites: their files join SiteFiles (a file whose only marker use is `batch([...])`
		// still needs the transform), and a cross-file BAT003 collision is visible only from here.
		genBatchSites, genBatchDiagnostics := sess.collectProgramBatches()
		// The batch transport: a server program (it creates the router, or at least names `@mionjs/router`)
		// reads the batch source, this program or the clientTsconfig one, and writes <outDir>/rpc/.
		// Router-init modules are the ones the transform appends the batch import to, so they join SiteFiles too.
		// A program that never names the router has nothing to serve the table to: none is written, a stale one
		// is removed. A server whose router hides behind a wrapper the detector cannot see gets the table plus a
		// BAT009 warning, and the import is then the author's to write.
		routerInitFiles := sess.routerInitFiles()
		var rpc rpcCollection
		if len(routerInitFiles) > 0 || sess.importsRouter() {
			var rpcErr error
			if rpc, rpcErr = sess.collectRpc(); rpcErr != nil {
				return protocol.Response{Error: "generate: " + rpcErr.Error()}
			}
		}
		batchesModule, rpcGenErr := generateRpc(outDir, rpc, sess.opts.EmitMode)
		if rpcGenErr != nil {
			return protocol.Response{Error: "generate: " + rpcGenErr.Error()}
		}
		siteFiles := append(append(append(sess.pureFnReplacementFiles(metrics), requestbatch.Files(genBatchSites)...), apimeta.Files(apiSites)...), routerInitFiles...)
		// A file whose only marker use is the version slot on `initRoutes` / `initClient` still needs the transform.
		siteFiles = append(siteFiles, sess.apiVersionFiles(sess.programSourceFiles(), routerInitFiles)...)
		genResponse := protocol.Response{Generated: manifest, OutDir: outDir, SiteFiles: uniqueSiteFiles(genDump.Sites, siteFiles)}
		genResponse.BatchesModule = batchesModule
		genResponse.BatchSourceFiles = rpc.files
		genResponse.BatchSourceRoots = rpc.roots
		genResponse.RouterInitFiles = routerInitFiles
		genResponse.Diagnostics = append(genResponse.Diagnostics, rpc.sourceDiags...)
		genResponse.Diagnostics = append(genResponse.Diagnostics, rpc.mapperDiags...)
		if batchesModule != "" && len(routerInitFiles) == 0 {
			genResponse.Diagnostics = append(genResponse.Diagnostics, diagnostics.New(diagnostics.CodeBatchNoRouterInit, diagnostics.Site{}, batchesModule))
		}
		// Echoed like OutDir, so the dependency-free host can adopt a tsconfig-only setting.
		genResponse.DowngradeErrors = sess.opts.TsconfigDowngradeErrors
		// The opt-in build report feeds the in-process callback; with file output on it is also written beside
		// the generated modules, which is how an out-of-process consumer (a separate server build, the
		// --compile lane) reads it.
		if report := sess.collectPureFnReport(metrics); report != nil {
			genResponse.PureFnSites = report
			if sess.opts.PureFnReportFile {
				if reportErr := writeJSONReport(pureFnReportPath(outDir), "pure-fn", report); reportErr != nil {
					return protocol.Response{Error: reportErr.Error()}
				}
			}
		}
		// Not written here: the caller owns the bundler's output dir; the modules are already on disk under types/pf/.
		genResponse.PureFnArtifact = genArtifact
		if sess.opts.PureFnReportWire {
			batchReport := requestbatch.Report(genBatchSites)
			genResponse.BatchSites = batchReport
			if sess.opts.PureFnReportFile {
				if reportErr := writeJSONReport(batchReportPath(outDir), "batch", batchReport); reportErr != nil {
					return protocol.Response{Error: reportErr.Error()}
				}
			}
		}
		genResponse.Diagnostics = append(genResponse.Diagnostics, genBatchDiagnostics...)
		genResponse.Diagnostics = append(genResponse.Diagnostics, apiSiteDiagnostics...)
		genResponse.Diagnostics = append(genResponse.Diagnostics, apiGenDiagnostics...)
		// The marker diagnostics scanAllProgramFiles persisted; without this, buildStart, which consumes THIS
		// response, never sees them.
		genResponse.Diagnostics = append(genResponse.Diagnostics, sess.programScanDiagnostics...)
		genResponse.Diagnostics = append(genResponse.Diagnostics, genPureFnsDiagnostics...)
		genResponse.Diagnostics = append(genResponse.Diagnostics, genDiagnostics...)
		// PFE9012: same dangling-dep guard on the disk-generation path.
		genResponse.Diagnostics = append(genResponse.Diagnostics, sess.validateProgramPureFnDeps(genPureFnDeps)...)
		return genResponse
	case protocol.OpSetSources:
		setStart := time.Now()
		if err := sess.dispatchSetSources(request.Sources); err != nil {
			return protocol.Response{Error: err.Error()}
		}
		if metrics != nil {
			metrics.SetSourcesMs = elapsedMs(setStart)
		}
		return protocol.Response{OK: true}
	case protocol.OpReset:
		sess.Reset()
		return protocol.Response{OK: true}
	case protocol.OpEnrich:
		return sess.dispatchEnrich(request)
	case protocol.OpTsCompile:
		ms, err := sess.dispatchTsCompile()
		if err != nil {
			return protocol.Response{Error: err.Error()}
		}
		return protocol.Response{TsCompileMs: ms}
	case protocol.OpTransform:
		// The compiler-driven transform: scan the requested files exactly as OpScanFiles does, then do the
		// rewrite and source-map generation IN GO (internal/compiler/sourcerewrite) instead of handing offsets
		// back to the JS plugin. The added* flags ride along so the thin Vite wrapper can still drive
		// data-bundle HMR off this single call.
		if sess.Program == nil {
			return protocol.Response{Error: "transform: no Program loaded — call setSources first"}
		}
		if len(request.Files) == 0 {
			return protocol.Response{Error: "transform: files is required and must be non-empty"}
		}
		scanStart := time.Now()
		sites, markerDiagnostics, err := sess.dispatchScanFiles(request.Files)
		if err != nil {
			return protocol.Response{Error: err.Error()}
		}
		if metrics != nil {
			metrics.MarkerScanMs = elapsedMs(scanStart)
		}
		pureFnsStart := time.Now()
		_, pureFnDiagnostics, pureFnReplacements, addedPureFns := sess.extractPureFnsForScan(request.Files)
		if metrics != nil {
			metrics.PureFnsMs = elapsedMs(pureFnsStart)
		}
		transformBatchSites, batchDiagnostics, batchReplacements := sess.extractBatchesForScan(request.Files)
		sess.noteOwnBatches(transformBatchSites)
		_, apiDiagnostics, apiReplacements := sess.extractApiSitesForScan(request.Files)
		// Override arg-nullings join the pure-fn factory nullings, the batch-id splices, the bundled-API
		// bindings and the batch transport's import; all are partitioned per file below.
		allReplacements := append(append(append(append([]protocol.Replacement(nil), pureFnReplacements...), batchReplacements...), apiReplacements...), sess.collectOverrideReplacements(request.Files)...)
		allReplacements = append(allReplacements, sess.routerInitReplacements(request.Files)...)
		sites = sess.stampSiteModules(sites)
		addedRunTypes := len(sess.cache.Added(before)) > 0
		// Sites and replacements come back flat across all requested files, so partition them by File. Source
		// text comes from the Program: those are the authoritative bytes Site.Pos offsets index.
		transformed := make(map[string]protocol.TransformResult, len(request.Files))
		// Relativization is a session posture (Options.TransformRelative), so the root resolves ONCE per request.
		transformOutDir := ""
		if sess.opts.TransformRelative {
			transformOutDir = sess.resolveOutDir()
		}
		for _, file := range request.Files {
			sourceFile, sourceErr := sess.sourceFile(file)
			if sourceErr != nil {
				return protocol.Response{Error: sourceErr.Error()}
			}
			fileAbs := sess.absPath(file)
			var fileSites []protocol.Site
			for _, site := range sites {
				if sameTransformPath(site.File, file, fileAbs) {
					fileSites = append(fileSites, site)
				}
			}
			var fileReplacements []protocol.Replacement
			for _, replacement := range allReplacements {
				if sameTransformPath(replacement.File, file, fileAbs) {
					fileReplacements = append(fileReplacements, replacement)
				}
			}
			source := sourceFile.Text()
			if request.EmitEdits {
				// 'edits' mode hands the FE the raw edit list instead of the rewritten file + map.
				// ComputeEdits shares Apply's insertion / import-block machinery, so applying these edits
				// with the FE's EditBuffer reproduces Apply's output byte for byte. SourceHash lets the FE
				// detect an upstream pre-plugin that edited the source out from under our byte offsets.
				importBlock, edits := sourcerewrite.ComputeEdits(source, fileSites, fileReplacements)
				if importBlock != "" && transformOutDir != "" {
					// The injected block is the only place rtmod: specifiers appear, so relativizing it
					// matches what 'go' mode does to the whole file.
					importBlock = relativizeUserImports(sess.absPath(file), transformOutDir, importBlock)
				}
				transformed[file] = protocol.TransformResult{
					ImportBlock: importBlock,
					Edits:       edits,
					SourceHash:  sourcerewrite.SourceHash(source),
					TypeDeps:    sess.cache.DeclFilesForFiles([]string{file}),
				}
				continue
			}
			code, sourceMap := sourcerewrite.Apply(file, source, fileSites, fileReplacements)
			if transformOutDir != "" {
				// Rewrite the injected block's rtmod: specifiers relative to this file, where the generated
				// modules live on disk. Both bases are absolute, so filepath.Rel always relates them, and
				// the block is one physical line, so the source map stays valid.
				code = relativizeUserImports(sess.absPath(file), transformOutDir, code)
			}
			if sess.opts.OmitSourcesContent && sourceMap != nil {
				// The bundler fills the original source from its own copy when composing the chained map.
				// One nil slot per source keeps the array length aligned with Sources.
				sourceMap.SourcesContent = make([]*string, len(sourceMap.Sources))
			}
			// SourceHash rides go-mode too (8 bytes) so the plugin can DETECT an upstream pre-plugin that
			// edited the source before us: 'go' rebuilds from the resolver's view and would otherwise clobber
			// that edit silently. The plugin warns on mismatch; the transform itself is unaffected either way.
			transformed[file] = protocol.TransformResult{
				Code:       code,
				Map:        sourceMap,
				SourceHash: sourcerewrite.SourceHash(source),
				TypeDeps:   sess.cache.DeclFilesForFiles([]string{file}),
			}
		}
		combinedDiagnostics := append(append(append(append(append([]diagnostics.Diagnostic{}, pureFnDiagnostics...), batchDiagnostics...), apiDiagnostics...), markerDiagnostics...), sess.overrideDiagnostics...)
		combinedDiagnostics = sess.appendLibSelectionDiagnostic(combinedDiagnostics, request.Files)
		response := protocol.Response{
			Transformed:   transformed,
			Sites:         sites,
			Replacements:  allReplacements,
			AddedRunTypes: addedRunTypes,
			AddedPureFns:  addedPureFns,
			Diagnostics:   combinedDiagnostics,
		}
		return response
	default:
		return protocol.Response{Error: "unknown op: " + request.Op}
	}
}

// dispatchSetSources builds an inferred Program from the supplied overlay and swaps it into the resolver.
// Relative file names resolve against Options.Cwd (main passes an absolute one for server mode), falling back to
// the previous Program's own working directory.
func (sess *Session) dispatchSetSources(sources map[string]string) error {
	if sources == nil {
		sources = map[string]string{}
	}
	cwd := sess.opts.Cwd
	if cwd == "" && sess.Program != nil {
		cwd = sess.Program.TS.GetCurrentDirectory()
	}
	if cwd == "" {
		return errors.New("setSources: no cwd configured")
	}
	cwd = tspath.NormalizePath(cwd)

	// Parsed ONCE per session and adopted wholesale in every inferred Program, so daemon rebuilds type-check
	// exactly like the build. Strict like tsc: a named config that is missing or broken fails the op, with
	// CFG001 tagging the message so lint hosts can synthesize the catalog diagnostic, and the next setSources
	// re-parses, so a fixed config heals without a respawn. (nil, nil) means no config was named.
	if _, err := sess.ensureInferredConfig(cwd); err != nil {
		return fmt.Errorf("setSources: %s %v", diagnostics.CodeTsconfigLoadFailed, err)
	}

	overlay := make(map[string]string, len(sources))
	fileNames := make([]string, 0, len(sources))
	for relativePath, content := range sources {
		absolutePath := tspath.ResolvePath(cwd, relativePath)
		overlay[absolutePath] = content
		// A source under node_modules/ is a virtual PACKAGE file the overlay serves to module resolution,
		// never a program root, as in tsc. Rooting a package's whole declaration tree changes the checker's
		// instantiation order against the build lane: the DataOnly<T> alias-recovery path stops matching
		// when the marker package's dist rides the roots.
		if !strings.Contains(relativePath, "node_modules/") {
			fileNames = append(fileNames, absolutePath)
		}
	}
	// A `.d.ts` in the include set is what tsc sees without an import and a source-rooted program loses, leaving
	// globals to check silently as `any`. Only that subset: rooting the full project would widen the
	// whole-program ops (OpDump / OpGenerate / OpEnrich walk non-declaration files) and pay a per-request parse
	// of every project file on the lint lane.
	fileNames = program.UnionRoots(fileNames, sess.configDeclarationRoots)
	prog, err := program.NewInferred(program.Options{
		Cwd:            cwd,
		SingleThreaded: sess.opts.SingleThreaded,
		Overlay:        overlay,
		Config:         sess.inferredConfig,
	}, fileNames)
	if err != nil {
		return fmt.Errorf("setSources: %w", err)
	}
	return sess.SetProgram(prog)
}

// extractPureFnsForScan runs the pure-fn extractor once per scanFiles request and returns everything downstream
// needs: the entries (so the entry-module collection does not extract a second time), the wire diagnostics, the
// factory-arg-to-binding replacements, and whether any entry is new to the session index.
// That index (pureFnKeys) is mutated in place. Removals are NOT detected: a file that drops a pure-fn call leaves
// the session entry behind, matching the runTypes cache's structural-dedup contract, harmless until a restart.
func (sess *Session) extractPureFnsForScan(files []string) (entries []purefunctions.Entry, diagnostics []diagnostics.Diagnostic, replacements []protocol.Replacement, changed bool) {
	if sess.Program == nil || len(files) == 0 {
		return nil, nil, nil, false
	}
	entries, diagnostics = purefunctions.ExtractFromProgramCached(sess.checker, sess.marker, sess.Program, files, sess.pureFnFileCache)
	// A changed body IS a new key, since an id hashes the body that ships, so a new key is the whole change signal.
	for _, entry := range entries {
		if key := entry.Key(); !sess.pureFnKeys[key] {
			sess.pureFnKeys[key] = true
			changed = true
		}
	}
	// Replacements are per CALL SITE, not per deduped entry: every registration site is rewritten, two same-file
	// calls sharing a body included, and RawEntries is what keeps the duplicate sites the entry dedup drops.
	rawEntries := purefunctions.RawEntries(sess.checker, sess.marker, sess.Program, files, sess.pureFnFileCache)
	// Do NOT rewrite the package's OWN built-in registration call sites: purefnindex is the SOLE producer of
	// built-in pure-fn MODULES, extracted only on demand. An in-repo build resolves the package via `src/`, so
	// the extractor sees those registrations, and rewriting their factory args to `import 'rtmod:/pf/rt/…'`
	// would DANGLE whenever the module is not demanded (a file that imports the marker but calls no createX).
	// Left alone, they stay a harmless runtime fallback registration, idempotent with the served tuple.
	userRaw := rawEntries[:0]
	for _, entry := range rawEntries {
		if purefnids.Has(entry.Key()) {
			continue
		}
		userRaw = append(userRaw, entry)
	}
	replacements = purefunctions.Replacements(userRaw, sess.opts.ModuleMode == constants.ModuleModeAllSingle)
	return entries, diagnostics, replacements, changed
}

// extractBatchesForScan runs the request-batch extractor over one request's files and returns the sites, their
// diagnostics, and the batch-id point insertions for the user's source; memoised per file (batchFileCache).
// Cross-file conflicts belong to collectProgramBatches, so a single-file scan never reports them.
func (sess *Session) extractBatchesForScan(files []string) (sites []requestbatch.Site, diagnostics []diagnostics.Diagnostic, replacements []protocol.Replacement) {
	if sess.Program == nil || len(files) == 0 {
		return nil, nil, nil
	}
	sites, diagnostics = requestbatch.ExtractFromProgramCached(sess.checker, sess.marker, sess.Program, files, sess.batchFileCache)
	return sites, diagnostics, requestbatch.Replacements(sites)
}

// dispatchTsCompile runs the embedded tsgo through a full bind + typecheck + emit pass on the current Program and
// returns the wall time in milliseconds. No markers, no entry modules: this is the pure-TypeScript baseline the
// bench orchestrators record alongside the scanFiles latency.
func (sess *Session) dispatchTsCompile() (float64, error) {
	if sess.Program == nil || sess.Program.TS == nil {
		return 0, errors.New("tsCompile: no Program loaded; call setSources first")
	}
	start := time.Now()
	options := compiler.EmitOptions{
		WriteFile: func(_ string, _ string, _ *compiler.WriteFileData) error {
			// Discard the emitted bytes: only the timing matters here.
			return nil
		},
	}
	sess.Program.TS.Emit(context.Background(), options)
	return float64(time.Since(start).Microseconds()) / 1000.0, nil
}
