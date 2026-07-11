import {Routes, initMionRouter, middleFn, route} from '@mionjs/router';

const invalidRoutes = {
    authorizationMiddleFn: middleFn((): void => undefined), // middleFn
    1: {
        // Invalid naming !!!
        userOnlyMiddleFn: middleFn((): void => undefined), // middleFn
        getUser: route((): null => null), // route
    },
    '2': {
        // Invalid naming !!!
        getPet: route((): null => null), // route
    },
    errorHandlerMiddleFn: middleFn((): void => undefined), // middleFn
    loggingMiddleFn: middleFn((): void => undefined), // middleFn
} satisfies Routes;

// Throws an error as there are invalid route names
export const myInvalidApi = await initMionRouter(invalidRoutes);
