import {initMionRouter} from '@mionjs/router';
import {createCloudflareHandler} from '@mionjs/platform-cloudflare';
import {routes} from './cloudflare-routes.ts';

await initMionRouter(routes);

export default createCloudflareHandler();
