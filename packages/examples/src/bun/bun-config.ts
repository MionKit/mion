import {startBunServer} from '@mionjs/platform-bun';
import {initMionRouter} from '@mionjs/router';
import {routes} from './bun-routes.ts';

await initMionRouter(routes, {
    basePath: 'api', // API prefix
});

await startBunServer({port: 3000});
