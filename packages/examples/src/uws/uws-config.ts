import {startUwsServer} from '@mionjs/platform-uws';
import {mion, routes} from './uws-routes.ts';

// router options (basePath, maxBodySize, ...) are set once in createMionRouter
await mion.initRoutes(routes);

await startUwsServer({port: 3000});
