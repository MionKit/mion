package testfixtures

// BatchClientDTS stands in for `@mionjs/client`, shaped like the real types: the build reads the route id from
// `RouteSubRequest`'s template-literal `Id`. Its markers import the REAL `@mionjs/run-types` package.
const BatchClientDTS = `declare module '@mionjs/client' {
  import type {PureFunction, InjectPureFnId, InjectBatchId} from '@mionjs/run-types';
  export interface RouteSubRequest<PH, Id extends string = string, RA = any> { id: Id }
  type Handler = (...args: any[]) => any;
  export type ClientRoutes<RA, Prefix extends string = '', Root = RA> = {
    [K in keyof RA & string]: RA[K] extends {type: 1; handler: infer H extends Handler}
      ? (...params: Parameters<H>) => RouteSubRequest<H, ` + "`${Prefix}${K}`" + `, Root>
      : ClientRoutes<RA[K], ` + "`${Prefix}${K}/`" + `, Root>;
  };
  export function initClient<RA>(o?: unknown): {client: unknown; routes: ClientRoutes<RA>};
  export interface InputFromRef<F> { asArg(): ReturnType<F> }
  export function inputFrom<S extends RouteSubRequest<any>, M = any>(source: S, name: string): InputFromRef<(v: any) => M>;
  export function inputFrom<S extends RouteSubRequest<any>, M = any>(source: S, mapper: PureFunction<(v: any) => M>, hash?: InjectPureFnId<(v: any) => M>): InputFromRef<(v: any) => M>;
  export function batch<R extends RouteSubRequest<any>[]>(routes: [...R], batchId?: InjectBatchId<R>): unknown;
}
`

// BatchRouteLeaf is the route leaf `ClientRoutes` maps, for a fixture's API: `getById: Route<(id: number) => User>`.
const BatchRouteLeaf = "type Route<H> = {type: 1; handler: H};\n"
