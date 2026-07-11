import {startNodeServer} from '@mionjs/platform-node';
import {initMionRouter} from '@mionjs/router';
import {routes} from './node-routes.ts';

await initMionRouter(routes, {
    basePath: 'api', // API prefix
});

await startNodeServer({port: 3000});
