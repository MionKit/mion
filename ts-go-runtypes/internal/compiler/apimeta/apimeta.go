// Package apimeta extracts the dispatch points of a mion client built with
// `bundleApi`, the client half of the RPC layer's build-time lanes (the batch
// lane, internal/compiler/requestbatch, is the server half). A dispatch point
// is a call whose resolved signature carries the InjectApiMetadata<Api, Id>
// marker as its trailing parameter: `routes.users.getById(1).call()`,
// `middleFns.auth(h).prefill()`, `.typeErrors()`, a batch's `.call()`, or,
// without an Id, `initClient()` itself (the anchor the mode literal lands in).
//
// The site says WHAT to bundle: the route ids the marker's Id type argument
// names (a literal, a union of literals for a batch) and the API type they are
// declared in. Resolving those ids into methods, ids and compiled functions is
// the resolver's job (internal/compiler/resolver/apigen.go): it walks the API
// type (tree.go, in this program or in the one `apiTsconfig` names), selects
// each site's route plus the middleFns in its chain, and emits one module per
// method and one per site shape under `<outDir>/api/`. The transform splices
// an import of the site module into the call's empty trailing slot, the way
// every marker lane splices its binding.
//
// Like requestbatch, the lane is modelled on internal/cachegen/purefunctions:
// discovery by brand behind a cheap syntactic pre-filter, a per-Program
// FileCache, wire-shaped Replacements. A site the build cannot read is a
// diagnostic (MET001 API type, MET002 unknown id, MET003 / MET004 widened id)
// and yields no injection.
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

// ClientModule is the package that declares the client surface: the dispatch
// methods and `initClient`.
const ClientModule = "@mionjs/client"

// RouterModule is the package that declares the router, whose `initRoutes`
// call roots the API walk in a program named by `apiTsconfig`.
const RouterModule = "@mionjs/router"

// InitRoutesName is the router method that registers the routes; its resolved
// return type is the instantiated PublicApi the walk reads.
const InitRoutesName = "initRoutes"

// Site is one dispatch point (or the initClient anchor) the build injects into.
type Site struct {
	// FilePath / Start / End are the call expression's span (byte offsets).
	FilePath string
	Start    int
	End      int
	// InjectPos is the byte offset of the call's closing `)`; InjectPad the
	// number of `undefined` the splice pads with (skipped optional slots);
	// ArgsCount the arguments the author wrote (zero means no separator
	// precedes the splice); TrailingComma whether that list already ends in a
	// comma.
	InjectPos     int
	InjectPad     int
	ArgsCount     int
	TrailingComma bool
	// Anchor marks the `initClient` site: the mode literal goes here, no ids.
	Anchor bool
	// Ids are the route / middleFn ids the site calls, sorted and unique. One
	// for a route or middleFn call, several for a batch. nil for the anchor.
	Ids []string
	// ApiType is the API type the marker names, as resolved by Checker, the
	// program's checker that materialized it. The resolver walks it (or the
	// matching API in the `apiTsconfig` program) to find the ids' methods.
	ApiType *checker.Type
	Checker *checker.Checker
	// CalleeName is the dispatch method (`call`, `prefill`, `typeErrors`,
	// `initClient`), for reports.
	CalleeName string

	sourceFile *ast.SourceFile
	callNode   *ast.Node
}

// DiagSite anchors a diagnostic on the call.
func (site Site) DiagSite() diagnostics.Site {
	return textpos.NodeSite(site.FilePath, site.sourceFile, site.callNode)
}

// ModuleBasename is the site module the injection imports, under
// <outDir>/api: `s/<id>` for a single route or middleFn, `s/b_<hash>` for the
// id set a batch runs. Two sites calling the same route share one module.
func (site Site) ModuleBasename() string {
	if len(site.Ids) == 1 {
		return "s/" + EscapeId(site.Ids[0])
	}
	sum := sha256.Sum256([]byte(strings.Join(site.Ids, "\n")))
	return "s/b_" + base64.RawURLEncoding.EncodeToString(sum[:])[:14]
}

// MethodModuleBasename is the per-method module under <outDir>/api that a
// site module imports: `m/<id>`, the id's segments escaped one by one so a
// nested route keeps its folder structure on disk.
func MethodModuleBasename(id string) string {
	return "m/" + EscapeId(id)
}

// EscapeId turns a route id into a module path: every `/` stays a folder
// separator, and inside a segment [A-Za-z0-9_-] pass through while any other
// byte is hex-escaped as `$XX`, the entrymodules convention, so arbitrary
// route keys produce collision-free, URL-safe paths.
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

// FileCache memoizes per-file extraction results for the lifetime of ONE
// Program, mirroring requestbatch.FileCache: source files are immutable
// within a Program, so a file's sites/diagnostics never change between
// requests. Not safe for concurrent use.
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
// dispatch calls, and returns their sites plus the per-site diagnostics. Sites
// keep file order then source order; diagnostics are sorted by site. The
// per-Program FileCache is optional (nil degrades to an uncached walk). mode
// decides the level a widened id reports at (MET003 under bundled, MET004
// under mixed).
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
	sortDiagnostics(diags)
	return sites, diags
}

// extractFromSourceFile is the per-file extraction core: walk every
// CallExpression and dispatch to extractOne. Declaration files hold no calls.
func extractFromSourceFile(typeChecker *checker.Checker, markerOpts marker.Options, sourceFile *ast.SourceFile, mode constants.BundleApiMode) ([]Site, []diagnostics.Diagnostic) {
	if sourceFile.IsDeclarationFile {
		return nil, nil
	}
	// Text pre-filter: a file that spells none of the dispatch method names
	// and never names the client package cannot hold a site.
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

// fileScope bundles the per-file handles the extractor needs.
type fileScope struct {
	typeChecker *checker.Checker
	markerOpts  marker.Options
	sourceFile  *ast.SourceFile
	mode        constants.BundleApiMode
}

func (scope *fileScope) diag(code string, node *ast.Node, args ...string) diagnostics.Diagnostic {
	return diagnostics.New(code, textpos.NodeSite(scope.sourceFile.FileName(), scope.sourceFile, node), args...)
}

// extractOne reads a single branded dispatch call into a Site. Returns (nil,
// diags) when the call is not a dispatch point, is a pass-through (the slot
// already written), or when the marker's Id cannot name a route.
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
	// The slot is already written (re-scanned rewritten source, or a wrapper
	// forwarding its own payload): a pass-through, never a second splice.
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
		CalleeName:    calleeIdentifierName(callExpr),
		sourceFile:    scope.sourceFile,
		callNode:      call,
	}
	ids, kind := readIds(idType)
	switch kind {
	case idsAnchor:
		site.Anchor = true
	case idsLiteral:
		site.Ids = ids
	case idsWidened:
		code := diagnostics.CodeApiMetaRouteWidened
		if scope.mode == constants.BundleApiMixed {
			code = diagnostics.CodeApiMetaRouteWidenedMixed
		}
		return nil, []diagnostics.Diagnostic{scope.diag(code, call)}
	default:
		return nil, []diagnostics.Diagnostic{scope.diag(diagnostics.CodeApiMetaUnreadable, call, "the route id type is neither a string literal nor `never`")}
	}
	return site, nil
}

type idsKind int

const (
	idsUnreadable idsKind = iota
	idsAnchor
	idsLiteral
	idsWidened
)

// readIds classifies the marker's Id type argument: absent or `never` is the
// anchor, a string literal or a union of them names the ids, `string` is a
// widened id.
func readIds(idType *checker.Type) ([]string, idsKind) {
	if idType == nil {
		return nil, idsAnchor
	}
	flags := checker.Type_flags(idType)
	if flags&checker.TypeFlagsNever != 0 {
		return nil, idsAnchor
	}
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

// calleeIdentifierName returns the callee identifier text: `f(...)` yields
// "f", `obj.f(...)` yields "f"; anything else yields "".
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
