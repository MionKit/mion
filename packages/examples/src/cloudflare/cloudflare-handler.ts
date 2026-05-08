import {initMionRouter} from '@mionjs/router';
import {createCloudflareHandler} from '@mionjs/platform-cloudflare';
import {aotCaches} from 'virtual:mion-aot/caches';
import {routes} from './cloudflare-routes.ts';

// During AOT generation (vite-node child with MION_COMPILE=*), the virtual module
// is empty and the router automatically falls back to JIT to emit the caches.
// At runtime in workerd, `aotCaches` carries the real pre-compiled data.
await initMionRouter(routes, {aotCaches});

export default createCloudflareHandler();
