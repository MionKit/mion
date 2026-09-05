import {startNodeServer} from '@mionjs/platform-node';
import {mion, routes} from './node-routes.ts';

// router options (basePath, maxBodySize, ...) are set once in createMionRouter
await mion.initRoutes(routes);

await startNodeServer({port: 3000});
