import {initMionRouter} from '@mionjs/router';
import {createCloudflareHandler} from '@mionjs/platform-cloudflare';
import {routes} from './cloudflare-routes.ts';

await initMionRouter(routes, {aot: true, basePath: 'api'});

export default createCloudflareHandler({
    basePath: '/api',
    defaultResponseHeaders: {'access-control-allow-origin': '*'},
});
