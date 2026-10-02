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

// apiVersions is what this program's own calls inject, plus an error for every client that disagrees with its server.
// A manifest reads its value from here, never recomputes it.
func (sess *Session) apiVersions(files []string) (routes, client string, diags []diagnostics.Diagnostic) {
	var clients []apiVersionSite
	for _, site := range sess.apiVersionSites(files) {
		switch site.callee {
		case apimeta.InitRoutesName:
			routes = site.version
		case apimeta.InitClientName:
			client = site.version
			clients = append(clients, site)
		}
	}
	if routes == "" {
		return routes, client, nil
	}
	// after the walk: comparing as it goes let a later client hide an earlier one
	for _, site := range clients {
		if site.version != routes {
			diags = append(diags, diagnostics.New(diagnostics.CodeApiMetaVersionMismatch, site.diagSite, site.version, routes))
		}
	}
	return routes, client, diags
}

// apiVersionTrusted reports whether ids match the server's: only when the program imports the router, so it holds the API.
// Any other program resolves the API under its own lib and strictness, so it injects nothing rather than a wrong version.
func (sess *Session) apiVersionTrusted() bool {
	return sess.importsRouter()
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
	versionIndex, apiType := apimeta.BuildVersionParam(sess.checker, sess.marker, call)
	if versionIndex < 0 || versionIndex < len(callExpr.Arguments.Nodes) {
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
	// TrailingArgText quotes the value and pads any slot the call left empty before it.
	text := purefunctions.TrailingArgText(version, callExpr.Arguments.HasTrailingComma(), versionIndex-len(callExpr.Arguments.Nodes))
	return apiVersionSite{
		filePath: sourceFile.FileName(),
		injectAt: call.End() - 1,
		callee:   marker.CalleeIdentifierName(callExpr),
		version:  version,
		diagSite: textpos.NodeSite(sourceFile.FileName(), sourceFile, call),
		text:     text,
	}, true
}

// apiVersionOf hashes the API's rows, walked like resolveApiBundle's, so ids share one checker.
func (sess *Session) apiVersionOf(apiType *checker.Type) string {
	tree := sess.clientApiTree(sess.checker, apiType)
	if tree == nil {
		return ""
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
