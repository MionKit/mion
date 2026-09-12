package apimeta

import (
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
)

// ClientModule is the package that declares `initClient`.
const ClientModule = "@mionjs/client"

// InitClientName is the client factory a file must call to be put on the lane.
const InitClientName = "initClient"

// InitSite names a file that calls `initClient`, and where the lane import is
// appended: End is the file's byte length, so the import lands after the last
// statement. ESM hoists it, so it still runs before the module body calls
// `initClient`. Twin of routerinit.Site, which does the same for the batch
// table a server registers.
type InitSite struct {
	FilePath string
	End      int
}

// InitFileCache memoizes per-file detection for the lifetime of one Program.
// Not safe for concurrent use.
type InitFileCache struct {
	sites map[string][]InitSite
}

// NewInitFileCache returns an empty per-Program memo.
func NewInitFileCache() *InitFileCache {
	return &InitFileCache{sites: map[string][]InitSite{}}
}

// InitSitesFromProgramCached returns one InitSite per file in `files` that
// calls `initClient`, in file order. The cache is optional (nil degrades to an
// uncached walk).
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

// callsInitClient reports whether the file holds at least one call that
// resolves to the client factory. Declaration files never do.
func callsInitClient(typeChecker *checker.Checker, markerOpts marker.Options, sourceFile *ast.SourceFile) bool {
	if sourceFile.IsDeclarationFile {
		return false
	}
	// Text pre-filter, like the router twin: resolving a signature per call
	// across the whole program is the cost, and a file reaching the factory
	// through a barrel that RENAMES it is deliberately not detected.
	if text := sourceFile.Text(); !strings.Contains(text, InitClientName) && !strings.Contains(text, ClientModule) {
		return false
	}
	found := false
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if node == nil || found {
			return false
		}
		if node.Kind == ast.KindCallExpression && isInitClientCall(typeChecker, markerOpts, node) {
			found = true
			return false
		}
		node.ForEachChild(visit)
		return false
	}
	sourceFile.AsNode().ForEachChild(visit)
	return found
}

// isInitClientCall checks the callee's name and then that the resolved
// signature is declared by the client package, so a same-named local function
// never matches.
func isInitClientCall(typeChecker *checker.Checker, markerOpts marker.Options, call *ast.Node) bool {
	callExpr := call.AsCallExpression()
	if callExpr == nil || marker.CalleeIdentifierName(callExpr) != InitClientName {
		return false
	}
	signature := checker.Checker_getResolvedSignature(typeChecker, call, nil, 0)
	if signature == nil {
		return false
	}
	return marker.DeclaringModuleOfNode(checker.Signature_declaration(signature), markerOpts.FS) == ClientModule
}
