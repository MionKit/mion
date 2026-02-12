import {initMionAws} from '@mionkit/aws';
import {routes} from './aws-routes.ts';

export const handler = initMionAws(routes, {
    prefix: '/api', // API prefix
    // ... other router options
});
