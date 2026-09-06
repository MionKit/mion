package routerrules

import (
	"context"
	"sort"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
)

// routerDts is the ambient stand-in for the `@mionjs/router` surface the rules
// read. The SHAPE is what matters: three helper interfaces whose first argument
// is the handler, and the two handler type aliases. It mirrors the real
// packages/router/src/types/mionRouter.ts without the marker parameters, which
// play no part in these rules.
const routerDts = `declare module '@mionjs/router' {
  export interface CallContext { path: string }
  export interface HeadersSubset<K extends string> { headers: Record<K, string> }
  export type Handler = (ctx: CallContext, ...params: any[]) => any;
  export type HeaderHandler = (ctx: CallContext, headers: HeadersSubset<any>, ...params: any[]) => any;
  export interface RouteDef<H> { handler: H }
  export interface RouteHelper { <H extends Handler>(handler: H, opts?: unknown): RouteDef<H> }
  export interface MiddleFnHelper { <H extends Handler>(handler: H, opts?: unknown): RouteDef<H> }
  export interface HeadersFnHelper { <H extends HeaderHandler>(handler: H, opts?: unknown): RouteDef<H> }
  export interface RawMiddleFnHelper { <H extends (...a: any[]) => any>(handler: H, opts?: unknown): RouteDef<H> }
  export interface MionRouter {
    readonly route: RouteHelper;
    readonly query: RouteHelper;
    readonly mutation: RouteHelper;
    readonly middleFn: MiddleFnHelper;
    readonly headersFn: HeadersFnHelper;
    readonly rawMiddleFn: RawMiddleFnHelper;
  }
  export function createMionRouter(opts?: unknown): MionRouter;
  // The package's OWN internal helpers (lib/handlers.ts), which is how the
  // framework declares its built-in routes.
  export function route<H extends Handler>(handler: H, opts?: unknown): RouteDef<H>;
  export function rawMiddleFn<H extends (...a: any[]) => any>(handler: H, opts?: unknown): RouteDef<H>;
}
`

// coreDts is the ambient stand-in for `@mionjs/core`: the error hierarchy the
// returned-error rule walks. TypedError carries the brand and RpcError adds the
// public answer, which is why only RpcError and its subclasses are accepted.
const coreDts = `declare module '@mionjs/core' {
  export class TypedError<T extends string = string> extends Error { readonly type: T }
  export class RpcError<T extends string = string, D = unknown> extends TypedError<T> {
    constructor(params?: unknown);
    readonly publicMessage: string;
    readonly statusCode: number;
  }
  export class FatalError<T extends string = string, D = unknown> extends RpcError<T, D> {}
}
`

// prelude is the ordinary way a route file opens.
const prelude = `import {createMionRouter} from '@mionjs/router';
const mion = createMionRouter();
`

// check builds a one-file program over the ambients and runs every rule.
func check(t *testing.T, files map[string]string) []diagnostics.Diagnostic {
	t.Helper()
	cwd := tspath.NormalizePath(t.TempDir())
	overlay := map[string]string{}
	names := make([]string, 0, len(files))
	for name := range files {
		names = append(names, name)
	}
	sort.Strings(names)
	var abs []string
	for _, name := range names {
		path := tspath.ResolvePath(cwd, name)
		overlay[path] = files[name]
		abs = append(abs, path)
	}
	for name, content := range map[string]string{"router.d.ts": routerDts, "core.d.ts": coreDts} {
		path := tspath.ResolvePath(cwd, name)
		overlay[path] = content
		abs = append(abs, path)
	}
	prog, err := program.NewInferred(program.Options{Cwd: cwd, SingleThreaded: true, Overlay: overlay}, abs)
	if err != nil {
		t.Fatalf("program.NewInferred: %v", err)
	}
	typeChecker, releaseLease := prog.TS.GetTypeChecker(context.Background())
	if typeChecker == nil {
		t.Fatalf("GetTypeChecker returned nil")
	}
	t.Cleanup(func() {
		if releaseLease != nil {
			releaseLease()
		}
	})
	markerOpts := marker.WithDefaults(marker.Options{FS: prog.FS})
	var found []diagnostics.Diagnostic
	for _, name := range names {
		sourceFile := prog.SourceFile(tspath.ResolvePath(cwd, name))
		if sourceFile == nil {
			t.Fatalf("source file %s not in program", name)
		}
		found = append(found, CheckSourceFile(typeChecker, markerOpts, sourceFile, name)...)
	}
	return found
}

// checkBody runs the rules over one file made of the prelude plus body.
func checkBody(t *testing.T, body string) []diagnostics.Diagnostic {
	t.Helper()
	return check(t, map[string]string{"routes.ts": prelude + body})
}

func codes(found []diagnostics.Diagnostic) []string {
	out := make([]string, 0, len(found))
	for _, one := range found {
		out = append(out, one.Code)
	}
	return out
}

func assertCodes(t *testing.T, found []diagnostics.Diagnostic, want ...string) {
	t.Helper()
	got := codes(found)
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("codes = %v, want %v\n%s", got, want, render(found))
	}
}

func render(found []diagnostics.Diagnostic) string {
	var out strings.Builder
	for _, one := range found {
		out.WriteString(diagnostics.FormatDebug(one))
		out.WriteString("\n")
	}
	return out.String()
}

// ─────────────────────────── strong-typed-routes ───────────────────────────

func TestStrongTypedRoutes_InlineHandler(t *testing.T) {
	assertCodes(t, checkBody(t, "export const ok = mion.route((ctx, name: string): string => name);"))
	assertCodes(t, checkBody(t, "export const bad = mion.route((ctx, name: string) => name);"),
		diagnostics.CodeRouteMissingReturnType)
	assertCodes(t, checkBody(t, "export const bad = mion.route((ctx, name): string => name);"),
		diagnostics.CodeRouteMissingParamType)
	assertCodes(t, checkBody(t, "export const bad = mion.route((ctx, name) => name);"),
		diagnostics.CodeRouteMissingReturnType, diagnostics.CodeRouteMissingParamType)
}

func TestStrongTypedRoutes_ContextParamsAreExempt(t *testing.T) {
	// The context is never annotated in real code and never crosses the wire.
	assertCodes(t, checkBody(t, "export const ok = mion.route((ctx): string => 'x');"))
	// headersFn takes TWO context parameters.
	assertCodes(t, checkBody(t, "export const ok = mion.headersFn((ctx, headers): void => undefined);"))
	assertCodes(t, checkBody(t, "export const bad = mion.headersFn((ctx, headers, id): void => undefined);"),
		diagnostics.CodeRouteMissingParamType)
}

func TestStrongTypedRoutes_RawMiddleFnIsNotAHandler(t *testing.T) {
	// A raw middleFn takes no typed params and declares no return type.
	assertCodes(t, checkBody(t, "export const raw = mion.rawMiddleFn((ctx, req) => undefined);"))
}

// The four handler shapes the syntactic rules could not see.

func TestStrongTypedRoutes_NamedFunctionReference(t *testing.T) {
	assertCodes(t, checkBody(t, `
function myHandler(ctx: unknown, name: string) { return name; }
export const bad = mion.route(myHandler);
`), diagnostics.CodeRouteMissingReturnType)
}

func TestStrongTypedRoutes_ArrowBoundToAConst(t *testing.T) {
	assertCodes(t, checkBody(t, `
const myHandler = (ctx: unknown, name: string) => name;
export const bad = mion.route(myHandler);
`), diagnostics.CodeRouteMissingReturnType)
}

func TestStrongTypedRoutes_SatisfiesExpression(t *testing.T) {
	assertCodes(t, check(t, map[string]string{"routes.ts": `import {createMionRouter, type Handler} from '@mionjs/router';
const mion = createMionRouter();
export const bad = mion.route(((ctx, name: string) => name) satisfies Handler);
`}), diagnostics.CodeRouteMissingReturnType)
}

func TestStrongTypedRoutes_HandlerTypedConst(t *testing.T) {
	// Never passed to a helper: the annotation alone declares it a handler.
	assertCodes(t, check(t, map[string]string{"routes.ts": `import {type Handler} from '@mionjs/router';
export const bad: Handler = (ctx, name: string) => name;
`}), diagnostics.CodeRouteMissingReturnType)
}

func TestStrongTypedRoutes_JsdocTag(t *testing.T) {
	assertCodes(t, check(t, map[string]string{"routes.ts": `
/** @mion:route */
export const bad = (ctx: unknown, name: string) => name;
`}), diagnostics.CodeRouteMissingReturnType)
	assertCodes(t, check(t, map[string]string{"routes.ts": `
/** @mion:headersFn */
export function ok(ctx: unknown, headers: unknown): void {}
`}))
}

// The router shapes an import-reading rule could not see.

func TestRouterShapes(t *testing.T) {
	cases := map[string]string{
		"alias": `import {createMionRouter as create} from '@mionjs/router';
const mion = create();
export const bad = mion.route((ctx, name: string) => name);
`,
		"namespace": `import * as router from '@mionjs/router';
const mion = router.createMionRouter();
export const bad = mion.route((ctx, name: string) => name);
`,
		"destructured": `import {createMionRouter} from '@mionjs/router';
const {route} = createMionRouter();
export const bad = route((ctx, name: string) => name);
`,
		"renamedHelper": `import {createMionRouter} from '@mionjs/router';
const {route: declare_} = createMionRouter();
export const bad = declare_((ctx, name: string) => name);
`,
	}
	for name, source := range cases {
		t.Run(name, func(t *testing.T) {
			assertCodes(t, check(t, map[string]string{"routes.ts": source}), diagnostics.CodeRouteMissingReturnType)
		})
	}
}

func TestRouterShapes_LocalBarrel(t *testing.T) {
	// The router is created in one module and imported from another — the shape
	// the syntactic rule only handled by trusting a relative import specifier.
	assertCodes(t, check(t, map[string]string{
		"mion.ts": `import {createMionRouter} from '@mionjs/router';
export const mion = createMionRouter();
`,
		"routes.ts": `import {mion} from './mion.ts';
export const bad = mion.route((ctx, name: string) => name);
`,
	}), diagnostics.CodeRouteMissingReturnType)
}

func TestRouterShapes_PackageOwnInternalHelper(t *testing.T) {
	// The framework's built-in routes call the bare `route()` from the router
	// package rather than a helper off the factory result. A rule that only knew
	// the helper interfaces would stop checking the router's own routes.
	assertCodes(t, check(t, map[string]string{"routes.ts": `import {route} from '@mionjs/router';
export const builtIn = route((ctx, name: string) => name);
`}), diagnostics.CodeRouteMissingReturnType)
}

func TestRouterShapes_RawMiddleFnFunctionIsNotAHandler(t *testing.T) {
	assertCodes(t, check(t, map[string]string{"routes.ts": `import {rawMiddleFn} from '@mionjs/router';
export const raw = rawMiddleFn((ctx, req) => undefined);
`}))
}

func TestRouterShapes_SameNamedCallElsewhereIsIgnored(t *testing.T) {
	assertCodes(t, check(t, map[string]string{"routes.ts": `
const app = {route: (path: string, handler: unknown) => handler};
export const ok = app.route('/x', (ctx: unknown, name: unknown) => name);
`}))
}

// ─────────────────────────── no-throw-in-handlers ───────────────────────────

func TestRouterShapes_SameNamedFunctionFromAnotherPackageIsIgnored(t *testing.T) {
	assertCodes(t, check(t, map[string]string{
		"other.d.ts": "declare module 'other-framework' {\n  export function route<H>(handler: H): H;\n}\n",
		"routes.ts": `import {route} from 'other-framework';
export const notMine = route((ctx: unknown, name: unknown) => name);
`,
	}))
}

func TestNoThrowInHandlers(t *testing.T) {
	assertCodes(t, check(t, map[string]string{"routes.ts": `import {createMionRouter} from '@mionjs/router';
import {RpcError} from '@mionjs/core';
const mion = createMionRouter();
export const bad = mion.route((ctx, name: string): string => { throw new Error(name); });
`}), diagnostics.CodeRouteThrowInHandler)
}

func TestNoThrowInHandlers_CaughtThrowIsFine(t *testing.T) {
	assertCodes(t, checkBody(t, `
export const ok = mion.route((ctx, name: string): string => {
  try { throw new Error(name); } catch { return 'caught'; }
});
`))
}

func TestNoThrowInHandlers_ThrowInACatchStillEscapes(t *testing.T) {
	assertCodes(t, checkBody(t, `
export const bad = mion.route((ctx, name: string): string => {
  try { return name; } catch (e) { throw e; }
});
`), diagnostics.CodeRouteThrowInHandler)
}

func TestNoThrowInHandlers_ThrowInsideACallbackEscapes(t *testing.T) {
	assertCodes(t, checkBody(t, `
export const bad = mion.route((ctx, names: string[]): string[] =>
  names.map((one) => { throw new Error(one); }));
`), diagnostics.CodeRouteThrowInHandler)
}

func TestNoThrowInHandlers_ThrowOutsideAHandlerIsIgnored(t *testing.T) {
	assertCodes(t, checkBody(t, `
export function helper(name: string): string { throw new Error(name); }
`))
}

// ─────────────────────────── returned-error-type ────────────────────────────

func TestReturnedErrorType_RpcErrorIsFine(t *testing.T) {
	assertCodes(t, check(t, map[string]string{"routes.ts": `import {createMionRouter} from '@mionjs/router';
import {RpcError, FatalError} from '@mionjs/core';
const mion = createMionRouter();
export const ok = mion.route((ctx, id: string): string | RpcError => 'x');
export const alsoOk = mion.middleFn((ctx): void | FatalError => undefined);
`}))
}

func TestReturnedErrorType_PlainErrorIsReported(t *testing.T) {
	assertCodes(t, check(t, map[string]string{"routes.ts": `import {createMionRouter} from '@mionjs/router';
const mion = createMionRouter();
export const bad = mion.route((ctx, id: string): string | Error => 'x');
`}), diagnostics.CodeRouteReturnedErrorType)
}

func TestReturnedErrorType_CustomErrorSubclassIsReported(t *testing.T) {
	assertCodes(t, check(t, map[string]string{"routes.ts": `import {createMionRouter} from '@mionjs/router';
const mion = createMionRouter();
class NotFound extends Error {}
export const bad = mion.route((ctx, id: string): string | NotFound => 'x');
`}), diagnostics.CodeRouteReturnedErrorType)
}

func TestReturnedErrorType_TypedErrorIsReported(t *testing.T) {
	// TypedError carries the brand at run time, but it has no publicMessage, no
	// errorData and no status code, so it is not an answer a client can use.
	assertCodes(t, check(t, map[string]string{"routes.ts": `import {createMionRouter} from '@mionjs/router';
import {TypedError} from '@mionjs/core';
const mion = createMionRouter();
export const bad = mion.route((ctx, id: string): string | TypedError => 'x');
`}), diagnostics.CodeRouteReturnedErrorType)
}

func TestReturnedErrorType_PromiseIsUnwrapped(t *testing.T) {
	assertCodes(t, check(t, map[string]string{"routes.ts": `import {createMionRouter} from '@mionjs/router';
const mion = createMionRouter();
export const bad = mion.route(async (ctx, id: string): Promise<string | Error> => 'x');
`}), diagnostics.CodeRouteReturnedErrorType)
}

func TestReturnedErrorType_NonErrorArmsAreLeftAlone(t *testing.T) {
	assertCodes(t, check(t, map[string]string{"routes.ts": `import {createMionRouter} from '@mionjs/router';
const mion = createMionRouter();
export const ok = mion.route((ctx, id: string): string | {code: number} | null => null);
`}))
}

// ───────────────────────── no-unsafe-property-names ─────────────────────────

func TestUnsafePropertyNames(t *testing.T) {
	assertCodes(t, check(t, map[string]string{"types.ts": `
export interface Settings { ok: number; constructor: string }
`}), diagnostics.CodeRouteUnsafePropertyName)
	assertCodes(t, check(t, map[string]string{"types.ts": `
export type Nested = {outer: {__proto__?: string}};
`}), diagnostics.CodeRouteUnsafePropertyName)
	assertCodes(t, check(t, map[string]string{"types.ts": `
export class Thing { prototype = 'x'; }
`}), diagnostics.CodeRouteUnsafePropertyName)
	assertCodes(t, check(t, map[string]string{"types.ts": `
export interface Settings { ok: number; ctor: string }
`}))
}

func TestUnsafePropertyNames_ClassConstructorIsFine(t *testing.T) {
	assertCodes(t, check(t, map[string]string{"types.ts": `
export class Thing { constructor(public ok: number) {} }
`}))
}

func TestUnsafePropertyNames_FiresWithoutAnyRoute(t *testing.T) {
	// The point of the rule: it reports the declaration, so it works for a type
	// no route reaches yet, which is exactly what UPN001 cannot do.
	found := check(t, map[string]string{"types.ts": `export type Wire = {prototype: string};`})
	assertCodes(t, found, diagnostics.CodeRouteUnsafePropertyName)
	if got := found[0].Args; len(got) != 1 || got[0] != "prototype" {
		t.Fatalf("args = %v, want [prototype]", got)
	}
}
