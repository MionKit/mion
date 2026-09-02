// Type-dependency recording: which SOURCE FILES declare the types a call site
// reflects.
//
// A rewritten file's correctness depends on types declared in OTHER files, and
// no bundler can see those edges — `import type` is erased, a plain import used
// only in type position is erased, and an ambient `.d.ts` type never had an
// import edge at all. So the host is never told to re-transform a file whose
// injected fn just changed shape, and keeps serving a validator for a type that
// no longer exists.
//
// The recording is per NODE and strictly LOCAL: each interned wire id remembers
// only the files that declare that type itself. Transitivity comes free from
// the per-file scope map (Cache.fileTypeIDs, walked by the resolver's
// recordFileIDs), so a file's full dependency set is the union of the local
// decl files of every id it transitively reaches — see DeclFilesForFiles.
//
// ⚠️ Recording is keyed by wire ID, never by walk, and that is load-bearing.
// assignID short-circuits on a warm pointer/structural cache, so a collector
// hung off the type WALK would report nothing on exactly the incremental-update
// path this exists for — and under-reporting here is the stale-validator bug
// itself, silently. Keying by id makes a cache hit a no-op instead of a gap.
package runtype

import (
	"sort"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
)

// recordDeclFiles notes the source files that declare tsType against its wire
// id. Idempotent and additive: called again for the same id (a structurally
// equal type declared somewhere else) it UNIONS the new files in rather than
// replacing them — two files declaring the same shape collapse to one id, and
// editing either one must invalidate.
func (cache *Cache) recordDeclFiles(id string, tsType *checker.Type) {
	if id == "" || tsType == nil {
		return
	}
	seen := make(map[string]struct{}, 4)
	for _, existing := range cache.declFiles[id] {
		seen[existing] = struct{}{}
	}
	before := len(seen)

	// The alias symbol first: `type Signup = {...}` is what the user edits, and
	// its declaration is the alias, not the anonymous object type it names.
	if alias := checker.Type_alias(tsType); alias != nil {
		addSymbolFiles(seen, alias.Symbol())
	}
	addSymbolFiles(seen, tsType.Symbol())
	// Members too. An interface can be MERGED across files (a `.d.ts`
	// augmentation adding a property), in which case the type's own symbol
	// names only one of them while the added member's declaration names the
	// other. Missing that file is a stale validator, so walk the properties.
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

// addSymbolFiles adds the file of every declaration of symbol. All of them, not
// just the first: declaration merging means one symbol can be declared across
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

// DeclFilesForFiles returns the sorted, deduplicated set of source files that
// declare any type transitively reached from the call sites in `files` — the
// per-file type-dependency set a host declares to its bundler.
//
// Returns nil when nothing is known, which callers MUST read as "unknown", not
// as "no dependencies": every host falls back to its coarse invalidation there.
// Over-invalidating costs milliseconds; under-invalidating ships a validator
// for a type that no longer exists.
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
