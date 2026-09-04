import {Routes, initMionRouter, route} from '@mionjs/router';
import type * as TF from '@mionjs/run-types/formats';

// the type says what a clean value looks like: trimmed and lowercased
type Email = TF.Transform<TF.Email, {trim: true; lowercase: true}>;

const routes = {
  // ' John@Example.COM ' arrives, the handler gets 'john@example.com'
  login: route(
    (ctx, email: Email, password: string): boolean =>
      email.length > 0 && password.length > 0,
    {
      sanitizeParams: true,
    }
  ),
} satisfies Routes;

const myApi = await initMionRouter(routes);

export type MyApi = typeof myApi;
