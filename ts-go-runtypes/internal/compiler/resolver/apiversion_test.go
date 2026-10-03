package resolver_test

import (
	"regexp"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// The version slot is the InjectBuildVersion parameter of `initRoutes` / `initClient`; the fixtures stand in for both packages.

const versionRouterDTS = `declare module '@mionjs/router' {
  import type {InjectBuildVersion} from '@mionjs/run-types';
  type Handler = (...args: any[]) => any;
  type Opts = {alwaysRun: false; description: undefined; parser: {params: 'clone'; return: 'clone'}; isMutation: undefined; sanitizeParams: undefined};
  export type PublicApi<R> = {
    [K in keyof R]: R[K] extends {type: infer T; handler: infer H extends Handler}
      ? {type: T; handler: H; options: Opts; types?: {params: Parameters<H>; return: Awaited<ReturnType<H>>; headers: never; isAsync: false}}
      : PublicApi<R[K]>;
  };
  const apiBuildVersion: unique symbol;
  export type ApiBuildVersion<V extends string> = {readonly [apiBuildVersion]?: V};
  export interface MionRouter {
    initRoutes<R, const V extends string = string>(routes: R, buildVersion?: InjectBuildVersion<PublicApi<R>> & V): PublicApi<R> & ApiBuildVersion<V>;
  }
  export function createMionRouter(): MionRouter;
}
`

const versionClientDTS = `declare module '@mionjs/client' {
  import type {InjectBuildVersion} from '@mionjs/run-types';
  type Handler = (...args: any[]) => any;
  export type ClientRoutes<RA> = {[K in keyof RA]: RA[K] extends {type: 1; handler: infer H extends Handler} ? (...params: Parameters<H>) => unknown : ClientRoutes<RA[K]>};
  export function initClient<RA>(o?: unknown, buildVersion?: InjectBuildVersion<RA>): {routes: ClientRoutes<RA>};
}
`

// versionClientTS names the SAME routes the server declares, so only the build could separate the two versions.
const versionClientTS = `import {initClient} from '@mionjs/client';
type RouteOpts = {alwaysRun: false; description: undefined; parser: {params: 'clone'; return: 'clone'}; isMutation: undefined; sanitizeParams: undefined};
type Api = {
  users: {getById: {type: 1; handler: (id: number, verbose: boolean) => {id: number; name: string}; options: RouteOpts; types?: {params: [id: number, verbose: boolean]; return: {id: number; name: string}; headers: never; isAsync: false}}};
  sum: {type: 1; handler: (a: number, b: number) => number; options: RouteOpts; types?: {params: [a: number, b: number]; return: number; headers: never; isAsync: false}};
};
export const {routes} = initClient<Api>({baseURL: 'http://x'});
`

// injectedVersion reads the literal the transform spliced into the call, or "" when nothing was injected.
var injectedVersion = regexp.MustCompile(`init(?:Routes|Client)[^\n]*?, '([A-Za-z0-9]+)'\)`)

func transformedVersion(t *testing.T, session *resolver.Session, file string) string {
	t.Helper()
	response := session.Dispatch(protocol.Request{Op: protocol.OpTransform, Files: []string{file}})
	if response.Error != "" {
		t.Fatalf("transform %s: %s", file, response.Error)
	}
	match := injectedVersion.FindStringSubmatch(response.Transformed[file].Code)
	if match == nil {
		return ""
	}
	return match[1]
}

// TestApiVersion_ServerAndClientOfOneApiAgree: a program holding both ends injects one version into both
// calls. The edit at the end is the kind of change api-check exists to catch, so it must move the version.
func TestApiVersion_ServerAndClientOfOneApiAgree(t *testing.T) {
	sources := map[string]string{
		"router.d.ts": versionRouterDTS,
		"client.d.ts": versionClientDTS,
		"routes.ts":   apiServerRoutesTS(1, false),
		"client.ts":   versionClientTS,
	}
	build := setupApi(t, sources, t.TempDir(), constants.ClientRoutesBundle)
	serverVersion := transformedVersion(t, build, "routes.ts")
	if serverVersion == "" {
		t.Fatal("the server's initRoutes call got no version")
	}
	if clientVersion := transformedVersion(t, build, "client.ts"); clientVersion != serverVersion {
		t.Fatalf("the two ends of one API disagree: server %q, client %q", serverVersion, clientVersion)
	}

	edited := setupApi(t, map[string]string{"router.d.ts": versionRouterDTS, "routes.ts": apiServerRoutesTS(1, true)}, t.TempDir(), "")
	if editedVersion := transformedVersion(t, edited, "routes.ts"); editedVersion == serverVersion {
		t.Fatalf("an added route parameter must move the version, still %q", editedVersion)
	}
}

// TestApiVersion_DerivedFromTheTypesAlone: nothing about the build (a temp dir, a clock, a counter) may reach the value.
func TestApiVersion_DerivedFromTheTypesAlone(t *testing.T) {
	sources := map[string]string{"router.d.ts": versionRouterDTS, "routes.ts": apiServerRoutesTS(1, false)}
	first := transformedVersion(t, setupApi(t, sources, t.TempDir(), ""), "routes.ts")
	second := transformedVersion(t, setupApi(t, sources, t.TempDir(), ""), "routes.ts")
	if first == "" || first != second {
		t.Fatalf("two builds of one API must agree: %q then %q", first, second)
	}
}

// TestApiVersion_RouterPackageOwnFilesAreTrusted: no file spells `@mionjs/router`, yet the owning package makes a server.
func TestApiVersion_RouterPackageOwnFilesAreTrusted(t *testing.T) {
	routerSource := strings.Replace(versionRouterDTS, "declare module '@mionjs/router' {", "", 1)
	routerSource = strings.Replace(routerSource, "export function createMionRouter", "export declare function createMionRouter", 1)
	routerSource = routerSource[:strings.LastIndex(routerSource, "}")]
	routes := strings.Replace(apiServerRoutesTS(1, false), "from '@mionjs/router'", "from '../src/router'", 1)
	server := setupApi(t, map[string]string{
		"package.json":   `{"name": "@mionjs/router"}`,
		"src/router.ts":  routerSource,
		"test/routes.ts": routes,
	}, t.TempDir(), "")
	if version := transformedVersion(t, server, "test/routes.ts"); version == "" {
		t.Fatal("the router package's own routes got no version")
	}
}

// packageApiDTS is the .d.ts a `mion compile` server package publishes, with version as its build version.
func packageApiDTS(version string) string {
	return `declare module '@acme/api' {
  import type {ApiBuildVersion, PublicApi} from '@mionjs/router';
  type Routes = {
    users: {getById: {type: 1; handler: (id: number, verbose: boolean) => {id: number; name: string}}};
    sum: {type: 1; handler: (a: number, b: number) => number};
  };
  export const api: PublicApi<Routes> & ApiBuildVersion<` + version + `>;
}
`
}

const packageClientTS = `import {initClient} from '@mionjs/client';
import type {api} from '@acme/api';
export const {routes} = initClient<typeof api>({baseURL: 'http://x'});
`

// serverVersion builds the server from source and returns what its initRoutes injects.
func serverVersion(t *testing.T) string {
	t.Helper()
	version := transformedVersion(t, setupApi(t, map[string]string{"router.d.ts": versionRouterDTS, "routes.ts": apiServerRoutesTS(1, false)}, t.TempDir(), ""), "routes.ts")
	if version == "" {
		t.Fatal("the server got no version")
	}
	return version
}

// packageClient builds a client from a package .d.ts carrying version and returns its MET diagnostics.
func packageClient(t *testing.T, version string, routesMode constants.ClientRoutesMode) (*resolver.Session, []diagnostics.Diagnostic) {
	t.Helper()
	sources := map[string]string{
		"router.d.ts": versionRouterDTS,
		"client.d.ts": versionClientDTS,
		"acme.d.ts":   packageApiDTS(version),
		"client.ts":   packageClientTS,
	}
	session := setupApi(t, sources, t.TempDir(), routesMode)
	generated := session.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if generated.Error != "" {
		t.Fatalf("generate: %s", generated.Error)
	}
	return session, metDiags(generated.Diagnostics)
}

// TestApiVersion_DeclarationVersionMatches: a client built from the server's published types hashes to their version.
func TestApiVersion_DeclarationVersionMatches(t *testing.T) {
	server := serverVersion(t)
	client, diags := packageClient(t, "'"+server+"'", constants.ClientRoutesBundle)
	if len(diags) != 0 {
		t.Fatalf("a client matching its server's build reports nothing, got %+v", diags)
	}
	if version := transformedVersion(t, client, "client.ts"); version != server {
		t.Fatalf("the client must inject the server's version %q, got %q", server, version)
	}
}

// TestApiVersion_DeclarationVersionDiffers: ids computed apart from the server's build fail the client build, naming both.
func TestApiVersion_DeclarationVersionDiffers(t *testing.T) {
	server := serverVersion(t)
	_, diags := packageClient(t, "'notTheServer'", constants.ClientRoutesBundle)
	if len(diags) != 1 || diags[0].Code != diagnostics.CodeApiMetaServerVersionMismatch {
		t.Fatalf("expected one MET012, got %+v", diags)
	}
	if diags[0].Args[0] != server || diags[0].Args[1] != "notTheServer" || !strings.HasSuffix(diags[0].Site.FilePath, "client.ts") {
		t.Fatalf("MET012 must sit at initClient and name the client's then the server's version, got %+v", diags[0])
	}
}

// TestApiVersion_DeclarationWithoutVersionWarns: types without a version build with a warning and the client's own hash.
func TestApiVersion_DeclarationWithoutVersionWarns(t *testing.T) {
	server := serverVersion(t)
	client, diags := packageClient(t, "string", constants.ClientRoutesBundle)
	if len(diags) != 1 || diags[0].Code != diagnostics.CodeApiMetaNoServerVersion {
		t.Fatalf("expected one MET013, got %+v", diags)
	}
	if version := transformedVersion(t, client, "client.ts"); version != server {
		t.Fatalf("the client injects its own hash, equal to the server's here: want %q, got %q", server, version)
	}
}

// TestApiVersion_FetchClientGetsNone: a client fetching its routes bundles no ids, so it has no version to compare.
func TestApiVersion_FetchClientGetsNone(t *testing.T) {
	client, diags := packageClient(t, "'notTheServer'", constants.ClientRoutesFetch)
	for _, diag := range diags {
		if diag.Code == diagnostics.CodeApiMetaServerVersionMismatch || diag.Code == diagnostics.CodeApiMetaNoServerVersion {
			t.Fatalf("a fetching client compares nothing, got %+v", diag)
		}
	}
	if version := transformedVersion(t, client, "client.ts"); version != "" {
		t.Fatalf("a fetching client injects no version, got %q", version)
	}
}

// TestApiVersion_SourceTypedClientComparesNothing: a source-typed API has no server version; the client injects its own.
func TestApiVersion_SourceTypedClientComparesNothing(t *testing.T) {
	client := setupApi(t, map[string]string{"client.d.ts": versionClientDTS, "client.ts": versionClientTS}, t.TempDir(), constants.ClientRoutesBundle)
	generated := client.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if generated.Error != "" {
		t.Fatalf("generate: %s", generated.Error)
	}
	if diags := metDiags(generated.Diagnostics); len(diags) != 0 {
		t.Fatalf("expected no MET diagnostics, got %+v", diags)
	}
	if version := transformedVersion(t, client, "client.ts"); version != serverVersion(t) {
		t.Fatalf("the client's own hash must equal the server's for the same routes, got %q", version)
	}
}

// TestApiVersion_FilledSlotIsLeftAlone: a value already in the slot is the author's, never overwritten.
func TestApiVersion_FilledSlotIsLeftAlone(t *testing.T) {
	source := strings.Replace(apiServerRoutesTS(1, false), "}});\n", "}}, 'mine');\n", 1)
	server := setupApi(t, map[string]string{"router.d.ts": versionRouterDTS, "routes.ts": source}, t.TempDir(), "")
	if version := transformedVersion(t, server, "routes.ts"); version != "mine" {
		t.Fatalf("the author's value must survive, got %q", version)
	}
}

// TestApiVersion_ManifestCarriesTheSameValue: api-check must be able to name the value the server answers with.
func TestApiVersion_ManifestCarriesTheSameValue(t *testing.T) {
	genDir := t.TempDir()
	server := setupApi(t, map[string]string{"router.d.ts": versionRouterDTS, "routes.ts": apiServerRoutesTS(1, false)}, genDir, "")
	if gen := server.Dispatch(protocol.Request{Op: protocol.OpGenerate}); gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	manifest := readManifest(t, genDir)
	if manifest.BuildVersion == "" || manifest.BuildVersion != transformedVersion(t, server, "routes.ts") {
		t.Fatalf("manifest version %q does not match the injected one", manifest.BuildVersion)
	}
}

// TestApiVersion_OneProgramTwoEndsMustAgree: the client's API type is the author's to write, and a program
// holding both ends is the one place the build can tell that what was written is not what the router registered.
func TestApiVersion_OneProgramTwoEndsMustAgree(t *testing.T) {
	sources := map[string]string{
		"router.d.ts": versionRouterDTS,
		"client.d.ts": versionClientDTS,
		"routes.ts":   apiServerRoutesTS(1, true),
		"client.ts":   versionClientTS,
	}
	session := setupApi(t, sources, t.TempDir(), constants.ClientRoutesBundle)
	generated := session.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if generated.Error != "" {
		t.Fatalf("generate: %s", generated.Error)
	}
	if !hasDiagCode(generated.Diagnostics, diagnostics.CodeApiMetaVersionMismatch) {
		t.Fatalf("a client typed against other routes must be reported, got %v", generated.Diagnostics)
	}
}

// TestApiVersion_ServerAloneIsNeverMismatched: the check needs both ends, so a server build reports nothing.
func TestApiVersion_ServerAloneIsNeverMismatched(t *testing.T) {
	sources := map[string]string{"router.d.ts": versionRouterDTS, "routes.ts": apiServerRoutesTS(1, false)}
	generated := setupApi(t, sources, t.TempDir(), "").Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if generated.Error != "" {
		t.Fatalf("generate: %s", generated.Error)
	}
	if hasDiagCode(generated.Diagnostics, diagnostics.CodeApiMetaVersionMismatch) {
		t.Fatalf("a server alone was reported as mismatched: %v", generated.Diagnostics)
	}
}

func hasDiagCode(diags []diagnostics.Diagnostic, code string) bool {
	for _, diag := range diags {
		if diag.Code == code {
			return true
		}
	}
	return false
}

// sumRoutesTS is the server; sumClientTS is the client that matches it.
const sumRoutesTS = `import {createMionRouter} from '@mionjs/router';
const mion = createMionRouter();
export const api = mion.initRoutes({sum: {type: 1 as const, handler: (a: number, b: number): number => a + b}});
`

const sumClientTS = `import {initClient} from '@mionjs/client';
import type {api} from './routes.ts';
export const {routes} = initClient<typeof api>({baseURL: 'http://x'});
`

// TestApiVersion_EveryClientIsCheckedAgainstTheServer: a later matching client never hides an earlier mismatch.
func TestApiVersion_EveryClientIsCheckedAgainstTheServer(t *testing.T) {
	badClient := strings.Replace(versionClientTS, "export const {routes} = initClient<Api>", "export const {routes: other} = initClient<Api>", 1)
	sources := map[string]string{
		"router.d.ts": versionRouterDTS,
		"client.d.ts": versionClientDTS,
		"routes.ts":   sumRoutesTS,
		"a-client.ts": badClient,
		"b-client.ts": sumClientTS,
	}
	session := setupApi(t, sources, t.TempDir(), "")
	generated := session.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if generated.Error != "" {
		t.Fatalf("generate: %s", generated.Error)
	}
	var mismatches []diagnostics.Diagnostic
	for _, diag := range generated.Diagnostics {
		if diag.Code == diagnostics.CodeApiMetaVersionMismatch {
			mismatches = append(mismatches, diag)
		}
	}
	if len(mismatches) != 1 {
		t.Fatalf("expected one mismatch for a-client.ts, got %v", mismatches)
	}
	if !strings.HasSuffix(mismatches[0].Site.FilePath, "a-client.ts") || mismatches[0].Args[0] == mismatches[0].Args[1] {
		t.Fatalf("the error must point at a-client.ts and name two different versions, got %+v", mismatches[0])
	}
}

// TestApiGen_InitClientFilesFollowAnEdit: the initClient files are dropped with the Program, so a file that gains one gets the lane import.
func TestApiGen_InitClientFilesFollowAnEdit(t *testing.T) {
	sources := apiSources("export const nothing = 1;\n")
	sess := setupApi(t, sources, t.TempDir(), constants.ClientRoutesBundle)
	transform := func() string {
		response := sess.Dispatch(protocol.Request{Op: protocol.OpTransform, Files: []string{"client.ts"}})
		if response.Error != "" {
			t.Fatalf("transform: %s", response.Error)
		}
		return response.Transformed["client.ts"].Code
	}
	if code := transform(); strings.Contains(code, "api/lane.js") {
		t.Fatalf("a file with no initClient gets no lane import:\n%s", code)
	}
	sources["client.ts"] = apiClientTS
	if response := sess.Dispatch(protocol.Request{Op: protocol.OpSetSources, Sources: withRealMarker(t, sources)}); response.Error != "" {
		t.Fatalf("setSources: %s", response.Error)
	}
	if code := transform(); strings.Count(code, "api/lane.js") != 1 {
		t.Fatalf("the edit added initClient, so exactly one lane import belongs in the file:\n%s", code)
	}
}

// TestApiVersion_AllSingleWarnsSharedModules: a client sharing the router's program is warned under allSingle only.
func TestApiVersion_AllSingleWarnsSharedModules(t *testing.T) {
	generate := func(mode string) []diagnostics.Diagnostic {
		session := setupInlineWith(t, fullstackSources(false), func(programOpts *program.Options, resolverOpts *resolver.Options) {
			programOpts.SingleThreaded = true
			resolverOpts.SingleThreaded = true
			resolverOpts.GenDir = t.TempDir()
			resolverOpts.ClientRoutes = constants.ClientRoutesBundle
			resolverOpts.ModuleMode = mode
		})
		generated := session.Dispatch(protocol.Request{Op: protocol.OpGenerate})
		if generated.Error != "" {
			t.Fatalf("generate: %s", generated.Error)
		}
		return generated.Diagnostics
	}
	if !hasDiagCode(generate(constants.ModuleModeAllSingle), diagnostics.CodeApiMetaSharedModules) {
		t.Error("allSingle in a program holding client and server must warn MET014")
	}
	if hasDiagCode(generate(constants.ModuleModeDefault), diagnostics.CodeApiMetaSharedModules) {
		t.Error("default mode splits the modules per file, so nothing is reported")
	}
}

// TestApiVersion_AliasOfPublishedTypesWarns: a local alias over published types without a version still warns.
func TestApiVersion_AliasOfPublishedTypesWarns(t *testing.T) {
	sources := map[string]string{
		"router.d.ts": versionRouterDTS,
		"client.d.ts": versionClientDTS,
		"acme.d.ts":   packageApiDTS("string"),
		"client.ts": `import {initClient} from '@mionjs/client';
type Api = typeof import('@acme/api').api;
export const {routes} = initClient<Api>({baseURL: 'http://x'});
`,
	}
	generated := setupApi(t, sources, t.TempDir(), constants.ClientRoutesBundle).Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if generated.Error != "" {
		t.Fatalf("generate: %s", generated.Error)
	}
	if diags := metDiags(generated.Diagnostics); len(diags) != 1 || diags[0].Code != diagnostics.CodeApiMetaNoServerVersion {
		t.Fatalf("expected one MET013, got %+v", diags)
	}
}

// TestApiVersion_WrappedSourceTypesCompareNothing: a third-party helper type around a source-typed API is no published API.
func TestApiVersion_WrappedSourceTypesCompareNothing(t *testing.T) {
	sources := map[string]string{
		"client.d.ts": versionClientDTS,
		"fest.d.ts": `declare module 'type-fest' {
  export type Simplify<T> = {[K in keyof T]: T[K]} & {};
}
`,
		"client.ts": strings.Replace(versionClientTS, "initClient<Api>(", "initClient<Simplify<Api>>(", 1) + "import type {Simplify} from 'type-fest';\n",
	}
	generated := setupApi(t, sources, t.TempDir(), constants.ClientRoutesBundle).Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if generated.Error != "" {
		t.Fatalf("generate: %s", generated.Error)
	}
	if diags := metDiags(generated.Diagnostics); len(diags) != 0 {
		t.Fatalf("expected no MET diagnostics, got %+v", diags)
	}
}
