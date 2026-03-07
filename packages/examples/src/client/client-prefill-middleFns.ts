import {initClient} from '@mionjs/client';
import type {MyApi} from './server.routes.ts';
import {HeadersSubset} from '@mionjs/core';

const {routes, middleFns} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

declare function redirectToLogin(): void;
declare function refreshToken(): Promise<string>;

// prefill() returns a TypedEvent for registering persistent handlers
// TypedEvent handlers are STRONGLY TYPED by the error.type string
middleFns
    .auth(new HeadersSubset({Authorization: 'myToken-XYZ'}))
    .prefill()
    .onSuccess((session) => {
        // Called after every successful auth
        console.log('Authenticated as:', session?.userId);
    })
    .onError('not-authorized', (error) => {
        // TypeScript knows error.type is 'invalid-token'
        console.log('Auth failed:', error.publicMessage);
        redirectToLogin();
    });

// call() returns a 4-tuple with middleFnResults and middleFnErrors
// These are NOT strongly typed - they contain generic RpcError types
const [sum, error, middleFnResults, middleFnErrors] = await routes.utils.sum(5, 2).call();

// Both TypedEvent handlers AND 4-tuple receive the same middleFn data:
// - TypedEvent handlers were already called above (if auth succeeded/failed)
// - middleFnResults/middleFnErrors also contain the auth result/error
if (middleFnErrors?.auth) {
    console.log('Auth error (generic type):', middleFnErrors.auth.publicMessage);
}
if (middleFnResults?.auth) {
    console.log('Session from tuple:', middleFnResults.auth);
}
if (!error) {
    console.log(sum); // 7
}
