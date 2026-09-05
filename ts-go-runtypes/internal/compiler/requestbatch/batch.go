// Package requestbatch extracts request-batch call sites, the first marker lane
// that serves mion's RPC layer rather than RunTypes itself: a `batch([...routes],
// batchId?)` call whose resolved signature carries the InjectBatchId marker
// (mion's `@mionjs/client` batch, or a wrapper forwarding the brand). For every
// site the build reads the ORDERED route ids the array literal names, the
// `inputFrom(source, mapper | name)` links between them, computes the
// deterministic batch id, and splices that id into the call's empty trailing
// slot exactly the way the anonymous pure-fn lane splices its `rt::<hash>`.
//
// The lane is modelled on internal/cachegen/purefunctions (discovery by brand
// behind a cheap syntactic pre-filter, a per-Program FileCache, wire-shaped
// Replacements + a structured report) and imports it one way: the mapper
// keys a batch records come from the pure-fn extractor itself, so the report
// and the hash the pure-fn lane injects at the same call can never disagree.
//
// Everything the build cannot read, or the server would refuse, is a
// diagnostic (BAT001 element, BAT002 source order, BAT004 mapper, BAT005
// duplicate route, BAT006 mapping position), and a batch with any diagnostic
// yields NO site: a half-read plan must not ship under an id the server would
// trust.
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

// ClientModule is the package that declares the client surface a batch is
// read against: `RouteSubRequest` (what a route call returns) and
// `initClient` (what produces the routes proxy). Both gates accept the ambient
// `declare module '@mionjs/client'` form and the real installed package.
const ClientModule = "@mionjs/client"

// RoutesProperty is the property of the `initClient()` result that holds the
// routes proxy; every route id is the property chain AFTER it.
const RoutesProperty = "routes"

// Mapping is one `inputFrom(source, mapper | name)` link inside a batch: the
// server feeds the output of route FromId through the mapper keyed MapperKey
// into argument ParamIndex of route ToId.
type Mapping struct {
	FromId     string
	ToId       string
	ParamIndex int
	MapperKey  string
}

// Site is one successfully read `batch([...])` call.
type Site struct {
	// FilePath / Start / End are the call expression's span (byte offsets).
	FilePath string
	Start    int
	End      int
	// BatchId is the injected id (`b_<hash>` of the ordered RouteIds).
	BatchId string
	// RouteIds are the batched routes in call order (`users/getById`).
	RouteIds []string
	// Mappings are the `inputFrom()` links, sorted by (ToId, ParamIndex).
	Mappings []Mapping
	// InjectPos / InjectText drive the id injection: the byte offset of the
	// call's closing `)` and the literal to splice there. Empty InjectText marks
	// a call whose id slot was already written (a pass-through).
	InjectPos  int
	InjectText string
	// CalleeName / CalleeModule attribute the site to the identifier it invoked
	// and the package that declares it (report-only).
	CalleeName   string
	CalleeModule string

	// sourceFile / callNode locate the call for the cross-file conflict
	// diagnostics (CheckConflicts); never on the wire.
	sourceFile *ast.SourceFile
	callNode   *ast.Node
}

// FileCache memoizes per-file extraction results for the lifetime of ONE
// Program, mirroring purefunctions.FileCache: source files are immutable
// within a Program, so a file's sites/diagnostics never change between
// requests. The cross-file conflict check (CheckConflicts) is set-dependent
// and re-runs on every call. Not safe for concurrent use.
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

// ExtractFromProgramCached walks every file in `files`, finds the branded
// batch calls, and returns their sites plus the per-site diagnostics.
// Sites keep file order then source order; diagnostics are sorted by site.
// The per-Program FileCache is optional (nil degrades to an uncached walk).
// Cross-file id collisions (BAT003) are NOT folded in here: run
// CheckConflicts over the whole-program site set.
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

// extractFromSourceFile is the per-file extraction core: walk every
// CallExpression and dispatch to extractOne.
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

// extractOne reads a single branded batch call into a Site. Returns (nil,
// diags) when the call is not a batch, is a pass-through (id slot already
// written, or an empty route list the runtime rejects itself), or when any
// element / mapping could not be read (the diagnostics say which).
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
	// The id slot is already written (a wrapper forwarding its own id, or
	// re-scanned rewritten source): a pass-through, never a second splice.
	if len(args) == 0 || len(args) > idParamIndex {
		return nil, nil
	}
	routesArg := unwrap(args[0])
	if routesArg == nil || routesArg.Kind != ast.KindArrayLiteralExpression {
		return nil, []diagnostics.Diagnostic{fileScope.diag(diagnostics.CodeBatchElementNotReadable, args[0], "routes argument is not an inline array literal")}
	}
	elements := routesArg.AsArrayLiteralExpression().Elements
	// `batch([])`: the runtime throws its own empty-routes error before it ever
	// looks at the id, so there is nothing to plan and nothing to hash.
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
		// The server keys the request and its results by route id, so one
		// batch cannot run the same route twice: the second element is the error.
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

// fileScope bundles the per-file handles every resolver step needs, plus the
// per-declaring-file memo of assignment targets the reassignment guard reads.
type fileScope struct {
	typeChecker     *checker.Checker
	markerOpts      marker.Options
	sourceFile      *ast.SourceFile
	assignedSymbols map[*ast.SourceFile]map[*ast.Symbol]bool
}

func newFileScope(typeChecker *checker.Checker, markerOpts marker.Options, sourceFile *ast.SourceFile) *fileScope {
	return &fileScope{typeChecker: typeChecker, markerOpts: marker.WithDefaults(markerOpts), sourceFile: sourceFile, assignedSymbols: map[*ast.SourceFile]map[*ast.Symbol]bool{}}
}

func (scope *fileScope) diag(code string, node *ast.Node, args ...string) diagnostics.Diagnostic {
	return diagnostics.New(code, textpos.NodeSite(scope.sourceFile.FileName(), scope.sourceFile, node), args...)
}

// calleeIdentifierName returns the callee identifier text: `f(...)` yields
// "f", `ns.f(...)` yields "f"; anything else yields "".
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
