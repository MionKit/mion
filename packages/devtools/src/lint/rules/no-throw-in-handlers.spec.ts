/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RuleTester} from '@typescript-eslint/rule-tester';
import rule from './no-throw-in-handlers.ts';

const ruleTester = new RuleTester();

ruleTester.run('no-throw-in-handlers', rule, {
  valid: [
    // the two supported forms: a plain error keeps the chain running, a fatal one stops it
    {
      code: `
                import { createMionRouter } from '@mionjs/router';
                const mion = createMionRouter();
                mion.route((ctx, id: string): string | RpcError<'not-found'> => {
                    if (!id) return new RpcError({type: 'not-found', publicMessage: 'nope'});
                    return id;
                });
            `,
    },
    {
      code: `
                import { createMionRouter } from '@mionjs/router';
                const mion = createMionRouter();
                mion.headersFn((ctx, h: HeadersSubset<'auth'>): void | FatalError<'not-authorized'> => {
                    if (!h.headers.auth) return new FatalError({type: 'not-authorized', publicMessage: 'nope'});
                });
            `,
    },
    // caught right here, so it never reaches the router
    {
      code: `
                import { createMionRouter } from '@mionjs/router';
                const mion = createMionRouter();
                mion.route((ctx, id: string): string | RpcError<'db'> => {
                    try {
                        if (!id) throw new Error('empty');
                        return id;
                    } catch {
                        return new RpcError({type: 'db', publicMessage: 'lookup failed'});
                    }
                });
            `,
    },
    // a plain function nobody passes to a helper
    {
      code: `
                import { createMionRouter } from '@mionjs/router';
                const mion = createMionRouter();
                function assertId(id: string): void {
                    if (!id) throw new Error('empty');
                }
            `,
    },
    // express style: the handler is not the first argument, so this is not a mion route
    {
      code: `
                import { app } from './app.ts';
                app.route('/hello', (req, res) => { throw new Error('boom'); });
            `,
    },
    // a bare helper name imported from a PACKAGE is never a mion helper
    {
      code: `
                import { route } from '@mionjs/router';
                route((ctx): string => { throw new Error('boom'); });
            `,
    },
    // rawMiddleFn cannot declare a return type, so it is not one of the checked helpers
    {
      code: `
                import { createMionRouter } from '@mionjs/router';
                const mion = createMionRouter();
                mion.rawMiddleFn((ctx): void => { throw new Error('boom'); });
            `,
    },
  ],
  invalid: [
    // one case per helper, through the `mion.<helper>()` form
    {
      code: `
                import { createMionRouter } from '@mionjs/router';
                const mion = createMionRouter();
                mion.route((ctx, id: string): string => { throw new Error('boom'); });
            `,
      errors: [{messageId: 'noThrow', data: {helper: 'route'}}],
    },
    {
      code: `
                import { createMionRouter } from '@mionjs/router';
                const mion = createMionRouter();
                mion.query((ctx, id: string): string => { throw new Error('boom'); });
            `,
      errors: [{messageId: 'noThrow', data: {helper: 'query'}}],
    },
    {
      code: `
                import { createMionRouter } from '@mionjs/router';
                const mion = createMionRouter();
                mion.mutation((ctx, id: string): string => { throw new Error('boom'); });
            `,
      errors: [{messageId: 'noThrow', data: {helper: 'mutation'}}],
    },
    {
      code: `
                import { createMionRouter } from '@mionjs/router';
                const mion = createMionRouter();
                mion.middleFn((ctx): void => { throw new Error('boom'); });
            `,
      errors: [{messageId: 'noThrow', data: {helper: 'middleFn'}}],
    },
    {
      code: `
                import { createMionRouter } from '@mionjs/router';
                const mion = createMionRouter();
                mion.headersFn((ctx, h: HeadersSubset<'auth'>): void => { throw new Error('boom'); });
            `,
      errors: [{messageId: 'noThrow', data: {helper: 'headersFn'}}],
    },
    // the destructured form, and a function expression rather than an arrow
    {
      code: `
                import { createMionRouter } from '@mionjs/router';
                const { route } = createMionRouter();
                route(function (ctx, id: string): string { throw new Error('boom'); });
            `,
      errors: [{messageId: 'noThrow', data: {helper: 'route'}}],
    },
    // a callback nested in the handler body still runs inside the request
    {
      code: `
                import { createMionRouter } from '@mionjs/router';
                const mion = createMionRouter();
                mion.route((ctx, ids: string[]): string[] => ids.map((id) => { throw new Error('boom'); }));
            `,
      errors: [{messageId: 'noThrow', data: {helper: 'route'}}],
    },
    // a rethrow from the catch clause escapes the handler
    {
      code: `
                import { createMionRouter } from '@mionjs/router';
                const mion = createMionRouter();
                mion.route((ctx, id: string): string => {
                    try {
                        return id;
                    } catch (err) {
                        throw err;
                    }
                });
            `,
      errors: [{messageId: 'noThrow', data: {helper: 'route'}}],
    },
    // finally is not the catch clause, so this one escapes too
    {
      code: `
                import { createMionRouter } from '@mionjs/router';
                const mion = createMionRouter();
                mion.route((ctx, id: string): string => {
                    try {
                        return id;
                    } finally {
                        throw new Error('boom');
                    }
                });
            `,
      errors: [{messageId: 'noThrow', data: {helper: 'route'}}],
    },
    // try/finally with no catch clause does not swallow the throw
    {
      code: `
                import { createMionRouter } from '@mionjs/router';
                const mion = createMionRouter();
                mion.route((ctx, id: string): string => {
                    try {
                        throw new Error('boom');
                    } finally {
                        cleanup();
                    }
                });
            `,
      errors: [{messageId: 'noThrow', data: {helper: 'route'}}],
    },
    // any class extending Error, however many parents away, is the same mistake
    {
      code: `
                import { createMionRouter } from '@mionjs/router';
                const mion = createMionRouter();
                class AuthError extends FatalError<'not-authorized'> {}
                mion.headersFn((ctx, h: HeadersSubset<'auth'>): void => {
                    throw new AuthError({type: 'not-authorized', publicMessage: 'nope'});
                });
            `,
      errors: [{messageId: 'noThrow', data: {helper: 'headersFn'}}],
    },
    {
      code: `
                import { createMionRouter } from '@mionjs/router';
                const mion = createMionRouter();
                class DbError extends Error {}
                mion.route((ctx, id: string): string => { throw new DbError('down'); });
            `,
      errors: [{messageId: 'noThrow', data: {helper: 'route'}}],
    },
    // the rule never classifies the thrown value, so a bare string reports the same way
    {
      code: `
                import { createMionRouter } from '@mionjs/router';
                const mion = createMionRouter();
                mion.route((ctx, id: string): string => { throw 'nope'; });
            `,
      errors: [{messageId: 'noThrow', data: {helper: 'route'}}],
    },
    // a router imported from a RELATIVE module is the usual app layout
    {
      code: `
                import { mion } from './mion.ts';
                mion.route((ctx, id: string): string => { throw new Error('boom'); });
            `,
      errors: [{messageId: 'noThrow', data: {helper: 'route'}}],
    },
  ],
});
