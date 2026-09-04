import {Routes, route, initRouter} from '@mionjs/router';
import type * as TF from '@mionjs/run-types/formats';

// The type says what a clean value looks like: trimmed and lowercased.
type Email = TF.Transform<TF.Email, {trim: true; lowercase: true}>;

// Turn sanitizing on for every route, or per route below. It is off by default.
await initRouter({sanitizeParams: true});

const routes = {
  // ' John@Example.COM ' arrives, the handler gets 'john@example.com'
  login: route(
    (ctx, email: Email, password: string): boolean =>
      email.length > 0 && password.length > 0
  ),
  // this route opts out: the handler gets the value exactly as sent
  echo: route((ctx, email: Email): string => email, {sanitizeParams: false}),
} satisfies Routes;
