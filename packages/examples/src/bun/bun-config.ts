import {initMionBun} from '@mionjs/platform-bun';
import {routes} from './bun-routes.ts';

const handler = initMionBun(routes, {
    prefix: '/api', // API prefix
    // ... other router options
});
