import {initMionHttp} from '@mionkit/http';
import {routes} from './routes';

const handler = initMionHttp(routes, {
    prefix: '/api', // API prefix
    // ... other router options
});

