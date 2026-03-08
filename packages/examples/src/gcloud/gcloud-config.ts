import {googleCFHandler, setGoogleCFOpts} from '@mionjs/platform-gcloud';
import {initMionRouter} from '@mionjs/router';
import {routes} from './gcloud-routes.ts';

await initMionRouter(routes, {
    basePath: 'api', // API prefix
});

setGoogleCFOpts({});

export const api = googleCFHandler;
