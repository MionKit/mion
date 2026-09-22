package resolver

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/apimeta"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// The API version rides the InjectBuildVersion slot of `initRoutes` on the server and `initClient` on the
// client: one hash over every method row of the API type the call names. Both ends run this code over the
// same rows, so one API gives one string and a changed route type gives another.

// apiVersionSite is one marked call and the value its empty slot takes.
type apiVersionSite struct {
	filePath string
	injectAt int
	text     string
}

// apiVersionReplacements returns the splices for every marked call in files. Empty when the program cannot
// produce a trustworthy version (see apiVersionTrusted).
func (sess *Session) apiVersionReplacements(files []string) []protocol.Replacement {
	if sess.Program == nil || sess.Program.TS == nil || len(files) == 0 || !sess.apiVersionTrusted() {
		return nil
	}
	versions := map[*checker.Type]string{}
	var out []protocol.Replacement
	for _, filePath := range files {
		sourceFile := sess.Program.SourceFile(filePath)
		if sourceFile == nil || sourceFile.IsDeclarationFile {
			continue
		}
		// Text pre-filter: resolving a signature per call is the cost, and only these two names carry the slot.
		if text := sourceFile.Text(); !strings.Contains(text, apimeta.InitRoutesName) && !strings.Contains(text, apimeta.InitClientName) {
			continue
		}
		for _, site := range sess.apiVersionSitesIn(sourceFile, versions) {
			out = append(out, protocol.Replacement{File: site.filePath, Start: site.injectAt, End: site.injectAt, Text: site.text})
		}
	}
	return out
}

// apiVersionTrusted reports whether this program's ids are the ones the server compiled. A client program
// pointed at the API through `api.tsConfig` reads the routes in THAT program, and a program importing the
// router IS the server. Any other program resolved the API types under its own `lib` and strictness
// settings, so its ids can differ with nothing wrong and it must inject nothing rather than claim a version.
func (sess *Session) apiVersionTrusted() bool {
	return sess.opts.ApiTsconfig != "" || sess.importsRouter()
}

// apiVersionSitesIn walks one file's calls, memoising the version per API type: several calls in one file
// usually name the same API, and each walk assigns ids for every method.
func (sess *Session) apiVersionSitesIn(sourceFile *ast.SourceFile, versions map[*checker.Type]string) []apiVersionSite {
	var sites []apiVersionSite
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		if node.Kind == ast.KindCallExpression {
			if site, ok := sess.apiVersionSite(sourceFile, node, versions); ok {
				sites = append(sites, site)
			}
		}
		node.ForEachChild(visit)
		return false
	}
	sourceFile.AsNode().ForEachChild(visit)
	return sites
}

// apiVersionSite reads one call: the resolved signature must carry an InjectBuildVersion parameter, and that
// parameter's slot must still be empty. A slot the caller already filled is a forwarded value, never ours.
func (sess *Session) apiVersionSite(sourceFile *ast.SourceFile, call *ast.Node, versions map[*checker.Type]string) (apiVersionSite, bool) {
	callExpr := call.AsCallExpression()
	if callExpr == nil || callExpr.Arguments == nil {
		return apiVersionSite{}, false
	}
	signature := checker.Checker_getResolvedSignature(sess.checker, call, nil, 0)
	if signature == nil {
		return apiVersionSite{}, false
	}
	for paramIndex, paramSymbol := range checker.Signature_parameters(signature) {
		if paramSymbol == nil {
			continue
		}
		paramType := checker.Checker_getTypeOfSymbol(sess.checker, paramSymbol)
		kind, apiType, matched := marker.DetectAny(sess.checker, paramType, sess.marker)
		if !matched || kind != marker.KindInjectBuildVersion || apiType == nil {
			continue
		}
		if paramIndex < len(callExpr.Arguments.Nodes) {
			return apiVersionSite{}, false
		}
		version, ok := versions[apiType]
		if !ok {
			version = sess.apiVersionOf(apiType)
			versions[apiType] = version
		}
		if version == "" {
			return apiVersionSite{}, false
		}
		return apiVersionSite{
			filePath: sourceFile.FileName(),
			injectAt: call.End() - 1,
			// TrailingArgText quotes the value and pads any slot the call left empty before it.
			text: purefunctions.TrailingArgText(
				version,
				callExpr.Arguments.HasTrailingComma(),
				paramIndex-len(callExpr.Arguments.Nodes),
			),
		}, true
	}
	return apiVersionSite{}, false
}

// apiVersionOf hashes the API type's method rows. A client pointed at `api.tsConfig` hashes the peer
// program's tree instead, the same source resolveApiBundle compiles its functions from, so the two ends
// hash ids minted under one checker.
func (sess *Session) apiVersionOf(apiType *checker.Type) string {
	tree, problem := apimeta.WalkApi(sess.checker, apiType)
	if tree == nil || problem != "" {
		return ""
	}
	if sess.opts.ApiTsconfig != "" {
		peerTree, _, err := sess.apiSourceTree(tree.Ids())
		if err != nil || peerTree == nil {
			return ""
		}
		tree = peerTree
	}
	rows := make(map[string]apimeta.ManifestMethod, len(tree.Methods))
	for _, method := range tree.Methods {
		// First row wins, like the server manifest: a tree listing an id twice keeps the earlier walk.
		if _, seen := rows[method.Id]; seen {
			continue
		}
		rows[method.Id] = sess.newApiMethodEntry(tree.Checker, method).manifestRow()
	}
	return apimeta.BuildVersion(rows)
}

// programFilePaths is every non-declaration source file of the program, the whole-program input the
// generate-side collectors walk.
func programFilePaths(sess *Session) []string {
	if sess.Program == nil || sess.Program.TS == nil {
		return nil
	}
	sourceFiles := sess.Program.TS.SourceFiles()
	files := make([]string, 0, len(sourceFiles))
	for _, sourceFile := range sourceFiles {
		if sourceFile == nil || sourceFile.IsDeclarationFile {
			continue
		}
		files = append(files, sourceFile.FileName())
	}
	return files
}
