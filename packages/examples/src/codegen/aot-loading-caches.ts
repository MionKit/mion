// Import cache exports from your AOT package
import {routerCache, jitFnsCache, pureFnsCache} from 'my-api-aot';
// Import the cache loading function from @mionjs/core
import {addAOTCaches} from '@mionjs/core';
// Now initialize your router - it will use the pre-compiled functions
import {initMionRouter} from '@mionjs/router';
import {routes as myRoutes} from './aot-routes-example.ts';

// Load the pre-compiled caches BEFORE initializing the router
addAOTCaches(jitFnsCache, pureFnsCache);
export const myApi = await initMionRouter(myRoutes);
