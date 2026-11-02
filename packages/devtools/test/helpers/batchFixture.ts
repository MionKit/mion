/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Ambient `@mionjs/client` / `@mionjs/router` declarations for a batch fixture: the compiler reads the declaring
// module, so a test needs no built framework packages. Runtime stubs are each spec's own.

export const CLIENT_DTS = `declare module '@mionjs/client' {
  import type {PureFunction, InjectPureFnId, InjectBatchId} from '@mionjs/run-types';
  export interface RouteSubRequest<PH> { id: string }
  export type ClientRoutes<RA> = { [K in keyof RA]: RA[K] extends (...a: infer P) => infer R ? (...p: P) => RouteSubRequest<RA[K]> : ClientRoutes<RA[K]> };
  export function initClient<RA>(o?: unknown): {client: unknown; routes: ClientRoutes<RA>};
  export interface InputFromRef<F> { asArg(): ReturnType<F> }
  export function inputFrom<S extends RouteSubRequest<any>, M = any>(source: S, name: string): InputFromRef<(v: any) => M>;
  export function inputFrom<S extends RouteSubRequest<any>, M = any>(source: S, mapper: PureFunction<(v: any) => M>, hash?: InjectPureFnId<(v: any) => M>): InputFromRef<(v: any) => M>;
  export function batch<R extends RouteSubRequest<any>[]>(routes: [...R], batchId?: InjectBatchId<R>): unknown;
}
`;
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
export type Routes = {
  users: {getById: (id: number) => {id: number; name: string}};
  orders: {getById: (id: number) => {id: number}};
};
export const {routes} = initClient<Routes>();
`;
