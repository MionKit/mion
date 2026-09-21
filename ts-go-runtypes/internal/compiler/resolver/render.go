package resolver

import (
	"slices"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnindex"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/requestbatch"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
	"github.com/mionkit/mion/ts-go-runtypes/internal/textpos"
)

// rtRenderOpts builds the typefns RenderOpts from session state, so the disk cache and runtype lookup follow the
// resolver across requests. sink takes the walker's root-throw / silent-skip diagnostics; provenance maps RT IDs to
// the sites that reach them and rooted narrows that to the sites that NAMED each id, the set EmitDiagnostic fans over.
func (sess *Session) rtRenderOpts(sink *[]diagnostics.Diagnostic, rooted, provenance map[string][]diagnostics.Site) typefunctions.RenderOpts {
	if sess == nil {
		return typefunctions.RenderOpts{}
	}
	// Fills sample-less pattern annotations BEFORE the collects fan out; single-threaded here, idempotent
	// and memoized in the engine, so repeat dispatches re-ask nothing.
	sess.enrichPatternSamples()
	return typefunctions.RenderOpts{
		Store:           sess.rtStore,
		Lookup:          sess.cache,
		DiagSink:        sink,
		ProvenanceSites: provenance,
		RootedSites:     rooted,
		EmitMode:        sess.opts.EmitMode,
		InlineMode:      sess.opts.InlineMode,
		// The validation authority for mockSamples (FMT001/FMT002), fail-closed with FMT004 when it
		// cannot run.
		JSEngine:           sess.opts.JSEngine,
		PatternSampleCount: sess.opts.PatternSampleCount,
		PatternGenFailures: sess.patternGenFailures,
		RefTable:           sess.fullRefTable(),
		SizeEstimate: typefunctions.SizeEstimateConfig{
			Bias:        sess.opts.SizeBias,
			Items:       sess.opts.SizeItems,
			StringBytes: sess.opts.SizeStringBytes,
			MaxBytes:    sess.opts.SizeMaxBytes,
		},
		// One predicate memo per dispatch, shared by every family collect: the predicates are emitter-independent.
		Facts: typefunctions.NewFactsTable(),
	}
}

// fullRefTable indexes every interned RunType by id: a collect seeds its roots from the (possibly scoped)
// dump but must resolve their child KindRef sentinels against the FULL session cache, a root being able
// to reference children interned while scanning a different file. It is the cache's own live table, under
// the read-only contract of Cache.NodesView.
func (sess *Session) fullRefTable() map[string]*reflection.RunType {
	if sess == nil || sess.cache == nil {
		return nil
	}
	return sess.cache.NodesView()
}

// demandedSite is one marker call site with the family tags it asked for; a reflection-only site
// (getRunTypeId, a builder) demands no function family and never reaches this type.
type demandedSite struct {
	site     diagnostics.Site
	families []string
}

// buildProvenanceSites converts the resolver's protocol.Site list into the ProvenanceKey → sites maps the
// typefns walker fans per-call-site diagnostics out with, both keyed by (type id + family tag): rooted
// holds only the sites that NAMED each id, reaching adds every site the id is reachable from. A ScopeRoot
// code reads the first, everything else the second, see Walker.diagnosticSites.
func (sess *Session) buildProvenanceSites() (rooted, reaching map[string][]diagnostics.Site) {
	if sess == nil || sess.Program == nil {
		return nil, nil
	}
	sites := sess.Sites()
	if len(sites) == 0 {
		return nil, nil
	}
	byID := make(map[string][]demandedSite, len(sites))
	for _, site := range sites {
		if site.ID == "" {
			continue
		}
		families := demandedFamilies(site)
		if len(families) == 0 {
			// A site that demands no function entry has none to be told about.
			continue
		}
		diagSite := diagnostics.Site{FilePath: site.File}
		// File-only fallback when the file is not in the program: the user still sees which file the
		// finding belongs to when line/col cannot be resolved.
		if sourceFile, err := sess.sourceFile(site.File); err == nil && sourceFile != nil {
			diagSite.StartLine, diagSite.StartCol = textpos.LineCol(sourceFile, site.Pos)
		}
		byID[site.ID] = append(byID[site.ID], demandedSite{site: diagSite, families: families})
	}
	rooted = make(map[string][]diagnostics.Site, len(byID))
	for id, demanded := range byID {
		addProvenance(rooted, id, demanded)
	}
	return rooted, sess.inheritProvenanceToDescendants(byID)
}

// demandedFamilies dedupes the site's family tags, so a composite strategy naming one twice does not
// double-report.
func demandedFamilies(site protocol.Site) []string {
	if len(site.Demand) == 0 {
		return nil
	}
	families := make([]string, 0, len(site.Demand))
	for _, demand := range site.Demand {
		if demand.FamilyTag == "" || slices.Contains(families, demand.FamilyTag) {
			continue
		}
		families = append(families, demand.FamilyTag)
	}
	return families
}

// addProvenance files each site under the id's key once per family that site demanded.
func addProvenance(out map[string][]diagnostics.Site, id string, demanded []demandedSite) {
	for _, entry := range demanded {
		for _, family := range entry.families {
			key := typefunctions.ProvenanceKey(id, family)
			out[key] = append(out[key], entry.site)
		}
	}
}

// inheritedProvenanceDepthCap bounds the descent through ID-LESS inline nodes; an interned node is
// memoized by id and a cycle can only close through one, so this backstops an un-interned inline subtree.
const inheritedProvenanceDepthCap = 32

// inheritProvenanceToDescendants gives every type REACHED BY a marker call site the provenance of that
// site, not just the type named at the call. A child type is keyed by its own structural id, which was
// never a marker call argument, and Walker.EmitDiagnostic drops what it cannot attribute rather than
// render an empty filePath, so with a call-site-only map every child-position diagnostic went unreported
// for the NORMAL nested case. The rule stays one diagnostic per CALL SITE, and a descendant inherits the
// site's DEMANDED families only: a site that asked for a validator hears about the members its validator
// drops, never about the JSON encoder it did not ask for. Repeats collapse later in diagnostics.Dedupe,
// so a child reached by several paths from one site still yields one line.
func (sess *Session) inheritProvenanceToDescendants(byID map[string][]demandedSite) map[string][]diagnostics.Site {
	out := make(map[string][]diagnostics.Site, len(byID)*2)
	for id, demanded := range byID {
		addProvenance(out, id, demanded)
	}
	refTable := sess.fullRefTable()
	if len(byID) == 0 || len(refTable) == 0 {
		return out
	}
	// Cleared per root, so a node visited under one root is still attributed under the next.
	seen := make(map[string]struct{}, 64)
	for rootID, demanded := range byID {
		root := refTable[rootID]
		if root == nil {
			continue
		}
		clear(seen)
		seen[rootID] = struct{}{}
		inheritFrom(root, demanded, rootID, refTable, seen, 0, out)
	}
	return out
}

// inheritFrom files one root's sites under every interned descendant. Children arrive as KindRef
// sentinels carrying an id but no slots of their own, so each id is re-resolved against the full table
// before descending, the same resolve-then-descend shape the other graph walks use.
func inheritFrom(
	node *reflection.RunType,
	demanded []demandedSite,
	rootID string,
	refTable map[string]*reflection.RunType,
	seen map[string]struct{},
	depth int,
	out map[string][]diagnostics.Site,
) {
	if node == nil || depth > inheritedProvenanceDepthCap {
		return
	}
	node.EachRefSlot(func(child *reflection.RunType) {
		resolved := child
		if id := child.ID; id != "" {
			if _, visited := seen[id]; visited {
				return
			}
			seen[id] = struct{}{}
			if full := refTable[id]; full != nil {
				resolved = full
			}
			if id != rootID {
				addProvenance(out, id, demanded)
			}
		}
		inheritFrom(resolved, demanded, rootID, refTable, seen, depth+1, out)
	})
}

// extractProgramPureFns walks every program source file through the pure-fn extractor (memoized per file,
// so repeat calls in one dispatch are cheap). Shared by collectProgramPureFns and
// validateProgramPureFnDeps so both observe the SAME whole-program registration set. overrideEntries are
// NOT folded in here: a caller that needs them appends resolver.overrideEntries itself.
func (sess *Session) extractProgramPureFns(metrics *protocol.Metrics) (entries []purefunctions.Entry, walkFiles []string, diags []diagnostics.Diagnostic) {
	if sess.Program == nil {
		return nil, nil, nil
	}
	// The override pass extracts the cfn entries the type-fn redirects forward to; idempotent, so this is
	// a cheap guard when scanning already ran.
	sess.ensureOverrides()
	pureFnsStart := time.Now()
	sourceFiles := sess.Program.TS.SourceFiles()
	walkFiles = make([]string, 0, len(sourceFiles))
	for _, sf := range sourceFiles {
		if sf == nil {
			continue
		}
		walkFiles = append(walkFiles, sf.FileName())
	}
	entries, diags = purefunctions.ExtractFromProgramCached(sess.checker, sess.marker, sess.Program, walkFiles, sess.pureFnFileCache)
	if metrics != nil {
		metrics.PureFnsMs = elapsedMs(pureFnsStart)
	}
	return entries, walkFiles, diags
}

// collectProgramPureFns returns the per-entry graph for the OpDump path; OpScanFiles reuses its own
// per-request extraction instead.
func (sess *Session) collectProgramPureFns(metrics *protocol.Metrics) (entrymodules.Graph, []diagnostics.Diagnostic) {
	entries, _, diags := sess.extractProgramPureFns(metrics)
	// The package's OWN build is the single producer of a built-in body; an in-repo program
	// resolves that package through the `source` condition and would extract a second body for
	// the same id, so those entries are dropped. Unless THIS program is that package: dropping
	// them would leave it with no artifact to publish.
	ownPackage, _ := sess.ownPackage()
	ownsBuiltins := ownPackage == purefnindex.MarkerPackageName
	kept := entries[:0]
	for _, entry := range entries {
		if purefnids.Has(entry.Key()) && !ownsBuiltins {
			continue
		}
		kept = append(kept, entry)
	}
	// Override cfn entries join here so the type-fn redirects resolve their dep modules on
	// OpDump / OpGenerate too, not just OpScanFiles. Without it generate() emits a redirect
	// whose module is missing and the runtime throws "Pure function not found" at the first createX.
	kept = append(kept, sess.overrideEntries...)
	return purefunctions.CollectEntries(kept, sess.opts.EmitMode), diags
}

// collectPureFnReport builds the whole-program pure-fn build report only when Options.PureFnReportWire is
// enabled, so the pipeline pays nothing when the report is off. It reuses collectProgramPureFns's memoized
// extraction and drops the built-in entries an in-repo program surfaces: a published consumer never emits
// those, and they are not user-registered pure fns. Cfn override entries carry no registrar call site, so
// they are not in this set either.
func (sess *Session) collectPureFnReport(metrics *protocol.Metrics) []protocol.PureFnSite {
	if !sess.opts.PureFnReportWire {
		return nil
	}
	entries, _, _ := sess.extractProgramPureFns(metrics)
	kept := make([]purefunctions.Entry, 0, len(entries))
	for _, entry := range entries {
		if purefnids.Has(entry.Key()) {
			continue
		}
		kept = append(kept, entry)
	}
	return purefunctions.Report(kept, sess.opts.EmitMode, sess.opts.ModuleMode == constants.ModuleModeAllSingle)
}

// renderPureFnArtifact renders the cache modules of the pure fns OWNED by the package at the program's cwd,
// byte for byte as generate writes them under types/pf/, plus the index (purefnindex.RenderArtifactIndex),
// keyed by path inside the artifact dir. A workspace sibling reached through the `source` condition, and the
// marker package's built-ins, are extracted too but belong to their own package's artifact. Nil when nothing is owned.
// Rendered per entry whatever the module mode: `allSingle` folds the cache, but a consumer reads one module per id.
func (sess *Session) renderPureFnArtifact(graph entrymodules.Graph, metrics *protocol.Metrics) (map[string]string, error) {
	if sess.Program == nil {
		return nil, nil
	}
	ownPackage, ownRoot := sess.ownPackage()
	if ownPackage == "" {
		return nil, nil
	}
	entries, _, _ := sess.extractProgramPureFns(metrics)
	var own []purefunctions.Entry
	for _, entry := range entries {
		if purefnindex.PackageOfID(entry.Key()) == ownPackage && graph[entry.Key()] != nil {
			own = append(own, entry)
		}
	}
	if len(own) == 0 {
		return nil, nil
	}
	// Every pure-fn entry (a dep's module is imported by name) plus the stubs for deps nothing answered.
	slice := entrymodules.Graph{}
	for key, entry := range graph {
		if entry.Kind == entrymodules.KindPureFn || (entry.Kind == entrymodules.KindMissing && strings.Contains(key, constants.PureFnHashPrefix)) {
			slice.Add(entry)
		}
	}
	modules, err := entrymodules.RenderGrouped(slice, nil)
	if err != nil {
		return nil, err
	}
	files := map[string]string{constants.PureFnArtifactIndexFile: string(purefnindex.RenderArtifactIndex(ownPackage, ownRoot, own))}
	for _, entry := range own {
		basename := entrymodules.ModuleName(entry.Key(), entrymodules.KindPureFn)
		files[purefnindex.ModulePath(entry.Key())] = relativizeModuleImports(basename, modules[basename])
	}
	return files, nil
}

// pureFnReportForEntries builds the report for an already-extracted per-request entry set (the
// OpScanFiles delta), with the same built-in filter and layout/emitMode as collectPureFnReport.
func (sess *Session) pureFnReportForEntries(entries []purefunctions.Entry) []protocol.PureFnSite {
	if !sess.opts.PureFnReportWire || len(entries) == 0 {
		return nil
	}
	kept := make([]purefunctions.Entry, 0, len(entries))
	for _, entry := range entries {
		if purefnids.Has(entry.Key()) {
			continue
		}
		kept = append(kept, entry)
	}
	return purefunctions.Report(kept, sess.opts.EmitMode, sess.opts.ModuleMode == constants.ModuleModeAllSingle)
}

// collectProgramBatches returns the whole-program batch site set with every batch diagnostic: the
// per-site BAT001 / BAT002 / BAT004 / BAT005 / BAT006 plus the cross-file BAT003 collisions, which only
// a whole-program fold can see.
func (sess *Session) collectProgramBatches() ([]requestbatch.Site, []diagnostics.Diagnostic) {
	if sess.Program == nil {
		return nil, nil
	}
	sourceFiles := sess.Program.TS.SourceFiles()
	walkFiles := make([]string, 0, len(sourceFiles))
	for _, sf := range sourceFiles {
		if sf == nil || sf.IsDeclarationFile {
			continue
		}
		walkFiles = append(walkFiles, sf.FileName())
	}
	sites, diags := requestbatch.ExtractFromProgramCached(sess.checker, sess.marker, sess.Program, walkFiles, sess.batchFileCache)
	return sites, append(diags, requestbatch.CheckConflicts(sites)...)
}

// batchReportForSites builds the wire report only when Options.PureFnReportWire is enabled, so a normal
// scan pays nothing.
func (sess *Session) batchReportForSites(sites []requestbatch.Site) []protocol.BatchSite {
	if !sess.opts.PureFnReportWire || len(sites) == 0 {
		return nil
	}
	return requestbatch.Report(sites)
}

// validateProgramPureFnDeps cross-checks the pure-fn dependencies aggregated while rendering RT function
// entries (opts.PureFnDepSink) against the program-wide registration set, returning PFE9012 for a dep
// whose id no scanned source file registers. The index is a WHOLE-program extraction, and that is the
// correctness pivot: the per-file scan set (extractPureFnsForScan) covers only the requested files, so
// validating against it false-positives on `newRunTypeErr` and friends, which register in the mion
// package's own source rather than in the user's requested files. Each missing id fans out to one
// diagnostic per distinct marker call site that demanded a type reaching it, so the squiggle lands on the
// user's createX<T>() call, as the walker's root-throw diagnostics do; an id reached only transitively
// falls back to a single file-less diagnostic, and the output is sorted by (key, file, line, col) so the
// response is deterministic whatever the family-collect order. Built-ins are exempt, and NOT by a count
// guard: the deps reaching here are ALWAYS ids the package owns, registered by its own side-effect imports
// at runtime while their source is a .d.ts in a published-package consumer's program, so cross-checking
// them false-positives; purefunctions.ValidatePureFnDependencies skips built-in namespaces and validates
// only user-owned ones, faithful to runtime for every consumer shape.
func (sess *Session) validateProgramPureFnDeps(uses []typefunctions.PureFnDepUse) []diagnostics.Diagnostic {
	if len(uses) == 0 || sess.Program == nil {
		return nil
	}
	entries, _, _ := sess.extractProgramPureFns(nil)
	// Override cfn registrations count too — they only add keys, never remove.
	entries = append(entries, sess.overrideEntries...)
	index := purefunctions.NewIndex(entries)
	index.LibraryDep = sess.isLibraryPureFnDep

	// Index each key's demanding call sites, deduped, so a miss can be anchored at them.
	deps := make([]protocol.PureFnDep, 0, len(uses))
	sitesByKey := map[string][]diagnostics.Site{}
	seenSite := map[string]bool{}
	for _, use := range uses {
		deps = append(deps, use.Dep)
		key := use.Dep.ID
		for _, site := range use.Sites {
			fingerprint := key + "\x00" + site.FilePath + "\x00" + strconv.Itoa(site.StartLine) + ":" + strconv.Itoa(site.StartCol)
			if seenSite[fingerprint] {
				continue
			}
			seenSite[fingerprint] = true
			sitesByKey[key] = append(sitesByKey[key], site)
		}
	}

	// The validation core returns one file-less diagnostic per missing key; fan each out to its demanding
	// call sites, or keep it file-less when there is no site to point at.
	missing := purefunctions.ValidatePureFnDependencies(deps, index)
	var diags []diagnostics.Diagnostic
	for _, diag := range missing {
		sites := sitesByKey[pureFnDepDiagKey(diag)]
		if len(sites) == 0 {
			diags = append(diags, diag)
			continue
		}
		for _, site := range sites {
			anchored := diag
			anchored.Site = site
			diags = append(diags, anchored)
		}
	}
	sort.SliceStable(diags, func(i, j int) bool {
		if key := pureFnDepDiagKey(diags[i]); key != pureFnDepDiagKey(diags[j]) {
			return key < pureFnDepDiagKey(diags[j])
		}
		left, right := diags[i].Site, diags[j].Site
		if left.FilePath != right.FilePath {
			return left.FilePath < right.FilePath
		}
		if left.StartLine != right.StartLine {
			return left.StartLine < right.StartLine
		}
		return left.StartCol < right.StartCol
	})
	return diags
}

// pureFnDepDiagKey returns the missing pure-fn id a PFE9012 diagnostic carries in its
// first arg (see ValidatePureFnDependencies), falling back to the code for a malformed diagnostic.
func pureFnDepDiagKey(diag diagnostics.Diagnostic) string {
	if len(diag.Args) > 0 {
		return diag.Args[0]
	}
	return diag.Code
}
