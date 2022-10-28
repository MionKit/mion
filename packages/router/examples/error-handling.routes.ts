import {Route, RouteError, StatusCodes} from '@mikrokit/router';

const getSomeData: Route = {
    route: (context): void => {
        try {
            const data = context.app.db.getSomeData();
        } catch (dbError) {
            const statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
            const publicMessage = `Cant fetch data.`;
            // Only statusCode and publicMessage will be returned in the response.body
            /* 
             Full RouteError containing dbError message and stacktrace will be added
             to context.internalErrors, so it can be logged or managed after
            */
            throw new RouteError(statusCode, publicMessage, dbError);
        }
    },
};
