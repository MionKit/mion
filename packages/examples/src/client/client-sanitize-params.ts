import {initClient} from '@mionjs/client';
import type {SanitizeApi} from './sanitize.routes.ts';

// on by default: the client runs the same transforms the route declares, before
// its own validation and before sending, so both ends see the same value
const {routes} = initClient<SanitizeApi>({baseURL: 'http://localhost:3000'});

// ' John@Example.COM ' is trimmed and lowercased before it leaves the browser
const [loggedIn] = await routes.login(' John@Example.COM ', 'my-password').call();
console.log(loggedIn); // true

// set sanitizeParams to false to validate and send the value exactly as typed,
// the server still sanitizes the route
const raw = initClient<SanitizeApi>({baseURL: 'http://localhost:3000', sanitizeParams: false});
