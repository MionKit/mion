import {createGoogleCFHandler} from '@mionjs/platform-gcloud';
import {mion, routes} from './gcloud-routes.ts';

await mion.initRoutes(routes);

export const api = createGoogleCFHandler();
