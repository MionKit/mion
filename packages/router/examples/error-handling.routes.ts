import {RouteError, StatusCodes} from '@mikrokit/router';
import type {Pet} from 'MyModels';

export const getPet = (context: any, id: string): Promise<Pet> => {
    try {
        const pet = context.app.db.getPet(id);
        if (!pet) {
            // Only statusCode and publicMessage will be returned in the response.body
            const statusCode = StatusCodes.BAD_REQUEST;
            const publicMessage = `Pet with id ${id} can't be found`;
            throw new RouteError(statusCode, publicMessage);
        }
        return pet;
    } catch (dbError) {
        // Only statusCode and publicMessage will be returned in the response.body
        const statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
        const publicMessage = `Cant fetch data.`;
        /* 
         Full RouteError containing dbError message and stacktrace will be added
         to context.request.internalErrors, so it can be logged or managed after
        */
        throw new RouteError(statusCode, publicMessage, undefined, dbError as Error);
    }
};
