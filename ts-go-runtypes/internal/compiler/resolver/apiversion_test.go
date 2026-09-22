package resolver_test

import (
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// The version slot is the InjectBuildVersion parameter of `initRoutes` and `initClient`. Both fixtures
// below are the real markers over an ambient stand-in of the package surface.

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

// versionClientTS names the SAME two routes the server project declares, with the boolean parameter the
// server's getById carries, so the only thing that could separate the two versions is the build.
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

// TestApiVersion_ServerAndClientOfOneApiAgree: the two ends inject the same literal, and the server edit
// api-check exists to catch moves it. The client reads the API through api.tsConfig, which is what makes
// its ids the server's.
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

// TestApiVersion_DerivedFromTheTypesAlone: two separate builds of one unchanged API answer with the same
// version. Nothing about the build (a temp dir, a clock, a counter) may reach the value.
func TestApiVersion_DerivedFromTheTypesAlone(t *testing.T) {
	sources := map[string]string{"router.d.ts": versionRouterDTS, "routes.ts": apiServerRoutesTS(1, false)}
	first := transformedVersion(t, setupApi(t, sources, t.TempDir(), "", ""), "routes.ts")
	second := transformedVersion(t, setupApi(t, sources, t.TempDir(), "", ""), "routes.ts")
	if first == "" || first != second {
		t.Fatalf("two builds of one API must agree: %q then %q", first, second)
	}
}

// TestApiVersion_UntrustedClientGetsNone: a client that reads the API neither through api.tsConfig nor
// through the router resolved those types under its own compiler settings, so its ids may differ with
// nothing wrong. It injects nothing, and the runtime reads that as "no version".
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

// TestApiVersion_ManifestCarriesTheSameValue: the manifest reports what the calls carry, so api-check can
// name the value the server answers with.
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
