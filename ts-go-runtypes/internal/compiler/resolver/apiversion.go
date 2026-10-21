package resolver

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/apimeta"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/textpos"
)

// Both ends inject one hash over the API type's method rows into the InjectBuildVersion slot of initRoutes / initClient.

// apiVersionSite is one marked call and the value its empty slot takes; serverVersion is what the API type carries.
type apiVersionSite struct {
	filePath      string
	injectAt      int
	text          string
	callee        string
	version       string
	serverVersion string
	// fromDeclarations: the call's API type comes from a .d.ts.
	fromDeclarations bool
	diagSite         diagnostics.Site
}

// apiVersionReplacements returns the splices for every marked call in files, or nothing when apiVersionOn is false.
func (sess *Session) apiVersionReplacements(files []string) []protocol.Replacement {
	sites := sess.apiVersionSites(files)
	out := make([]protocol.Replacement, 0, len(sites))
	for _, site := range sites {
		out = append(out, protocol.Replacement{File: site.filePath, Start: site.injectAt, End: site.injectAt, Text: site.text})
	}
	return out
}

// DeclarationReplacements is every splice a declaration emit keeps: a quoted value that imports nothing, the
// build version or a pure fn's id. Marker arguments import untyped modules, which would widen inferred types.
func (sess *Session) DeclarationReplacements() []protocol.Replacement {
	files := sess.programSourceFiles()
	out := sess.apiVersionReplacements(files)
	_, _, pureFns, _ := sess.extractPureFnsForScan(files)
	for _, replacement := range pureFns {
		if replacement.Start == replacement.End && replacement.ImportFrom == "" {
			out = append(out, replacement)
		}
	}
	return out
}

// apiVersionSites walks files for marked calls, or answers nothing when apiVersionOn is false.
func (sess *Session) apiVersionSites(files []string) []apiVersionSite {
	if sess.Program == nil || sess.Program.TS == nil || len(files) == 0 || !sess.apiVersionOn() {
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
	// allSingle has no per-file modules, so a client sharing its program with the router bundles the server's types.
	sharedModules := sess.opts.ModuleMode == constants.ModuleModeAllSingle && sess.importsRouter()
	// Only an API read from a .d.ts can carry a server version; one typed from source has nothing to compare against.
	for _, site := range clients {
		if sharedModules {
			diags = append(diags, diagnostics.New(diagnostics.CodeApiMetaSharedModules, site.diagSite))
		}
		switch {
		case site.serverVersion != "" && site.serverVersion != site.version:
			diags = append(diags, diagnostics.New(diagnostics.CodeApiMetaServerVersionMismatch, site.diagSite, site.version, site.serverVersion))
		case site.serverVersion == "" && site.fromDeclarations:
			diags = append(diags, diagnostics.New(diagnostics.CodeApiMetaNoServerVersion, site.diagSite))
		}
	}
	if routes == "" {
		return routes, client, diags
	}
	// after the walk: comparing as it goes let a later client hide an earlier one
	for _, site := range clients {
		if site.version != routes {
			diags = append(diags, diagnostics.New(diagnostics.CodeApiMetaVersionMismatch, site.diagSite, site.version, routes))
		}
	}
	return routes, client, diags
}

// apiVersionOn reports whether this program injects versions: a server always, a client only when it bundles its routes.
func (sess *Session) apiVersionOn() bool {
	return sess.apiLaneOn() || sess.importsRouter()
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
		filePath:         sourceFile.FileName(),
		injectAt:         call.End() - 1,
		callee:           marker.CalleeIdentifierName(callExpr),
		version:          version,
		serverVersion:    apimeta.ServerBuildVersion(sess.checker, apiType),
		fromDeclarations: apimeta.ApiTypeFromDeclarations(sess.checker, apiType),
		diagSite:         textpos.NodeSite(sourceFile.FileName(), sourceFile, call),
		text:             text,
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
