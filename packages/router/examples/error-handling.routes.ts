import {RpcError, StatusCodes} from '@mionkit/core';
import type {Pet} from './myModels';
import {myApp} from './myApp';

export const getPet = async (ctx, id: string): Promise<Pet | RpcError> => {
    try {
        const pet = await myApp.db.getPet(id);
        if (!pet) {
            // Only statusCode and publicMessage will be returned in the response.body
            const statusCode = StatusCodes.BAD_REQUEST;
            const publicMessage = `Pet with id ${id} can't be found`;
            // either return or throw are allowed
            return new RpcError({statusCode, publicMessage});
        }
        return pet;
    } catch (dbError) {
        const statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
        const publicMessage = `Cant fetch data.`;
        /*
         * Only statusCode and publicMessage will be returned in the response.body.
         *
         * Full RpcError containing dbError message and stacktrace will be added
         * to ctx.request.internalErrors, so it can be logged or managed after
         */
        return new RpcError({statusCode, publicMessage, originalError: dbError as Error});
    }
}; // satisfies Route

export const alwaysError = (): void => {
    throw new Error('will generate a 500 error with an "Unknown Error" message');
}; // satisfies Route
