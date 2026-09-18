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

// servePackagePureFns delivers the pure-fn bodies the surviving graph demands
// from INSTALLED packages (purefnindex): a consumer pure fn that imports a
// library id, or an emitted validator that reaches one of the marker package's
// own built-ins, gets that body emitted into its own module, in this render's
// emit mode and layout, with the package's own deps pulled along across
// packages. Runs after Cascade (demand reflects only entries that ship) and
// before AddMissingStubs (a served body never degrades to a KindMissing stub).
//
// Demand is every soft dep no graph entry answers. An id whose package is not
// installed belongs to the program (a consumer's own missing registration is
// PFE9012 from validateProgramPureFnDeps), except a built-in: a program that
// demands one and reaches no marker package is a broken install (CFG004). A
// located package that ships rows but not this id is a build error (PFE9012,
// site-less); one whose sources could not be read is CFG004 for the marker
// package (its bodies are the compiler's own contract) and the runtime-only
// lane otherwise; a located package with nothing to serve at all is that lane,
// reported once per id as PFE9016 so a silent stub never hides the edge.
//
// emitMode is the RENDER's mode, not the session's: the bundled-API mirror
// renders in `functions` whatever the program's own mode, and a body shipped as
// a code string there would be rebuilt with `new Function` at the first
// validation, exactly where a bundled client is not allowed to.
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
	unreadable := map[string]bool{}
	for _, id := range result.Unresolved {
		if purefnids.Has(id) && !unreadable[purefnindex.MarkerPackageName] {
			unreadable[purefnindex.MarkerPackageName] = true
			appendDiag(diagnostics.CodeBuiltinPureFnSourceUnreadable, purefnindex.MarkerPackageName, "no file of this package is in the program")
		}
	}
	for _, miss := range result.Missing {
		switch {
		case miss.Err != nil && miss.Package == purefnindex.MarkerPackageName:
			if !unreadable[miss.Package] {
				unreadable[miss.Package] = true
				appendDiag(diagnostics.CodeBuiltinPureFnSourceUnreadable, miss.Package, miss.Err.Error())
			}
		case miss.Built || purefnids.Has(miss.ID):
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
