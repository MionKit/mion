package batchcompile

import (
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// versionedRouterDTS stands in for @mionjs/router: a handler-dependent marker slot and a versioned initRoutes type.
const versionedRouterDTS = `declare module '@mionjs/router' {
  import type {InjectBuildVersion, InjectRunTypeId, InjectTypeFnArgs} from '@mionjs/run-types';
  type Ctx = {path: string};
  type Handler = (ctx: Ctx, ...args: any[]) => any;
  type Params<H> = H extends (ctx: any, ...args: infer P) => any ? P : never;
  const apiBuildVersion: unique symbol;
  export type ApiBuildVersion<V extends string> = {readonly [apiBuildVersion]?: V};
  type Opts = {alwaysRun: false; description: undefined; parser: {params: 'clone'; return: 'clone'}; isMutation: undefined; sanitizeParams: undefined};
  export type Route<H extends Handler> = {type: 1; handler: H; options: Opts; types?: {params: Params<H>; return: ReturnType<H>; headers: never; isAsync: false}};
  type Fn<RO, Name extends string> = RO extends {parser: 'compact'} ? Name : Name;
  export function route<H extends Handler, const RO extends object = {}>(handler: H, opts?: RO, paramsFns?: InjectTypeFnArgs<Params<H>, Fn<RO, 'validate'>, Fn<RO, 'validationErrors'>>, paramsId?: InjectRunTypeId<Params<H>>): Route<H>;
  export function initRoutes<R, const V extends string = string>(routes: R, buildVersion?: InjectBuildVersion<R> & V): R & ApiBuildVersion<V>;
}
`

const versionedServerTS = `import {initRoutes, route} from '@mionjs/router';
export const api = initRoutes({sum: route((ctx, a: number, b: number): number => a + b)});
`

var injectedVersionRE = regexp.MustCompile(`, '([A-Za-z0-9]{12})'\)`)

// TestCompile_DeclarationsKeepRouteTypesAndCarryTheVersion: the injected marker arguments must not widen route types.
func TestCompile_DeclarationsKeepRouteTypesAndCarryTheVersion(t *testing.T) {
	dir := writeProject(t, map[string]string{"router.d.ts": versionedRouterDTS, "server.ts": versionedServerTS})
	writeFile(t, filepath.Join(dir, "tsconfig.json"), strings.Replace(projectTsconfigJSON, `"strict": true,`, `"strict": true, "declaration": true,`, 1))
	compileProject(t, dir, nil)

	js := readEmitted(t, dir, "server.js")
	if !strings.Contains(js, "__rt_") {
		t.Fatalf("the route's marker slots must be injected in the js:\n%s", js)
	}
	match := injectedVersionRE.FindStringSubmatch(js)
	if match == nil {
		t.Fatalf("initRoutes got no build version:\n%s", js)
	}
	dts := readEmitted(t, dir, "server.d.ts")
	if !strings.Contains(dts, "a: number, b: number) => number") {
		t.Errorf("the declaration lost the route's handler type:\n%s", dts)
	}
	if !strings.Contains(dts, `ApiBuildVersion<"`+match[1]+`">`) {
		t.Errorf("the declaration must carry the injected version %s:\n%s", match[1], dts)
	}
}

// TestCompile_SkippedDeclarationEmitNamesTheCause: a .d.ts tsgo refuses to write fails with its own diagnostic, not a bare line.
func TestCompile_SkippedDeclarationEmitNamesTheCause(t *testing.T) {
	dir := writeProject(t, map[string]string{"a.ts": "export const next = (n: number) => n + 1;\n"})
	writeFile(t, filepath.Join(dir, "tsconfig.json"), strings.Replace(projectTsconfigJSON, `"strict": true,`, `"strict": true, "declaration": true, "isolatedDeclarations": true,`, 1))
	_, err := Run(Options{Cwd: dir, TsconfigPath: "tsconfig.json", GenDir: filepath.Join(dir, ".mion")})
	if err == nil || !strings.Contains(err.Error(), "src/a.ts(1,") || !strings.Contains(err.Error(), "error TS") {
		t.Fatalf("the failure must name the file and the TS code, got %v", err)
	}
}
