// Type-dependency recording: which SOURCE FILES declare the types a call site reflects. No bundler can see
// those edges (`import type` is erased, an ambient `.d.ts` type never had an import edge at all), so without
// this the host is never told to re-transform a file whose injected fn changed shape and keeps serving a
// validator for a type that no longer exists. Recording is per NODE and strictly LOCAL; transitivity comes
// from the per-file scope map (Cache.fileTypeIDs), see DeclFilesForFiles.
// ⚠️ Keyed by wire ID, never by walk: assignID short-circuits on a warm pointer/structural cache, so a
// collector hung off the type WALK would report nothing on exactly the incremental-update path this exists for.
package runtype

import (
	"sort"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
)

// recordDeclFiles notes the source files that declare tsType against its wire id. Idempotent and additive: a
// second call for the same id UNIONS the new files in, two files declaring one shape collapsing to one id
// while editing either must invalidate.
func (cache *Cache) recordDeclFiles(id string, tsType *checker.Type) {
	if id == "" || tsType == nil {
		return
	}
	seen := make(map[string]struct{}, 4)
	for _, existing := range cache.declFiles[id] {
		seen[existing] = struct{}{}
	}
	before := len(seen)

	// The alias symbol first: `type Signup = {...}` is what the user edits, not the object type it names.
	if alias := checker.Type_alias(tsType); alias != nil {
		addSymbolFiles(seen, alias.Symbol())
	}
	addSymbolFiles(seen, tsType.Symbol())
	// Members too: an interface can be MERGED across files (a `.d.ts` augmentation adding a property), where
	// the type's own symbol names one file and the added member's declaration the other, and missing that
	// file is a stale validator.
	if cache.typeChecker != nil {
		for _, property := range cache.typeChecker.GetPropertiesOfType(tsType) {
			addSymbolFiles(seen, property)
		}
	}

	if len(seen) == before {
		return
	}
	files := make([]string, 0, len(seen))
	for file := range seen {
		files = append(files, file)
	}
	sort.Strings(files)
	if cache.declFiles == nil {
		cache.declFiles = make(map[string][]string)
	}
	cache.declFiles[id] = files
}

// addSymbolFiles adds the file of EVERY declaration of symbol: declaration merging spreads one symbol across
// several files and each is a real dependency.
func addSymbolFiles(into map[string]struct{}, symbol *ast.Symbol) {
	if symbol == nil {
		return
	}
	for _, declaration := range symbol.Declarations {
		sourceFile := ast.GetSourceFileOfNode(declaration)
		if sourceFile == nil {
			continue
		}
		if name := sourceFile.FileName(); name != "" {
			into[name] = struct{}{}
		}
	}
}

// DeclFilesForFiles returns the sorted, deduplicated source files declaring any type transitively reached from
// the call sites in `files`, the type-dependency set a host declares to its bundler. nil means "unknown", NOT
// "no dependencies": callers MUST fall back to coarse invalidation, since over-invalidating costs milliseconds
// and under-invalidating ships a validator for a type that no longer exists.
func (cache *Cache) DeclFilesForFiles(files []string) []string {
	ids := cache.IDsForUnion(files)
	if len(ids) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		for _, file := range cache.declFiles[id] {
			seen[file] = struct{}{}
		}
	}
	if len(seen) == 0 {
		return nil
	}
	out := make([]string, 0, len(seen))
	for file := range seen {
		out = append(out, file)
	}
	sort.Strings(out)
	return out
}
