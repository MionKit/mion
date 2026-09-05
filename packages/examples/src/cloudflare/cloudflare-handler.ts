import {createCloudflareHandler} from '@mionjs/platform-cloudflare';
import {mion, routes} from './cloudflare-routes.ts';

await mion.initRoutes(routes);

export default createCloudflareHandler();
