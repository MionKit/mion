import {initClient} from '@mionkit/client';
import type {HeadersSubset} from '@mionkit/core';
// importing only the RemoteApi type from server
import type {MyApi} from './server.routes';

const john = {id: '123', name: 'John', surname: 'Doe'};
const {routes, hooks} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// ========== Hook with Typed Success Return and Error Handling ==========
// prefills auth token for any future requests, value is stored in localStorage by default
// Returns TypedEvent for registering persistent success and error handlers
// The auth hook returns SessionInfo on success (when returnSession=true) or RpcError<'not-authorized', NotAuthorizedData>
const authHeaders: HeadersSubset<'Authorization'> = {headers: {Authorization: 'Bearer myToken-XYZ'}};
hooks
    .auth(authHeaders, true) // returnSession=true to get SessionInfo back
    .prefill()
    // onSuccess receives the strongly typed SessionInfo (or void when returnSession=false)
    .onSuccess((sessionInfo) => {
        // Since we passed returnSession=true, we know sessionInfo is SessionInfo
        // TypeScript infers: sessionInfo is SessionInfo | void, so we narrow it
        if (!sessionInfo) return;

        // Now TypeScript knows sessionInfo is SessionInfo!
        // sessionInfo.role is 'admin' | 'user' | 'guest'
        console.log('Logged in as:', sessionInfo.userId);
        console.log('Role:', sessionInfo.role);
        console.log('Permissions:', sessionInfo.permissions.join(', '));
        console.log('Session expires at:', sessionInfo.expiresAt);

        // Use session info to configure app state
        if (sessionInfo.role === 'admin') {
            console.log('Admin features enabled');
        }
    })
    .onError('not-authorized', (error) => {
        // error.errorData is strongly typed as NotAuthorizedData!
        // TypeScript knows: error.errorData?.reason is 'missing-token' | 'invalid-token' | 'expired-token'
        const reason = error.errorData?.reason;
        if (reason === 'expired-token') {
            console.log('Token expired, refreshing...');
        } else if (reason === 'missing-token') {
            console.log('No token provided, redirecting to login...');
        } else {
            console.log('Invalid token:', error.publicMessage);
        }
    });

// ========== Example 1: Route with strongly-typed errorData ==========
// getById returns User | RpcError<'user-not-found', UserNotFoundData>
// TypedPromise provides type-safe error handling with fully typed errorData
routes.users
    .getById('USER-123')
    .call()
    .then((user) => {
        // user is guaranteed to be User (not RpcError) here
        console.log('Found user:', user.name, user.surname);
    })
    .catchError('user-not-found', (error) => {
        // error.errorData is strongly typed as UserNotFoundData!
        // TypeScript knows: error.errorData has { requestedId: string; suggestedIds?: string[] }
        console.log('User not found. Requested ID:', error.errorData?.requestedId);
        if (error.errorData?.suggestedIds?.length) {
            console.log('Did you mean one of these?', error.errorData.suggestedIds.join(', '));
        }
    })
    .catchUnknown((error) => {
        // Catches any other errors (network errors, hook errors, etc.)
        console.log('Unexpected error:', error.publicMessage);
    })
    .finally(() => {
        console.log('Request completed');
    });

// ========== Example 2: Order error with typed errorData ==========
// Order getById returns Order | RpcError<'order-not-found', OrderNotFoundData>
routes.orders
    .getById('ORDER-404')
    .call()
    .then((order) => {
        console.log('Order total:', order.totalUSD);
    })
    .catchError('order-not-found', (error) => {
        // error.errorData is strongly typed as OrderNotFoundData!
        console.log('Order not found. Requested ID:', error.errorData?.requestedId);
    });

// ========== Example 3: Route without specific error types ==========
// sayHello doesn't define specific error types, use catchUnknown
routes.users
    .sayHello(john)
    .call()
    .then((result) => {
        console.log(result); // Hello John Doe
    })
    .catchUnknown((error) => {
        console.log('Error:', error.publicMessage);
    });

// ========== Example 4: Using catch() for unhandled errors ==========
// The catch method receives a record of all unhandled errors keyed by method/hook ID
routes.users
    .getById('USER-999')
    .call()
    .catchError('user-not-found', (error) => {
        // This handles user-not-found specifically
        console.log('User not found:', error.errorData?.requestedId);
    })
    .catch((errors) => {
        // Called only if there are unhandled errors (not caught by catchError)
        // errors is a record: { [methodId]: RpcError }
        for (const [methodId, error] of Object.entries(errors)) {
            console.log(`Unhandled error from ${methodId}:`, error.publicMessage);
        }
    });

// ========== Example 5: Using async/await ==========
// TypedPromise implements PromiseLike for async/await support
async function example() {
    try {
        // If user exists, returns User
        // If user-not-found error, throws and caught by catch block
        const user = await routes.users.getById('USER-999').call();
        console.log('User:', user.name);
    } catch (error: any) {
        // With async/await, unhandled errors are thrown
        // errorData is available here too
        console.log('Error:', error.publicMessage, error.errorData);
    }

    // validate parameters locally without calling the server
    const validationResp = await routes.users.sayHello(john).typeErrors();
    console.log(validationResp); // []
}

example();
