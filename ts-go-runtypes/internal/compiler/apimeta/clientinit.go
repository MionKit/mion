package apimeta

import (
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/runtype/typeid"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/textpos"
)

// ClientModule is the package that declares `initClient`.
const ClientModule = "@mionjs/client"

// InitClientName is the client factory a file must call to be put on the lane.
const InitClientName = "initClient"

// InitSite names a file that calls `initClient`; End is the file's byte length, so the lane import lands
// after the last statement and ESM hoisting still runs it first. Twin of routerinit.Site.
type InitSite struct {
	FilePath string
	End      int
}

// InitFileCache memoizes per-file detection for one Program. Not safe for concurrent use.
type InitFileCache struct {
	sites map[string][]InitSite
}

// NewInitFileCache returns an empty per-Program memo.
func NewInitFileCache() *InitFileCache {
	return &InitFileCache{sites: map[string][]InitSite{}}
}

// InitSitesFromProgramCached returns one InitSite per file of `files` that calls `initClient`, in file
// order. The cache is optional (nil degrades to an uncached walk).
func InitSitesFromProgramCached(typeChecker *checker.Checker, markerOpts marker.Options, lookup purefunctions.SourceFileLookup, files []string, cache *InitFileCache) []InitSite {
	var sites []InitSite
	for _, filePath := range files {
		if cache != nil {
			if cached, ok := cache.sites[filePath]; ok {
				sites = append(sites, cached...)
				continue
			}
		}
		sourceFile := lookup.SourceFile(filePath)
		if sourceFile == nil {
			continue
		}
		var fileSites []InitSite
		if callsInitClient(typeChecker, markerOpts, sourceFile) {
			fileSites = []InitSite{{FilePath: sourceFile.FileName(), End: len(sourceFile.Text())}}
		}
		if cache != nil {
			cache.sites[filePath] = fileSites
		}
		sites = append(sites, fileSites...)
	}
	return sites
}

// InitFiles returns the sorted unique file paths of the sites.
func InitFiles(sites []InitSite) []string {
	seen := map[string]bool{}
	var files []string
	for _, site := range sites {
		if site.FilePath == "" || seen[site.FilePath] {
			continue
		}
		seen[site.FilePath] = true
		files = append(files, site.FilePath)
	}
	sort.Strings(files)
	return files
}

// callsInitClient reports whether the file calls the client factory; declaration files never do.
func callsInitClient(typeChecker *checker.Checker, markerOpts marker.Options, sourceFile *ast.SourceFile) bool {
	if sourceFile.IsDeclarationFile {
		return false
	}
	// Text pre-filter like the router twin, as resolving each call costs; a RENAMING barrel is deliberately missed.
	if text := sourceFile.Text(); !strings.Contains(text, InitClientName) && !strings.Contains(text, ClientModule) {
		return false
	}
	found := false
	forEachCall(sourceFile, func(call *ast.Node) bool {
		found = isInitClientCall(typeChecker, markerOpts, call)
		return !found
	})
	return found
}

// isInitClientCall reports whether the call is the client package's own `initClient`.
func isInitClientCall(typeChecker *checker.Checker, markerOpts marker.Options, call *ast.Node) bool {
	return isClientCall(typeChecker, markerOpts, call, InitClientName)
}

// ApiTypeImports reports SRV001 once per value import the `initClient` type argument names, local aliases followed.
func ApiTypeImports(typeChecker *checker.Checker, markerOpts marker.Options, sourceFile *ast.SourceFile, filePath string) []diagnostics.Diagnostic {
	if sourceFile == nil || sourceFile.IsDeclarationFile || !strings.Contains(sourceFile.Text(), InitClientName) {
		return nil
	}
	var found []diagnostics.Diagnostic
	reported := map[*ast.Node]bool{}
	forEachCall(sourceFile, func(call *ast.Node) bool {
		if call.TypeArguments() == nil || !isInitClientCall(typeChecker, markerOpts, call) {
			return true
		}
		for _, typeArgument := range call.TypeArguments() {
			marker.EachWrittenTypeName(typeChecker, typeArgument, func(name *ast.Node) {
				statement, specifier := valueImportOf(typeChecker, name)
				if statement == nil || reported[statement] || ast.GetSourceFileOfNode(statement) != sourceFile {
					return
				}
				reported[statement] = true
				found = append(found, diagnostics.New(diagnostics.CodeServerImportInClient, textpos.NodeSite(filePath, sourceFile, statement), name.Text(), specifier))
			})
		}
		return true
	})
	return found
}

// ApiTypeFromDeclarations reports an API whose routes are declared in a third-party .d.ts: a published API.
// Reading the routes, not the type argument, sees through an alias, an `import()` type or a wrapper.
func ApiTypeFromDeclarations(typeChecker *checker.Checker, apiType *checker.Type) bool {
	return ApiDeclarationFile(typeChecker, apiType) != ""
}

// ApiDeclarationFile is the third-party .d.ts declaring the API's first route; "" when the API is not published.
func ApiDeclarationFile(typeChecker *checker.Checker, apiType *checker.Type) string {
	if apiType == nil {
		return ""
	}
	for _, property := range typeChecker.GetPropertiesOfType(apiType) {
		for _, declaration := range property.Declarations {
			if declaredInPackageTypes(declaration) {
				return ast.GetSourceFileOfNode(declaration).FileName()
			}
		}
	}
	return ""
}

// declaredInPackageTypes reports a declaration in a .d.ts outside the TypeScript libs and @mionjs packages.
func declaredInPackageTypes(declaration *ast.Node) bool {
	sourceFile := ast.GetSourceFileOfNode(declaration)
	if sourceFile == nil || !sourceFile.IsDeclarationFile || typeid.IsDefaultLibFileName(sourceFile.FileName()) {
		return false
	}
	return !strings.HasPrefix(marker.DeclaringModuleOfNode(declaration, nil), "@mionjs/")
}

// valueImportOf returns name's import statement and specifier, or nil for a type-only or non-import binding.
func valueImportOf(typeChecker *checker.Checker, name *ast.Node) (*ast.Node, string) {
	if name == nil || !ast.IsIdentifier(name) {
		return nil, ""
	}
	symbol := typeChecker.GetSymbolAtLocation(name)
	if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias == 0 {
		return nil, ""
	}
	declaration := checker.Checker_getDeclarationOfAliasSymbol(typeChecker, symbol)
	if declaration == nil || ast.IsTypeOnlyImportDeclaration(declaration) {
		return nil, ""
	}
	for node := declaration; node != nil; node = node.Parent {
		switch {
		case ast.IsImportDeclaration(node):
			return node, node.AsImportDeclaration().ModuleSpecifier.Text()
		case ast.IsImportEqualsDeclaration(node):
			reference := node.AsImportEqualsDeclaration().ModuleReference
			if !ast.IsExternalModuleReference(reference) {
				return nil, ""
			}
			return node, reference.AsExternalModuleReference().Expression.Text()
		}
	}
	return nil, ""
}
