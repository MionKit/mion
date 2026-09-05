/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionjs/core';
import {PublicApi, Routes, createMionRouter} from '@mionjs/router';

// NOTE: regular imports only — the resolver reads types from the program, but the
// route VALUES are real runtime values.

type SimpleUser = {name: string; age: number};

// The router options live here, next to the routes they type. The contextDataFactory
// must return a plain object with at least one property (the router validates it at
// init), so give it the shape a real app would carry.
export const mion = createMionRouter({contextDataFactory: () => ({user: null}), skipClientRoutes: false});

export const routes = {
    sayHello: mion.route((_ctx, user: SimpleUser): string => `Hello ${user.name}`),
    calculateAge: mion.route((_ctx, birthYear: number): number => 2026 - birthYear),
    mayFail: mion.route((_ctx, shouldFail: boolean): string | RpcError<'intentional-error'> => {
        if (shouldFail) return new RpcError({publicMessage: 'Intentional failure', type: 'intentional-error'});
        return 'Success!';
    }),

    // Binary lane: proves the packed serializer travels to bun too, not just node.
    binary: {
        echo: mion.route((_ctx, message: string): string => message, {serializer: 'binary'}),
        getSimpleUser: mion.route((_ctx, name: string, age: number): SimpleUser => ({name, age}), {serializer: 'binary'}),
    },
} satisfies Routes;

/** Exported for the client-side half of the round-trip. */
export type BunServerApi = PublicApi<typeof routes>;
