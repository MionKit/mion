import {initMionBun} from '@mionjs/platform-bun';
import {routes} from './bun-routes.ts';

const server = Bun.serve({
    port: 3000,
    fetch: initMionBun(routes),
});

console.log(`Server running at http://localhost:${server.port}`);
