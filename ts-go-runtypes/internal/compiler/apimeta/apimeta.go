// Package apimeta extracts the dispatch points of a mion client built with `bundleApi`: calls whose
// resolved signature carries the InjectApiMetadata<Api, Id> marker as trailing parameter. A site says
// only WHAT to bundle; resolving the ids into modules is internal/compiler/resolver/apigen.go, and the
// server half of the lane is internal/compiler/requestbatch.
package apimeta

import (
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/textpos"
)

// RouterModule is the package whose `initRoutes` call roots the API walk in the program `apiTsconfig` names.
const RouterModule = "@mionjs/router"

// InitRoutesName is the router method whose resolved return type is the instantiated PublicApi the walk reads.
const InitRoutesName = "initRoutes"

// Site is one dispatch point the build injects into.
type Site struct {
	// The call expression's span, in byte offsets.
	FilePath string
	Start    int
	End      int
	// InjectPos is the closing `)` offset; InjectPad the `undefined` one per skipped optional slot.
	// ArgsCount is what the author wrote, zero meaning no separator precedes the splice.
	InjectPos     int
	InjectPad     int
	ArgsCount     int
	TrailingComma bool
	// Route / middleware ids the site calls, sorted and unique; several for a batch.
	Ids []string
	// ApiType comes from Checker, the program's checker that materialized it; the resolver walks it or its `apiTsconfig` twin.
	ApiType *checker.Type
	Checker *checker.Checker
	// CalleeName is the dispatch method (`call`, `typeErrors`), for reports.
	CalleeName string

	sourceFile *ast.SourceFile
	callNode   *ast.Node
}

// DiagSite anchors a diagnostic on the call.
func (site Site) DiagSite() diagnostics.Site {
	return textpos.NodeSite(site.FilePath, site.sourceFile, site.callNode)
}

// ModuleBasename is the site module the injection imports under <outDir>/api; two sites calling one route share it.
func (site Site) ModuleBasename() string {
	if len(site.Ids) == 1 {
		return "s/" + EscapeId(site.Ids[0])
	}
	sum := sha256.Sum256([]byte(strings.Join(site.Ids, "\n")))
	return "s/b_" + base64.RawURLEncoding.EncodeToString(sum[:])[:14]
}

// MethodModuleBasename is the per-method module under <outDir>/api that a site module imports.
func MethodModuleBasename(id string) string {
	return "m/" + EscapeId(id)
}

// EscapeId turns a route id into a collision-free, URL-safe module path, the `$XX` entrymodules convention.
func EscapeId(id string) string {
	segments := strings.Split(id, "/")
	for i, segment := range segments {
		var builder strings.Builder
		for j := 0; j < len(segment); j++ {
			ch := segment[j]
			switch {
			case ch >= 'a' && ch <= 'z', ch >= 'A' && ch <= 'Z', ch >= '0' && ch <= '9', ch == '_', ch == '-':
				builder.WriteByte(ch)
			default:
				fmt.Fprintf(&builder, "$%02X", ch)
			}
		}
		segments[i] = builder.String()
	}
	return strings.Join(segments, "/")
}

// FileCache memoizes extraction for ONE Program, where source files are immutable, mirroring requestbatch.FileCache.
// Not safe for concurrent use.
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

// ExtractFromProgramCached returns the branded dispatch sites of `files` in file then source order, plus diagnostics.
// The cache is optional (nil degrades to an uncached walk); mode decides the level a widened id reports at.
func ExtractFromProgramCached(typeChecker *checker.Checker, markerOpts marker.Options, lookup purefunctions.SourceFileLookup, files []string, cache *FileCache, mode constants.BundleApiMode) ([]Site, []diagnostics.Diagnostic) {
	var sites []Site
	var diags []diagnostics.Diagnostic
	for _, filePath := range files {
		fileSites, fileDiags, cached := cache.get(filePath)
		if !cached {
			sourceFile := lookup.SourceFile(filePath)
			if sourceFile == nil {
				continue
			}
			fileSites, fileDiags = extractFromSourceFile(typeChecker, markerOpts, sourceFile, mode)
			cache.put(filePath, fileSites, fileDiags)
		}
		sites = append(sites, fileSites...)
		diags = append(diags, fileDiags...)
	}
	diagnostics.Sort(diags)
	return sites, diags
}

// extractFromSourceFile walks every CallExpression; declaration files hold no calls.
func extractFromSourceFile(typeChecker *checker.Checker, markerOpts marker.Options, sourceFile *ast.SourceFile, mode constants.BundleApiMode) ([]Site, []diagnostics.Diagnostic) {
	if sourceFile.IsDeclarationFile {
		return nil, nil
	}
	// Text pre-filter: a file that spells none of the dispatch method names cannot hold a site.
	if text := sourceFile.Text(); !mentionsDispatch(text) {
		return nil, nil
	}
	var sites []Site
	var diags []diagnostics.Diagnostic
	scope := &fileScope{typeChecker: typeChecker, markerOpts: marker.WithDefaults(markerOpts), sourceFile: sourceFile, mode: mode}
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

func mentionsDispatch(text string) bool {
	for _, name := range dispatchCalleeNames {
		if strings.Contains(text, name) {
			return true
		}
	}
	return false
}

type fileScope struct {
	typeChecker *checker.Checker
	markerOpts  marker.Options
	sourceFile  *ast.SourceFile
	mode        constants.BundleApiMode
}

func (scope *fileScope) diag(code string, node *ast.Node, args ...string) diagnostics.Diagnostic {
	return diagnostics.New(code, textpos.NodeSite(scope.sourceFile.FileName(), scope.sourceFile, node), args...)
}

// extractOne reads a single branded dispatch call into a Site.
func (scope *fileScope) extractOne(call *ast.Node) (*Site, []diagnostics.Diagnostic) {
	callExpr := call.AsCallExpression()
	if callExpr == nil {
		return nil, nil
	}
	matched, paramIndex, paramType := isApiMetadataCall(scope.typeChecker, scope.markerOpts, call)
	if !matched {
		return nil, nil
	}
	var args []*ast.Node
	if callExpr.Arguments != nil {
		args = callExpr.Arguments.Nodes
	}
	// The slot is already written (re-scanned rewritten source, or a wrapper forwarding its own payload): never splice twice.
	if len(args) > paramIndex {
		return nil, nil
	}
	apiType, idType, ok := marker.ApiMetadataArgs(paramType, scope.markerOpts)
	if !ok {
		return nil, nil
	}
	site := &Site{
		FilePath:      scope.sourceFile.FileName(),
		Start:         call.Pos(),
		End:           call.End(),
		InjectPos:     call.End() - 1,
		InjectPad:     paramIndex - len(args),
		ArgsCount:     len(args),
		TrailingComma: callExpr.Arguments != nil && callExpr.Arguments.HasTrailingComma(),
		ApiType:       apiType,
		Checker:       scope.typeChecker,
		CalleeName:    marker.CalleeIdentifierName(callExpr),
		sourceFile:    scope.sourceFile,
		callNode:      call,
	}
	ids, kind := readIds(idType)
	switch kind {
	case idsLiteral:
		site.Ids = ids
	case idsWidened:
		code := diagnostics.CodeApiMetaRouteWidened
		if scope.mode == constants.BundleApiMixed {
			code = diagnostics.CodeApiMetaRouteWidenedMixed
		}
		return nil, []diagnostics.Diagnostic{scope.diag(code, call)}
	default:
		return nil, []diagnostics.Diagnostic{scope.diag(diagnostics.CodeApiMetaUnreadable, call, "the route id type is not a string literal")}
	}
	return site, nil
}

type idsKind int

const (
	idsUnreadable idsKind = iota
	idsLiteral
	idsWidened
)

// readIds classifies the marker's Id type argument; a bare `string` is a widened id.
func readIds(idType *checker.Type) ([]string, idsKind) {
	if idType == nil {
		return nil, idsUnreadable
	}
	flags := checker.Type_flags(idType)
	if flags&checker.TypeFlagsStringLiteral != 0 {
		if value, ok := idType.AsLiteralType().Value().(string); ok {
			return []string{value}, idsLiteral
		}
		return nil, idsUnreadable
	}
	if flags&checker.TypeFlagsUnion != 0 {
		seen := map[string]bool{}
		var ids []string
		for _, member := range idType.Types() {
			memberFlags := checker.Type_flags(member)
			if memberFlags&checker.TypeFlagsStringLiteral == 0 {
				if memberFlags&checker.TypeFlagsString != 0 {
					return nil, idsWidened
				}
				return nil, idsUnreadable
			}
			value, ok := member.AsLiteralType().Value().(string)
			if !ok {
				return nil, idsUnreadable
			}
			if !seen[value] {
				seen[value] = true
				ids = append(ids, value)
			}
		}
		sort.Strings(ids)
		return ids, idsLiteral
	}
	if flags&checker.TypeFlagsString != 0 {
		return nil, idsWidened
	}
	return nil, idsUnreadable
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
