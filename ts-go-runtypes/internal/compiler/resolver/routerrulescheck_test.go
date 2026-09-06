package resolver_test

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// routerRulesDTS is the ambient stand-in for the two packages the route rules
// read. Only the shapes matter: the helper interfaces whose first argument is
// the handler, and the error hierarchy the returned-error rule walks.
const routerRulesDTS = `declare module '@mionjs/router' {
  export interface CallContext { path: string }
  export type Handler = (ctx: CallContext, ...params: any[]) => any;
  export interface RouteDef<H> { handler: H }
  export interface RouteHelper { <H extends Handler>(handler: H, opts?: unknown): RouteDef<H> }
  export interface MiddleFnHelper { <H extends Handler>(handler: H, opts?: unknown): RouteDef<H> }
  export interface MionRouter { readonly route: RouteHelper; readonly middleFn: MiddleFnHelper }
  export function createMionRouter(opts?: unknown): MionRouter;
}
declare module '@mionjs/core' {
  export class TypedError<T extends string = string> extends Error { readonly type: T }
  export class RpcError<T extends string = string> extends TypedError<T> { readonly publicMessage: string }
}
`

// routerRulesRoutes carries one finding of each kind, and NO runtypes marker —
// which is the point: a route file need not import the marker package, and the
// pass must still reach it.
const routerRulesRoutes = `import {createMionRouter} from '@mionjs/router';
const mion = createMionRouter();
export interface Wire { ok: number; constructor: string }
export const noReturn = mion.route((ctx, name: string) => name);
export const untyped = mion.route((ctx, name): string => 'x');
export const throws = mion.route((ctx, name: string): string => { throw new Error(name); });
export const badError = mion.route((ctx, name: string): string | Error => 'x');
`

func routerRuleCodes(response protocol.Response) map[string]int {
	byCode := map[string]int{}
	for _, diagnostic := range response.Diagnostics {
		if diagnostic.Family == diagnostics.FamilyMionRoute {
			byCode[diagnostic.Code]++
		}
	}
	return byCode
}

// TestCheckRouterRules_SinglePassFindings drives the one-pass contract the lint
// plugin relies on: one scanFiles request with CheckRouterRules returns every
// mion route finding for the file, anchored to a real position in the path that
// was requested.
func TestCheckRouterRules_SinglePassFindings(t *testing.T) {
	res := setupInline(t, map[string]string{"router.d.ts": routerRulesDTS, "routes.ts": routerRulesRoutes})
	response := res.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"routes.ts"}, CheckRouterRules: true})
	if response.Error != "" {
		t.Fatalf("scan error: %s", response.Error)
	}
	for code, want := range map[string]int{
		diagnostics.CodeRouteMissingReturnType:  1,
		diagnostics.CodeRouteMissingParamType:   1,
		diagnostics.CodeRouteThrowInHandler:     1,
		diagnostics.CodeRouteReturnedErrorType:  1,
		diagnostics.CodeRouteUnsafePropertyName: 1,
	} {
		if got := routerRuleCodes(response)[code]; got != want {
			t.Errorf("%s fired %d time(s), want %d", code, got, want)
		}
	}
	for _, diagnostic := range response.Diagnostics {
		if diagnostic.Family != diagnostics.FamilyMionRoute {
			continue
		}
		if diagnostic.Site.FilePath != "routes.ts" {
			t.Errorf("%s: FilePath = %q, want the requested path", diagnostic.Code, diagnostic.Site.FilePath)
		}
		if diagnostic.Site.StartLine < 1 || diagnostic.Site.StartCol < 1 {
			t.Errorf("%s: unanchored site %+v", diagnostic.Code, diagnostic.Site)
		}
		if diagnostic.Severity != diagnostics.SeverityError {
			t.Errorf("%s: severity = %d, want error", diagnostic.Code, diagnostic.Severity)
		}
	}
}

// TestCheckRouterRules_OptIn pins the gate. This is not an optimisation: every
// route code is Severity-Error, and `mion compile` plus the bundler plugins'
// failOnError stop on one, so a build that ran these would fail on a finding a
// team may have turned off in its lint config.
func TestCheckRouterRules_OptIn(t *testing.T) {
	res := setupInline(t, map[string]string{"router.d.ts": routerRulesDTS, "routes.ts": routerRulesRoutes})
	response := res.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"routes.ts"}})
	if response.Error != "" {
		t.Fatalf("scan error: %s", response.Error)
	}
	if found := routerRuleCodes(response); len(found) != 0 {
		t.Errorf("without CheckRouterRules the pass must not run; got %v", found)
	}
	// The transform lane is the one a build actually runs, so pin it too.
	response = res.Dispatch(protocol.Request{Op: protocol.OpTransform, Files: []string{"routes.ts"}})
	if found := routerRuleCodes(response); len(found) != 0 {
		t.Errorf("a transform must never carry route findings; got %v", found)
	}
}
