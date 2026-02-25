import {initClient} from '@mionkit/client';
import type {MyApi} from './server.routes.ts';
import {HeadersSubset} from '@mionkit/core';

const {routes, useFns} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

declare function redirectToLogin(): void;
declare function refreshToken(): Promise<string>;

async function prefillUseFns() {
    // prefill() returns a TypedEvent for registering persistent handlers
    // TypedEvent handlers are STRONGLY TYPED by the error.type string
    useFns
        .auth(new HeadersSubset({Authorization: 'myToken-XYZ'}))
        .prefill()
        .onSuccess((session) => {
            // Called after every successful auth
            console.log('Authenticated as:', session?.userId);
        })
        .onError('invalid-token', (error) => {
            // TypeScript knows error.type is 'invalid-token'
            console.log('Auth failed:', error.publicMessage);
            redirectToLogin();
        })
        .onError('token-expired', async (error) => {
            // TypeScript knows error.type is 'token-expired'
            const newToken = await refreshToken();
            useFns.auth(newToken).prefill();
        });

    // call() returns a 4-tuple with useFnResults and useFnErrors
    // These are NOT strongly typed - they contain generic RpcError types
    const [sum, error, useFnResults, useFnErrors] = await routes.utils.sum(5, 2).call();

    // Both TypedEvent handlers AND 4-tuple receive the same useFn data:
    // - TypedEvent handlers were already called above (if auth succeeded/failed)
    // - useFnResults/useFnErrors also contain the auth result/error
    if (useFnErrors?.auth) {
        console.log('Auth error (generic type):', useFnErrors.auth.publicMessage);
    }
    if (useFnResults?.auth) {
        console.log('Session from tuple:', useFnResults.auth);
    }
    if (!error) {
        console.log(sum); // 7
    }
}
