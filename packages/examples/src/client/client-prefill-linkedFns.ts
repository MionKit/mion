import {initClient} from '@mionkit/client';
import type {MyApi} from './server.routes';
import {HeadersSubset} from '@mionkit/core';

const {routes, linkedFns} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

declare function redirectToLogin(): void;
declare function refreshToken(): Promise<string>;

async function prefillLinkedFns() {
    // prefill() returns a TypedEvent for registering persistent handlers
    // TypedEvent handlers are STRONGLY TYPED by the error.type string
    linkedFns
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
            linkedFns.auth(newToken).prefill();
        });

    // call() returns a 4-tuple with linkedFnResults and linkedFnErrors
    // These are NOT strongly typed - they contain generic RpcError types
    const [sum, error, linkedFnResults, linkedFnErrors] = await routes.utils.sum(5, 2).call();

    // Both TypedEvent handlers AND 4-tuple receive the same linkedFn data:
    // - TypedEvent handlers were already called above (if auth succeeded/failed)
    // - linkedFnResults/linkedFnErrors also contain the auth result/error
    if (linkedFnErrors?.auth) {
        console.log('Auth error (generic type):', linkedFnErrors.auth.publicMessage);
    }
    if (linkedFnResults?.auth) {
        console.log('Session from tuple:', linkedFnResults.auth);
    }
    if (!error) {
        console.log(sum); // 7
    }
}
