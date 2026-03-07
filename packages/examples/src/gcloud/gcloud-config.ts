import {initMionGcloud} from '@mionjs/platform-gcloud';
import {routes} from './gcloud-routes.ts';

export const api = initMionGcloud(routes, {
    prefix: '/api', // API prefix
    // ... other router options
});
