/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/require-await */
import {initClient} from '@mionkit/client';
import {HeadersSubset} from '@mionkit/core';
// importing only the RemoteApi type from server
import type {MyApi} from './server.routes';

const john = {id: '123', name: 'John', surname: 'Doe'};
const {routes, hooks} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// ========== Hook with Typed Success Return and Error Handling ==========
// prefills auth token for any future requests, value is stored in localStorage by default
// Returns TypedEvent for registering persistent success and error handlers
// The auth hook returns SessionInfo on success (when returnSession=true) or RpcError<'not-authorized', NotAuthorizedData>
const authHeaders = new HeadersSubset({Authorization: 'Bearer myToken-XYZ'});
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
    })
    .onError('validation-error', (error) => {
        console.log('Validation error:', error.errorData?.typeErrors);
    });

// ========== Example 1: Route with strongly-typed errorData ==========
// getById returns User | RpcError<'user-not-found', UserNotFoundData>
// call() returns 4-tuple: [routeResult, routeError, hooksResults, hooksErrors]
async function exampleWithTypedError() {
    const [user, error] = await routes.users.getById('USER-123').call();
    if (error && error.type === 'user-not-found') {
        // error.errorData is strongly typed as UserNotFoundData!
        console.log('User not found. Requested ID:', error.errorData?.requestedId);
        if (error.errorData?.suggestedIds?.length) {
            console.log('Did you mean one of these?', error.errorData.suggestedIds.join(', '));
        }
        return;
    } else if (error) {
        // Catches any other errors (network errors, hook errors, etc.)
        console.log('Unexpected error:', error.publicMessage);
        return;
    }
    // After error check, user is guaranteed to be User here
    // Use optional chaining for TypeScript strictness
    console.log('Found user:', user?.name, user?.surname);
}

// ========== Example 2: Order error with typed errorData ==========
// Order getById returns Order | RpcError<'order-not-found', OrderNotFoundData>
async function exampleWithOrderError() {
    const [order, error] = await routes.orders.getById('ORDER-404').call();
    if (error && error.type === 'order-not-found') {
        // error.errorData is strongly typed as OrderNotFoundData!
        console.log('Order not found. Requested ID:', error.errorData?.requestedId);
        return;
    }
    // After error check, order is guaranteed to be Order here
    console.log('Order total:', order?.totalUSD);
}

// ========== Example 3: Route that always succeeds ==========
// sayHello returns just string (no error type), so error is always undefined
async function exampleAlwaysSucceeds() {
    const [result, error] = await routes.users.sayHello(john).call();
    // sayHello never has an error type, so we can use the result directly
    console.log(result); // Hello John Doe
}

// ========== Example 5: Using callWithHooks() for per-request hooks ==========
// Use callWithHooks() when you need to pass hooks for a SINGLE request
// Returns 4-tuple: [routeResult, routeError, hooksResults, hooksErrors]

// Create a hook with temporary credentials for this specific request
const tempAuthHeaders: HeadersSubset<'Authorization'> = {headers: {Authorization: 'Bearer temp-token-ABC'}};

// callWithHooks() takes a record of hooks and returns a typed 4-tuple
async function exampleWithCallWithHooks() {
    const [user, routeError, hookResults, hookErrors] = await routes.users.getById('USER-123').callWithHooks({
        auth: hooks.auth(tempAuthHeaders, true),
    });
    // Check for route errors
    if (routeError?.type === 'user-not-found') {
        console.log('User not found:', routeError.errorData?.requestedId);
    }
    // Check hook errors
    if (hookErrors?.auth?.type === 'not-authorized') {
        const authError = hookErrors.auth;
        const reason = authError.errorData?.reason;
        if (reason === 'expired-token') {
            console.log('Temp token expired, requesting new one...');
        }
    }
    // Access success data
    if (user) console.log('Found user:', user.name);
    if (hookResults?.auth) console.log('Authenticated as:', hookResults.auth.userId);
}

// ========== Example 6: Multiple Hooks with callWithHooks() ==========
// Pass multiple hooks in the record - each gets its own typed result
async function exampleWithMultipleHooks() {
    const [user, routeError, hookResults, hookErrors] = await routes.users.getById('USER-123').callWithHooks({
        auth: hooks.auth(tempAuthHeaders),
        // session: hooks.session('session-token'), // If you have a session hook
    });
    // Handle each hook's errors independently
    if (hookErrors?.auth) {
        console.log('Auth failed:', hookErrors.auth.publicMessage);
    }
    // Access success data
    if (user) console.log('User:', user.name);
}

// ========== Example 7: Using call() with async/await (recommended) ==========
// call() returns 4-tuple: [routeResult, routeError, hooksResults, hooksErrors]
// This is the standard pattern for all route calls
async function exampleWithCall() {
    // call() never throws - returns a 4-tuple
    // Partial destructuring still works for backward compatibility
    const [user, error] = await routes.users.getById('USER-999').call();
    if (error) {
        // TypeScript knows error is the typed error here
        // Each error type can be checked
        if (error.type === 'user-not-found') {
            // error.errorData is still strongly typed!
            console.log('User not found:', error.errorData?.requestedId);
        } else {
            console.log('Other error:', error.publicMessage);
        }
        return;
    }
    // After error check, user is guaranteed to be User here
    // Use optional chaining for TypeScript strictness
    console.log('User:', user?.name, user?.surname);
    // validate parameters locally without calling the server
    const validationResp = await routes.users.sayHello(john).typeErrors();
    console.log(validationResp); // []
}
