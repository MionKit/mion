package resolver

import (
	"sort"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnindex"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
)

// servePackagePureFns delivers the pure-fn bodies the surviving graph demands from INSTALLED packages
// (purefnindex): a consumer pure fn importing a library id, or an emitted validator reaching a marker built-in,
// gets that body emitted into its own module in this render's emit mode and layout, deps pulled along across
// packages. Runs after Cascade (demand reflects only entries that ship) and before AddMissingStubs (a served
// body never degrades to a stub). Demand is every soft dep no graph entry answers. An id whose package is not
// installed belongs to the program (PFE9012 from validateProgramPureFnDeps), except a built-in with no marker
// package reachable, a broken install (CFG004). A located package shipping rows but not this id is PFE9012,
// site-less; nothing to serve at all is PFE9016 once per id, so a silent stub never
// hides the edge; an artifact this compiler cannot read is PFE9017, two artifacts disagreeing on a body PFE9018.
// emitMode is the RENDER's mode, not the session's: the bundled-API mirror renders in `functions` whatever the
// program's mode, and a code string there would be rebuilt with `new Function` at first validation, exactly
// where a bundled client is not allowed to.
func (sess *Session) servePackagePureFns(graph entrymodules.Graph, diagSink *[]diagnostics.Diagnostic, emitMode constants.EmitMode) {
	if sess.pureFnIndex == nil || sess.Program == nil {
		return
	}
	keys := make([]string, 0, len(graph))
	for key := range graph {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	demanded := map[string]bool{}
	var demands []purefnindex.Demand
	for _, key := range keys {
		for _, dep := range graph[key].SoftDeps {
			if demanded[dep] || graph[dep] != nil {
				continue
			}
			demanded[dep] = true
			demands = append(demands, purefnindex.Demand{ID: dep, FromDir: sess.Program.Cwd})
		}
	}
	if len(demands) == 0 {
		return
	}
	result := sess.pureFnIndex.Closure(demands)
	graph.Merge(purefunctions.CollectEntries(result.Entries, emitMode))
	if diagSink == nil {
		return
	}
	appendDiag := func(code string, args ...string) {
		*diagSink = append(*diagSink, diagnostics.New(code, diagnostics.Site{}, args...))
	}
	for _, problem := range result.Problems {
		appendDiag(diagnostics.CodePureFnArtifactUnreadable, problem.File, problem.Reason)
	}
	for _, conflict := range result.Conflicts {
		appendDiag(diagnostics.CodePureFnArtifactConflict, conflict.ID, conflict.Files[0], conflict.Files[1])
	}
	// A built-in whose package resolves nowhere is the marker package missing from the install,
	// which reads the same as any other unbuilt dependency now that it ships an artifact too.
	for _, id := range result.Unresolved {
		if purefnids.Has(id) {
			appendDiag(diagnostics.CodePureFnDepUnbuilt, id, purefnindex.MarkerPackageName)
		}
	}
	for _, miss := range result.Missing {
		switch {
		// Built means the package ships rows but not this one: a stale reference, not an
		// unbuilt package. Built-ins read the same way now that they ship in an artifact too.
		case miss.Built:
			appendDiag(diagnostics.CodeMissingPureFnDep, miss.ID)
		default:
			appendDiag(diagnostics.CodePureFnDepUnbuilt, miss.ID, miss.Package)
		}
	}
}

// isLibraryPureFnDep reports whether id is owned by a package installed under
// node_modules (resolved from the program's cwd). Such an edge is checked by
// servePackagePureFns against the package's files, so the sink-based
// validation must not report it as unregistered.
func (sess *Session) isLibraryPureFnDep(id string) bool {
	if sess.pureFnIndex == nil || sess.Program == nil {
		return false
	}
	packageName := purefnindex.PackageOfID(id)
	if packageName == "" {
		return false
	}
	_, ok := sess.pureFnIndex.ResolvePackage(packageName, sess.Program.Cwd)
	return ok
}
