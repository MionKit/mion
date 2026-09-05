import {createGoogleCFHandler} from '@mionjs/platform-gcloud';
import {mion, routes} from './gcloud-routes.ts';

// router options (basePath, maxBodySize, ...) are set once in createMionRouter
await mion.initRoutes(routes);

export const api = createGoogleCFHandler({});
