import {initMionRouter, route, Routes} from '@mionkit/router';
import {ordersRoutes} from './features/orders/orders-handlers.ts';

const routes = {
    hello: route((ctx, name: string): string => `Hello ${name}!`),
    getTime: route((ctx): Date => new Date()),
    orders: ordersRoutes,
} satisfies Routes;

export type MyApi = Awaited<ReturnType<typeof initApi>>;

export async function initApi() {
    return initMionRouter(routes, {prefix: 'api/mion'});
}
