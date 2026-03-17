import {createGoogleCFHandler} from '@mionjs/platform-gcloud';
import {initMionRouter} from '@mionjs/router';
import {routes} from './gcloud-routes.ts';

await initMionRouter(routes, {
    basePath: 'api', // API prefix
});

export const api = createGoogleCFHandler({});
