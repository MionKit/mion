import {startBunServer} from '@mionjs/platform-bun';
import {mion, routes} from './bun-routes.ts';

await mion.initRoutes(routes);

const server = await startBunServer({port: 3000});

console.log(`Server running at http://localhost:${server.port}`);
