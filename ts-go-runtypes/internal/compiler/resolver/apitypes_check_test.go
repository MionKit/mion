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

// typesOnlyApiDTS is the API as a published package file; Secret's typeless private member is marker-untyped-private-member bait.
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

// The client names Secret through both getRunTypeId shapes, the sites marker-untyped-private-member reports at.
const typesOnlyClientTS = `import {initClient} from '@mionjs/client';
import {getRunTypeId} from '@mionjs/run-types';
import type {api, Secret} from '@acme/api-types';
export const {routes} = initClient<typeof api>({baseURL: 'http://x'});
export const staticId = getRunTypeId<Secret>();
declare const secret: Secret;
export const valueId = getRunTypeId(secret);
`

// typesOnlyClient builds a client from @acme/api-types and returns the rpc-client-* and marker-untyped-private-member findings of a dump plus a generate.
func typesOnlyClient(t *testing.T, packageJSON, marker, version string, mode constants.ClientRoutesMode) []diagnostics.Diagnostic {
	t.Helper()
	extra := map[string]string{}
	if marker != "" {
		extra[typesPkgDir+"/mion-api.json"] = marker
	}
	return typesOnlyClientWith(t, packageJSON, version, mode, extra, nil, []string{protocol.OpDump, protocol.OpGenerate})
}

// typesOnlyClientWith adds overlay-only files (never program roots) and extra sources, and runs the given ops.
func typesOnlyClientWith(t *testing.T, packageJSON, version string, mode constants.ClientRoutesMode, extra, extraSources map[string]string, ops []string) []diagnostics.Diagnostic {
	t.Helper()
	sources := map[string]string{
		"router.d.ts":                 versionRouterDTS,
		"client.d.ts":                 versionClientDTS,
		typesPkgDir + "/package.json": packageJSON,
		typesPkgDir + "/index.d.ts":   typesOnlyApiDTS(version),
		"client.ts":                   typesOnlyClientTS,
	}
	for rel, text := range extraSources {
		sources[rel] = text
	}
	genDir := t.TempDir()
	session := setupInlineWith(t, sources, func(programOpts *program.Options, resolverOpts *resolver.Options) {
		programOpts.SingleThreaded = true
		resolverOpts.SingleThreaded = true
		resolverOpts.GenDir = genDir
		resolverOpts.TransformRelative = true
		resolverOpts.ClientRoutes = mode
		for rel, text := range extra {
			programOpts.Overlay[tspath.ResolvePath(programOpts.Cwd, rel)] = text
		}
	})
	var found []diagnostics.Diagnostic
	for _, op := range ops {
		response := session.Dispatch(protocol.Request{Op: op})
		if response.Error != "" {
			t.Fatalf("%s: %s", op, response.Error)
		}
		for _, diag := range response.Diagnostics {
			// rpc-client-no-metadata-route says the stub API serves no metadata to a fetching client: true, and not this check's business.
			if (strings.HasPrefix(diag.Code, "rpc-client-") && diag.Code != diagnostics.CodeApiMetaNoMetadataToFetch) || diag.Code == diagnostics.CodeMarkerTypelessPrivateMember {
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
			t.Fatalf("%s: want one rpc-client-types-not-built-by-mion, got %+v", mode, diags)
		}
		if diags[0].Args[0] != "@acme/api-types" || !strings.Contains(diags[0].Args[1], "mion-api.json") || !strings.HasSuffix(diags[0].Site.FilePath, "client.ts") {
			t.Errorf("%s: rpc-client-types-not-built-by-mion must name the package and the missing marker at initClient, got %+v", mode, diags[0])
		}
	}
}

// TestApiTypes_MissingFieldIsOneError: no `mion.apiTypes` field at all.
func TestApiTypes_MissingFieldIsOneError(t *testing.T) {
	diags := typesOnlyClient(t, `{"name": "@acme/api-types", "types": "./index.d.ts"}`, "", "string", constants.ClientRoutesBundle)
	if apiTypesCodes(diags) != diagnostics.CodeApiMetaTypesNotBuiltByMion || !strings.Contains(diags[0].Args[1], "mion.apiTypes") {
		t.Fatalf("want one rpc-client-types-not-built-by-mion naming the field, got %+v", diags)
	}
}

// TestApiTypes_PackageWithJavaScriptIsNotJudged: a full server package keeps today's findings.
func TestApiTypes_PackageWithJavaScriptIsNotJudged(t *testing.T) {
	diags := typesOnlyClient(t, `{"name": "@acme/api", "types": "./index.d.ts", "main": "./index.js"}`, "", "'notTheServer'", constants.ClientRoutesBundle)
	codes := apiTypesCodes(diags)
	if strings.Contains(codes, diagnostics.CodeApiMetaTypesNotBuiltByMion) || !strings.Contains(codes, diagnostics.CodeApiMetaServerVersionMismatch) || !strings.Contains(codes, diagnostics.CodeMarkerTypelessPrivateMember) {
		t.Fatalf("want rpc-client-server-version-mismatch and marker-untyped-private-member, no rpc-client-types-not-built-by-mion, got %+v", diags)
	}
}

// TestApiTypes_OtherCompilerWarns: the marker is there but another mion wrote it; the version check still runs.
func TestApiTypes_OtherCompilerWarns(t *testing.T) {
	diags := typesOnlyClient(t, typesOnlyPackageJSON, markerJSON("0.0.0-other"), "'notTheServer'", constants.ClientRoutesBundle)
	codes := apiTypesCodes(diags)
	if !strings.Contains(codes, diagnostics.CodeApiMetaTypesOtherCompiler) || !strings.Contains(codes, diagnostics.CodeApiMetaServerVersionMismatch) || strings.Contains(codes, diagnostics.CodeApiMetaTypesNotBuiltByMion) {
		t.Fatalf("want rpc-client-types-other-mion-version beside rpc-client-server-version-mismatch, got %+v", diags)
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

// TestApiTypes_DumpAloneReportsTheError: `mion compile --no-emit` stops after the dump, so rpc-client-types-not-built-by-mion must come with it.
func TestApiTypes_DumpAloneReportsTheError(t *testing.T) {
	diags := typesOnlyClientWith(t, typesOnlyPackageJSON, "'notTheServer'", constants.ClientRoutesBundle, nil, nil, []string{protocol.OpDump})
	if apiTypesCodes(diags) != diagnostics.CodeApiMetaTypesNotBuiltByMion {
		t.Fatalf("a dump alone must report rpc-client-types-not-built-by-mion and drop the marker-untyped-private-member it explains, got %+v", diags)
	}
}

// TestApiTypes_RootIndexMeansJavaScript: with no `main` and no `exports`, a root index.js is what Node loads.
func TestApiTypes_RootIndexMeansJavaScript(t *testing.T) {
	diags := typesOnlyClientWith(t, `{"name": "@acme/api", "types": "./index.d.ts"}`, "'notTheServer'", constants.ClientRoutesBundle,
		map[string]string{typesPkgDir + "/index.js": "export const api = {};\n"}, nil, []string{protocol.OpDump, protocol.OpGenerate})
	if codes := apiTypesCodes(diags); strings.Contains(codes, diagnostics.CodeApiMetaTypesNotBuiltByMion) || !strings.Contains(codes, diagnostics.CodeApiMetaServerVersionMismatch) {
		t.Fatalf("a package with a root index.js keeps today's findings, got %+v", diags)
	}
}

// TestApiTypes_OnlyTheRefusedPackageIsSilenced: another package's typeless private member still fails the build.
func TestApiTypes_OnlyTheRefusedPackageIsSilenced(t *testing.T) {
	other := map[string]string{
		"node_modules/@acme/ledger/package.json": `{"name": "@acme/ledger", "types": "./index.d.ts", "main": "./index.js"}`,
		"node_modules/@acme/ledger/index.d.ts":   "export declare class Account {\n    id: string;\n    private balance;\n}\n",
		"ledger.ts":                              "import {getRunTypeId} from '@mionjs/run-types';\nimport type {Account} from '@acme/ledger';\nexport const accountId = getRunTypeId<Account>();\ndeclare const account: Account;\nexport const accountValueId = getRunTypeId(account);\n",
	}
	diags := typesOnlyClientWith(t, typesOnlyPackageJSON, "'notTheServer'", constants.ClientRoutesBundle, nil, other, []string{protocol.OpDump, protocol.OpGenerate})
	var rpcClientTypesNotBuiltByMion, ledger, refused int
	for _, diag := range diags {
		switch {
		case diag.Code == diagnostics.CodeApiMetaTypesNotBuiltByMion:
			rpcClientTypesNotBuiltByMion++
		case diag.Code == diagnostics.CodeMarkerTypelessPrivateMember && strings.Contains(strings.Join(diag.Args, ","), "Account"):
			ledger++
		case diag.Code == diagnostics.CodeMarkerTypelessPrivateMember:
			refused++
		}
	}
	if rpcClientTypesNotBuiltByMion != 1 || ledger == 0 || refused != 0 {
		t.Fatalf("want one rpc-client-types-not-built-by-mion, the ledger's marker-untyped-private-member kept and the refused package's dropped; got %+v", diags)
	}
}
