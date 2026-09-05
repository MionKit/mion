// Package routerinit finds the modules of a program that create the mion
// router: every call to `createMionRouter` declared by `@mionjs/router`. Those
// modules are where the batch transport's import lands: the server build
// appends `import 'rtrpc:/batches.generated.js';` to each of them, so the
// batch table and its mappers register before any route runs (ESM imports are
// hoisted, wherever the statement sits).
//
// Detection is checker-based, never textual: the callee's RESOLVED signature
// must be declared by the router package, so an alias
// (`{createMionRouter as create}`), a namespace import (`router.createMionRouter`)
// and a re-export through a local barrel all match, and a same-named function
// declared elsewhere does not.
package routerinit

import (
	"sort"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
)

// RouterModule is the package that declares the router factory. Matched
// against the nearest package.json name of the declaring file, or the
// `declare module '@mionjs/router'` ambient form.
const RouterModule = "@mionjs/router"

// FactoryName is the router factory's identifier, used as a cheap pre-filter
// before the signature is resolved.
const FactoryName = "createMionRouter"

// Site is one module that creates the router.
type Site struct {
	// FilePath is the absolute source path; End is the byte length of its
	// text, the point the batch import is appended at.
	FilePath string
	End      int
}

// FileCache memoizes per-file detection for the lifetime of one Program
// (source files are immutable within a Program). Not safe for concurrent use.
type FileCache struct {
	sites map[string][]Site
}

// NewFileCache returns an empty per-Program memo.
func NewFileCache() *FileCache {
	return &FileCache{sites: map[string][]Site{}}
}

// ExtractFromProgramCached walks every file in `files` and returns one Site
// per module that calls the router factory, in file order. The cache is
// optional (nil degrades to an uncached walk).
func ExtractFromProgramCached(typeChecker *checker.Checker, markerOpts marker.Options, lookup purefunctions.SourceFileLookup, files []string, cache *FileCache) []Site {
	var sites []Site
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
		var fileSites []Site
		if callsFactory(typeChecker, markerOpts, sourceFile) {
			fileSites = []Site{{FilePath: sourceFile.FileName(), End: len(sourceFile.Text())}}
		}
		if cache != nil {
			cache.sites[filePath] = fileSites
		}
		sites = append(sites, fileSites...)
	}
	return sites
}

// Files returns the sorted unique file paths of the sites.
func Files(sites []Site) []string {
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

// callsFactory reports whether the file holds at least one call whose callee
// resolves to the router factory. Declaration files never do.
func callsFactory(typeChecker *checker.Checker, markerOpts marker.Options, sourceFile *ast.SourceFile) bool {
	if sourceFile.IsDeclarationFile {
		return false
	}
	found := false
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if node == nil || found {
			return false
		}
		if node.Kind == ast.KindCallExpression && isFactoryCall(typeChecker, markerOpts, node) {
			found = true
			return false
		}
		node.ForEachChild(visit)
		return false
	}
	sourceFile.AsNode().ForEachChild(visit)
	return found
}

// isFactoryCall is the two-layer check: the callee's symbol, resolved through
// any alias chain (a renamed import, a namespace member, a barrel re-export),
// must be named after the factory; then the resolved signature must be
// declared by the router package, so a same-named local function never
// matches.
func isFactoryCall(typeChecker *checker.Checker, markerOpts marker.Options, call *ast.Node) bool {
	callExpr := call.AsCallExpression()
	if callExpr == nil {
		return false
	}
	nameNode := calleeNameNode(callExpr)
	if nameNode == nil {
		return false
	}
	symbol := typeChecker.GetSymbolAtLocation(nameNode)
	if symbol != nil && symbol.Flags&ast.SymbolFlagsAlias != 0 {
		symbol = typeChecker.GetAliasedSymbol(symbol)
	}
	if symbol == nil || symbol.Name != FactoryName {
		return false
	}
	signature := checker.Checker_getResolvedSignature(typeChecker, call, nil, 0)
	if signature == nil {
		return false
	}
	return marker.DeclaringModuleOfNode(checker.Signature_declaration(signature), markerOpts.FS) == RouterModule
}

// calleeNameNode returns the identifier a call is made through: the callee
// itself for `f(...)`, the member name for `ns.f(...)`; nil for any other
// callee shape.
func calleeNameNode(callExpr *ast.CallExpression) *ast.Node {
	if callExpr == nil || callExpr.Expression == nil {
		return nil
	}
	expr := callExpr.Expression
	switch expr.Kind {
	case ast.KindIdentifier:
		return expr
	case ast.KindPropertyAccessExpression:
		return expr.AsPropertyAccessExpression().Name()
	}
	return nil
}
