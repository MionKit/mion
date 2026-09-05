import {startUwsServer} from '@mionjs/platform-uws';
import {mion, routes} from './uws-routes.ts';

await mion.initRoutes(routes);

const server = await startUwsServer({port: 3000});

console.log('Server running at http://localhost:3000');
