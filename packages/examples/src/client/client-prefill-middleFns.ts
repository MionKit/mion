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

// call() returns a 4-tuple: [result, error, unexpected, middleFnResults]
// A middleFn error reaches BOTH channels: its typed onError handler (above) and the
// `unexpected` slot (an untyped RpcError<string>)
const [sum, error, unexpected, middleFnResults] = await routes.utils.sum(5, 2).call();

if (unexpected) {
    console.log('Something the route did not declare failed:', unexpected.publicMessage);
}
if (middleFnResults?.auth) {
    console.log('Session from tuple:', middleFnResults.auth);
}
if (!error) {
    console.log(sum); // 7
}
