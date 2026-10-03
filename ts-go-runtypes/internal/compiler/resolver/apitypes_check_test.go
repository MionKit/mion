package resolver_test

import (
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

const typesPkgDir = "node_modules/@acme/api-types"

// typesOnlyApiDTS is the API as a published package file; Secret's typeless private member is MKR016 bait.
func typesOnlyApiDTS(version string) string {
	return `import type {ApiBuildVersion, PublicApi} from '@mionjs/router';
export declare class Secret {
    id: string;
    private code;
}
type Routes = {
  users: {getById: {type: 1; handler: (id: number, verbose: boolean) => {id: number; name: string}}};
  sum: {type: 1; handler: (a: number, b: number) => number};
  secret: {type: 1; handler: () => Secret};
};
export declare const api: PublicApi<Routes> & ApiBuildVersion<` + version + `>;
`
}

// The client names Secret through both getRunTypeId shapes, the sites MKR016 reports at.
const typesOnlyClientTS = `import {initClient} from '@mionjs/client';
import {getRunTypeId} from '@mionjs/run-types';
import type {api, Secret} from '@acme/api-types';
export const {routes} = initClient<typeof api>({baseURL: 'http://x'});
export const staticId = getRunTypeId<Secret>();
declare const secret: Secret;
export const valueId = getRunTypeId(secret);
`

// typesOnlyClient builds a client from @acme/api-types and returns the MET and MKR016 findings of a dump plus a generate.
func typesOnlyClient(t *testing.T, packageJSON, marker, version string, mode constants.ClientRoutesMode) []diagnostics.Diagnostic {
	t.Helper()
	sources := map[string]string{
		"router.d.ts":                 versionRouterDTS,
		"client.d.ts":                 versionClientDTS,
		typesPkgDir + "/package.json": packageJSON,
		typesPkgDir + "/index.d.ts":   typesOnlyApiDTS(version),
		"client.ts":                   typesOnlyClientTS,
	}
	genDir := t.TempDir()
	session := setupInlineWith(t, sources, func(programOpts *program.Options, resolverOpts *resolver.Options) {
		programOpts.SingleThreaded = true
		resolverOpts.SingleThreaded = true
		resolverOpts.GenDir = genDir
		resolverOpts.TransformRelative = true
		resolverOpts.ClientRoutes = mode
		if marker != "" {
			programOpts.Overlay[tspath.ResolvePath(programOpts.Cwd, typesPkgDir+"/mion-api.json")] = marker
		}
	})
	var found []diagnostics.Diagnostic
	for _, op := range []string{protocol.OpDump, protocol.OpGenerate} {
		response := session.Dispatch(protocol.Request{Op: op})
		if response.Error != "" {
			t.Fatalf("%s: %s", op, response.Error)
		}
		for _, diag := range response.Diagnostics {
			// MET010 says the stub API serves no metadata to a fetching client: true, and not this check's business.
			if (strings.HasPrefix(diag.Code, "MET") && diag.Code != diagnostics.CodeApiMetaNoMetadataToFetch) || diag.Code == diagnostics.CodeMarkerTypelessPrivateMember {
				found = append(found, diag)
			}
		}
	}
	return diagnostics.Dedupe(found)
}

const typesOnlyPackageJSON = `{"name": "@acme/api-types", "types": "./index.d.ts", "mion": {"apiTypes": "./mion-api.json"}}`

func markerJSON(compiler string) string {
	return `{"format": 1, "package": "@acme/api", "compiler": "` + compiler + `", "buildVersion": "x"}`
}

func apiTypesCodes(diags []diagnostics.Diagnostic) string {
	codes := make([]string, 0, len(diags))
	for _, diag := range diags {
		codes = append(codes, diag.Code)
	}
	return strings.Join(codes, ",")
}

// TestApiTypes_MissingMarkerIsOneError: the version and private-member findings it explains are dropped, both modes.
func TestApiTypes_MissingMarkerIsOneError(t *testing.T) {
	for _, mode := range []constants.ClientRoutesMode{constants.ClientRoutesBundle, constants.ClientRoutesFetch} {
		diags := typesOnlyClient(t, typesOnlyPackageJSON, "", "'notTheServer'", mode)
		if apiTypesCodes(diags) != diagnostics.CodeApiMetaTypesNotBuiltByMion {
			t.Fatalf("%s: want one MET015, got %+v", mode, diags)
		}
		if diags[0].Args[0] != "@acme/api-types" || !strings.Contains(diags[0].Args[1], "mion-api.json") || !strings.HasSuffix(diags[0].Site.FilePath, "client.ts") {
			t.Errorf("%s: MET015 must name the package and the missing marker at initClient, got %+v", mode, diags[0])
		}
	}
}

// TestApiTypes_MissingFieldIsOneError: no `mion.apiTypes` field at all.
func TestApiTypes_MissingFieldIsOneError(t *testing.T) {
	diags := typesOnlyClient(t, `{"name": "@acme/api-types", "types": "./index.d.ts"}`, "", "string", constants.ClientRoutesBundle)
	if apiTypesCodes(diags) != diagnostics.CodeApiMetaTypesNotBuiltByMion || !strings.Contains(diags[0].Args[1], "mion.apiTypes") {
		t.Fatalf("want one MET015 naming the field, got %+v", diags)
	}
}

// TestApiTypes_PackageWithJavaScriptIsNotJudged: a full server package keeps today's findings.
func TestApiTypes_PackageWithJavaScriptIsNotJudged(t *testing.T) {
	diags := typesOnlyClient(t, `{"name": "@acme/api", "types": "./index.d.ts", "main": "./index.js"}`, "", "'notTheServer'", constants.ClientRoutesBundle)
	codes := apiTypesCodes(diags)
	if strings.Contains(codes, diagnostics.CodeApiMetaTypesNotBuiltByMion) || !strings.Contains(codes, diagnostics.CodeApiMetaServerVersionMismatch) || !strings.Contains(codes, diagnostics.CodeMarkerTypelessPrivateMember) {
		t.Fatalf("want MET012 and MKR016, no MET015, got %+v", diags)
	}
}

// TestApiTypes_OtherCompilerWarns: the marker is there but another mion wrote it; the version check still runs.
func TestApiTypes_OtherCompilerWarns(t *testing.T) {
	diags := typesOnlyClient(t, typesOnlyPackageJSON, markerJSON("0.0.0-other"), "'notTheServer'", constants.ClientRoutesBundle)
	codes := apiTypesCodes(diags)
	if !strings.Contains(codes, diagnostics.CodeApiMetaTypesOtherCompiler) || !strings.Contains(codes, diagnostics.CodeApiMetaServerVersionMismatch) || strings.Contains(codes, diagnostics.CodeApiMetaTypesNotBuiltByMion) {
		t.Fatalf("want MET016 beside MET012, got %+v", diags)
	}
}

// TestApiTypes_ValidMarkerReportsNothingOfItsOwn: a package `mion api-types` wrote, with the server's version.
func TestApiTypes_ValidMarkerReportsNothingOfItsOwn(t *testing.T) {
	diags := typesOnlyClient(t, typesOnlyPackageJSON, markerJSON(constants.Version), "'notTheServer'", constants.ClientRoutesBundle)
	for _, diag := range diags {
		if diag.Code == diagnostics.CodeApiMetaTypesNotBuiltByMion || diag.Code == diagnostics.CodeApiMetaTypesOtherCompiler {
			t.Fatalf("a valid marker raises nothing, got %+v", diags)
		}
	}
}
