// Package requestbatch reads each InjectBatchId-branded `batch([...])` call: the ORDERED route ids from each item's
// type and the `inputFrom` links, and splices the batch id (or one per route combination) into the empty trailing
// slot. Mapper keys come from the pure-fn extractor, so this report and the pure-fn lane's hash cannot disagree.
// A batch with any diagnostic yields NO site: a half-read plan must not ship under an id the server trusts.
package requestbatch

import (
	"sort"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/jsquote"
	"github.com/mionkit/mion/ts-go-runtypes/internal/textpos"
)

// ClientModule declares the surface a batch is read against, `RouteSubRequest` and the routes proxy's call
// signatures; both gates accept the ambient `declare module '@mionjs/client'` form and the real installed package.
const ClientModule = "@mionjs/client"

// Mapping is one `inputFrom(source, mapper | name)` link: the server feeds route FromId's output through
// the mapper keyed MapperKey into argument ParamIndex of route ToId.
type Mapping struct {
	FromId     string
	ToId       string
	ParamIndex int
	MapperKey  string
}

// Site is one route combination a read `batch([...])` call may run; all share the span, the first holds the splice.
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
	// InjectPos is the closing `)` offset, InjectText the batchIdLiteral to splice, empty on all but a call's first site.
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
// The cache is optional (nil degrades to an uncached walk). Cross-file id collisions (rpc-batch-id-collision) are NOT folded
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
			callSites, callDiags := scope.extractOne(node)
			diags = append(diags, callDiags...)
			sites = append(sites, callSites...)
		}
		node.ForEachChild(visit)
		return false
	}
	sourceFile.AsNode().ForEachChild(visit)
	return sites, diags
}

// maxCombinations caps one call's batches: union items multiply them, each a server table entry plus a client key.
const maxCombinations = 64

// batchItem is one element of the routes argument, the routes it may run, and whether its route call is out of sight.
type batchItem struct {
	node   *ast.Node
	ids    []string
	opaque bool
}

// extractOne reads a single branded batch call into one Site per route combination it may run.
func (fileScope *fileScope) extractOne(call *ast.Node) ([]Site, []diagnostics.Diagnostic) {
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
	items := make([]batchItem, 0, len(elements.Nodes))
	combinationCount := 1
	for _, element := range elements.Nodes {
		ids, reason := fileScope.itemRouteIds(element)
		if reason != "" {
			diags = append(diags, fileScope.diag(diagnostics.CodeBatchElementNotReadable, element, reason))
			continue
		}
		items = append(items, batchItem{node: element, ids: ids})
		if combinationCount <= maxCombinations {
			combinationCount *= len(ids)
		}
	}
	if len(diags) > 0 {
		return nil, diags
	}
	if combinationCount > maxCombinations {
		return nil, []diagnostics.Diagnostic{fileScope.diag(diagnostics.CodeBatchTooManyCombinations, routesArg, strconv.Itoa(maxCombinations))}
	}
	pending, mappingDiags := fileScope.resolveMappings(items)
	if len(mappingDiags) > 0 {
		return nil, mappingDiags
	}
	combinations := routeCombinations(items)
	sites := make([]Site, 0, len(combinations))
	for _, routeIds := range combinations {
		comboDiags := fileScope.duplicateRoutes(items, routeIds)
		var mappings []Mapping
		if len(comboDiags) == 0 {
			mappings, comboDiags = fileScope.placeMappings(pending, routeIds)
		}
		diags = append(diags, comboDiags...)
		sites = append(sites, Site{
			FilePath:   sourceFile.FileName(),
			Start:      call.Pos(),
			End:        call.End(),
			BatchId:    BatchId(routeIds, mappings),
			RouteIds:   routeIds,
			Mappings:   mappings,
			CalleeName: calleeIdentifierName(callExpr),
			sourceFile: sourceFile,
			callNode:   call,
		})
	}
	if len(diags) > 0 {
		// Combinations repeat the same finding at the same place.
		return nil, diagnostics.Dedupe(diags)
	}
	calleeModule := ""
	if signature := checker.Checker_getResolvedSignature(typeChecker, call, nil, 0); signature != nil {
		calleeModule = marker.DeclaringModuleOfNode(checker.Signature_declaration(signature), fileScope.markerOpts.FS)
	}
	for i := range sites {
		sites[i].CalleeModule = calleeModule
	}
	// One splice per call, carried by its first site.
	sites[0].InjectPos = call.End() - 1
	sites[0].InjectText = purefunctions.TrailingArgLiteral(batchIdLiteral(sites, anyOpaque(items)), callExpr.Arguments.HasTrailingComma(), idParamIndex-len(args))
	return sites, nil
}

func anyOpaque(items []batchItem) bool {
	for _, item := range items {
		if item.opaque {
			return true
		}
	}
	return false
}

// routeCombinations lists every ordered route list the items may run, the first item varying slowest.
func routeCombinations(items []batchItem) [][]string {
	combinations := [][]string{{}}
	for _, item := range items {
		next := make([][]string, 0, len(combinations)*len(item.ids))
		for _, prefix := range combinations {
			for _, id := range item.ids {
				next = append(next, append(append(make([]string, 0, len(items)), prefix...), id))
			}
		}
		combinations = next
	}
	return combinations
}

// duplicateRoutes reports a route listed twice: the server keys the request and its results by route id.
func (fileScope *fileScope) duplicateRoutes(items []batchItem, routeIds []string) []diagnostics.Diagnostic {
	var diags []diagnostics.Diagnostic
	seen := map[string]bool{}
	for i, routeId := range routeIds {
		if seen[routeId] {
			diags = append(diags, fileScope.diag(diagnostics.CodeBatchDuplicateRoute, items[i].node, routeId))
			continue
		}
		seen[routeId] = true
	}
	return diags
}

// batchIdLiteral is the id, or `{batchLookupKey: id}` per combination for `batch()` to pick from. An out-of-sight item
// also gets the object: a mapping the build missed finds no key, so `batch()` throws instead of sending a null arg.
func batchIdLiteral(sites []Site, opaque bool) string {
	if len(sites) == 1 && !opaque {
		return jsquote.Single(sites[0].BatchId)
	}
	entries := make([]string, 0, len(sites))
	for _, site := range sites {
		entries = append(entries, jsquote.Single(batchLookupKey(site))+": "+jsquote.Single(site.BatchId))
	}
	return "{" + strings.Join(entries, ", ") + "}"
}

// batchLookupKey must match the key pickBatchId in rpc-client's batch.ts builds from the routes it got.
func batchLookupKey(site Site) string {
	parts := make([]string, len(site.RouteIds))
	for i, routeId := range site.RouteIds {
		var part strings.Builder
		part.WriteString(routeId)
		var mapped []int
		for _, mapping := range site.Mappings {
			if mapping.ToId == routeId {
				mapped = append(mapped, mapping.ParamIndex)
			}
		}
		sort.Ints(mapped)
		for _, paramIndex := range mapped {
			part.WriteString(constants.BatchKeyMappedArgMark + strconv.Itoa(paramIndex))
		}
		parts[i] = part.String()
	}
	return strings.Join(parts, constants.BatchKeyRouteSeparator)
}

// fileScope also memoises, per declaring file, the writes the reassignment guard reads.
type fileScope struct {
	typeChecker     *checker.Checker
	markerOpts      marker.Options
	sourceFile      *ast.SourceFile
	assignedSymbols map[*ast.SourceFile]map[*ast.Symbol][]*ast.Node
	pureFns         *purefunctions.FileCache
}

func newFileScope(typeChecker *checker.Checker, markerOpts marker.Options, sourceFile *ast.SourceFile) *fileScope {
	return &fileScope{
		typeChecker:     typeChecker,
		markerOpts:      marker.WithDefaults(markerOpts),
		sourceFile:      sourceFile,
		assignedSymbols: map[*ast.SourceFile]map[*ast.Symbol][]*ast.Node{},
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
