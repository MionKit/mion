// worker.ts
import {routerCache, jitFnsCache, pureFnsCache} from 'my-api-aot';
import {addAOTCaches} from '@mionkit/core';

// Load AOT caches - no dynamic code generation needed
addAOTCaches(jitFnsCache, pureFnsCache);

import {initMionRouter} from '@mionkit/router';
import {routes} from './routes';

const myApi = await initMionRouter(routes);

export default {
    async fetch(request: Request): Promise<Response> {
        // Handle request using mion router
        // ...
    },
};
