import {initClient} from '@mionkit/client';
import type {MyApi} from './server.routes';

const {routes, hooks} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

declare function redirectToLogin(): void;
declare function refreshToken(): Promise<string>;

async function prefillHooks() {
    // prefill() returns a TypedEvent for registering persistent handlers
    // TypedEvent handlers are STRONGLY TYPED by the error.type string
    hooks
        .auth('myToken-XYZ')
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
            hooks.auth(newToken).prefill();
        });

    // call() returns a 4-tuple with hookResults and hookErrors
    // These are NOT strongly typed - they contain generic RpcError types
    const [sum, error, hookResults, hookErrors] = await routes.utils.sum(5, 2).call();

    // Both TypedEvent handlers AND 4-tuple receive the same hook data:
    // - TypedEvent handlers were already called above (if auth succeeded/failed)
    // - hookResults/hookErrors also contain the auth result/error
    if (hookErrors?.auth) {
        console.log('Auth error (generic type):', hookErrors.auth.publicMessage);
    }
    if (hookResults?.auth) {
        console.log('Session from tuple:', hookResults.auth);
    }
    if (!error) {
        console.log(sum); // 7
    }
}

