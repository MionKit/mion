import {createVercelHandler} from '@mionjs/platform-vercel';
import {mion, routes} from './vercel-routes.ts';

// router options (basePath, maxBodySize, ...) are set once in createMionRouter
await mion.initRoutes(routes);

export const {GET, POST, PUT, DELETE, PATCH} = createVercelHandler({
  defaultResponseHeaders: {'access-control-allow-origin': '*'},
});
