import {createCloudflareHandler} from '@mionjs/platform-cloudflare';
import './cloudflare-routes.ts';

export default createCloudflareHandler({
  basePath: '/api',
  maxBodySize: 512 * 1024,
});
