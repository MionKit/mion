import {initMionBun} from '@mionkit/bun';
import {routes} from './routes';

const handler = initMionBun(routes, {
    prefix: '/api', // API prefix
    // ... other router options
});

