package purefunctions

import (
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/jsquote"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// CollectEntries builds one entrymodules.Entry per extracted pure fn. The `code` and
// `createPureFn` slots vary by emit mode, as typefunctions/module.go's codeArg / createRTFnArg do:
//   - EmitCode (default): the `code` STRING, createPureFn dropped. The runtime rebuilds the
//     factory from `code` + `paramNames` via `new Function(...paramNames, code)` on first lookup.
//   - EmitFunctions: `code` dropped, the live `function(<params>){<code>}` literal shipped.
//   - EmitBoth: the body twice, for a runtime that disallows `new Function` (CSP) yet reads `.code`.
//
// The per-entry module is the canonical runtime home of every pure-fn body: the registration call
// site is separately rewritten so its factory argument becomes the imported entry binding (see
// Replacements), and the runtime registers the tuple there.
//
// Deps carry the entry's pure-fn dependencies, so importing one pure fn transitively loads the
// pure fns it calls.
func CollectEntries(entries []Entry, emitMode constants.EmitMode) entrymodules.Graph {
	graph := make(entrymodules.Graph, len(entries))
	for _, entry := range entries {
		// An empty string is a JS array hole: a trailing one is trimmed, while an interior
		// one (functions mode's dropped `code`) stays, a later slot being populated.
		codeArg := ""
		if emitMode.EmitsCode() {
			codeArg = jsquote.Single(entry.Code)
		}
		createPureFnArg := ""
		if emitMode.EmitsFactory() {
			createPureFnArg = createPureFnJS(entry.Code, entry.ParamNames)
		}
		args := trimTrailingHoles([]string{
			jsquote.Single(entry.Key()),
			paramNamesJS(entry.ParamNames),
			codeArg,
			depKeysJS(entry.PureFnDependencies),
			createPureFnArg,
		})
		// Pure-fn deps are SOFT: a dep outside the collected set stubs out
		// instead of cascading — its real registration happens at its own
		// registerPureFnFactory call site when the defining module loads.
		graph.Add(&entrymodules.Entry{
			Key:      entry.Key(),
			Kind:     entrymodules.KindPureFn,
			ArgsText: strings.Join(args, ","),
			SoftDeps: append([]string(nil), entry.PureFnDependencies...),
		})
	}
	return graph
}

// trimTrailingHoles shortens the tuple instead of ending it on a hole; interior holes are kept.
func trimTrailingHoles(args []string) []string {
	end := len(args)
	for end > 0 && args[end-1] == "" {
		end--
	}
	return args[:end]
}

// Report builds the pure-fn build report host tooling consumes to relocate pure-fn bodies across
// bundles (mion's cross-bundle transport). Each record is SELF-CONTAINED, Code and ParamNames
// inline, so a consumer never reads the generated module files and the report shape is identical
// across every moduleMode. `Module` carries the per-record layout the way Replacements picks its
// import target, and Code honors emitMode exactly as CollectEntries does. Entries arrive deduped
// and sorted by Key, so the report is deterministic.
func Report(entries []Entry, emitMode constants.EmitMode, bundled bool) []protocol.PureFnSite {
	out := make([]protocol.PureFnSite, 0, len(entries))
	for _, entry := range entries {
		module := entrymodules.ModuleName(entry.Key(), entrymodules.KindPureFn)
		if bundled {
			module = constants.PureFnModuleDir
		}
		code := ""
		if emitMode.EmitsCode() {
			code = entry.Code
		}
		out = append(out, protocol.PureFnSite{
			File:               entry.FilePath,
			Start:              entry.FactoryArgStart,
			End:                entry.FactoryArgEnd,
			Key:                entry.Key(),
			BindingName:        entry.BindingName,
			CalleeName:         entry.CalleeName,
			CalleeModule:       entry.CalleeModule,
			Form:               entry.Form,
			Module:             module,
			ParamNames:         entry.ParamNames,
			Code:               code,
			PureFnDependencies: entry.PureFnDependencies,
		})
	}
	return out
}

// Replacements builds the byte-range rewrites every extracted registration needs: the factory
// argument is swapped for the pure fn's entry-module import binding, and the empty trailing `id?`
// slot is filled with the computed id. The Go transform applies these during OpTransform (adding
// the matching import via ImportFrom), so the runtime registers the tuple at the call site while
// the body lives only in the entry module.
//
// An Entry without FactoryArgStart/End (a synthetic one built by a test) is skipped: only a real
// extraction result carries the offsets to rewrite source with. Text doubles as the export name in
// BOTH layouts (see entrymodules.ExportName); bundled selects allSingle module mode, where
// ImportFrom targets the `pf` bundle instead of the per-entry module.
func Replacements(entries []Entry, bundled bool) []protocol.Replacement {
	var out []protocol.Replacement
	for _, entry := range entries {
		if entry.FilePath == "" || entry.FactoryArgEnd <= entry.FactoryArgStart {
			continue
		}
		basename := entrymodules.ModuleName(entry.Key(), entrymodules.KindPureFn)
		replacement := protocol.Replacement{
			File:       entry.FilePath,
			Start:      entry.FactoryArgStart,
			End:        entry.FactoryArgEnd,
			Text:       entrymodules.BindingName(basename),
			ImportFrom: entrymodules.ImportSpecifier(basename),
		}
		if bundled {
			replacement.ImportFrom = entrymodules.ImportSpecifier(constants.PureFnModuleDir)
		}
		out = append(out, replacement)
		// A point insertion at the call's closing `)`. No ImportFrom: the injected value is
		// a plain string literal, not an entry binding.
		if entry.IDInjectText != "" {
			out = append(out, protocol.Replacement{
				File:  entry.FilePath,
				Start: entry.IDInjectPos,
				End:   entry.IDInjectPos,
				Text:  entry.IDInjectText,
			})
		}
	}
	return out
}

// createPureFnJS templates the type-stripped factory body into a `function(<params>){<code>}`
// expression using the AUTHOR's parameter names: the body references the factory's own rtUtils
// binding (`jUtils.getPureFn(…)`), so the literal must redeclare exactly those params for the
// closure to resolve. The runtime invokes it with the rtUtils singleton as the single argument.
func createPureFnJS(code string, paramNames []string) string {
	params := strings.Join(paramNames, ",")
	var b strings.Builder
	b.Grow(len(code) + len(params) + 20)
	b.WriteString("function(")
	b.WriteString(params)
	b.WriteString("){")
	b.WriteString(code)
	b.WriteByte('}')
	return b.String()
}

// depKeysJS renders a JS array literal of quoted dep keys; an empty slice becomes `[]`, so a
// consumer can always treat the field as iterable.
func depKeysJS(keys []string) string {
	if len(keys) == 0 {
		return "[]"
	}
	parts := make([]string, len(keys))
	for i, key := range keys {
		parts[i] = jsquote.Single(key)
	}
	return "[" + strings.Join(parts, ",") + "]"
}

func paramNamesJS(names []string) string {
	if len(names) == 0 {
		return "[]"
	}
	parts := make([]string, len(names))
	for i, name := range names {
		parts[i] = jsquote.Single(name)
	}
	return "[" + strings.Join(parts, ",") + "]"
}
