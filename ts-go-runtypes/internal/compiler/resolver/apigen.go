package resolver

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"slices"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/operations"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/apimeta"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/sourcerewrite"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// The bundled-API lane (`client.routes: 'bundle'`): generate renders a SELF-CONTAINED tree under <outDir>/api/ in
// `functions` emit mode whatever the program's mode, so a client never evaluates code strings. Ids are assigned
// under the checker that owns each type (`AssignIDUnder`), demanding exactly the families the server's marker slots
// name (types/parser.ts MarkerSlots). A site's injection depends on its ids alone, so a file rewrites before generate.

// apiLaneOn reports whether this session bundles API metadata.
func (sess *Session) apiLaneOn() bool {
	return sess.opts.ClientRoutes == constants.ClientRoutesBundle
}

// extractApiSitesForScan returns the requested files' dispatch sites, their diagnostics and the point
// insertions for the user's source, memoised per file; nothing when the lane is off.
func (sess *Session) extractApiSitesForScan(files []string) ([]apimeta.Site, []diagnostics.Diagnostic, []protocol.Replacement) {
	// Filled whatever the bundled-routes lane: a server-only build never bundles, yet its `initRoutes` answers every client.
	versions := sess.apiVersionReplacements(files)
	if !sess.apiLaneOn() || sess.Program == nil || len(files) == 0 {
		return nil, nil, versions
	}
	sites, diags := sess.extractApiSites(files)
	replacements := append([]protocol.Replacement(nil), apimeta.Replacements(sites)...)
	replacements = append(replacements, sess.apiLaneImports(files)...)
	return sites, diags, append(replacements, versions...)
}

// apiVersionFiles lists the version-slot files, so one whose only marker use is `initRoutes` / `initClient` is still transformed.
func (sess *Session) apiVersionFiles(files, routerInitFiles []string) []string {
	if sess.Program == nil || !sess.apiVersionOn() {
		return nil
	}
	initClientFiles := apimeta.InitFiles(apimeta.InitSitesFromProgramCached(sess.checker, sess.marker, sess.Program, files, sess.apiInitFileCache))
	return append(initClientFiles, routerInitFiles...)
}

// apiLaneImports appends `import '<genDir>/api/lane.js';` to every file calling `initClient`, the way the
// batch table reaches the modules that create a router. The lane is a build option, so it arrives as a
// module rather than as a value spliced into a call a user could also write.
func (sess *Session) apiLaneImports(files []string) []protocol.Replacement {
	sites := apimeta.InitSitesFromProgramCached(sess.checker, sess.marker, sess.Program, files, sess.apiInitFileCache)
	if len(sites) == 0 {
		return nil
	}
	// Same two roads as the batch transport's import: under TransformRelative the rewritten file IS the
	// output, so the path is computed here; otherwise `rtapi:/` goes out for the emit-side relativizer.
	outDir := ""
	if sess.opts.TransformRelative {
		outDir = sess.resolveOutDir()
	}
	out := make([]protocol.Replacement, 0, len(sites))
	for _, site := range sites {
		specifier := constants.ApiModulePrefix + constants.ApiLaneFile + constants.EntryModuleSuffix
		if outDir != "" {
			if rel := relUserToApi(site.FilePath, outDir, constants.ApiLaneFile); rel != "" {
				specifier = rel
			}
		}
		out = append(out, protocol.Replacement{File: site.FilePath, Start: site.End, End: site.End, Text: "\nimport '" + specifier + "';\n"})
	}
	return out
}

// collectProgramApiSites walks every non-declaration file through the dispatch-site extractor.
func (sess *Session) collectProgramApiSites() ([]apimeta.Site, []diagnostics.Diagnostic) {
	if !sess.apiLaneOn() || sess.Program == nil {
		return nil, nil
	}
	return sess.extractApiSites(sess.apiWalkFiles())
}

// extractApiSites returns the files' dispatch sites, widened ones included, with a report for each widened one.
func (sess *Session) extractApiSites(files []string) ([]apimeta.Site, []diagnostics.Diagnostic) {
	sites, diags := apimeta.ExtractFromProgramCached(sess.checker, sess.marker, sess.Program, files, sess.apiFileCache)
	for _, site := range sites {
		if site.Widened {
			diags = append(diags, sess.widenedSiteDiag(site))
		}
	}
	diagnostics.Sort(diags)
	return sites, diags
}

// widenedSiteDiag reports a call nothing is bundled for: it fetches when its client set that up, else it fails.
func (sess *Session) widenedSiteDiag(site apimeta.Site) diagnostics.Diagnostic {
	code := diagnostics.CodeApiMetaRouteWidenedFetched
	if tree := sess.clientApiTree(site.Checker, site.ApiType); tree != nil {
		if !sess.fetchingFor(site.ApiType) {
			code = diagnostics.CodeApiMetaRouteWidened
		} else if !tree.HasFetchMetadata() {
			code = diagnostics.CodeApiMetaNoMetadataToFetch
		}
		return diagnostics.New(code, site.DiagSite())
	}
	// A wide `RouteSubRequest<any>` erases the API with the id, so the call may belong to any client.
	if _, setUps := sess.clientFacts(); len(setUps) == 0 {
		code = diagnostics.CodeApiMetaRouteWidened
	} else if sess.fetchingApisLackMetadata() {
		code = diagnostics.CodeApiMetaNoMetadataToFetch
	}
	return diagnostics.New(code, site.DiagSite())
}

// fetchingFor reports whether apiType's client sets up fetching; an untraced `useFetchMetadata` covers every client.
func (sess *Session) fetchingFor(apiType *checker.Type) bool {
	_, setUps := sess.clientFacts()
	return slices.ContainsFunc(setUps, func(setUp apimeta.FetchSetUp) bool { return setUp.ApiType == nil || setUp.ApiType == apiType })
}

// fetchingApisLackMetadata reports whether every readable API of a fetching client lacks the metadata middleware.
func (sess *Session) fetchingApisLackMetadata() bool {
	clients, _ := sess.clientFacts()
	lacks := false
	for _, client := range clients {
		if tree := sess.clientApiTree(sess.checker, client.ApiType); tree != nil && sess.fetchingFor(client.ApiType) {
			if tree.HasFetchMetadata() {
				return false
			}
			lacks = true
		}
	}
	return lacks
}

// apiFetchMemo holds what the fetching checks read, dropped with the Program.
type apiFetchMemo struct {
	walks     map[*checker.Type]apiWalk
	factsDone bool
	clients   []apimeta.ClientApi
	setUps    []apimeta.FetchSetUp
	apiTypes  *apiTypesCheck
}

type apiWalk struct {
	tree    *apimeta.Tree
	problem string
}

func (sess *Session) fetchMemo() *apiFetchMemo {
	if sess.apiFetch == nil {
		sess.apiFetch = &apiFetchMemo{walks: map[*checker.Type]apiWalk{}}
	}
	return sess.apiFetch
}

// clientFacts lists the program's `initClient` calls and its `useFetchMetadata` calls.
func (sess *Session) clientFacts() ([]apimeta.ClientApi, []apimeta.FetchSetUp) {
	memo := sess.fetchMemo()
	if !memo.factsDone {
		memo.factsDone = true
		files := sess.apiWalkFiles()
		memo.clients = apimeta.ClientApis(sess.checker, sess.marker, sess.Program, files)
		memo.setUps = apimeta.FetchSetUps(sess.checker, sess.marker, sess.Program, files)
	}
	return memo.clients, memo.setUps
}

// walkApi walks an API type of this program once per Program; a problem says why it is not a PublicApi.
func (sess *Session) walkApi(typeChecker *checker.Checker, apiType *checker.Type) (*apimeta.Tree, string) {
	memo := sess.fetchMemo()
	walk, ok := memo.walks[apiType]
	if !ok {
		walk.tree, walk.problem = apimeta.WalkApi(typeChecker, apiType)
		memo.walks[apiType] = walk
	}
	return walk.tree, walk.problem
}

// clientApiTree walks the API a client names; nil when unreadable, which MET001 owns.
func (sess *Session) clientApiTree(typeChecker *checker.Checker, apiType *checker.Type) *apimeta.Tree {
	tree, problem := sess.walkApi(typeChecker, apiType)
	if tree == nil || problem != "" {
		return nil
	}
	return tree
}

// fetchSetupDiags checks a fetching client has the server's metadata middleware and its `useFetchMetadata`.
// Bundled, widened sites reported themselves, and with none only a setup whose API lacks the middleware is wrong.
// Off, every call fetches, so each API reports once at its first `initClient`, readable or not.
func (sess *Session) fetchSetupDiags(sites []apimeta.Site) []diagnostics.Diagnostic {
	if sess.Program == nil {
		return nil
	}
	clients, setUps := sess.clientFacts()
	if len(clients) == 0 {
		return nil
	}
	var diags []diagnostics.Diagnostic
	if sess.apiLaneOn() {
		if slices.ContainsFunc(sites, func(site apimeta.Site) bool { return site.Widened }) {
			return nil
		}
		for _, setUp := range setUps {
			lacks := sess.fetchingApisLackMetadata()
			if setUp.ApiType != nil {
				tree := sess.clientApiTree(sess.checker, setUp.ApiType)
				lacks = tree != nil && !tree.HasFetchMetadata()
			}
			if lacks {
				diags = append(diags, diagnostics.New(diagnostics.CodeApiMetaNoMetadataToFetch, setUp.DiagSite))
			}
		}
		return diags
	}
	reported := map[*checker.Type]bool{}
	for _, client := range clients {
		if reported[client.ApiType] {
			continue
		}
		reported[client.ApiType] = true
		if tree := sess.clientApiTree(sess.checker, client.ApiType); tree != nil && !tree.HasFetchMetadata() {
			diags = append(diags, diagnostics.New(diagnostics.CodeApiMetaNoMetadataToFetch, client.DiagSite))
		} else if !sess.fetchingFor(client.ApiType) {
			diags = append(diags, diagnostics.New(diagnostics.CodeApiMetaFetchNotSetUp, client.DiagSite))
		}
	}
	return diags
}

// apiWalkFiles lists the program's non-declaration files, the ones the client lane reads.
func (sess *Session) apiWalkFiles() []string {
	sourceFiles := sess.Program.TS.SourceFiles()
	walkFiles := make([]string, 0, len(sourceFiles))
	for _, sourceFile := range sourceFiles {
		if sourceFile == nil || sourceFile.IsDeclarationFile {
			continue
		}
		walkFiles = append(walkFiles, sourceFile.FileName())
	}
	return walkFiles
}

// middlewareUse is where a middleware is first needed: the first call to a route whose chain runs it.
type middlewareUse struct {
	site    apimeta.Site
	routeId string
	method  *apimeta.Method
}

// unsetMiddlewareDiags reports, at first use, each chain middleware the client never reads: nothing sends its params.
func (sess *Session) unsetMiddlewareDiags(order []string, uses map[string]middlewareUse) []diagnostics.Diagnostic {
	if len(uses) == 0 {
		return nil
	}
	reads := apimeta.MiddlewareReadsFromProgramCached(sess.checker, sess.marker, sess.Program, sess.apiWalkFiles(), sess.apiMiddlewareReadsCache)
	var diags []diagnostics.Diagnostic
	for _, id := range order {
		use, ok := uses[id]
		if !ok || reads[id] {
			continue
		}
		// mion's own metadata middleware is set up by `useFetchMetadata`, which fetchSetupDiags checks
		if use.method.FetchMetadata {
			continue
		}
		// nothing to send: the client gets its answer with no setup
		if !use.method.TakesParams {
			continue
		}
		code := diagnostics.CodeApiMetaOptionalMiddlewareNotSetUp
		if use.method.NeedsParams {
			code = diagnostics.CodeApiMetaMiddlewareNotSetUp
		}
		diags = append(diags, diagnostics.New(code, use.site.DiagSite(), id, use.routeId))
	}
	return diags
}

// apiMethodEntry is one selected method with the ids and synthetic sites its module renders from.
type apiMethodEntry struct {
	method    *apimeta.Method
	paramsId  string
	returnId  string
	headersId string
	// syncId is the id of the method's `[params, return]` pair, the one the server's syncId slot gets; "" without one.
	syncId string
	// fn sites demand the families, reflection sites the runtype facades; both stamped before rendering.
	paramsFns  protocol.Site
	returnFns  protocol.Site
	headersFns protocol.Site
	paramsRef  protocol.Site
	returnRef  protocol.Site
	headersRef protocol.Site
	families   []string
}

// apiBundle is the resolved output of one generate.
type apiBundle struct {
	methods map[string]*apiMethodEntry
	order   []string
	// siteMethods lists a site module's ids in tree order: the routes it calls plus their middlewares.
	siteMethods map[string][]string
}

func (bundle *apiBundle) empty() bool {
	return bundle == nil || len(bundle.methods) == 0
}

// syntheticSites is the stable-order dump the client mirror is rendered from.
func (bundle *apiBundle) syntheticSites() []protocol.Site {
	var sites []protocol.Site
	for _, id := range bundle.order {
		entry := bundle.methods[id]
		sites = append(sites, entry.paramsFns, entry.returnFns, entry.paramsRef, entry.returnRef)
		if entry.headersId != "" {
			sites = append(sites, entry.headersFns, entry.headersRef)
		}
	}
	return sites
}

// generateApiBundle writes the bundled-API tree under <outDir>/api/ plus the manifests: the server's when
// this program initializes an API, the client's when it bundles routes. The dir is removed when neither applies.
func (sess *Session) generateApiBundle(outDir string, sites []apimeta.Site) ([]diagnostics.Diagnostic, error) {
	routesVersion, clientVersion, diags := sess.apiVersions(sess.programSourceFiles())
	apiDir := filepath.Join(outDir, constants.ApiModuleDir)
	bundle, bundleDiags := sess.resolveApiBundle(sites)
	diags = append(diags, bundleDiags...)
	diags = append(diags, sess.fetchSetupDiags(sites)...)
	diags = append(diags, sess.apiTypesPackages().diags...)
	serverManifest := sess.serverApiManifest()
	if bundle.empty() && serverManifest == nil {
		if err := os.RemoveAll(apiDir); err != nil {
			return diags, unwritableOutDirError(apiDir, err)
		}
		return diags, nil
	}
	files := map[string]string{}
	var clientManifest *apimeta.Manifest
	if !bundle.empty() {
		renderDiags, renderErr := sess.renderApiBundle(bundle, files)
		diags = append(diags, renderDiags...)
		if renderErr != nil {
			return diags, renderErr
		}
		clientManifest = bundle.clientManifest()
		files[constants.ApiLaneFile] = renderApiLaneModule()
	}
	if err := os.MkdirAll(apiDir, 0o755); err != nil {
		return diags, unwritableOutDirError(apiDir, err)
	}
	if _, err := materializeModules(apiDir, files); err != nil {
		return diags, unwritableOutDirError(apiDir, err)
	}
	if err := pruneStaleModules(apiDir, files); err != nil {
		return diags, unwritableOutDirError(apiDir, err)
	}
	// Each build version is the value this program's own calls carry, so a report names what shipped.
	if err := writeManifest(apiDir, constants.ApiManifestFile, serverManifest, routesVersion); err != nil {
		return diags, err
	}
	if err := writeManifest(apiDir, constants.ApiClientManifestFile, clientManifest, clientVersion); err != nil {
		return diags, err
	}
	return diags, nil
}

// writeManifest writes one manifest under apiDir, or removes a stale one when this build has none.
func writeManifest(apiDir, name string, manifest *apimeta.Manifest, buildVersion string) error {
	path := filepath.Join(apiDir, name)
	if manifest == nil {
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			return unwritableOutDirError(apiDir, err)
		}
		return nil
	}
	manifest.BuildVersion = buildVersion
	if err := writeIfChanged(path, manifest.Render()); err != nil {
		return unwritableOutDirError(apiDir, err)
	}
	return nil
}

// renderApiLaneModule renders `api/lane.js`, a side-effect import, so only the build that made the bundle sets the flag.
func renderApiLaneModule() string {
	return "// GENERATED by mion (the bundled-routes lane). Do not edit.\n" +
		"import {setApiBundled} from '" + apimeta.ClientModule + "';\n" +
		"setApiBundled();\n"
}

// renderApiBundle renders the bundle's module tree into files, in the materializeModules shape: the
// demanded families as a SELF-CONTAINED client mirror under types/, one module per method, one per site.
func (sess *Session) renderApiBundle(bundle *apiBundle, files map[string]string) ([]diagnostics.Diagnostic, error) {
	// Stamped one site at a time: two methods can demand different families for the same type id, so a
	// site is only ever its own, never looked up by id.
	stamp := func(site *protocol.Site) {
		*site = sess.stampSiteModules([]protocol.Site{*site})[0]
	}
	for _, entry := range bundle.methods {
		stamp(&entry.paramsFns)
		stamp(&entry.returnFns)
		stamp(&entry.paramsRef)
		stamp(&entry.returnRef)
		if entry.headersId != "" {
			stamp(&entry.headersFns)
			stamp(&entry.headersRef)
		}
	}
	stamped := bundle.syntheticSites()
	// The client mirror renders factories only, in its own tree, with no disk cache, whose store is keyed
	// by the session's own emit mode. The program's pure fns come in the same mode, so a format resolves.
	var renderDiags []diagnostics.Diagnostic
	renderOpts := sess.rtRenderOpts(&renderDiags, nil, nil)
	renderOpts.EmitMode = constants.EmitFunctions
	renderOpts.Store = nil
	pureFnEntries, _, _ := sess.extractProgramPureFns(nil)
	pureFnGraph := purefunctions.CollectEntries(sess.userPureFnEntries(pureFnEntries), constants.EmitFunctions)
	apiDump := protocol.Dump{RunTypes: sess.cache.Dump(), Sites: stamped}
	typeModules, _, err := sess.collectEntryModules(apiDump, nil, renderOpts, pureFnGraph, nil)
	if err != nil {
		return renderDiags, fmt.Errorf("bundled routes: %w", err)
	}
	for basename, source := range typeModules {
		files[typesSubdir+"/"+basename] = relativizeModuleImports(basename, source)
	}
	for _, id := range bundle.order {
		basename := apimeta.MethodModuleBasename(id)
		files[basename] = renderApiMethodModule(basename, bundle.methods[id])
	}
	for basename, ids := range bundle.siteMethods {
		files[basename] = renderApiSiteModule(basename, ids)
	}
	return renderDiags, nil
}

// clientManifest is what a client build writes: the bundled methods.
func (bundle *apiBundle) clientManifest() *apimeta.Manifest {
	manifest := &apimeta.Manifest{Kind: apimeta.ManifestKindClient, Methods: map[string]apimeta.ManifestMethod{}}
	for _, id := range bundle.order {
		manifest.Methods[id] = bundle.methods[id].manifestRow()
	}
	return manifest
}

// manifestRow is the method's manifest row: what api-check compares.
func (entry *apiMethodEntry) manifestRow() apimeta.ManifestMethod {
	return apimeta.ManifestMethod{
		Type:          entry.method.Type,
		ParamsId:      entry.paramsId,
		ReturnId:      entry.returnId,
		HeadersId:     entry.headersId,
		Families:      entry.families,
		Options:       entry.method.Options,
		MiddlewareIds: entry.method.MiddlewareIds,
	}
}

// serverApiManifest is the manifest a server build writes: every public method of every `initRoutes(...)`
// call in THIS program, ids assigned under this program's checker, which are the ids the route helpers'
// marker sites already got, so the walk adds nothing to the cache. An id two calls declare with differing
// rows keeps the first row and is listed as ambiguous, which a program holding its spec files produces.
func (sess *Session) serverApiManifest() *apimeta.Manifest {
	if sess.Program == nil || sess.Program.TS == nil || !sess.importsRouter() {
		return nil
	}
	var manifest *apimeta.Manifest
	ambiguous := map[string]bool{}
	for _, sourceFile := range sess.Program.TS.SourceFiles() {
		if sourceFile == nil || sourceFile.IsDeclarationFile || strings.Contains(sourceFile.FileName(), "/node_modules/") {
			continue
		}
		if !strings.Contains(sourceFile.Text(), apimeta.InitRoutesName) {
			continue
		}
		for _, apiType := range initRoutesApiTypes(sess.checker, sess.marker, sourceFile) {
			tree, problem := apimeta.WalkApi(sess.checker, apiType)
			if problem != "" || tree == nil {
				continue
			}
			if manifest == nil {
				manifest = &apimeta.Manifest{Kind: apimeta.ManifestKindServer, Methods: map[string]apimeta.ManifestMethod{}}
			}
			for _, method := range tree.Methods {
				row := sess.newApiMethodEntry(tree.Checker, method).manifestRow()
				existing, seen := manifest.Methods[method.Id]
				if !seen {
					manifest.Methods[method.Id] = row
					continue
				}
				if !ambiguous[method.Id] && !apimeta.RowsEqual(existing, row) {
					ambiguous[method.Id] = true
					manifest.Ambiguous = append(manifest.Ambiguous, method.Id)
				}
			}
		}
	}
	return manifest
}

// writeIfChanged writes content to path unless the file already holds it, so
// an unchanged artifact keeps its mtime (and a watcher stays quiet).
func writeIfChanged(path, content string) error {
	if existing, err := os.ReadFile(path); err == nil && string(existing) == content {
		return nil
	}
	return os.WriteFile(path, []byte(content), 0o644)
}

// userPureFnEntries drops the built-in registrations an in-repo program surfaces (the package index
// serves those) and adds the override entries, exactly like collectProgramPureFns.
func (sess *Session) userPureFnEntries(entries []purefunctions.Entry) []purefunctions.Entry {
	kept := make([]purefunctions.Entry, 0, len(entries)+len(sess.overrideEntries))
	for _, entry := range entries {
		if purefnids.Has(entry.Key()) {
			continue
		}
		kept = append(kept, entry)
	}
	return append(kept, sess.overrideEntries...)
}

// resolveApiBundle walks the API type(s) the sites name, selects their
// methods and assigns the type ids.
func (sess *Session) resolveApiBundle(sites []apimeta.Site) (*apiBundle, []diagnostics.Diagnostic) {
	bundle := &apiBundle{methods: map[string]*apiMethodEntry{}, siteMethods: map[string][]string{}}
	var diags []diagnostics.Diagnostic
	widenedReported := map[string]bool{}
	middlewareUses := map[string]middlewareUse{}
	for _, site := range sites {
		if site.Widened {
			continue
		}
		tree, problem := sess.walkApi(site.Checker, site.ApiType)
		if tree == nil {
			diags = append(diags, diagnostics.New(diagnostics.CodeApiMetaUnreadable, site.DiagSite(), problem))
			continue
		}
		methods, missing := tree.Select(site.Ids)
		for _, id := range missing {
			diags = append(diags, diagnostics.New(diagnostics.CodeApiMetaRouteNotDeclared, site.DiagSite(), id))
		}
		ids := make([]string, 0, len(methods))
		for _, method := range methods {
			ids = append(ids, method.Id)
			if _, seen := middlewareUses[method.Id]; !seen && method.Type != apimeta.TypeRoute {
				middlewareUses[method.Id] = middlewareUse{site: site, routeId: routeRunning(tree, site.Ids, method.Id), method: method}
			}
			if _, seen := bundle.methods[method.Id]; !seen {
				entry := sess.newApiMethodEntry(tree.Checker, method)
				bundle.methods[method.Id] = entry
				bundle.order = append(bundle.order, method.Id)
				for _, option := range method.WidenedOptions {
					key := method.Id + "\x00" + option
					if !widenedReported[key] {
						widenedReported[key] = true
						diags = append(diags, diagnostics.New(diagnostics.CodeApiMetaOptionWidened, site.DiagSite(), option, method.Id))
					}
				}
			}
			entry := bundle.methods[method.Id]
			// The client file reflects these types, so an edit to a route's declaration re-runs its transform.
			for _, id := range []string{entry.paramsId, entry.returnId, entry.headersId} {
				sess.cache.RecordFileID(site.FilePath, id)
			}
		}
		bundle.siteMethods[site.ModuleBasename()] = ids
	}
	diags = append(diags, sess.unsetMiddlewareDiags(bundle.order, middlewareUses)...)
	return bundle, diags
}

// routeRunning names the first route of a site whose chain runs the middleware.
func routeRunning(tree *apimeta.Tree, routeIds []string, middlewareId string) string {
	for _, routeId := range routeIds {
		if route := tree.ById[routeId]; route != nil && slices.Contains(route.MiddlewareIds, middlewareId) {
			return routeId
		}
	}
	return routeIds[0]
}

// initRoutesApiTypes returns the instantiated PublicApi of every `initRoutes(...)` call whose signature
// the router package declares.
func initRoutesApiTypes(typeChecker *checker.Checker, markerOpts marker.Options, sourceFile *ast.SourceFile) []*checker.Type {
	var out []*checker.Type
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		if node.Kind == ast.KindCallExpression {
			callExpr := node.AsCallExpression()
			if callExpr.Expression != nil && callExpr.Expression.Kind == ast.KindPropertyAccessExpression {
				if name := callExpr.Expression.AsPropertyAccessExpression().Name(); name != nil && name.Text() == apimeta.InitRoutesName {
					if signature := checker.Checker_getResolvedSignature(typeChecker, node, nil, 0); signature != nil {
						if marker.DeclaringModuleOfNode(checker.Signature_declaration(signature), markerOpts.FS) == apimeta.RouterModule {
							if returnType := checker.Checker_getReturnTypeOfSignature(typeChecker, signature); returnType != nil {
								out = append(out, returnType)
							}
						}
					}
				}
			}
		}
		node.ForEachChild(visit)
		return false
	}
	sourceFile.AsNode().ForEachChild(visit)
	return out
}

// newApiMethodEntry assigns the type ids under the checker that owns them and builds the synthetic sites
// demanding the server's families.
func (sess *Session) newApiMethodEntry(owner *checker.Checker, method *apimeta.Method) *apiMethodEntry {
	entry := &apiMethodEntry{method: method}
	entry.paramsId = sess.cache.AssignIDUnder(owner, method.Params)
	entry.returnId = sess.cache.AssignIDUnder(owner, method.Return)
	if method.Sync != nil {
		entry.syncId = sess.cache.AssignIDUnder(owner, method.Sync)
	}
	paramsStrategy, returnStrategy := parserStrategies(method.Options)
	paramsKeys := parseMode(paramsStrategy).paramsMarkerKeys()
	returnKeys := parseMode(returnStrategy).returnMarkerKeys()
	entry.paramsFns = apiFnSite(entry.paramsId, paramsKeys)
	entry.returnFns = apiFnSite(entry.returnId, returnKeys)
	entry.paramsRef = protocol.Site{ID: entry.paramsId}
	entry.returnRef = protocol.Site{ID: entry.returnId}
	entry.families = append(append([]string(nil), paramsKeys...), returnKeys...)
	if method.Headers != nil {
		entry.headersId = sess.cache.AssignIDUnder(owner, method.Headers)
		entry.headersFns = apiFnSite(entry.headersId, []string{"validate", "validationErrors"})
		entry.headersRef = protocol.Site{ID: entry.headersId}
	}
	return entry
}

// apiFnSite builds one type's synthetic multi-function site with the same fnIds and demands the scanner
// computes for a server helper's slot, whose options name no createX option, so every family renders plain.
func apiFnSite(id string, fnKeys []string) protocol.Site {
	site := protocol.Site{ID: id}
	for _, fnKey := range fnKeys {
		op, known := operations.ByFnKey(fnKey)
		if !known {
			continue
		}
		site.FnIds = append(site.FnIds, operations.FnHashFor(op, nil, "", false))
		for _, demand := range operations.DemandFor(fnKey, nil, "", false) {
			site.Demand = append(site.Demand, protocol.SiteDemand{
				FamilyTag:      demand.FamilyTag,
				VariantSuffix:  demand.VariantSuffix,
				Options:        demand.Options,
				FnHash:         demand.FnHash,
				RejectCircular: demand.RejectCircular,
				ComposedBy:     demand.ComposedBy,
			})
		}
	}
	if len(site.FnIds) > 0 {
		site.FnId = site.FnIds[0]
	}
	return site
}

// parserStrategies reads a method's `parser` pair; a missing or widened direction falls back to `clone`.
func parserStrategies(options map[string]any) (params, ret string) {
	params, ret = "clone", "clone"
	parser, ok := options["parser"].(map[string]any)
	if !ok {
		return params, ret
	}
	if value, ok := parser["params"].(string); ok && value != "" {
		params = value
	}
	if value, ok := parser["return"].(string); ok && value != "" {
		ret = value
	}
	return params, ret
}

// parseModeRow is every family one wire compiles, in the order a marker lists them.
type parseModeRow struct {
	validate         string
	validationErrors string
	encode           string
	decode           string
}

// parseModes mirrors PARSE_MODES in core's constants.ts and the marker slots in packages/rpc-router/src/types/parser.ts.
// All three must name the same families or strategyFromFamilies matches no row on the bundled lane.
// The validator follows the decoder: `clone` and `compact` rebuild the declared shape, so only a union can hide a key.
// `mutateStrict` has a row like any other; the RETURN wire never reaches it because ReturnParserStrategy leaves it out.
var parseModes = map[string]parseModeRow{
	"clone":        {"validateUnionKeys", "validationErrorsUnionKeys", "prepareForJsonClone", "restoreFromJsonClone"},
	"mutate":       {"validate", "validationErrors", "prepareForJsonMutate", "restoreFromJsonMutate"},
	"mutateStrict": {"validateStrict", "validationErrorsStrict", "prepareForJsonMutate", "restoreFromJsonMutate"},
	"compact":      {"validateUnionKeys", "validationErrorsUnionKeys", "compactForJson", "compactFromJson"},
}

// parseMode returns the row a strategy compiles, falling back to `clone` like parserStrategies' own default.
func parseMode(strategy string) parseModeRow {
	if row, ok := parseModes[strategy]; ok {
		return row
	}
	return parseModes["clone"]
}

// paramsMarkerKeys renders a row as the PARAMS marker's slot list. `formatTransform` (sanitizeParams) is
// params-only: the answer side is written by the handler, never by a caller.
func (row parseModeRow) paramsMarkerKeys() []string {
	return []string{row.validate, row.validationErrors, "formatTransform", row.encode, row.decode}
}

// returnMarkerKeys renders a row as the RETURN marker's slot list.
func (row parseModeRow) returnMarkerKeys() []string {
	return []string{row.validate, row.validationErrors, row.encode, row.decode}
}

// renderApiMethodModule renders `api/m/<id>.js`: the method's metadata row plus the marker payload the
// server helper receives, its entries imported from the mirror under `api/types/`.
func renderApiMethodModule(basename string, entry *apiMethodEntry) string {
	method := entry.method
	var out strings.Builder
	out.WriteString("// GENERATED by mion (bundled routes). Do not edit.\n")
	imports := map[string]map[string]bool{}
	addImports := func(site protocol.Site) {
		for _, siteImport := range sourcerewrite.SiteImports(site) {
			specifier := relApiToTypes(basename, siteImport.Basename)
			if imports[specifier] == nil {
				imports[specifier] = map[string]bool{}
			}
			imports[specifier][siteImport.Binding] = true
		}
	}
	addImports(entry.paramsFns)
	addImports(entry.returnFns)
	addImports(entry.paramsRef)
	addImports(entry.returnRef)
	if entry.headersId != "" {
		addImports(entry.headersFns)
		addImports(entry.headersRef)
	}
	specifiers := make([]string, 0, len(imports))
	for specifier := range imports {
		specifiers = append(specifiers, specifier)
	}
	sort.Strings(specifiers)
	for _, specifier := range specifiers {
		bindings := make([]string, 0, len(imports[specifier]))
		for binding := range imports[specifier] {
			bindings = append(bindings, binding)
		}
		sort.Strings(bindings)
		out.WriteString("import {" + strings.Join(bindings, ", ") + "} from '" + specifier + "';\n")
	}
	row := map[string]any{
		"id":        method.Id,
		"pointer":   method.Pointer,
		"nestLevel": method.NestLevel,
		"type":      method.Type,
		"isAsync":   method.IsAsync,
		"options":   method.Options,
	}
	if method.Type == apimeta.TypeRoute {
		row["middlewareIds"] = method.MiddlewareIds
	}
	rtFns := "{paramsFns: " + sourcerewrite.SlotBinding(entry.paramsFns) +
		", returnFns: " + sourcerewrite.SlotBinding(entry.returnFns) +
		", paramsId: " + sourcerewrite.SlotBinding(entry.paramsRef) +
		", returnId: " + sourcerewrite.SlotBinding(entry.returnRef)
	if entry.headersId != "" {
		rtFns += ", headersFns: " + sourcerewrite.SlotBinding(entry.headersFns) + ", headersId: " + sourcerewrite.SlotBinding(entry.headersRef)
	}
	// the bare id, not a binding: a client only compares it, so its runtype is never loaded
	if entry.syncId != "" {
		rtFns += ", syncId: " + encodeJSON(entry.syncId)
	}
	rtFns += "}"
	encoded := encodeJSON(row)
	// Splice the live bindings in: the row is JSON except for rtFns.
	out.WriteString("export const " + apimeta.MethodBinding(method.Id) + " = " + encoded[:len(encoded)-1] + ", \"rtFns\": " + rtFns + "};\n")
	return out.String()
}

// renderApiSiteModule renders `api/s/<id>.js`: the method rows a dispatch site registers, in tree order.
func renderApiSiteModule(basename string, ids []string) string {
	var out strings.Builder
	out.WriteString("// GENERATED by mion (bundled routes). Do not edit.\n")
	bindings := make([]string, 0, len(ids))
	for _, id := range ids {
		methodBasename := apimeta.MethodModuleBasename(id)
		binding := apimeta.MethodBinding(id)
		bindings = append(bindings, binding)
		out.WriteString("import {" + binding + "} from '" + ensureDotPrefix(relPosix(path.Dir(basename), methodBasename)) + moduleFileExt + "';\n")
	}
	out.WriteString("export const " + apiSiteBinding(basename) + " = {methods: [" + strings.Join(bindings, ", ") + "]};\n")
	return out.String()
}

// apiSiteBinding is the site module's export, the identifier the transform splices into the dispatch call.
func apiSiteBinding(basename string) string {
	return entrymodules.BindingName(basename)
}

// relApiToTypes is the specifier from an `api/<basename>` module to the mirror entry `api/types/<dep>`.
func relApiToTypes(fromBasename, depBasename string) string {
	return ensureDotPrefix(relPosix(path.Dir(fromBasename), typesSubdir+"/"+depBasename)) + moduleFileExt
}

func encodeJSON(value any) string {
	var encoded bytes.Buffer
	encoder := json.NewEncoder(&encoded)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		panic("bundled API row is not encodable: " + err.Error())
	}
	return strings.TrimSuffix(encoded.String(), "\n")
}
