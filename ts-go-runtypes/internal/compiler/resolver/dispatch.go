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
	"github.com/mionkit/ts-runtypes/internal/cachegen/builtinpurefns"
	"github.com/mionkit/ts-runtypes/internal/cachegen/operations"
	"github.com/mionkit/ts-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/ts-runtypes/internal/cachegen/runtype"
	"github.com/mionkit/ts-runtypes/internal/cachegen/typefunctions"
	"github.com/mionkit/ts-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/compiler/sourcerewrite"
	"github.com/mionkit/ts-runtypes/internal/constants"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// familyAddedFlag wires one family's per-scan added-flag: the pre-flight
// Supports probe plus the Response setter. pureFns / runTypes are not here —
// their flags come from the extractor / cache delta directly.
type familyAddedFlag struct {
	key          string
	anySupported func(runTypes []*protocol.RunType) bool
	setAdded     func(response *protocol.Response, added bool)
}

// familyAddedFlags enumerates the per-family added-flag wiring consumed by the
// Vite plugin's scan-change signals (and hmr-signals tests). Probe order is
// cosmetic — each row runs one shallow Supports pass over the scan's added
// nodes.
var familyAddedFlags = []familyAddedFlag{
	{key: "validationErrors",
		anySupported: typefunctions.FamilyByKey("validationErrors").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedValidationErrors = added }},
	{key: "prepareForJson",
		anySupported: typefunctions.FamilyByKey("prepareForJson").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedPrepareForJson = added }},
	{key: "restoreFromJson",
		anySupported: typefunctions.FamilyByKey("restoreFromJson").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedRestoreFromJson = added }},
	{key: "stringifyJson",
		anySupported: typefunctions.FamilyByKey("stringifyJson").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedStringifyJson = added }},
	{key: "prepareForJsonSafe",
		anySupported: typefunctions.FamilyByKey("prepareForJsonSafe").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedPrepareForJsonSafe = added }},
	{key: "hasUnknownKeys",
		anySupported: typefunctions.FamilyByKey("hasUnknownKeys").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedHasUnknownKeys = added }},
	{key: "cloneExactShape",
		anySupported: typefunctions.FamilyByKey("cloneExactShape").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedCloneExactShape = added }},
	{key: "unknownKeyErrors",
		anySupported: typefunctions.FamilyByKey("unknownKeyErrors").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedUnknownKeyErrors = added }},
	{key: "unknownKeysToUndefinedWire",
		anySupported: typefunctions.FamilyByKey("unknownKeysToUndefinedWire").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedUnknownKeysToUndefinedWire = added }},
	{key: "toBinary",
		anySupported: typefunctions.FamilyByKey("toBinary").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedToBinary = added }},
	{key: "fromBinary",
		anySupported: typefunctions.FamilyByKey("fromBinary").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedFromBinary = added }},
	// NOT the registry generic: FormatTransformEmitter.Supports is true for
	// everything (identity is a valid transform), so the added-flag gates on
	// an actual value-transforming format instead.
	{key: "formatTransform",
		anySupported: typefunctions.AnyFormatTransformSupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedFormatTransform = added }},
	{key: "validate",
		anySupported: typefunctions.FamilyByKey("validate").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedValidate = added }},
}

// Dispatch routes a request to the correct handler. When the request sets
// IncludeMetrics, the response carries a Metrics block measured around the
// dispatch: total wall time, Go memory deltas/snapshots, tsgo
// extendedDiagnostics counters (read off the live Program), and the
// per-phase times the inner handler recorded.
func (sess *Session) Dispatch(request protocol.Request) protocol.Response {
	if !request.IncludeMetrics {
		return sess.dispatch(request, nil)
	}
	var memBefore runtime.MemStats
	runtime.ReadMemStats(&memBefore)
	metrics := &protocol.Metrics{RenderMs: map[string]float64{}}
	start := time.Now()
	response := sess.dispatch(request, metrics)
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
	// extendedDiagnostics counters — tsgo checks lazily, so these are
	// post-op absolutes reflecting every check forced so far in this
	// Program's lifetime. The bench harness resets the Program per cycle,
	// which makes per-case numbers directly comparable.
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

// collectEntryModules runs the full per-entry pipeline against dump: runtype
// node entries for every dumped type, demand-driven family entries (parallel
// fan-out preserved), JSON composites, pure fns, the cross-family fixpoint,
// the global dangling-dep cascade, and missing stubs for demanded keys that
// didn't survive. Returns the rendered modules keyed by module BASENAME.
func (sess *Session) collectEntryModules(dump protocol.Dump, rtOpts typefunctions.RenderOpts, pureFnGraph entrymodules.Graph, metrics *protocol.Metrics) (map[string]string, error) {
	var graph entrymodules.Graph
	if sess.opts.ModuleMode == constants.ModuleModeAllModules {
		graph = runtype.CollectEntriesPerNode(dump)
	} else {
		graph = runtype.CollectEntries(dump)
	}

	familyGraphs, err := sess.collectFamilies(dump, rtOpts, metrics)
	if err != nil {
		return nil, err
	}
	for _, familyGraph := range familyGraphs {
		graph.Merge(familyGraph)
	}
	// Composites collect AFTER the family merge so each one can read its
	// primitives' rendered IsNoop flags and elide dead identity bindings.
	graph.Merge(typefunctions.CollectJsonCompositeEntries(dump, rtOpts, graph))
	graph.Merge(pureFnGraph)

	// The circular-reference guard is now a compile-time option: an armed
	// (`{rejectCircularRefs: true}`) guarded entry inlines the guard with a baked
	// skeleton and demands rt::findCycle by body reference (served like any
	// built-in), so there is no type-shape wiring or RunType-bundle linking left
	// to do here — a plain (unarmed) cyclable type ships neither.

	sess.resolveCrossFamilyEdges(graph, dump, rtOpts)
	// Composite prologues bind primitives with an unguarded
	// `utl.getRT(key).fn` — assert every referenced primitive actually
	// rendered (post-fixpoint) so an invariant breach fails the build
	// instead of crashing at runtime. ProvenanceSites anchors any breach at
	// the demanding createJsonEncoderFn/Decoder call site.
	typefunctions.AssertCompositeSoftDeps(graph, rtOpts.ProvenanceSites, rtOpts.DiagSink)
	// Same invariant for cfn redirects: every `utl.usePureFn('cfn::…')` must
	// have its module in the graph or the build fails (OVR002) instead of
	// throwing at runtime.
	typefunctions.AssertOverrideCfn(graph, rtOpts.DiagSink)

	// Dropping an entry whose same-family dep never rendered mirrors the
	// pre-migration dangling cascade; the demanded roots that fall out (or
	// never rendered at all — unsupported kinds with no diag code) become
	// KindMissing stubs so the imports the plugin injected still resolve, and
	// the runtime degrades to the family identity fn exactly as before.
	graph.Cascade()
	// Deliver the demanded package-owned pure-fn bodies from the built-in table,
	// after Cascade (demand reflects only surviving entries) and before
	// AddMissingStubs (a served built-in must be present so it never degrades to a
	// KindMissing stub). A demanded built-in absent from the table is a PFE9012.
	sess.serveBuiltinPureFns(graph, rtOpts.DiagSink)
	demanded, demandTags := demandedEntryKeys(dump.Sites)
	graph.AddMissingStubs(demanded)
	// allSingle: a dropped demanded key must stay importable at the bundle
	// the site's import points at (Site.Module) — tag its stub so the
	// grouping routes it into that family bundle. Untagged stubs (soft-dep
	// fallbacks no site demanded) keep their own per-entry module.
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
	return modules, err
}

// collectFamilies runs every type-walking family's per-entry collection.
// Families fan out across goroutines by default (collects are checker-free
// pure functions of (dump, RefTable, opts)); each goroutine gets a value copy
// of rtOpts with the two dispatch-shared mutable fields sharded: its own
// DiagSink slice and a fresh FactsTable. The join then, per family in
// registry order: first error wins, RenderMs recorded (values overlap
// wall-clock; their sum exceeds elapsed time), shard diagnostics appended
// (== the sequential order), and Facts shards merged into the dispatch opts.
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
			// Shard the pure-fn dep sink per goroutine (like DiagSink) so the
			// concurrent family collects never append to a shared slice; the
			// shards merge back in family order below, matching the serial path.
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

// parallelRenderEnabled reports whether family collects may fan out.
// Parallel is the default; SingleThreaded means "no concurrency at all",
// covering collects too even though they never touch a checker.
func (sess *Session) parallelRenderEnabled() bool {
	return !sess.opts.DisableParallelRender && !sess.opts.SingleThreaded
}

// familyByPlainHash maps each type-walking family's PLAIN fnHash to its spec —
// the reverse lookup the cross-family fixpoint needs to route a missing
// `<fnHash>_<id>` dep to the family that renders it. Cross-family edges always
// target plain (no-variant) entries, so plain hashes suffice.
var familyByPlainHash = func() map[string]typefunctions.FamilySpec {
	out := make(map[string]typefunctions.FamilySpec, len(typefunctions.Families))
	for _, spec := range typefunctions.Families {
		op, ok := operations.ByFamilyTag(spec.Settings.Tag)
		if !ok {
			continue
		}
		out[operations.PlainHash(op.Name)] = spec
	}
	return out
}()

// resolveCrossFamilyEdges renders, to fixpoint, every foreign-family entry the
// graph's deps reference but no family demanded directly — the
// `<valHash>_<member>` lookups union decoders / validationErrors bodies reach at
// runtime. This replaces the pre-migration CrossFamilyValRoots seeding pass:
// instead of collecting edges into the validate render, each missing edge is
// routed to its owning family (via the plain-fnHash reverse map) and collected
// as a plain root + same-family closure. Sites are stripped from the seed dump
// so the sub-collect renders ONLY the requested roots (no demand re-render, no
// duplicate diagnostics).
//
// Iteration is bounded: each pass only renders keys that were missing, and the
// rendered set grows monotonically toward the (finite) session type set. The
// guard cap is defensive — hitting it leaves the remaining edges to the stub
// pass, which preserves the build (runtime degrades to identity fallback).
func (sess *Session) resolveCrossFamilyEdges(graph entrymodules.Graph, dump protocol.Dump, rtOpts typefunctions.RenderOpts) {
	seedDump := protocol.Dump{RunTypes: dump.RunTypes}
	for iteration := 0; iteration < 8; iteration++ {
		missingByFamily := map[string]map[string]bool{}
		for _, entry := range graph {
			if entry.Kind != entrymodules.KindTypeFn {
				continue
			}
			// Cross-family edges ride SoftDeps (hard Deps are same-family and
			// always rendered by the family's own collect or cascaded away).
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
				spec, ok := familyByPlainHash[dep[:separator]]
				if !ok {
					continue
				}
				if missingByFamily[spec.Key] == nil {
					missingByFamily[spec.Key] = map[string]bool{}
				}
				missingByFamily[spec.Key][dep[separator+1:]] = true
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
			ids := make([]string, 0, len(missingByFamily[key]))
			for id := range missingByFamily[key] {
				ids = append(ids, id)
			}
			sort.Strings(ids)
			before := len(graph)
			graph.Merge(typefunctions.FamilyByKey(key).Collect(seedDump, rtOpts, ids))
			if len(graph) > before {
				progressed = true
			}
		}
		// No progress means every remaining edge points at an unsupported
		// type — the stub pass will cover them; looping again would spin.
		if !progressed {
			return
		}
	}
}

// demandedEntryKeys lists the entry keys user call sites import: the
// `<fnHash>_<typeId>` key for every createX site (reflection sites import the
// runtype entry, which always exists for interned types). The stub pass turns
// any demanded key that didn't survive collection into a resolvable
// KindMissing module. The second return maps each demanded key to its
// family tag (the Demand entry whose FnHash keyed the site) — allSingle mode
// uses it to place dropped-key stubs inside the family bundle the site's
// import points at.
func demandedEntryKeys(sites []protocol.Site) ([]string, map[string]string) {
	var keys []string
	seen := map[string]bool{}
	tags := map[string]string{}
	for _, site := range sites {
		if site.ID == "" {
			continue
		}
		// A multi-function site (createStandardSchema's <T,'val','verr'>) injects
		// SEVERAL entry bindings at one slot; each is a key the plugin imports
		// directly, so every fnId is demanded — not just the scalar FnId mirror.
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
			for _, demand := range site.Demand {
				if demand.FnHash == fnId {
					tags[key] = demand.FamilyTag
					break
				}
			}
		}
	}
	sort.Strings(keys)
	return keys, tags
}

// uniqueSiteFiles lists the source files carrying at least one marker site OR an
// extracted pure-fn registration (extraFiles), sorted and deduplicated.
// OpGenerate returns it as Response.SiteFiles so the plugin can gate its per-file
// transform on real scan results instead of textual import sniffing — wrapper
// call sites (markers forwarded by another package, node_modules included) are
// covered with zero configuration. A pure fn is a Replacement, not a Site, so its
// file never appears in `sites`; extraFiles folds those in so both the named
// (`registerPureFnFactory`) and anonymous (`registerAnonymousPureFn`) lanes —
// including calls behind a library wrapper — are transformed.
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

// pureFnReplacementFiles returns the sorted unique source files that carry an
// extracted pure-fn registration whose factory argument gets rewritten (both the
// named and anonymous lanes). These files need the per-file transform even
// though a pure fn is a Replacement and never a marker Site, so they never land
// in the Site-derived file set — including WRAPPED registrations, whose consumer
// files import neither the marker package by name nor call the primitive
// textually. Folded into OpGenerate's SiteFiles so the plugin's transform gate
// covers them with zero configuration. Extraction is memoised (pureFnFileCache),
// so re-running it here is cheap.
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

// pruneUnreachableTypeFnEntries drops every KindTypeFn entry nothing can
// load: not a rewrite-injected binding (`demanded` — each site's own
// `<FnId>_<ID>`, the only fn keys the plugin ever imports directly) and not
// reachable from a live module through import edges (Deps + SoftDeps,
// transitively). The noop-elision gate stopped REFERENCING identity entries;
// this stops EMITTING them — the demand machinery still renders a short-form
// for every primitive a composite site demands, but once the composite elides
// its binding the orphan (and anything only it pulled in) cascades out of the
// module set entirely.
//
// Non-typefn kinds are unconditional roots: the runtype bundle/facades load
// via reflection-site bindings and pure-fn modules via their own injected
// registration sites — neither rides the fn-site demand list, so reachability
// over it would under-approximate their liveness.
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

// moduleGrouping returns the entrymodules.Grouping for the resolver's module
// mode. Nil (everything per-entry, the runtype bundle shaping its own module
// via CollectEntries) for default/allModules; the allSingle partition
// otherwise: fn/composite entries ride `fns/<familyTag>` bundles, pure fns
// the `pf` bundle, the reflection facades fold into the runtypes bundle, and
// missing stubs follow their demanding site's family (per-entry when no site
// demanded them — soft-dep stubs keep their own resolvable module).
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

// stampSiteModules annotates sites with the bundle basename their entry rides
// in under allSingle mode (Site.Module). The mapping is mode-static —
// reflection sites point at the runtypes bundle, createX sites at their
// demand family's bundle — so the plain transform scan (no entry-module
// collection) stamps identically to the dump path. Returns a copy when
// stamping occurs; other modes pass sites through untouched.
func (sess *Session) stampSiteModules(sites []protocol.Site) []protocol.Site {
	if sess.opts.ModuleMode != constants.ModuleModeAllSingle || len(sites) == 0 {
		return sites
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
		for _, demand := range out[i].Demand {
			if demand.FnHash == out[i].FnId {
				out[i].Module = constants.FnsBundleDir + "/" + demand.FamilyTag
				break
			}
		}
	}
	return out
}

// serveBuiltinPureFns delivers the package-owned pure-fn bodies (`rt::…` /
// `rtFormats::…`) demanded by the surviving graph, straight from the generated
// table (builtinpurefns) — the mechanism that lets a published consumer, whose
// program has only a .d.ts, receive built-in bodies at all. Demand is (a) every
// soft dep the table recognises (covers user-pure-fn → built-in edges) plus
// (b) every `rt::`/`rtFormats::` soft dep on a TYPE-FN entry, whose bodies reach
// only built-ins (never the anonymous `rt::<hash>` lane, so no false demand). The
// table's transitive closure is pulled too (isDateString_YMD → isDateString).
//
// A (b)-demanded key the table does NOT carry is a genuine build error: once
// delivery is build-owned there is no runtime registration lane left to cover a
// built-in the resolver emitted a reference to but the table never generated
// (a stale table, or a new built-in in a source file the generator does not
// list). It surfaces as PFE9012 — the same "RT depends on missing pure-fn" code,
// now validated against the table instead of taken on faith (the exemption flip).
// Runs post-Cascade so demand reflects only entries that will ship, and
// pre-AddMissingStubs so a served built-in never degrades to a KindMissing stub.
func (sess *Session) serveBuiltinPureFns(graph entrymodules.Graph, diagSink *[]diagnostics.Diagnostic) {
	keys := make([]string, 0, len(graph))
	for key := range graph {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	demandSet := make(map[string]bool)
	var demand []string
	addDemand := func(dep string) {
		if !demandSet[dep] {
			demandSet[dep] = true
			demand = append(demand, dep)
		}
	}
	for _, key := range keys {
		entry := graph[key]
		for _, dep := range entry.SoftDeps {
			if builtinpurefns.Has(dep) {
				addDemand(dep)
				continue
			}
			// A `rt::`/`rtFormats::` edge on a type-fn entry that the table does
			// not carry: demand it so Closure reports it as missing (a build
			// error). Restricted to type-fn entries — only their bodies reach
			// built-ins, so the anonymous `rt::<hash>` user lane (which shares the
			// `rt` namespace but lives only on pure-fn entries) is never misread.
			if entry.Kind == entrymodules.KindTypeFn && isBuiltinPureFnKey(dep) {
				addDemand(dep)
			}
		}
	}
	if len(demand) == 0 {
		return
	}
	entries, missing := builtinpurefns.Closure(demand)
	graph.Merge(purefunctions.CollectEntries(entries, sess.opts.EmitMode))
	if diagSink == nil {
		return
	}
	for _, key := range missing {
		namespace, fnName := splitBuiltinPureFnKey(key)
		*diagSink = append(*diagSink, diagnostics.New(diagnostics.CodeMissingPureFnDep, diagnostics.Site{}, key, namespace, fnName, ""))
	}
}

// isBuiltinPureFnKey reports whether dep is in a package-owned pure-fn namespace
// (`rt` / `rtFormats`). It matches the anonymous `rt::<hash>` lane too, so callers
// gate on entry kind — type-fn bodies never reference anonymous pure fns.
func isBuiltinPureFnKey(dep string) bool {
	namespace, _ := splitBuiltinPureFnKey(dep)
	return namespace == "rt" || namespace == "rtFormats"
}

// splitBuiltinPureFnKey splits a `<ns>::<fn>` key at the first `::`.
func splitBuiltinPureFnKey(key string) (namespace, fnName string) {
	if idx := strings.Index(key, "::"); idx >= 0 {
		return key[:idx], key[idx+2:]
	}
	return key, ""
}

// typeIDFromEntryKey splits a `<fnHash>_<typeId>` fn-entry key at the first
// underscore, returning the type-id tail (empty when the key has no underscore).
func typeIDFromEntryKey(key string) string {
	if idx := strings.IndexByte(key, '_'); idx >= 0 {
		return key[idx+1:]
	}
	return ""
}

// sameTransformPath matches a wire-tagged file path against a requested path,
// tolerating the abs-vs-rel skew: scan Sites echo the REQUESTED (often
// relative) path, but pure-fn Replacements carry the program's ABSOLUTE file
// name (the extractor records positions against the tsgo program). Mirrors the
// JS scan-batcher's projectFile/samePath rule so transform partitions edits to
// the right file. Matching on a separator boundary keeps `a/user.ts` from
// claiming `another-user.ts`.
func sameTransformPath(tagged, requested string) bool {
	return tagged == requested || strings.HasSuffix(tagged, "/"+requested) || strings.HasSuffix(tagged, "\\"+requested)
}

// containsString reports whether values contains target.
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
		// Pure-fn extraction runs every scanFiles call: the request's
		// files may add or modify registerPureFnFactory calls without
		// producing any new RunTypes, AND every accepted entry yields
		// one Replacement record the Vite plugin uses to swap the
		// factory argument for the entry-module binding in the user's
		// source. Diagnostics flow unconditionally so editor surfaces
		// update as the user types.
		pureFnsStart := time.Now()
		pureFnEntries, pureFnDiagnostics, pureFnReplacements, addedPureFns := sess.extractPureFnsForScan(request.Files)
		if metrics != nil {
			metrics.PureFnsMs = elapsedMs(pureFnsStart)
		}
		prepStart := time.Now()
		added := sess.cache.Added(before)
		// Per-cache "did this scan change anything?" signals consumed by
		// the Vite plugin's handleHotUpdate.
		addedRunTypes := len(added) > 0
		combinedDiagnostics := append(append(append([]diagnostics.Diagnostic{}, pureFnDiagnostics...), markerDiagnostics...), sess.overrideDiagnostics...)
		// Opt-in enrichment-health pass (tag hygiene + FriendlyText/MockData
		// content + breadcrumb drift) for the lint surfaces. Runs AFTER
		// cache.Added(before) so the types the content checks intern never
		// leak into this response's added* HMR signals.
		if request.CheckEnrich {
			combinedDiagnostics = append(combinedDiagnostics, sess.checkEnrichFiles(request.Files)...)
		}
		// Override arg-nulling replacements (scoped to the requested files) ride
		// the same Replacements channel as pure-fn factory nullings.
		allReplacements := append(append([]protocol.Replacement(nil), pureFnReplacements...), sess.collectOverrideReplacements(request.Files)...)
		response := protocol.Response{
			Sites:         sess.stampSiteModules(sites),
			Replacements:  allReplacements,
			AddedRunTypes: addedRunTypes,
			AddedPureFns:  addedPureFns,
			Diagnostics:   combinedDiagnostics,
		}
		// Pure-fn build report (opt-in) — the DELTA for the rescanned files, so
		// the plugin's update-lane callback fires with just the changed sites.
		// nil when the report is off, so a normal HMR scan pays nothing.
		response.PureFnSites = sess.pureFnReportForEntries(pureFnEntries)
		// Per-family added flags, one shallow Supports pass each (the
		// addedRunTypes short-circuit skips all passes on no-change scans).
		for _, family := range familyAddedFlags {
			family.setAdded(&response, addedRunTypes && family.anySupported(added))
		}
		// The full added-node payload is attached only when the caller
		// opted into type payloads — the Vite plugin and the bench client
		// read just the added* booleans, so marshalling every new RunType
		// graph on every scan was pure wire/encode waste.
		if request.IncludeRunTypes {
			response.Added = added
		}
		if metrics != nil {
			metrics.PrepMs = elapsedMs(prepStart)
		}
		// rtDiagnostics is the sink the walker appends to at every
		// RTThrow / silent-skip site reached during the entry collection
		// below. Single sink covers every collect in this dispatch so a
		// single shared throw-site emits one diag per call site. The
		// render opts (provenance line/col conversion + full ref table)
		// are built ONLY when collection will actually run — the plain
		// rewrite-pipeline scan (no entry modules requested) skips all of
		// that work. IncludeRtDiagnostics runs the SAME collection for its
		// diagnostics but drops the module payload (lint pass).
		renderEntries := request.IncludeEntryModules || request.IncludeRtDiagnostics
		var rtDiagnostics []diagnostics.Diagnostic
		// rtPureFnDeps accumulates the pure-fn dependencies the family walkers
		// record while rendering live bodies below (via rtOpts.PureFnDepSink);
		// validated against the program registration set for PFE9012 once the
		// collection finishes. Only wired when entries actually render, so a
		// plain rewrite scan collects nothing and the validation short-circuits.
		var rtPureFnDeps []typefunctions.PureFnDepUse
		var rtOpts typefunctions.RenderOpts
		if renderEntries {
			rtOptsStart := time.Now()
			rtOpts = sess.rtRenderOpts(&rtDiagnostics, sess.buildProvenanceSites())
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
				// Override cfn entries (whole-program) ride the pure-fn collection
				// so the type-fn redirects resolve their `cfn::` dep modules. Kept
				// out of the per-file pure-fn signals (replacements / addedPureFns)
				// — those track registerPureFnFactory rewrites, not overrides.
				allPureFns := append(append([]purefunctions.Entry(nil), pureFnEntries...), sess.overrideEntries...)
				modules, modulesErr := sess.collectEntryModules(scoped, rtOpts, purefunctions.CollectEntries(allPureFns, sess.opts.EmitMode), metrics)
				if modulesErr != nil {
					return protocol.Response{Error: modulesErr.Error()}
				}
				if request.IncludeEntryModules {
					response.EntryModules = modules
				}
			}
		}
		// Flush RT diagnostics into the unified response.Diagnostics slice
		// so the Vite plugin's reception loop surfaces them via this.warn.
		response.Diagnostics = append(response.Diagnostics, rtDiagnostics...)
		// PFE9012: any pure-fn dep an emitted body reaches whose registration
		// is absent from the program is an Error the lint surface / build must
		// see. No-op when nothing rendered (deps empty).
		response.Diagnostics = append(response.Diagnostics, sess.validateProgramPureFnDeps(rtPureFnDeps)...)
		return response
	case protocol.OpDump:
		// Ensure every source file in the Program has been scanned for
		// marker calls before the dump is serialized. Without this,
		// the Vite plugin's virtual-module load — which fires on the
		// first import of any entry module — may run BEFORE the user's
		// marker-bearing source files have been transformed (and
		// therefore scanned). The eager scan amortises any per-file scan
		// that hasn't happened yet, so OpDump always returns the
		// complete picture.
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
		// rtDiagnostics mirrors the OpScanFiles branch — one sink shared
		// across the whole collection, flushed into response.Diagnostics
		// once the render completes.
		var rtDiagnostics []diagnostics.Diagnostic
		var rtPureFnDeps []typefunctions.PureFnDepUse
		rtOpts := sess.rtRenderOpts(&rtDiagnostics, sess.buildProvenanceSites())
		rtOpts.PureFnDepSink = &rtPureFnDeps
		pureFnGraph, pureFnsDiagnostics := sess.collectProgramPureFns(metrics)
		// Marker diagnostics from the eager whole-program scan — same
		// surfacing as OpGenerate (batchcompile consumes this response).
		response.Diagnostics = append(response.Diagnostics, sess.programScanDiagnostics...)
		response.Diagnostics = append(response.Diagnostics, pureFnsDiagnostics...)
		modules, modulesErr := sess.collectEntryModules(fullDump, rtOpts, pureFnGraph, metrics)
		if modulesErr != nil {
			return protocol.Response{Error: modulesErr.Error()}
		}
		response.EntryModules = modules
		response.Diagnostics = append(response.Diagnostics, rtDiagnostics...)
		// PFE9012: dangling pure-fn deps in the whole-program dump — the path
		// batchcompile drives, so a missing registration fails the build.
		response.Diagnostics = append(response.Diagnostics, sess.validateProgramPureFnDeps(rtPureFnDeps)...)
		return response
	case protocol.OpGenerate:
		// Filesystem-output sibling of OpDump: the same full-program entry
		// collection, but the modules are WRITTEN under <outDir>/types/ (real
		// files the bundler resolves natively) instead of returned on the wire.
		// The root is session config (--gen-dir > tsconfig genDir > inferred
		// <srcDir>/__runtypes); the resolved path is echoed back so the
		// dependency-free plugin can adopt an inference it cannot compute.
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
		genOpts := sess.rtRenderOpts(&genDiagnostics, sess.buildProvenanceSites())
		genOpts.PureFnDepSink = &genPureFnDeps
		genPureFnGraph, genPureFnsDiagnostics := sess.collectProgramPureFns(metrics)
		genModules, genModulesErr := sess.collectEntryModules(genDump, genOpts, genPureFnGraph, metrics)
		if genModulesErr != nil {
			return protocol.Response{Error: genModulesErr.Error()}
		}
		manifest, genErr := generateToDisk(outDir, genModules)
		if genErr != nil {
			return protocol.Response{Error: genErr.Error()}
		}
		genResponse := protocol.Response{Generated: manifest, OutDir: outDir, SiteFiles: uniqueSiteFiles(genDump.Sites, sess.pureFnReplacementFiles(metrics))}
		// Echo the tsconfig plugin's failOnError (nil when unset) so the
		// dependency-free host can adopt a tsconfig-only setting, same as OutDir.
		genResponse.FailOnError = sess.opts.TsconfigFailOnError
		// Pure-fn build report (opt-in): populate the structured records for the
		// in-process callback, and — when file output is enabled — write the JSON
		// file alongside the generated modules so out-of-process consumers (a
		// separate server build, the --compile lane) read it from disk.
		if report := sess.collectPureFnReport(metrics); report != nil {
			genResponse.PureFnSites = report
			if sess.opts.PureFnReportFile {
				if reportErr := writePureFnReport(pureFnReportPath(outDir), report); reportErr != nil {
					return protocol.Response{Error: reportErr.Error()}
				}
			}
		}
		// Marker diagnostics from the eager whole-program scan (MKR/CTA/TMP…)
		// — persisted by scanAllProgramFiles; without this, buildStart (which
		// consumes THIS response) never sees them.
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
		// The compiler-driven transform: scan the requested files exactly as
		// OpScanFiles does (sites + pure-fn replacements), then apply the
		// rewrite + source-map generation IN GO (internal/compiler/sourcerewrite)
		// rather than handing offsets back to the JS plugin. Returns one
		// TransformResult per file. The added* flags ride along so the thin
		// Vite wrapper can still drive data-bundle HMR off this single call.
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
		// Override arg-nulling replacements (scoped to the requested files) join
		// the pure-fn factory nullings; both are partitioned per file below.
		allReplacements := append(append([]protocol.Replacement(nil), pureFnReplacements...), sess.collectOverrideReplacements(request.Files)...)
		sites = sess.stampSiteModules(sites)
		added := sess.cache.Added(before)
		addedRunTypes := len(added) > 0
		// Apply the rewrite per file. Sites/replacements come back flat across
		// all requested files, so partition them by File. Source text is read
		// from the Program (the authoritative bytes Site.Pos byte-offsets index).
		transformed := make(map[string]protocol.TransformResult, len(request.Files))
		// Files-mode relativization is a session posture (Options.TransformRelative),
		// so the output root resolves ONCE for the whole request instead of per file.
		transformOutDir := ""
		if sess.opts.TransformRelative {
			transformOutDir = sess.resolveOutDir()
		}
		for _, file := range request.Files {
			sourceFile, sourceErr := sess.sourceFile(file)
			if sourceErr != nil {
				return protocol.Response{Error: sourceErr.Error()}
			}
			var fileSites []protocol.Site
			for _, site := range sites {
				if sameTransformPath(site.File, file) {
					fileSites = append(fileSites, site)
				}
			}
			var fileReplacements []protocol.Replacement
			for _, replacement := range allReplacements {
				if sameTransformPath(replacement.File, file) {
					fileReplacements = append(fileReplacements, replacement)
				}
			}
			source := sourceFile.Text()
			if request.EmitEdits {
				// 'edits' mode: hand the FE the raw edit list instead of the
				// rewritten file + map. ComputeEdits shares Apply's insertion /
				// import-block machinery, so applying these edits with the FE's
				// EditBuffer reproduces Apply's output byte-for-byte. The
				// SourceHash lets the FE detect an upstream pre-plugin that
				// edited the source out from under the resolver's byte offsets.
				importBlock, edits := sourcerewrite.ComputeEdits(source, fileSites, fileReplacements)
				if importBlock != "" && transformOutDir != "" {
					// Files-mode: relativize the injected block's rtmod:
					// specifiers exactly as 'go' mode does to the whole file —
					// the block is the only place those specifiers appear.
					importBlock = relativizeUserImports(sess.absPath(file), transformOutDir, importBlock)
				}
				transformed[file] = protocol.TransformResult{
					ImportBlock: importBlock,
					Edits:       edits,
					SourceHash:  sourcerewrite.SourceHash(source),
				}
				continue
			}
			code, sourceMap := sourcerewrite.Apply(file, source, fileSites, fileReplacements)
			if transformOutDir != "" {
				// Files-mode: rewrite the injected import block's rtmod:
				// specifiers to paths relative to this file (the generated
				// modules live on disk under <outDir>/types). Both bases are
				// absolute so filepath.Rel always relates them. The block is one
				// physical line, so this leaves the source map valid.
				code = relativizeUserImports(sess.absPath(file), transformOutDir, code)
			}
			if sess.opts.OmitSourcesContent && sourceMap != nil {
				// Drop the embedded original source — the bundler fills it from
				// its own copy when composing the chained map. One nil slot per
				// source keeps the array length aligned with Sources.
				sourceMap.SourcesContent = make([]*string, len(sourceMap.Sources))
			}
			// SourceHash rides go-mode too (8 bytes) so the plugin can DETECT an
			// upstream pre-plugin that edited the source before us — 'go' rebuilds
			// from the resolver's view and would otherwise clobber that edit
			// silently. The plugin warns on mismatch; the transform itself is
			// unaffected either way.
			transformed[file] = protocol.TransformResult{Code: code, Map: sourceMap, SourceHash: sourcerewrite.SourceHash(source)}
		}
		combinedDiagnostics := append(append(append([]diagnostics.Diagnostic{}, pureFnDiagnostics...), markerDiagnostics...), sess.overrideDiagnostics...)
		response := protocol.Response{
			Transformed:   transformed,
			Sites:         sites,
			Replacements:  allReplacements,
			AddedRunTypes: addedRunTypes,
			AddedPureFns:  addedPureFns,
			Diagnostics:   combinedDiagnostics,
		}
		for _, family := range familyAddedFlags {
			family.setAdded(&response, addedRunTypes && family.anySupported(added))
		}
		return response
	default:
		return protocol.Response{Error: "unknown op: " + request.Op}
	}
}

// dispatchSetSources builds an inferred Program from the supplied overlay
// and swaps it into the resolver. Relative file names are resolved against
// the working directory the resolver's previous Program had (or, on first
// call before any Program exists, against os.Getwd at start — but we don't
// have that here; main passes an absCwd via Options for server mode).
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

	// Parse the project tsconfig ONCE per session (cwd + tsconfig path are fixed
	// for the session lifetime) and adopt its options wholesale in every inferred
	// Program, so daemon rebuilds type-check exactly like the build. Strict like
	// tsc: a named config that is missing or broken fails the op — CFG001 tags the
	// message so lint hosts can synthesize the catalog diagnostic — and the done
	// flag stays unset, so the next setSources re-parses and a fixed config heals
	// without a respawn. (nil, nil) means no config was named: the fixed inferred
	// defaults apply.
	if !sess.inferredConfigDone {
		inferredConfig, err := program.ParseInferredConfig(cwd, sess.opts.TsconfigPath)
		if err != nil {
			return fmt.Errorf("setSources: %s %v", diagnostics.CodeTsconfigLoadFailed, err)
		}
		sess.inferredConfig = inferredConfig
		sess.inferredConfigDone = true
	}

	overlay := make(map[string]string, len(sources))
	fileNames := make([]string, 0, len(sources))
	for relativePath, content := range sources {
		absolutePath := tspath.ResolvePath(cwd, relativePath)
		overlay[absolutePath] = content
		fileNames = append(fileNames, absolutePath)
	}
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

// extractPureFnsForScan runs the pure-fn extractor once per scanFiles
// request and returns everything downstream code needs: the entries
// (so the entry-module collection doesn't extract a second time), the wire
// diagnostics, the byte-range replacements for the user's source
// (factory-arg-to-binding), and a `changed` flag indicating that at
// least one entry's bodyHash differs from the session index.
//
// The session index (pureFnHashes) is mutated in place so subsequent
// scans see the new state. Removals are not detected here — a file
// that drops one of its pure-fn calls still leaves the session entry
// behind (matches the runTypes cache's structural-dedup contract;
// the orphan is harmless until the next process restart).
func (sess *Session) extractPureFnsForScan(files []string) (entries []purefunctions.Entry, diagnostics []diagnostics.Diagnostic, replacements []protocol.Replacement, changed bool) {
	if sess.Program == nil || len(files) == 0 {
		return nil, nil, nil, false
	}
	entries, diagnostics = purefunctions.ExtractFromProgramCached(sess.checker, sess.marker, sess.Program, files, sess.pureFnFileCache)
	for _, entry := range entries {
		key := entry.Key()
		if existing, ok := sess.pureFnHashes[key]; !ok || existing != entry.BodyHash {
			sess.pureFnHashes[key] = entry.BodyHash
			changed = true
		}
	}
	// Replacements are per CALL SITE, not per deduped entry: every registration
	// site is rewritten (factory → binding, plus the anonymous lane's hash
	// splice), including two same-file calls that share a body. RawEntries keeps
	// those duplicate sites the entry dedup drops. `entries` (deduped) still drives
	// pureFnHashes + diagnostics above.
	rawEntries := purefunctions.RawEntries(sess.checker, sess.marker, sess.Program, files, sess.pureFnFileCache)
	// Do NOT rewrite built-in (`rt::`/`rtFormats::`) registration call sites. The
	// table (builtinpurefns) is the SOLE producer of built-in pure-fn MODULES,
	// served on demand only when a fn body reaches one. An in-repo build resolves
	// the package via `src/`, so the extractor sees the built-in registrations in
	// pure-fns-utils.ts / *-pure-fns.ts; rewriting those factory args to
	// `import 'rtmod:/pf/rt/…'` would DANGLE whenever the module isn't demanded
	// (e.g. a file that imports the marker but calls no createX). Leaving them as
	// plain `registerPureFnFactory(key, factory)` calls keeps the harmless runtime
	// fallback registration (idempotent with the table's tuple; hollowed in dist).
	userRaw := rawEntries[:0]
	for _, entry := range rawEntries {
		if builtinpurefns.Has(entry.Key()) {
			continue
		}
		userRaw = append(userRaw, entry)
	}
	replacements = purefunctions.Replacements(userRaw, sess.opts.ModuleMode == constants.ModuleModeAllSingle)
	return entries, diagnostics, replacements, changed
}

// dispatchTsCompile runs the embedded tsgo through a full bind +
// typecheck + emit pass on the resolver's current Program. Returns the
// wall time in milliseconds. The emit output bytes are discarded — we
// only care about timing. Does NOT walk markers, does NOT collect any
// ts-runtypes entry modules — this is the pure-TypeScript baseline
// measurement the bench orchestrators record alongside the existing
// scanFiles latency.
func (sess *Session) dispatchTsCompile() (float64, error) {
	if sess.Program == nil || sess.Program.TS == nil {
		return 0, errors.New("tsCompile: no Program loaded; call setSources first")
	}
	start := time.Now()
	// EmitOptions.WriteFile is the sink for emitted bytes. Discard
	// everything — the test is the timing, not the output.
	options := compiler.EmitOptions{
		WriteFile: func(_ string, _ string, _ *compiler.WriteFileData) error {
			// discard emit output — only the timing matters here
			return nil
		},
	}
	sess.Program.TS.Emit(context.Background(), options)
	return float64(time.Since(start).Microseconds()) / 1000.0, nil
}
