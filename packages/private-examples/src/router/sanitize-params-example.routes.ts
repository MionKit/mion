import {createMionRouter, Routes} from '@mionjs/router';
import type * as TF from '@mionjs/run-types/formats';

// The type says what a clean value looks like: trimmed and lowercased.
type Email = TF.Transform<TF.Email, {trim: true; lowercase: true}>;

// Turn sanitizing on for every route, or per route below. It is off by default.
const mion = createMionRouter({sanitizeParams: true});

const routes = {
  // ' John@Example.COM ' arrives, the handler gets 'john@example.com'
  login: mion.route(
    (ctx, email: Email, password: string): boolean =>
      email.length > 0 && password.length > 0
  ),
  // this route opts out: the handler gets the value exactly as sent
  echo: mion.route((ctx, email: Email): string => email, {
    sanitizeParams: false,
  }),
} satisfies Routes;

mion.initRoutes(routes);
