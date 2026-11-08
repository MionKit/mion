/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Ambient `@mionjs/client` / `@mionjs/router` declarations for a batch fixture: the compiler reads the declaring
// module, so a test needs no built framework packages. Runtime stubs are each spec's own.

// Shaped like the real client: a route call returns `RouteSubRequest<H, Id, Api>` with the id as a template-literal
// type, which is what the build reads.
export const CLIENT_DTS = `declare module '@mionjs/client' {
  import type {PureFunction, InjectPureFnId, InjectBatchId} from '@mionjs/run-types';
  export interface RouteSubRequest<PH, Id extends string = string, RA = any> { id: Id }
  type Handler = (...args: any[]) => any;
  export type ClientRoutes<RA, Prefix extends string = '', Root = RA> = {
    [K in keyof RA & string]: RA[K] extends {type: 1; handler: infer H extends Handler}
      ? (...params: Parameters<H>) => RouteSubRequest<H, \`\${Prefix}\${K}\`, Root>
      : ClientRoutes<RA[K], \`\${Prefix}\${K}/\`, Root>;
  };
  export function initClient<RA>(options?: unknown): {client: unknown; routes: ClientRoutes<RA>};
  export interface InputFromRef<F extends (...args: any) => any> { asArg(): ReturnType<F> }
  export function inputFrom<S extends RouteSubRequest<any>, M = any>(source: S, name: string): InputFromRef<(v: any) => M>;
  export function inputFrom<S extends RouteSubRequest<any>, M = any>(source: S, mapper: PureFunction<(v: any) => M>, hash?: InjectPureFnId<(v: any) => M>): InputFromRef<(v: any) => M>;
  export function batch<R extends RouteSubRequest<any>[]>(routes: [...R], batchId?: InjectBatchId<R>): unknown;
}
`;
// The route leaf `ClientRoutes` maps, for a fixture's API type: `getById: Route<(id: number) => User>`.
export const ROUTE_LEAF = 'type Route<H> = {type: 1; handler: H};\n';
export const ROUTER_DTS = `declare module '@mionjs/router' {
  export function createMionRouter(opts?: unknown): {initRoutes: (routes: unknown) => unknown};
  export namespace createMionRouter {
    function withTypes<T = {}>(): (opts?: unknown) => {initRoutes: (routes: unknown) => unknown};
  }
  export function replaceBatches(table: unknown): void;
}
declare module '@mionjs/core' {
  export function registerInputMapperTuple(key: string, tuple: unknown): void;
}
`;
export const ROUTES = `import {initClient} from '@mionjs/client';
${ROUTE_LEAF}export type Routes = {
  users: {getById: Route<(id: number) => {id: number; name: string}>};
  orders: {getById: Route<(id: number) => {id: number}>};
};
export const {routes} = initClient<Routes>();
`;
