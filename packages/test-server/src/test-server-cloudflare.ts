/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Routes, initMionRouter, route, resetRouter} from '@mionjs/router';
import {CallContext, Route} from '@mionjs/router';
import {createCloudflareHandler, resetCloudflareHandlerOpts, setCloudflareHandlerOpts} from '@mionjs/platform-cloudflare';

// ############# Types #############

type SimpleUser = {
    name: string;
    surname: string;
};
type DataPoint = {
    date: Date;
};
type MySharedData = ReturnType<typeof getSharedData>;
type Context = CallContext<MySharedData>;

const getSharedData = () => ({auth: {me: null as any}});

// ############# Routes #############

const changeUserName: Route = route((ctx: Context, user: SimpleUser): SimpleUser => {
    return {name: 'NewName', surname: user.surname};
});

const getDate: Route = route((ctx: Context, dataPoint?: DataPoint): DataPoint => {
    return dataPoint || {date: new Date('2022-04-10T02:13:00.000Z')};
});

const updateHeaders: Route = route((context: Context): void => {
    context.response.headers.set('x-something', 'true');
    context.response.headers.set('server', 'my-server');
});

const cloudflareRoutes = {changeUserName, getDate, updateHeaders} satisfies Routes;

// ############# AOT Compilation #############
// When running under vite-node for AOT cache generation (MION_COMPILE=true|SSR),
// auto-initialize the router so emitAOTCaches() can serialize all JIT functions.
// This code is a no-op in the bundled IIFE (process is undefined in workerd).
(async () => {
    const mionCompile = typeof process !== 'undefined' ? process.env?.MION_COMPILE : undefined;
    if (mionCompile === 'onlyAOT' || mionCompile === 'viteSSR') {
        await initMionRouter(cloudflareRoutes, {
            contextDataFactory: getSharedData,
            basePath: 'api/',
        });
    }
})();

// ############# Cloudflare Server Setup #############

export interface CloudflareSetupOptions {
    basePath?: string;
    serializer?: 'stringifyJson' | 'json';
    defaultResponseHeaders?: Record<string, string>;
}

/** Sets up the cloudflare handler inside the workerd runtime. Returns the handler object. */
export async function setup(options?: CloudflareSetupOptions) {
    resetCloudflareHandlerOpts();
    resetRouter();
    setCloudflareHandlerOpts({
        basePath: options?.basePath ?? '',
        defaultResponseHeaders: options?.defaultResponseHeaders ?? {},
    });
    await initMionRouter(cloudflareRoutes, {
        contextDataFactory: getSharedData,
        basePath: 'api/',
        serializer: options?.serializer,
        aot: true, // Use pre-compiled AOT caches (bundled via virtual modules)
    });
    const handler = createCloudflareHandler();
    // Expose handler globally so the service worker fetch listener can access it
    (globalThis as any).handler = handler;
    return handler;
}

/** Resets all state (router + cloudflare handler options) */
export function resetServer() {
    resetCloudflareHandlerOpts();
    resetRouter();
    (globalThis as any).handler = undefined;
}
