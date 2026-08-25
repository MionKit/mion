import {startUwsServer} from '@mionjs/platform-uws';
import {initMionRouter} from '@mionjs/router';
import {routes} from './uws-routes.ts';

await initMionRouter(routes);

const server = await startUwsServer({port: 3000});

console.log('Server running at http://localhost:3000');
