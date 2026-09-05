import {createVercelHandler} from '@mionjs/platform-vercel';
import {mion, routes} from './vercel-routes.ts';

await mion.initRoutes(routes);

export const {GET, POST, PUT, DELETE, PATCH} = createVercelHandler();
