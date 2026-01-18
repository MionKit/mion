import {jitFnsCache, pureFnsCache} from 'my-api-aot';
import {addAOTCaches} from '@mionkit/core';
import {initMionRouter} from '@mionkit/router';
import {routes} from './routes';

// ✅ Correct order
addAOTCaches(jitFnsCache, pureFnsCache);
const myApi = initMionRouter(routes);

// ❌ Wrong order - caches won't be used
const myApi2 = initMionRouter(routes);
addAOTCaches(jitFnsCache, pureFnsCache);

