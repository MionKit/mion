package purefunctions

import (
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-runtypes/internal/compiler/marker"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// KEPT-UNWIRED (owner decision, 2026-07-05): this validation API has no
// production caller yet — the resolver wiring is the planned follow-up for
// the orphaned build-time PFE9012 "missing pure-fn dep" diagnostic, surfaced
// through the lint plugin. Do NOT delete as dead code.
//
// Index is a lookup-only view of an extraction result. The resolver
// builds one after ExtractFromProgramCached and reuses it for dep validation
// — every check is O(1). Carries:
//
//   - byKey: every successful registration the extractor saw, keyed by
//     "<namespace>::<functionName>". Same map shape consumers see in
//     virtual:runtypes-pure-fns.
//   - scanned: every absolute filePath that has already been parsed
//     for registerPureFnFactory call sites. Gates the lazy expansion
//     in ValidatePureFnDependencies — a file in this set never gets
//     re-parsed.
//
// Not safe for concurrent use; build per-dump.
type Index struct {
	byKey   map[string]Entry
	scanned map[string]bool
}

// NewIndex builds the lookup view from an extraction result. `files`
// is the slice ExtractFromProgramCached was called with — every file in it
// counts as scanned even when it contributed zero registrations, so
// later lazy expansion knows not to re-walk it.
func NewIndex(entries []Entry, files []string) *Index {
	idx := &Index{
		byKey:   make(map[string]Entry, len(entries)),
		scanned: make(map[string]bool, len(files)),
	}
	for _, entry := range entries {
		idx.byKey[entry.Key()] = entry
	}
	for _, file := range files {
		idx.scanned[file] = true
	}
	return idx
}

// Get returns the Entry registered under "<namespace>::<functionName>"
// if any, plus an ok flag.
func (idx *Index) Get(key string) (Entry, bool) {
	entry, ok := idx.byKey[key]
	return entry, ok
}

// Scanned reports whether filePath has already been walked. A true
// result means lazy expansion won't re-parse it.
func (idx *Index) Scanned(filePath string) bool {
	return idx.scanned[filePath]
}

// merge folds a single-file extraction result into the index. Dedup
// semantics mirror ExtractFromProgram: first occurrence wins. A
// mismatched bodyHash on the same key is silently shadowed here — the
// extractor's main pass surfaces PFE9004 collisions; the validation
// step intentionally doesn't double-author them for lazy-expanded
// files (the alternative would generate noise during incremental
// build flows).
func (idx *Index) merge(entries []Entry, filePath string) {
	for _, entry := range entries {
		if _, dup := idx.byKey[entry.Key()]; dup {
			continue
		}
		idx.byKey[entry.Key()] = entry
	}
	idx.scanned[filePath] = true
}

// builtinPureFnNamespaces are the pure-fn namespaces @mionjs/run-types owns and
// registers itself at runtime, guaranteed present whenever the package is
// imported:
//
//   - "rt"        — the core built-ins (newRunTypeErr, getUnknownKeysFromArray,
//     hasUnknownKeysFromArray, countEnumKeys), delivered on demand from the
//     built-in table and registered via each fn entry's deps thunk (the
//     package entry's side-effect import of runtypes/pure-fns-utils.ts is the
//     hollowed runtime fallback).
//   - "rtFormats" — every format validator (isUUID, isDateString_*, …),
//     registered when that format's runtime module loads.
//
// A reference to a fn in one of these namespaces is ALWAYS satisfiable at
// runtime, so it must never surface as a "missing registration" (PFE9012). The
// resolver's own emitters (validationErrors, unknown-keys, formats) are the only
// thing that reaches these fns, and they only ever reference fns the runtime
// actually ships — so exempting the whole namespace is faithful to runtime AND
// self-maintaining (a new built-in needs no list update here). Only user-owned
// namespaces are cross-checked against the program's registrations. This is the
// principled replacement for the old whole-program "any registration present?"
// guard, which a consumer's own registerPureFnFactory defeated — false-flagging
// every built-in.
var builtinPureFnNamespaces = map[string]bool{
	"rt":        true,
	"rtFormats": true,
}

// IsBuiltinPureFnNamespace reports whether ns is a @mionjs/run-types-owned
// pure-fn namespace whose registrations are guaranteed at runtime (see
// builtinPureFnNamespaces). PFE9012 never fires for these.
func IsBuiltinPureFnNamespace(ns string) bool {
	return builtinPureFnNamespaces[ns]
}

// ValidatePureFnDependencies cross-checks every dep recorded by RT
// walkers against idx. For deps whose registration is already in the
// index the check is an O(1) map lookup. For deps whose filePath was
// NOT part of the original program-wide scan, the file is parsed once
// (via lookup) and merged into idx — subsequent deps against the same
// path are then O(1). Already-scanned files are never re-parsed.
//
// Deps in a built-in namespace (rt::, rtFormats::) are skipped: @mionjs/run-types
// registers them itself at runtime, but its source is a .d.ts in a published-
// package consumer's program, so cross-checking them false-positives (the bug
// this exemption fixes). Only user-owned namespaces are validated.
//
// Returns one PFE9012 diagnostic per unique missing key. Repeated
// references to the same missing key collapse to a single diagnostic
// — the RT compiler may register the same dep from multiple emitters
// and we don't want N copies of the same complaint in the editor's
// Problems panel.
//
// idx is mutated in-place when lazy expansion adds entries — the
// caller can keep using it afterwards (e.g. to inspect the now-larger
// scanned-files set).
func ValidatePureFnDependencies(typeChecker *checker.Checker, markerOpts marker.Options, deps []protocol.PureFnDep, idx *Index, lookup SourceFileLookup) []diagnostics.Diagnostic {
	if idx == nil {
		return nil
	}
	var diags []diagnostics.Diagnostic
	seenMisses := make(map[string]bool, len(deps))
	for _, dep := range deps {
		// Built-in namespaces (rt / rtFormats) are validated against the generated
		// built-in table at SERVE time now, not here: serveBuiltinPureFns delivers
		// each demanded built-in from builtinpurefns and raises PFE9012 for one the
		// table lacks (the exemption "flip" — no longer taken on faith). That check
		// is graph-based, so it also covers warm disk-cache hits this sink-based
		// pass never sees. This pass therefore skips built-ins (they'd otherwise
		// false-positive on a .d.ts-resolved core, whose registrations aren't in
		// the program) and validates only USER-owned pure-fn deps. NOTE: purefunctions
		// cannot import builtinpurefns (that package imports THIS one), which is the
		// other reason the table check lives in the resolver, not here.
		if IsBuiltinPureFnNamespace(dep.Namespace) {
			continue
		}
		key := dep.Namespace + "::" + dep.FunctionName
		if _, found := idx.Get(key); found {
			continue
		}
		// Maybe the dep references a file the main scan didn't cover.
		// Parse it once, merge, then re-check.
		if dep.FilePath != "" && !idx.Scanned(dep.FilePath) && lookup != nil {
			entries, _ := extractFromFile(typeChecker, markerOpts, lookup, dep.FilePath)
			idx.merge(entries, dep.FilePath)
			if _, found := idx.Get(key); found {
				continue
			}
		}
		if seenMisses[key] {
			continue
		}
		seenMisses[key] = true
		// Args: [key, expectedNamespace, expectedFunctionName, expectedFilePath].
		// The catalog template renders all four into the headline/detail.
		// File path may be empty when the dep was collected purely from a
		// RT walk with no source-level provenance.
		args := []string{key, dep.Namespace, dep.FunctionName, dep.FilePath}
		// No Site — the dep was collected from a RT walk, not a TS
		// source position. Future enhancement: have the rt walker
		// thread the source position of the utl.getPureFn(...) call
		// through to here.
		diags = append(diags, diagnostics.New(
			diagnostics.CodeMissingPureFnDep,
			diagnostics.Site{},
			args...,
		))
	}
	return diags
}
