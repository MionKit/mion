// Load AOT caches first
import {routerCache, jitFnsCache, pureFnsCache} from 'my-api-aot';
import {addAOTCaches} from '@mionjs/core';
// Then initialize router and server
import {initMionRouter} from '@mionjs/router';
import {initHttp} from '@mionjs/platform-node';
import {routes} from './aot-routes-example.ts';

// Load the pre-compiled caches BEFORE initializing the router
addAOTCaches(jitFnsCache, pureFnsCache);
export const myApi = await initMionRouter(routes);

initHttp({port: 3000});
console.log('Server running on port 3000');
