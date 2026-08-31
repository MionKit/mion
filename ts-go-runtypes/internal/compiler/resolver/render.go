package resolver

import (
	"sort"
	"strconv"
	"time"

	"github.com/mionkit/ts-runtypes/internal/cachegen/builtinpurefns"
	"github.com/mionkit/ts-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/ts-runtypes/internal/cachegen/typefunctions"
	"github.com/mionkit/ts-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/ts-runtypes/internal/constants"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/protocol"
	"github.com/mionkit/ts-runtypes/internal/reflection"
	"github.com/mionkit/ts-runtypes/internal/textpos"
)

// rtRenderOpts builds the RenderOpts the typefns entry collectors expect
// from the resolver's session state. The dispatch path feeds this into
// every collect call so the disk cache and runtype lookup follow the
// resolver across requests.
//
// sink (when non-nil) is the destination for compile-time diagnostics
// emitted by the walker at RTThrow / silent-skip sites; provenance
// (when non-nil) maps RT IDs to the marker call sites that reference
// them, so EmitDiagnostic can fan out one Diagnostic per call site.
func (sess *Session) rtRenderOpts(sink *[]diagnostics.Diagnostic, provenance map[string][]diagnostics.Site) typefunctions.RenderOpts {
	if sess == nil {
		return typefunctions.RenderOpts{}
	}
	// Fill generated mockSamples into sample-less pattern annotations
	// BEFORE the collects fan out — single-threaded here, idempotent, and
	// memoized in the engine, so repeat dispatches re-ask nothing.
	sess.enrichPatternSamples()
	return typefunctions.RenderOpts{
		Store:           sess.rtStore,
		Lookup:          sess.cache,
		DiagSink:        sink,
		ProvenanceSites: provenance,
		EmitMode:        sess.opts.EmitMode,
		InlineMode:      sess.opts.InlineMode,
		// The JS engine format-pattern checks run on — the validation
		// authority for mockSamples (FMT001/FMT002), fail-closed with
		// FMT004 when it cannot run.
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
		// One predicate memo per dispatch, shared by every family collect
		// (the predicates are emitter-independent).
		Facts: typefunctions.NewFactsTable(),
	}
}

// fullRefTable indexes every interned RunType by id for the typefns collectors.
// A collect seeds its roots from the (possibly scoped) dump but must resolve those
// roots' child KindRef sentinels against the FULL session cache — a root can
// reference children interned while scanning a different file. This is the
// cache's own live table (read-only contract — see Cache.NodesView), so no
// per-dispatch rebuild/sort/re-stamp happens anymore.
func (sess *Session) fullRefTable() map[string]*reflection.RunType {
	if sess == nil || sess.cache == nil {
		return nil
	}
	return sess.cache.NodesView()
}

// buildProvenanceSites converts the resolver's protocol.Site list into
// the (RT ID → []diagnostics.Site) map the typefns walker uses to fan out
// per-call-site diagnostics. Pos→line/col is computed against the
// resolver's current Program; sites whose file isn't in the program
// (defensive) are skipped.
func (sess *Session) buildProvenanceSites() map[string][]diagnostics.Site {
	if sess == nil || sess.Program == nil {
		return nil
	}
	sites := sess.Sites()
	if len(sites) == 0 {
		return nil
	}
	out := make(map[string][]diagnostics.Site, len(sites))
	for _, site := range sites {
		if site.ID == "" {
			continue
		}
		sourceFile, err := sess.sourceFile(site.File)
		if err != nil || sourceFile == nil {
			// Fall back to file-only — better than dropping the entry
			// entirely; the user still sees which file the error belongs
			// to even when line/col can't be resolved.
			out[site.ID] = append(out[site.ID], diagnostics.Site{FilePath: site.File})
			continue
		}
		line, col := textpos.LineCol(sourceFile, site.Pos)
		out[site.ID] = append(out[site.ID], diagnostics.Site{
			FilePath:  site.File,
			StartLine: line,
			StartCol:  col,
		})
	}
	return sess.inheritProvenanceToDescendants(out)
}

// inheritedProvenanceDepthCap bounds the descent through ID-LESS inline nodes.
// Every interned node is memoized by id (the common case, and the only way a
// cycle can close, since a circular type is always interned), so this only
// backstops a pathological un-interned inline subtree.
const inheritedProvenanceDepthCap = 32

// inheritProvenanceToDescendants gives every type REACHED BY a marker call site
// the provenance of that site, not just the type named at the call.
//
// # The bug this fixes
//
// A child type gets its own cache entry, keyed by its own structural id — an id
// that was never a marker call argument. So a map built only from call sites has
// no entry for it, and `Walker.EmitDiagnostic` drops anything it cannot
// attribute rather than render a diagnostic with an empty filePath. The result
// was silent: `createJsonEncoderFn<Pet>()` warned that `Pet` serializes
// structurally, while `createJsonEncoderFn<{pet: Pet}>()` and
// `createJsonEncoderFn<Pet | Owner>()` said nothing at all — for the exact same
// class, compiled by the exact same emitter. Nesting is the NORMAL case, so most
// occurrences of every child-position diagnostic never reached anyone.
//
// # Why "every site that reaches it" is the right attribution
//
// The established rule for a root type is one diagnostic per CALL SITE, not one
// per type id. Inheriting provenance keeps that rule intact one level down: a
// site is told about the types it actually pulls in. A shared child legitimately
// reports at each site that demands it, exactly as a shared root already does.
//
// Repeats collapse later: identical (code, args, site) tuples are folded by
// diagnostics.Dedupe, so a child reached by several paths from one site — or by
// several cache families — still yields one line.
func (sess *Session) inheritProvenanceToDescendants(rooted map[string][]diagnostics.Site) map[string][]diagnostics.Site {
	refTable := sess.fullRefTable()
	if len(rooted) == 0 || len(refTable) == 0 {
		return rooted
	}
	out := make(map[string][]diagnostics.Site, len(rooted)*2)
	for id, sites := range rooted {
		out[id] = sites
	}
	// Reused across roots: cleared per root so a node visited under one root is
	// still attributed under the next.
	seen := make(map[string]struct{}, 64)
	for rootID, sites := range rooted {
		root := refTable[rootID]
		if root == nil {
			continue
		}
		clear(seen)
		seen[rootID] = struct{}{}
		inheritFrom(root, sites, rootID, refTable, seen, 0, out)
	}
	return out
}

// inheritFrom walks one root's ref slots, appending the root's sites to every
// interned descendant. Children arrive as KindRef sentinels carrying an id but
// no slots of their own, so each id is re-resolved against the full table before
// descending — the same resolve-then-descend shape the other graph walks use.
func inheritFrom(
	node *reflection.RunType,
	sites []diagnostics.Site,
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
				out[id] = append(out[id], sites...)
			}
		}
		inheritFrom(resolved, sites, rootID, refTable, seen, depth+1, out)
	})
}

// extractProgramPureFns walks every source file in the program through the
// pure-fn extractor (memoized per file via pureFnFileCache, so repeat calls in
// one dispatch are cheap) and returns the registration entries, the exact
// walked-file set, and the wire-shaped diagnostics. Shared by
// collectProgramPureFns (the entry-graph path) and validateProgramPureFnDeps
// (the PFE9012 registration index) so both observe the SAME whole-program
// registration set. overrideEntries are NOT folded in here — callers that need
// them (the graph, the index) append resolver.overrideEntries themselves.
func (sess *Session) extractProgramPureFns(metrics *protocol.Metrics) (entries []purefunctions.Entry, walkFiles []string, diags []diagnostics.Diagnostic) {
	if sess.Program == nil {
		return nil, nil, nil
	}
	// The override pass extracts the cfn pure-fn entries the type-fn redirects
	// forward to; idempotent, so this is a cheap guard when scanning already ran.
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

// collectProgramPureFns walks every file in the program through the pure-fn
// extractor and returns the per-entry graph (the OpDump path; OpScanFiles
// reuses its own per-request extraction instead). Returns the wire-shaped
// diagnostics from the in-place extraction alongside.
func (sess *Session) collectProgramPureFns(metrics *protocol.Metrics) (entrymodules.Graph, []diagnostics.Diagnostic) {
	entries, _, diags := sess.extractProgramPureFns(metrics)
	// Precedence: the built-in pure-fn table is the SINGLE producer of every
	// `rt::`/`rtFormats::` body. An IN-REPO program resolves the package via `src/`
	// (the `source` condition), so the extractor would ALSO find the built-in
	// registrations and serve a second, clashing producer for the same key. Drop
	// those program entries — the table wins on key clash — so there is exactly one
	// pure-fn module per built-in key regardless of how the package resolved. (A
	// published consumer never hits this: its program has only a .d.ts, nothing to
	// extract.) User keys, including the anonymous lane's `rt::<hash>`, are not in
	// the table and pass through untouched.
	kept := entries[:0]
	for _, entry := range entries {
		if builtinpurefns.Has(entry.Key()) {
			continue
		}
		kept = append(kept, entry)
	}
	// Override cfn entries (whole-program) join the program pure-fn graph so the
	// type-fn redirects resolve their `cfn::` dep modules on the OpDump /
	// OpGenerate paths too — not just OpScanFiles. Without this the plugin's
	// generate() emits the redirect but not the cfn module it imports, and the
	// runtime throws "Pure function not found" at the first createX call.
	kept = append(kept, sess.overrideEntries...)
	return purefunctions.CollectEntries(kept, sess.opts.EmitMode), diags
}

// collectPureFnReport builds the whole-program pure-fn build report
// (protocol.PureFnSite records) when Options.PureFnReportWire is enabled — nil
// otherwise, so the pipeline pays nothing when the report is off. It reuses the
// same deduped whole-program extraction as collectProgramPureFns (memoized by
// the per-Program FileCache, so no extra walk) and drops the built-in
// `rt::`/`rtFormats::` entries an in-repo program surfaces — a published
// consumer never emits those, and they are not user-registered pure fns. Cfn
// override entries are NOT in this set (they carry no registrar call site).
func (sess *Session) collectPureFnReport(metrics *protocol.Metrics) []protocol.PureFnSite {
	if !sess.opts.PureFnReportWire {
		return nil
	}
	entries, _, _ := sess.extractProgramPureFns(metrics)
	kept := make([]purefunctions.Entry, 0, len(entries))
	for _, entry := range entries {
		if builtinpurefns.Has(entry.Key()) {
			continue
		}
		kept = append(kept, entry)
	}
	return purefunctions.Report(kept, sess.opts.EmitMode, sess.opts.ModuleMode == constants.ModuleModeAllSingle)
}

// pureFnReportForEntries builds the report for an already-extracted per-request
// entry set (the OpScanFiles delta), applying the same built-in filter and
// layout/emitMode as collectPureFnReport. Empty in / empty out; nil when the
// report is disabled.
func (sess *Session) pureFnReportForEntries(entries []purefunctions.Entry) []protocol.PureFnSite {
	if !sess.opts.PureFnReportWire || len(entries) == 0 {
		return nil
	}
	kept := make([]purefunctions.Entry, 0, len(entries))
	for _, entry := range entries {
		if builtinpurefns.Has(entry.Key()) {
			continue
		}
		kept = append(kept, entry)
	}
	return purefunctions.Report(kept, sess.opts.EmitMode, sess.opts.ModuleMode == constants.ModuleModeAllSingle)
}

// validateProgramPureFnDeps cross-checks the pure-fn dependencies aggregated
// while rendering RT function entries (opts.PureFnDepSink) against the
// program-wide pure-fn registration set, returning PFE9012 diagnostics for any
// dep whose `<namespace>::<fnName>` registration is missing from every scanned
// source file. Empty uses (the common non-linting path, or a build that renders
// no pure-fn-bearing family) or no Program short-circuits to nil.
//
// The index is a WHOLE-program extraction — a registration in ANY program file
// satisfies the dep by key. This is the correctness pivot: the per-file scan
// set (extractPureFnsForScan) covers only the requested files, so validating
// against it would false-positive on `rt::newRunTypeErr` and friends, which
// register in the mion package's own source (pulled into the program by
// its side-effect import), never in the user's requested files. The dep's
// FilePath hint drives only ValidatePureFnDependencies' lazy expansion, which
// stays a no-op here because the whole program is already walked.
//
// Site attribution: each missing key fans out to one diagnostic per distinct
// marker call site that demanded a type reaching it (collected from each use's
// root provenance), so the squiggle lands on the user's createX<T>() call —
// mirroring how the walker's RTThrow diagnostics fan out. A key whose uses
// carry no provenance (only transitively-reached children) falls back to a
// single file-less diagnostic. Output is sorted by (key, file, line, col) so
// the response is deterministic regardless of family-collect order (serial vs
// parallel).
//
// Built-in exemption (NOT a count guard): the deps reaching here are the ones
// emitted RT bodies reach, which are ALWAYS in a @mionjs/run-types-owned
// namespace (rt::, rtFormats:: — see AddPureFnDependency call sites). Those are
// registered by the package's own side-effect imports at runtime but their
// source is a .d.ts in a published-package consumer's program, so cross-checking
// them false-positives. purefunctions.ValidatePureFnDependencies skips built-in
// namespaces and validates only user-owned ones, so the check is faithful to
// runtime for every consumer shape. This replaced the old
// `len(entries) == 0 → skip` guard, which a consumer's own registerPureFnFactory
// defeated (entries became non-zero, so every built-in dep was then flagged
// missing — the PFE9012 wall this fixes).
func (sess *Session) validateProgramPureFnDeps(uses []typefunctions.PureFnDepUse) []diagnostics.Diagnostic {
	if len(uses) == 0 || sess.Program == nil {
		return nil
	}
	entries, walkFiles, _ := sess.extractProgramPureFns(nil)
	// Override cfn registrations count too — they only add keys, never remove.
	entries = append(entries, sess.overrideEntries...)
	index := purefunctions.NewIndex(entries, walkFiles)

	// Flatten to the bare deps for the validation core, and index each key's
	// demanding call sites (deduped) so a miss can be anchored at them.
	deps := make([]protocol.PureFnDep, 0, len(uses))
	sitesByKey := map[string][]diagnostics.Site{}
	seenSite := map[string]bool{}
	for _, use := range uses {
		deps = append(deps, use.Dep)
		key := use.Dep.Namespace + "::" + use.Dep.FunctionName
		for _, site := range use.Sites {
			fingerprint := key + "\x00" + site.FilePath + "\x00" + strconv.Itoa(site.StartLine) + ":" + strconv.Itoa(site.StartCol)
			if seenSite[fingerprint] {
				continue
			}
			seenSite[fingerprint] = true
			sitesByKey[key] = append(sitesByKey[key], site)
		}
	}

	// The validation core returns one file-less diagnostic per missing key.
	// Fan each out to its demanding call sites (or keep it file-less when the
	// key was only reached transitively, with no site to point at).
	missing := purefunctions.ValidatePureFnDependencies(sess.checker, sess.marker, deps, index, sess.Program)
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

// pureFnDepDiagKey returns the missing `<namespace>::<fnName>` key a PFE9012
// diagnostic carries in its first arg (see ValidatePureFnDependencies), for
// deterministic sorting. Falls back to the code for a malformed diagnostic.
func pureFnDepDiagKey(diag diagnostics.Diagnostic) string {
	if len(diag.Args) > 0 {
		return diag.Args[0]
	}
	return diag.Code
}
