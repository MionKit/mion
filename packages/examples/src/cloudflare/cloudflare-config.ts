import {createCloudflareHandler} from '@mionjs/platform-cloudflare';
import './cloudflare-routes.ts';

export default createCloudflareHandler({
  basePath: '/api',
  defaultResponseHeaders: {'access-control-allow-origin': 'my.app.com'},
});
