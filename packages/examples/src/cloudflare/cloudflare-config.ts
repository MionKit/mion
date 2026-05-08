import {initMionRouter} from '@mionjs/router';
import {createCloudflareHandler} from '@mionjs/platform-cloudflare';
import {aotCaches} from 'virtual:mion-aot/caches';
import {routes} from './cloudflare-routes.ts';

await initMionRouter(routes, {aotCaches, basePath: 'api'});

export default createCloudflareHandler({
    basePath: '/api',
    defaultResponseHeaders: {'access-control-allow-origin': '*'},
});
