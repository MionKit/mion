import {initClient, routesFlow, mapFrom} from '@mionkit/client';
import type {MyApi} from './home-server.ts';

const {routes} = initClient<MyApi>({
    baseURL: 'http://localhost:3000',
});
// @annotate: Execute multiple routes in a single HTTP request

const sumResult = routes.sum(5, 3);

const [[sum, product], [sumError, productError]] = await routesFlow([
    sumResult,
    // mapFrom: maps sum result (8) → multiply(8, 10) = 80, resolved server-side
    routes.multiply(mapFrom(sumResult, (s) => s!).fake(), 10),
]);
// @annotate: Map results between routes using mapFrom — like GraphQL, but simpler

if (sum) { sum; }
//          ^?

if (product) { product; }
//              ^?

