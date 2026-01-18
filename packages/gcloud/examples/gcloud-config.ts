import {initMionGcloud} from '@mionkit/gcloud';
import {routes} from './routes';

export const api = initMionGcloud(routes, {
    prefix: '/api', // API prefix
    // ... other router options
});

