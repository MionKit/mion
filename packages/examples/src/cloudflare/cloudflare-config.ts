import {createCloudflareHandler} from '@mionjs/platform-cloudflare';
import {mion, routes} from './cloudflare-routes.ts';

// router options (basePath, maxBodySize, ...) are set once in createMionRouter
await mion.initRoutes(routes);

export default createCloudflareHandler({
  basePath: '/api',
  defaultResponseHeaders: {'access-control-allow-origin': 'my.app.com'},
});
