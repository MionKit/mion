import {startBunServer} from '@mionjs/platform-bun';
import {initMionRouter} from '@mionjs/router';
import {routes} from './bun-routes.ts';

await initMionRouter(routes);

const server = await startBunServer({port: 3000});

console.log(`Server running at http://localhost:${server.port}`);
