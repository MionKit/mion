import {initClient, routesFlow} from '@mionjs/client';
import type {MyApi} from './server.routes.ts';

const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// ============================================
// SINGLE ROUTE CALL - call()
// ============================================
// Result and error are the direct types from the route
// Returns: [result, error, middleFnResults, middleFnErrors]
const [user, error] = await routes.users.getById('USER-123').call();

// `user` is User | undefined
// `error` is RpcError<'user-not-found', UserNotFoundData> | ValidationError | undefined
if (error) {
    if (error.type === 'user-not-found') {
        console.log('User not found:', error.errorData?.requestedId);
    }
} else {
    console.log('User:', user?.name);
}

// ============================================
// ROUTES_FLOW - Multiple routes in one request
// ============================================
// Results and errors are ARRAYS in the same order as the routes
// Returns: [[results...], [errors...], middleFnResults, middleFnErrors]
const [[user2, order], [userError, orderError]] = await routesFlow([
    routes.users.getById('USER-123'),
    routes.orders.getById('ORDER-1'),
]);

// `user2` is User | undefined (first route result)
// `order` is Order | undefined (second route result)
// `userError` is RpcError<'user-not-found'> | ValidationError | undefined
// `orderError` is RpcError<'order-not-found'> | ValidationError | undefined

// Each result/error corresponds to its route by position
if (userError) console.log('User error:', userError.publicMessage);
else console.log('User:', user2?.name);

if (orderError) console.log('Order error:', orderError.publicMessage);
else console.log('Order:', order?.id);
