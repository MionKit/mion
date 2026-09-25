package apimeta

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
)

// ClientMiddlewareName is the client type every `middlewares.x` read has; its second type argument is the middleware id.
const ClientMiddlewareName = "ClientMiddleware"

// middlewaresText pre-filters files: a middleware is reached through the object `initClient` names `middlewares`.
// A file that only receives one as a parameter needs no look, the file that read it already counted.
const middlewaresText = "middlewares"

// MiddlewareReadsCache memoizes per-file middleware reads for one Program. Not safe for concurrent use.
type MiddlewareReadsCache struct {
	reads map[string][]string
}

// NewMiddlewareReadsCache returns an empty per-Program memo.
func NewMiddlewareReadsCache() *MiddlewareReadsCache {
	return &MiddlewareReadsCache{reads: map[string][]string{}}
}

// MiddlewareReadsFromProgramCached returns the ids of every client middleware the files read, set up by a hook
// or handed to an installer alike. The cache is optional (nil degrades to an uncached walk).
func MiddlewareReadsFromProgramCached(typeChecker *checker.Checker, markerOpts marker.Options, lookup purefunctions.SourceFileLookup, files []string, cache *MiddlewareReadsCache) map[string]bool {
	out := map[string]bool{}
	for _, filePath := range files {
		fileReads, ok := cache.get(filePath)
		if !ok {
			if sourceFile := lookup.SourceFile(filePath); sourceFile != nil {
				fileReads = middlewareReadsInFile(typeChecker, markerOpts, sourceFile)
			}
			cache.set(filePath, fileReads)
		}
		for _, id := range fileReads {
			out[id] = true
		}
	}
	return out
}

func (cache *MiddlewareReadsCache) get(filePath string) ([]string, bool) {
	if cache == nil {
		return nil, false
	}
	reads, ok := cache.reads[filePath]
	return reads, ok
}

func (cache *MiddlewareReadsCache) set(filePath string, reads []string) {
	if cache != nil {
		cache.reads[filePath] = reads
	}
}

// middlewareReadsInFile checks every member access and destructured name, the ways code reaches `middlewares.x`.
func middlewareReadsInFile(typeChecker *checker.Checker, markerOpts marker.Options, sourceFile *ast.SourceFile) []string {
	if sourceFile.IsDeclarationFile || !strings.Contains(sourceFile.Text(), middlewaresText) {
		return nil
	}
	seen := map[string]bool{}
	var ids []string
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		var target *ast.Node
		switch node.Kind {
		case ast.KindPropertyAccessExpression, ast.KindElementAccessExpression:
			target = node
		case ast.KindBindingElement:
			// a nested pattern is not a middleware yet, its own elements are visited next
			if name := node.Name(); name != nil && name.Kind == ast.KindIdentifier {
				target = name
			}
		}
		if target != nil {
			if id, ok := clientMiddlewareId(typeChecker, markerOpts, typeChecker.GetTypeAtLocation(target)); ok && !seen[id] {
				seen[id] = true
				ids = append(ids, id)
			}
		}
		node.ForEachChild(visit)
		return false
	}
	sourceFile.AsNode().ForEachChild(visit)
	return ids
}

// clientMiddlewareId reads the id literal off a `ClientMiddleware<H, Id>` declared by the client package.
func clientMiddlewareId(typeChecker *checker.Checker, markerOpts marker.Options, nodeType *checker.Type) (string, bool) {
	if nodeType == nil || nodeType.ObjectFlags()&checker.ObjectFlagsReference == 0 {
		return "", false
	}
	symbol := nodeType.Symbol()
	if symbol == nil || symbol.Name != ClientMiddlewareName || len(symbol.Declarations) == 0 {
		return "", false
	}
	if marker.DeclaringModuleOfNode(symbol.Declarations[0], markerOpts.FS) != ClientModule {
		return "", false
	}
	arguments := typeChecker.GetTypeArguments(nodeType)
	if len(arguments) < 2 {
		return "", false
	}
	ids, kind := readIds(arguments[1])
	if kind != idsLiteral || len(ids) != 1 {
		return "", false
	}
	return ids[0], true
}
