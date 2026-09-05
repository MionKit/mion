import {createMionRouter, Routes} from '@mionjs/router';
import type * as TF from '@mionjs/run-types/formats';

const mion = createMionRouter();

// the type says what a clean value looks like: trimmed and lowercased
type Email = TF.Transform<TF.Email, {trim: true; lowercase: true}>;

const routes = {
  // ' John@Example.COM ' arrives, the handler gets 'john@example.com'
  login: mion.route(
    (ctx, email: Email, password: string): boolean =>
      email.length > 0 && password.length > 0,
    {
      sanitizeParams: true,
    }
  ),
} satisfies Routes;

const myApi = mion.initRoutes(routes);

export type MyApi = typeof myApi;
