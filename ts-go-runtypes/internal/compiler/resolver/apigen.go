package resolver

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/builtinpurefns"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/operations"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/apimeta"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/sourcerewrite"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/jsquote"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// The bundled-API lane (mion's `bundleApi` client option). A client program's
// dispatch sites (internal/compiler/apimeta) name, in their marker's type
// arguments, the API and the routes they call. On generate this file:
//
//  1. resolves every site's routes out of the API type (walked in this program,
//     or in the `apiTsconfig` program rooted at its `initRoutes` call),
//  2. selects each route plus the middleFns in its chain,
//  3. assigns the params / return / headers type ids under the checker that
//     owns them (`AssignIDUnder`, so an API resolved in another program still
//     lands in this session's cache) and demands, per type, exactly the families
//     the server's marker slots name (types/encoder.ts MarkerSlots),
//  4. renders those entries as a SELF-CONTAINED module tree under
//     <outDir>/api/types/ in `functions` emit mode, whatever the program's own
//     mode (a client never evaluates code strings), plus one module per method
//     (`api/m/<id>.js`: its metadata and the same marker payload a server
//     helper receives) and one per site shape (`api/s/<id>.js`: the route with
//     its chain, or a batch's union), and
//  5. writes the client manifest (`api/manifest.json`) `mion api-check` reads.
//
// The transform (OpScanFiles / OpTransform) needs none of that: a dispatch
// site's injection is decided by its ids alone (apimeta.Replacements), so a
// client file rewrites before generate ever ran, and the modules it imports
// are the ones generate writes.

// apiLaneOn reports whether this session bundles API metadata.
func (sess *Session) apiLaneOn() bool {
	return sess.opts.BundleApi.Enabled()
}

// extractApiSitesForScan runs the dispatch-site extractor over the requested
// files: the sites, their diagnostics and the point insertions for the
// user's source. Memoised per file (apiFileCache). Nothing when the lane is
// off.
func (sess *Session) extractApiSitesForScan(files []string) ([]apimeta.Site, []diagnostics.Diagnostic, []protocol.Replacement) {
	if !sess.apiLaneOn() || sess.Program == nil || len(files) == 0 {
		return nil, nil, nil
	}
	sites, diags := apimeta.ExtractFromProgramCached(sess.checker, sess.marker, sess.Program, files, sess.apiFileCache, sess.opts.BundleApi)
	return sites, diags, append(apimeta.Replacements(sites), sess.apiLaneImports(files)...)
}

// apiLaneImports appends `import '<genDir>/api/lane.js';` to every file that
// calls `initClient`, the way the batch table reaches the modules that create
// a router. The lane is a build option, so it arrives as a module rather than
// as a value spliced into a call a user could also write.
func (sess *Session) apiLaneImports(files []string) []protocol.Replacement {
	sites := apimeta.InitSitesFromProgramCached(sess.checker, sess.marker, sess.Program, files, sess.apiInitFileCache)
	if len(sites) == 0 {
		return nil
	}
	// Same two roads as the batch transport's import: under TransformRelative the rewritten file
	// IS the output, so the path is computed here; otherwise the `rtapi:/` scheme rides out and
	// the emit-side relativizer turns it into the path the emitted file's own depth needs.
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

// collectProgramApiSites walks every non-declaration file of the program
// through the dispatch-site extractor (memoised per file).
func (sess *Session) collectProgramApiSites() ([]apimeta.Site, []diagnostics.Diagnostic) {
	if !sess.apiLaneOn() || sess.Program == nil {
		return nil, nil
	}
	sourceFiles := sess.Program.TS.SourceFiles()
	walkFiles := make([]string, 0, len(sourceFiles))
	for _, sourceFile := range sourceFiles {
		if sourceFile == nil || sourceFile.IsDeclarationFile {
			continue
		}
		walkFiles = append(walkFiles, sourceFile.FileName())
	}
	return apimeta.ExtractFromProgramCached(sess.checker, sess.marker, sess.Program, walkFiles, sess.apiFileCache, sess.opts.BundleApi)
}

// apiMethodEntry is one selected method with the ids and synthetic sites its
// module renders from.
type apiMethodEntry struct {
	method    *apimeta.Method
	paramsId  string
	returnId  string
	headersId string
	// The synthetic sites: fn sites demand the families, reflection sites the
	// runtype facades. Stamped with their bundle modules before rendering.
	paramsFns  protocol.Site
	returnFns  protocol.Site
	headersFns protocol.Site
	paramsRef  protocol.Site
	returnRef  protocol.Site
	headersRef protocol.Site
	families   []string
}

// apiBundle is the resolved output of one generate: every selected method,
// the site modules and the ids they list.
type apiBundle struct {
	methods map[string]*apiMethodEntry
	order   []string
	// siteMethods maps a site module basename to the ids it lists, in tree
	// order: the route(s) the site calls plus every middleFn in their chains.
	siteMethods map[string][]string
}

func (bundle *apiBundle) empty() bool {
	return bundle == nil || len(bundle.methods) == 0
}

// syntheticSites lists every synthetic site in a stable order, the dump the
// client mirror is rendered from.
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

// generateApiBundle resolves the program's dispatch sites and writes the
// bundled-API tree under <outDir>/api/, plus the API manifest: the server's
// (from this program's initRoutes calls) when the program initializes an API,
// else the client's (the bundled methods). The dir is removed when neither
// applies. Returns the diagnostics the resolution raised.
func (sess *Session) generateApiBundle(outDir string, sites []apimeta.Site) ([]diagnostics.Diagnostic, error) {
	apiDir := filepath.Join(outDir, constants.ApiModuleDir)
	bundle, diags, err := sess.resolveApiBundle(sites)
	if err != nil {
		return diags, err
	}
	manifest := sess.serverApiManifest()
	if bundle.empty() && manifest == nil {
		if err := os.RemoveAll(apiDir); err != nil {
			return diags, unwritableOutDirError(apiDir, err)
		}
		return diags, nil
	}
	files := map[string]string{}
	if !bundle.empty() {
		renderDiags, renderErr := sess.renderApiBundle(bundle, files)
		diags = append(diags, renderDiags...)
		if renderErr != nil {
			return diags, renderErr
		}
		if manifest == nil {
			manifest = bundle.clientManifest(sess.opts)
		}
		files[constants.ApiLaneFile] = renderApiLaneModule(sess.opts.BundleApi)
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
	if err := writeIfChanged(filepath.Join(apiDir, constants.ApiManifestFile), manifest.Render()); err != nil {
		return diags, unwritableOutDirError(apiDir, err)
	}
	return diags, nil
}

// renderApiLaneModule renders `api/lane.js`, the module that puts the client on
// the lane the build compiled for. Imported for its side effect into every file
// that calls `initClient`, the way `rpc/batches.generated.js` reaches a server,
// so the lane is set in exactly one place: the build that produced the bundle.
func renderApiLaneModule(mode constants.BundleApiMode) string {
	return "// GENERATED by mion (the bundleApi lane). Do not edit.\n" +
		"import {setBundleApiMode} from '" + apimeta.ClientModule + "';\n" +
		"setBundleApiMode(" + jsquote.Single(string(mode)) + ");\n"
}

// renderApiBundle renders the bundle's module tree into files (basename to
// source, the materializeModules shape): the demanded families as a
// SELF-CONTAINED client mirror under types/, one module per method, one per
// site.
func (sess *Session) renderApiBundle(bundle *apiBundle, files map[string]string) ([]diagnostics.Diagnostic, error) {
	// Stamp each synthetic site with its bundle module (allSingle mode) one by
	// one: two methods can demand different families for the same type id, so
	// a site is only its own, never looked up by id.
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
	// The client mirror: the demanded families rendered as factories only, in
	// their own tree, with no disk cache (the store is keyed by the session's
	// own emit mode). Pure fns the program registers ride along in the same
	// mode, so a validator depending on a user format still resolves.
	var renderDiags []diagnostics.Diagnostic
	renderOpts := sess.rtRenderOpts(&renderDiags, nil)
	renderOpts.EmitMode = constants.EmitFunctions
	renderOpts.Store = nil
	pureFnEntries, _, _ := sess.extractProgramPureFns(nil)
	pureFnGraph := purefunctions.CollectEntries(sess.userPureFnEntries(pureFnEntries), constants.EmitFunctions)
	apiDump := protocol.Dump{RunTypes: sess.cache.Dump(), Sites: stamped}
	typeModules, err := sess.collectEntryModules(apiDump, renderOpts, pureFnGraph, nil)
	if err != nil {
		return renderDiags, fmt.Errorf("bundleApi: %w", err)
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

// clientManifest is the manifest a client build writes: the bundled methods,
// the lane and the API pointer it resolved them through.
func (bundle *apiBundle) clientManifest(opts Options) *apimeta.Manifest {
	manifest := &apimeta.Manifest{Kind: apimeta.ManifestKindClient, Mode: string(opts.BundleApi), ApiTsconfig: opts.ApiTsconfig, Methods: map[string]apimeta.ManifestMethod{}}
	for _, id := range bundle.order {
		manifest.Methods[id] = bundle.methods[id].manifestRow()
	}
	return manifest
}

// manifestRow is the method's manifest row: what api-check compares.
func (entry *apiMethodEntry) manifestRow() apimeta.ManifestMethod {
	return apimeta.ManifestMethod{
		Type:        entry.method.Type,
		ParamsId:    entry.paramsId,
		ReturnId:    entry.returnId,
		HeadersId:   entry.headersId,
		Families:    entry.families,
		Options:     entry.method.Options,
		MiddleFnIds: entry.method.MiddleFnIds,
	}
}

// serverApiManifest is the manifest a server build writes: every public
// method of every `initRoutes(...)` call in THIS program, ids assigned under
// this program's checker (the same ids the route helpers' marker sites got, so
// the walk adds nothing to the cache). Nil when the program initializes no
// API. An id two calls declare with differing rows keeps the first row and
// is listed as ambiguous (a program holding its spec files does that).
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

// userPureFnEntries drops the built-in `rt::` / `rtFormats::` registrations an
// in-repo program surfaces (the built-in table serves those) and adds the
// override entries, exactly like collectProgramPureFns.
func (sess *Session) userPureFnEntries(entries []purefunctions.Entry) []purefunctions.Entry {
	kept := make([]purefunctions.Entry, 0, len(entries)+len(sess.overrideEntries))
	for _, entry := range entries {
		if builtinpurefns.Has(entry.Key()) {
			continue
		}
		kept = append(kept, entry)
	}
	return append(kept, sess.overrideEntries...)
}

// resolveApiBundle walks the API type(s) the sites name, selects their
// methods and assigns the type ids.
func (sess *Session) resolveApiBundle(sites []apimeta.Site) (*apiBundle, []diagnostics.Diagnostic, error) {
	bundle := &apiBundle{methods: map[string]*apiMethodEntry{}, siteMethods: map[string][]string{}}
	var diags []diagnostics.Diagnostic
	trees := map[*checker.Type]*apimeta.Tree{}
	problems := map[*checker.Type]string{}
	var peerTree *apimeta.Tree
	var peerCandidates string
	peerTried := false
	widenedReported := map[string]bool{}
	for _, site := range sites {
		tree, ok := trees[site.ApiType]
		if !ok {
			var problem string
			tree, problem = apimeta.WalkApi(site.Checker, site.ApiType)
			trees[site.ApiType] = tree
			problems[site.ApiType] = problem
		}
		if tree == nil {
			diags = append(diags, diagnostics.New(diagnostics.CodeApiMetaUnreadable, site.DiagSite(), problems[site.ApiType]))
			continue
		}
		if sess.opts.ApiTsconfig != "" {
			// The API project's own program answers, rooted at its initRoutes
			// call; the client's walk only says which routes to match on.
			if !peerTried {
				peerTried = true
				var peerErr error
				peerTree, peerCandidates, peerErr = sess.apiSourceTree(tree.Ids())
				if peerErr != nil {
					return nil, diags, peerErr
				}
			}
			if peerTree == nil {
				diags = append(diags, diagnostics.New(diagnostics.CodeApiMetaSourceAmbiguous, site.DiagSite(), sess.absPath(sess.opts.ApiTsconfig), peerCandidates))
				continue
			}
			tree = peerTree
		}
		methods, missing := tree.Select(site.Ids)
		for _, id := range missing {
			diags = append(diags, diagnostics.New(diagnostics.CodeApiMetaRouteNotDeclared, site.DiagSite(), id))
		}
		ids := make([]string, 0, len(methods))
		for _, method := range methods {
			ids = append(ids, method.Id)
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
			// The client file reflects these types: an edit to a route's
			// declaration re-runs its transform (TypeDeps).
			for _, id := range []string{entry.paramsId, entry.returnId, entry.headersId} {
				sess.cache.RecordFileID(site.FilePath, id)
			}
		}
		bundle.siteMethods[site.ModuleBasename()] = ids
	}
	return bundle, diags, nil
}

// apiSourceTree opens the `apiTsconfig` program and returns the walked API of
// the ONE `initRoutes(...)` call whose routes are exactly the client's; nil
// when none or several match (the caller reports MET005 with the count).
func (sess *Session) apiSourceTree(clientIds []string) (*apimeta.Tree, string, error) {
	tsconfig := sess.absPath(sess.opts.ApiTsconfig)
	peer, err := sess.apiPeer.open(sess, tsconfig, "apiTsconfig", nil)
	if err != nil {
		return nil, "", err
	}
	var matches []*apimeta.Tree
	wanted := strings.Join(clientIds, "\n")
	for _, sourceFile := range peer.Program.TS.SourceFiles() {
		if sourceFile == nil || sourceFile.IsDeclarationFile || strings.Contains(sourceFile.FileName(), "/node_modules/") {
			continue
		}
		if !strings.Contains(sourceFile.Text(), apimeta.InitRoutesName) {
			continue
		}
		for _, apiType := range initRoutesApiTypes(peer.checker, peer.marker, sourceFile) {
			tree, problem := apimeta.WalkApi(peer.checker, apiType)
			if problem != "" || tree == nil {
				continue
			}
			if strings.Join(tree.Ids(), "\n") == wanted {
				matches = append(matches, tree)
			}
		}
	}
	candidates := fmt.Sprint(len(matches))
	if len(matches) != 1 {
		return nil, candidates, nil
	}
	return matches[0], candidates, nil
}

// initRoutesApiTypes returns the resolved return type (the instantiated
// PublicApi) of every `initRoutes(...)` call in sourceFile whose signature the
// router package declares.
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

// newApiMethodEntry assigns the method's type ids under the checker that owns
// them and builds the synthetic sites demanding the server's families.
func (sess *Session) newApiMethodEntry(owner *checker.Checker, method *apimeta.Method) *apiMethodEntry {
	entry := &apiMethodEntry{method: method}
	entry.paramsId = sess.cache.AssignIDUnder(owner, method.Params)
	entry.returnId = sess.cache.AssignIDUnder(owner, method.Return)
	paramsStrategy, returnStrategy := encoderStrategies(method.Options)
	paramsKeys := []string{"val", "verr", "huk", "uke", "fmt", encodeFamily(paramsStrategy), decodeFamily(paramsStrategy)}
	returnKeys := []string{"val", "verr", "huk", "uke", encodeFamily(returnStrategy), decodeFamily(returnStrategy)}
	entry.paramsFns = apiFnSite(entry.paramsId, paramsKeys)
	entry.returnFns = apiFnSite(entry.returnId, returnKeys)
	entry.paramsRef = protocol.Site{ID: entry.paramsId}
	entry.returnRef = protocol.Site{ID: entry.returnId}
	entry.families = append(append([]string(nil), paramsKeys...), returnKeys...)
	if method.Headers != nil {
		entry.headersId = sess.cache.AssignIDUnder(owner, method.Headers)
		entry.headersFns = apiFnSite(entry.headersId, []string{"val", "verr"})
		entry.headersRef = protocol.Site{ID: entry.headersId}
	}
	return entry
}

// apiFnSite builds the synthetic multi-function site for one type: the same
// fnIds and demands the scanner computes for a server helper's
// `InjectTypeFnArgs<T, F1, F2, …>` slot, whose options slot (the route's own
// options) names none of the createX options, so every family renders in its
// plain variant.
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
			})
		}
	}
	if len(site.FnIds) > 0 {
		site.FnId = site.FnIds[0]
	}
	return site
}

// encoderStrategies reads the resolved `encoder` pair off a method's options;
// a missing or widened direction falls back to the built-in default, `clone`.
func encoderStrategies(options map[string]any) (params, ret string) {
	params, ret = "clone", "clone"
	encoder, ok := options["encoder"].(map[string]any)
	if !ok {
		return params, ret
	}
	if value, ok := encoder["params"].(string); ok && value != "" {
		params = value
	}
	if value, ok := encoder["return"].(string); ok && value != "" {
		ret = value
	}
	return params, ret
}

// encodeFamily / decodeFamily mirror EncodeFamily / DecodeFamily in
// packages/router/src/types/encoder.ts (and ENCODE_FAMILY_BY_STRATEGY in core).
func encodeFamily(strategy string) string {
	switch strategy {
	case "mutate":
		return "pj"
	case "direct":
		return "sj"
	case "compact":
		return "cj"
	default:
		return "pjs"
	}
}

func decodeFamily(strategy string) string {
	if strategy == "compact" {
		return "cjr"
	}
	return "rj"
}

// renderApiMethodModule renders `api/m/<id>.js`: the method's metadata row plus
// the marker payload the server helper receives, its entries imported from the
// mirror under `api/types/`.
func renderApiMethodModule(basename string, entry *apiMethodEntry) string {
	method := entry.method
	var out strings.Builder
	out.WriteString("// GENERATED by mion (bundleApi). Do not edit.\n")
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
		row["middleFnIds"] = method.MiddleFnIds
	}
	rtFns := "{paramsFns: " + sourcerewrite.SlotBinding(entry.paramsFns) +
		", returnFns: " + sourcerewrite.SlotBinding(entry.returnFns) +
		", paramsId: " + sourcerewrite.SlotBinding(entry.paramsRef) +
		", returnId: " + sourcerewrite.SlotBinding(entry.returnRef)
	if entry.headersId != "" {
		rtFns += ", headersFns: " + sourcerewrite.SlotBinding(entry.headersFns) + ", headersId: " + sourcerewrite.SlotBinding(entry.headersRef)
	}
	rtFns += "}"
	encoded := encodeJSON(row)
	// Splice the live bindings in: the row is JSON except for rtFns.
	out.WriteString("export const " + apimeta.MethodBinding(method.Id) + " = " + encoded[:len(encoded)-1] + ", \"rtFns\": " + rtFns + "};\n")
	return out.String()
}

// renderApiSiteModule renders `api/s/<id>.js`: the payload a dispatch site
// registers, the method rows it needs in tree order.
func renderApiSiteModule(basename string, ids []string) string {
	var out strings.Builder
	out.WriteString("// GENERATED by mion (bundleApi). Do not edit.\n")
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

// apiSiteBinding is the export of a site module, the identifier the transform
// splices into the dispatch call (apimeta.Site.SiteBinding, from the basename).
func apiSiteBinding(basename string) string {
	return entrymodules.BindingName(basename)
}

// relApiToTypes is the specifier from an `api/<basename>` module to the mirror
// entry module `api/types/<dep>`.
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
