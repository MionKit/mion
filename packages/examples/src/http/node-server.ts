import {startNodeServer} from '@mionjs/platform-node';
import {mion, routes} from './node-routes.ts';

await mion.initRoutes(routes);

const server = await startNodeServer({port: 3000});

console.log('Server running at http://localhost:3000');
