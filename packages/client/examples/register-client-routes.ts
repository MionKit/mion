import {Routes, registerRoutes} from '@mionkit/router';
import {clientRoutes} from '@mionkit/common';
import {initAwsLambdaRouter, lambdaHandler} from '@mionkit/serverless';

const routes = {
    // ... my Application Routes
} satisfies Routes;

// init & register routes
initAwsLambdaRouter();
export const handler = lambdaHandler;
const myApi = registerRoutes(routes);

// register client routes
// these routes serve metadata required for validation and serialization on the client
registerRoutes(clientRoutes);

// Export Routes type  (to be used by the client)
export type MyApi = typeof myApi;
