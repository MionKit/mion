import {startBunServer} from '@mionjs/platform-bun';
import {mion, routes} from './bun-routes.ts';

// router options (basePath, maxBodySize, ...) are set once in createMionRouter
await mion.initRoutes(routes);

await startBunServer({port: 3000});
