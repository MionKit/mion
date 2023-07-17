import {RouteError, StatusCodes} from '@mionkit/router';
import type {Pet} from './myModels';
import {myApp} from './myApp';

export const getPet = (ctx, id: string): Promise<Pet> => {
    try {
        const pet = myApp.db.getPet(id);
        if (!pet) {
            // Only statusCode and publicMessage will be returned in the response.body
            const statusCode = StatusCodes.BAD_REQUEST;
            const publicMessage = `Pet with id ${id} can't be found`;
            throw new RouteError({statusCode, publicMessage});
        }
        return pet;
    } catch (dbError) {
        const statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
        const publicMessage = `Cant fetch data.`;
        /*
         * Only statusCode and publicMessage will be returned in the response.body.
         *
         * Full RouteError containing dbError message and stacktrace will be added
         * to ctx.request.internalErrors, so it can be logged or managed after
         */
        throw new RouteError({statusCode, publicMessage, originalError: dbError as Error});
    }
};

export const alwaysError = (): void => {
    /*
     * this will generate a public 500 error with an 'Unknown Error' message.
     *
     * Full RouteError containing dbError message and stacktrace will be added
     * to ctx.request.internalErrors, so it can be logged or managed after
     */
    throw new Error('This error will generate a public 500 error with no message');
};
