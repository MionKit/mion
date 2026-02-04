import {initMionHttp} from '@mionkit/node';
import {routes} from './routes';

const handler = initMionHttp(routes, {
    prefix: '/api', // API prefix
    // ... other router options
});
