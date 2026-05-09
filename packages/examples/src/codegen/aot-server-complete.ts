// Import the populated AOT caches — see aot-loading-caches.ts for details.
import {aotCaches} from 'virtual:mion-aot/caches';
import {initMionRouter} from '@mionjs/router';
import {startNodeServer} from '@mionjs/platform-node';
import {routes} from './aot-routes-example.ts';

// Pass `aotCaches` to initMionRouter — flips the router into strict AOT mode and
// uses the pre-compiled validators / serializers / route methods directly.
export const myApi = await initMionRouter(routes, {aotCaches, basePath: '/api'});

startNodeServer({port: 3000});
console.log('Server running on port 3000');
