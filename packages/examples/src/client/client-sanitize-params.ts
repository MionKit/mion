import {initClient} from '@mionjs/client';
import type {MyApi} from './sanitize.routes.ts';

// sanitizeParams is on by default
const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// ' John@Example.COM ' is trimmed and lowercased before it leaves the browser
const [loggedIn] = await routes
  .login(' John@Example.COM ', 'my-password')
  .call();
console.log(loggedIn); // true

// false: validate and send the value as typed; the server still sanitizes
const raw = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
  sanitizeParams: false,
});
