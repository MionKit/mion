// Package requestbatch extracts `batch([...routes], batchId?)` call sites whose resolved signature carries
// the InjectBatchId marker, reads the ORDERED route ids and the `inputFrom` links between them, and splices
// the deterministic batch id into the call's empty trailing slot. The mapper keys come from the pure-fn
// extractor itself, so this report and the hash the pure-fn lane injects at the same call cannot disagree.
// A batch with any diagnostic yields NO site: a half-read plan must not ship under an id the server trusts.
package requestbatch

import (
	"sort"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/textpos"
)

// ClientModule declares the surface a batch is read against, `RouteSubRequest` and `initClient`; both gates
// accept the ambient `declare module '@mionjs/client'` form and the real installed package.
const ClientModule = "@mionjs/client"

// RoutesProperty holds the routes proxy on the `initClient()` result; a route id is the property chain AFTER it.
const RoutesProperty = "routes"

// Mapping is one `inputFrom(source, mapper | name)` link: the server feeds route FromId's output through
// the mapper keyed MapperKey into argument ParamIndex of route ToId.
type Mapping struct {
	FromId     string
	ToId       string
	ParamIndex int
	MapperKey  string
}

// Site is one successfully read `batch([...])` call.
type Site struct {
	// The call expression's span, in byte offsets.
	FilePath string
	Start    int
	End      int
	// BatchId is the injected id (`b_<hash>` of the ordered RouteIds).
	BatchId string
	// RouteIds are the batched routes in call order.
	RouteIds []string
	// Mappings are the `inputFrom()` links, sorted by (ToId, ParamIndex).
	Mappings []Mapping
	// InjectPos is the closing `)` offset and InjectText the literal to splice; empty InjectText marks
	// a call whose id slot was already written (a pass-through).
	InjectPos  int
	InjectText string
	// CalleeName / CalleeModule attribute the site to the identifier and its declaring package (report-only).
	CalleeName   string
	CalleeModule string

	// sourceFile / callNode locate the call for CheckConflicts; never on the wire.
	sourceFile *ast.SourceFile
	callNode   *ast.Node
}

// FileCache memoizes extraction for ONE Program, where source files are immutable, mirroring
// purefunctions.FileCache. CheckConflicts is set-dependent and re-runs every call. Not safe for concurrent use.
type FileCache struct {
	sites map[string][]Site
	diags map[string][]diagnostics.Diagnostic
}

// NewFileCache returns an empty per-Program extraction memo.
func NewFileCache() *FileCache {
	return &FileCache{sites: map[string][]Site{}, diags: map[string][]diagnostics.Diagnostic{}}
}

func (cache *FileCache) get(filePath string) ([]Site, []diagnostics.Diagnostic, bool) {
	if cache == nil {
		return nil, nil, false
	}
	sites, ok := cache.sites[filePath]
	if !ok {
		return nil, nil, false
	}
	return sites, cache.diags[filePath], true
}

func (cache *FileCache) put(filePath string, sites []Site, diags []diagnostics.Diagnostic) {
	if cache == nil {
		return
	}
	cache.sites[filePath] = sites
	cache.diags[filePath] = diags
}

// ExtractFromProgramCached returns the branded batch sites of `files` in file then source order, plus diagnostics.
// The cache is optional (nil degrades to an uncached walk). Cross-file id collisions (BAT003) are NOT folded
// in here: run CheckConflicts over the whole-program site set.
func ExtractFromProgramCached(typeChecker *checker.Checker, markerOpts marker.Options, lookup purefunctions.SourceFileLookup, files []string, cache *FileCache) ([]Site, []diagnostics.Diagnostic) {
	var sites []Site
	var diags []diagnostics.Diagnostic
	for _, filePath := range files {
		fileSites, fileDiags, cached := cache.get(filePath)
		if !cached {
			sourceFile := lookup.SourceFile(filePath)
			if sourceFile == nil {
				continue
			}
			fileSites, fileDiags = extractFromSourceFile(typeChecker, markerOpts, sourceFile)
			cache.put(filePath, fileSites, fileDiags)
		}
		sites = append(sites, fileSites...)
		diags = append(diags, fileDiags...)
	}
	sortDiagnostics(diags)
	return sites, diags
}

func extractFromSourceFile(typeChecker *checker.Checker, markerOpts marker.Options, sourceFile *ast.SourceFile) ([]Site, []diagnostics.Diagnostic) {
	var sites []Site
	var diags []diagnostics.Diagnostic
	scope := newFileScope(typeChecker, markerOpts, sourceFile)
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		if node.Kind == ast.KindCallExpression {
			site, callDiags := scope.extractOne(node)
			diags = append(diags, callDiags...)
			if site != nil {
				sites = append(sites, *site)
			}
		}
		node.ForEachChild(visit)
		return false
	}
	sourceFile.AsNode().ForEachChild(visit)
	return sites, diags
}

// extractOne reads a single branded batch call into a Site.
func (fileScope *fileScope) extractOne(call *ast.Node) (*Site, []diagnostics.Diagnostic) {
	typeChecker, sourceFile := fileScope.typeChecker, fileScope.sourceFile
	callExpr := call.AsCallExpression()
	if callExpr == nil {
		return nil, nil
	}
	matched, idParamIndex := isBatchCall(typeChecker, fileScope.markerOpts, call)
	if !matched {
		return nil, nil
	}
	var args []*ast.Node
	if callExpr.Arguments != nil {
		args = callExpr.Arguments.Nodes
	}
	// The id slot is already written (a wrapper forwarding its own id, or re-scanned source): never splice twice.
	if len(args) == 0 || len(args) > idParamIndex {
		return nil, nil
	}
	routesArg := unwrap(args[0])
	if routesArg == nil || routesArg.Kind != ast.KindArrayLiteralExpression {
		return nil, []diagnostics.Diagnostic{fileScope.diag(diagnostics.CodeBatchElementNotReadable, args[0], "routes argument is not an inline array literal")}
	}
	elements := routesArg.AsArrayLiteralExpression().Elements
	// `batch([])`: the runtime throws its own empty-routes error before it looks at the id, so nothing to hash.
	if elements == nil || len(elements.Nodes) == 0 {
		return nil, nil
	}
	var diags []diagnostics.Diagnostic
	routeIds := make([]string, 0, len(elements.Nodes))
	routeCalls := make([]*ast.Node, 0, len(elements.Nodes))
	seen := map[string]bool{}
	for _, element := range elements.Nodes {
		routeCall, routeId, reason := fileScope.resolveRouteRef(element, 0)
		if reason != "" {
			diags = append(diags, fileScope.diag(diagnostics.CodeBatchElementNotReadable, element, reason))
			continue
		}
		// The server keys the request and its results by route id, so one batch cannot run a route twice.
		if seen[routeId] {
			diags = append(diags, fileScope.diag(diagnostics.CodeBatchDuplicateRoute, element, routeId))
			continue
		}
		seen[routeId] = true
		routeIds = append(routeIds, routeId)
		routeCalls = append(routeCalls, routeCall)
	}
	if len(diags) > 0 {
		return nil, diags
	}
	mappings, mappingDiags := fileScope.resolveMappings(routeIds, routeCalls)
	if len(mappingDiags) > 0 {
		return nil, mappingDiags
	}
	site := &Site{
		FilePath:   sourceFile.FileName(),
		Start:      call.Pos(),
		End:        call.End(),
		BatchId:    BatchId(routeIds, mappings),
		RouteIds:   routeIds,
		Mappings:   mappings,
		CalleeName: calleeIdentifierName(callExpr),
		sourceFile: sourceFile,
		callNode:   call,
	}
	site.InjectPos = call.End() - 1
	site.InjectText = purefunctions.TrailingArgText(site.BatchId, callExpr.Arguments.HasTrailingComma(), idParamIndex-len(args))
	if signature := checker.Checker_getResolvedSignature(typeChecker, call, nil, 0); signature != nil {
		site.CalleeModule = marker.DeclaringModuleOfNode(checker.Signature_declaration(signature), fileScope.markerOpts.FS)
	}
	return site, nil
}

// fileScope also memoises, per declaring file, the assignment targets the reassignment guard reads.
type fileScope struct {
	typeChecker     *checker.Checker
	markerOpts      marker.Options
	sourceFile      *ast.SourceFile
	assignedSymbols map[*ast.SourceFile]map[*ast.Symbol]bool
	pureFns         *purefunctions.FileCache
}

func newFileScope(typeChecker *checker.Checker, markerOpts marker.Options, sourceFile *ast.SourceFile) *fileScope {
	return &fileScope{
		typeChecker:     typeChecker,
		markerOpts:      marker.WithDefaults(markerOpts),
		sourceFile:      sourceFile,
		assignedSymbols: map[*ast.SourceFile]map[*ast.Symbol]bool{},
		pureFns:         purefunctions.NewFileCache(),
	}
}

func (scope *fileScope) diag(code string, node *ast.Node, args ...string) diagnostics.Diagnostic {
	return diagnostics.New(code, textpos.NodeSite(scope.sourceFile.FileName(), scope.sourceFile, node), args...)
}

// calleeIdentifierName returns the callee identifier text; `ns.f(...)` yields "f", anything else "".
func calleeIdentifierName(callExpr *ast.CallExpression) string {
	if callExpr == nil || callExpr.Expression == nil {
		return ""
	}
	expr := callExpr.Expression
	switch expr.Kind {
	case ast.KindIdentifier:
		return expr.Text()
	case ast.KindPropertyAccessExpression:
		if name := expr.AsPropertyAccessExpression().Name(); name != nil {
			return name.Text()
		}
	}
	return ""
}

func sortDiagnostics(diags []diagnostics.Diagnostic) {
	sort.SliceStable(diags, func(i, j int) bool {
		a, b := diags[i].Site, diags[j].Site
		if a.FilePath != b.FilePath {
			return a.FilePath < b.FilePath
		}
		if a.StartLine != b.StartLine {
			return a.StartLine < b.StartLine
		}
		return a.StartCol < b.StartCol
	})
}
