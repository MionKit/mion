import {createGoogleCFHandler} from '@mionjs/platform-gcloud';
import {initMionRouter} from '@mionjs/router';
import {routes} from './gcloud-routes.ts';

await initMionRouter(routes);

export const api = createGoogleCFHandler();
