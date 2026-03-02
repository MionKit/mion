import {initMionHttp} from '@mionkit/platform-node';
import {routes} from './node-routes.ts';

const handler = initMionHttp(routes, {
    prefix: '/api', // API prefix
    // ... other router options
});
