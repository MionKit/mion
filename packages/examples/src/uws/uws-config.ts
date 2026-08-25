import {startUwsServer} from '@mionjs/platform-uws';
import {initMionRouter} from '@mionjs/router';
import {routes} from './uws-routes.ts';

await initMionRouter(routes, {
  basePath: 'api', // API prefix
});

await startUwsServer({port: 3000});
