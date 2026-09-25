import {startBunServer} from '@mionjs/platform-bun';
import './bun-routes.ts';

const server = await startBunServer({port: 3000});

console.log(`Server running at http://localhost:${server.port}`);
