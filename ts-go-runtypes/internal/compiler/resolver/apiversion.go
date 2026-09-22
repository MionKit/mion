package resolver

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/apimeta"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/textpos"
)

// Both ends inject one hash over the API type's method rows into the InjectBuildVersion slot of initRoutes / initClient.

// apiVersionSite is one marked call and the value its empty slot takes.
type apiVersionSite struct {
	filePath string
	injectAt int
	text     string
	callee   string
	version  string
	diagSite diagnostics.Site
}

// apiVersionReplacements returns the splices for every marked call in files, or nothing when apiVersionTrusted is false.
func (sess *Session) apiVersionReplacements(files []string) []protocol.Replacement {
	sites := sess.apiVersionSites(files)
	out := make([]protocol.Replacement, 0, len(sites))
	for _, site := range sites {
		out = append(out, protocol.Replacement{File: site.filePath, Start: site.injectAt, End: site.injectAt, Text: site.text})
	}
	return out
}

// apiVersionSites walks files for marked calls, or answers nothing when apiVersionTrusted is false.
func (sess *Session) apiVersionSites(files []string) []apiVersionSite {
	if sess.Program == nil || sess.Program.TS == nil || len(files) == 0 || !sess.apiVersionTrusted() {
		return nil
	}
	versions := map[*checker.Type]string{}
	var out []apiVersionSite
	for _, filePath := range files {
		sourceFile := sess.Program.SourceFile(filePath)
		if sourceFile == nil || sourceFile.IsDeclarationFile {
			continue
		}
		// Resolving a signature per call is the cost, and only these two names carry the slot.
		if text := sourceFile.Text(); !strings.Contains(text, apimeta.InitRoutesName) && !strings.Contains(text, apimeta.InitClientName) {
			continue
		}
		out = append(out, sess.apiVersionSitesIn(sourceFile, versions)...)
	}
	return out
}

// apiVersions is what this program's own calls inject, and the error when its client and its server disagree.
// The value a manifest records is read from here, never recomputed, so a report names what the calls carry.
func (sess *Session) apiVersions(files []string) (routes, client string, diags []diagnostics.Diagnostic) {
	var mismatched *apiVersionSite
	for _, site := range sess.apiVersionSites(files) {
		switch site.callee {
		case apimeta.InitRoutesName:
			routes = site.version
		case apimeta.InitClientName:
			client = site.version
		}
		if routes != "" && client != "" && routes != client && mismatched == nil {
			mismatched = &site
		}
	}
	if mismatched != nil {
		diags = append(diags, diagnostics.New(diagnostics.CodeApiMetaVersionMismatch, mismatched.diagSite, client, routes))
	}
	return routes, client, diags
}

// apiVersionTrusted reports whether ids match the server's: only with api.tsConfig, or when the program imports the router.
// Any other program resolves the API under its own lib and strictness, so it injects nothing rather than a wrong version.
func (sess *Session) apiVersionTrusted() bool {
	return sess.opts.ApiTsconfig != "" || sess.importsRouter()
}

// apiVersionSitesIn walks one file's calls; versions memoises per API type because each walk assigns ids for every method.
func (sess *Session) apiVersionSitesIn(sourceFile *ast.SourceFile, versions map[*checker.Type]string) []apiVersionSite {
	var sites []apiVersionSite
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		if node.Kind == ast.KindCallExpression {
			if site, ok := sess.apiVersionSiteOf(sourceFile, node, versions); ok {
				sites = append(sites, site)
			}
		}
		node.ForEachChild(visit)
		return false
	}
	sourceFile.AsNode().ForEachChild(visit)
	return sites
}

// apiVersionSiteOf reads one call; a slot the caller already filled holds a forwarded value, never ours.
func (sess *Session) apiVersionSiteOf(sourceFile *ast.SourceFile, call *ast.Node, versions map[*checker.Type]string) (apiVersionSite, bool) {
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
			callee:   marker.CalleeIdentifierName(callExpr),
			version:  version,
			diagSite: textpos.NodeSite(sourceFile.FileName(), sourceFile, call),
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

// apiVersionOf hashes the API type's method rows; with api.tsConfig it hashes the peer program's tree instead,
// the same source resolveApiBundle compiles from, so both ends hash ids minted under one checker.
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
