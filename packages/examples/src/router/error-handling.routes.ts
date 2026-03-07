import {RpcError} from '@mionjs/core';
import {Route, route} from '@mionjs/router';
import type {Pet} from './full-example.app.ts';
import {myApp} from './full-example.app.ts';

export const getPet = route(async (ctx, id: string): Promise<Pet | RpcError<'pet-not-found'>> => {
    try {
        const pet = await myApp.db.getPet(id);
        if (!pet) {
            const publicMessage = `Pet with id ${id} can't be found`;
            // application errors should be returned and strongly typed,
            // so can be correctly managed by client
            return new RpcError({publicMessage, type: 'pet-not-found'});
        }
        return pet;
    } catch (dbError) {
        const publicMessage = `Cant fetch data.`;
        const message = (dbError as Error).message;
        /*
         * Thrown or Unexpected error are not strongly typed
         *
         * Full RpcError containing dbError message and stacktrace will be added
         * to ctx.request.unexpectedErrors, so it can be logged or managed after
         *
         * only publicMessage will be returned in the response
         */
        throw new RpcError({publicMessage, message, originalError: dbError as Error, type: 'db-error'});
    }
}) satisfies Route;

export const alwaysError = route((): void => {
    throw new Error('will generate a 500 error with an "Unknown Error" message');
}) satisfies Route;
