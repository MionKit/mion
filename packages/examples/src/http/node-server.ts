import {startNodeServer} from '@mionjs/platform-node';
import {initMionRouter} from '@mionjs/router';
import {routes} from './node-routes.ts';

await initMionRouter(routes);

const server = await startNodeServer({port: 3000});

console.log('Server running at http://localhost:3000');
