import {initClient, workflow} from '@mionkit/client';
import type {MyApi} from './home-server.ts';

const {routes} = initClient<MyApi>({
    baseURL: 'http://localhost:3000',
});
// @annotate: Execute multiple routes in a single HTTP request

const [[user, greeting], [userError, greetingError]] = await workflow([
    routes.getUser(1234),
    routes.sayHello('World'),
]);
// @annotate: Results are typed arrays matching the order of routes

if (user) { user.name; }
//                ^?

 
if (userError) { userError.type; }
//                  ^?

