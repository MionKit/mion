// Import cache exports from your AOT package
import {routerCache, jitFnsCache, pureFnsCache} from 'my-api-aot';
// Import the cache loading function from @mionkit/core
import {addAOTCaches} from '@mionkit/core';
// Now initialize your router - it will use the pre-compiled functions
import {initMionRouter} from '@mionkit/router';
import {myRoutes} from './routes';

// Load the pre-compiled caches BEFORE initializing the router
addAOTCaches(jitFnsCache, pureFnsCache);
export const myApi = await initMionRouter(myRoutes);
