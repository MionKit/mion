package resolver_test

import (
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// The version slot is the InjectBuildVersion parameter of `initRoutes` / `initClient`; the fixtures stand in for both packages.

const versionRouterDTS = `declare module '@mionjs/router' {
  import type {InjectBuildVersion} from '@mionjs/run-types';
  type Handler = (...args: any[]) => any;
  type Opts = {alwaysRun: false; validateParams: true; validateReturn: false; description: undefined; parser: {params: 'clone'; return: 'clone'}; isMutation: undefined; sanitizeParams: undefined};
  export type PublicApi<R> = {
    [K in keyof R]: R[K] extends {type: infer T; handler: infer H extends Handler}
      ? {type: T; handler: H; options: Opts; types?: {params: Parameters<H>; return: Awaited<ReturnType<H>>; headers: never; isAsync: false}}
      : PublicApi<R[K]>;
  };
  export interface MionRouter { initRoutes<R>(routes: R, buildVersion?: InjectBuildVersion<PublicApi<R>>): PublicApi<R> }
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
type RouteOpts = {alwaysRun: false; validateParams: true; validateReturn: false; description: undefined; parser: {params: 'clone'; return: 'clone'}; isMutation: undefined; sanitizeParams: undefined};
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

// TestApiVersion_ServerAndClientOfOneApiAgree: the client reads the API through api.tsConfig, which makes its
// ids the server's. The edit at the end is the kind of change api-check exists to catch, so it must move the version.
func TestApiVersion_ServerAndClientOfOneApiAgree(t *testing.T) {
	serverTsconfig := writeApiServerProject(t, filepath.Join(t.TempDir(), "server"), 1)
	server := setupApi(t, map[string]string{"router.d.ts": versionRouterDTS, "routes.ts": apiServerRoutesTS(1, false)}, t.TempDir(), "", "")
	serverVersion := transformedVersion(t, server, "routes.ts")
	if serverVersion == "" {
		t.Fatal("the server's initRoutes call got no version")
	}

	client := setupApi(t, map[string]string{"client.d.ts": versionClientDTS, "client.ts": versionClientTS}, t.TempDir(), constants.BundleApiBundled, serverTsconfig)
	clientVersion := transformedVersion(t, client, "client.ts")
	if clientVersion != serverVersion {
		t.Fatalf("the two ends of one API disagree: server %q, client %q", serverVersion, clientVersion)
	}

	edited := setupApi(t, map[string]string{"router.d.ts": versionRouterDTS, "routes.ts": apiServerRoutesTS(1, true)}, t.TempDir(), "", "")
	if editedVersion := transformedVersion(t, edited, "routes.ts"); editedVersion == serverVersion {
		t.Fatalf("an added route parameter must move the version, still %q", editedVersion)
	}
}

// TestApiVersion_DerivedFromTheTypesAlone: nothing about the build (a temp dir, a clock, a counter) may reach the value.
func TestApiVersion_DerivedFromTheTypesAlone(t *testing.T) {
	sources := map[string]string{"router.d.ts": versionRouterDTS, "routes.ts": apiServerRoutesTS(1, false)}
	first := transformedVersion(t, setupApi(t, sources, t.TempDir(), "", ""), "routes.ts")
	second := transformedVersion(t, setupApi(t, sources, t.TempDir(), "", ""), "routes.ts")
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
	}, t.TempDir(), "", "")
	if version := transformedVersion(t, server, "test/routes.ts"); version == "" {
		t.Fatal("the router package's own routes got no version")
	}
}

// TestApiVersion_UntrustedClientGetsNone: a client reading the API neither through api.tsConfig nor through the
// router resolved those types under its own settings, so its ids may differ with nothing wrong; it injects nothing.
func TestApiVersion_UntrustedClientGetsNone(t *testing.T) {
	client := setupApi(t, map[string]string{"client.d.ts": versionClientDTS, "client.ts": versionClientTS}, t.TempDir(), constants.BundleApiBundled, "")
	if version := transformedVersion(t, client, "client.ts"); version != "" {
		t.Fatalf("an untrusted client claimed version %q", version)
	}
}

// TestApiVersion_FilledSlotIsLeftAlone: a value already in the slot is the author's, never overwritten.
func TestApiVersion_FilledSlotIsLeftAlone(t *testing.T) {
	source := strings.Replace(apiServerRoutesTS(1, false), "}});\n", "}}, 'mine');\n", 1)
	server := setupApi(t, map[string]string{"router.d.ts": versionRouterDTS, "routes.ts": source}, t.TempDir(), "", "")
	if version := transformedVersion(t, server, "routes.ts"); version != "mine" {
		t.Fatalf("the author's value must survive, got %q", version)
	}
}

// TestApiVersion_ManifestCarriesTheSameValue: api-check must be able to name the value the server answers with.
func TestApiVersion_ManifestCarriesTheSameValue(t *testing.T) {
	genDir := t.TempDir()
	server := setupApi(t, map[string]string{"router.d.ts": versionRouterDTS, "routes.ts": apiServerRoutesTS(1, false)}, genDir, "", "")
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
	session := setupApi(t, sources, t.TempDir(), constants.BundleApiBundled, "")
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
	generated := setupApi(t, sources, t.TempDir(), "", "").Dispatch(protocol.Request{Op: protocol.OpGenerate})
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
	session := setupApi(t, sources, t.TempDir(), "", "")
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
