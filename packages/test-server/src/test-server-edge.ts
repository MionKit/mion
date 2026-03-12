/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Routes, initMionRouter, route, resetRouter} from '@mionjs/router';
import {CallContext, Route} from '@mionjs/router';
import {createVercelHandler, resetVercelHandlerOpts, setVercelHandlerOpts} from '@mionjs/platform-vercel';

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

const edgeRoutes = {changeUserName, getDate, updateHeaders} satisfies Routes;

// ############# AOT Compilation #############
// When running under vite-node for AOT cache generation (MION_COMPILE=true|SSR),
// auto-initialize the router so emitAOTCaches() can serialize all JIT functions.
// This code is a no-op in the bundled IIFE (process is undefined in EdgeVM).
(async () => {
    const mionCompile = typeof process !== 'undefined' ? process.env?.MION_COMPILE : undefined;
    if (mionCompile === 'true' || mionCompile === 'SSR') {
        await initMionRouter(edgeRoutes, {
            contextDataFactory: getSharedData,
            basePath: 'api/',
        });
    }
})();

// ############# Edge Server Setup #############

export interface EdgeSetupOptions {
    basePath?: string;
    serializer?: 'stringifyJson' | 'json';
    defaultResponseHeaders?: Record<string, string>;
}

/** Sets up the vercel handler inside the edge runtime. Returns the handler object. */
export async function setup(options?: EdgeSetupOptions) {
    resetVercelHandlerOpts();
    resetRouter();
    setVercelHandlerOpts({
        defaultResponseHeaders: options?.defaultResponseHeaders ?? {},
    });
    await initMionRouter(edgeRoutes, {
        contextDataFactory: getSharedData,
        basePath: 'api/',
        serializer: options?.serializer,
        aot: true, // Use pre-compiled AOT caches (bundled via virtual modules)
    });
    const handler = createVercelHandler();
    // Expose handler globally so EdgeVM evaluate() calls can access it
    (globalThis as any).handler = handler;
    return handler;
}

/** Resets all state (router + vercel handler options) */
export function resetServer() {
    resetVercelHandlerOpts();
    resetRouter();
    (globalThis as any).handler = undefined;
}
