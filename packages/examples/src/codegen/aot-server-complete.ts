// Load AOT caches first
import {routerCache, jitFnsCache, pureFnsCache} from 'my-api-aot';
import {addAOTCaches} from '@mionkit/core';
// Then initialize router and server
import {initMionRouter} from '@mionkit/router';
import {initHttp} from '@mionkit/http';
import {routes} from './routes';

// Load the pre-compiled caches BEFORE initializing the router
addAOTCaches(jitFnsCache, pureFnsCache);
export const myApi = await initMionRouter(routes);

initHttp({port: 3000});
console.log('Server running on port 3000');
