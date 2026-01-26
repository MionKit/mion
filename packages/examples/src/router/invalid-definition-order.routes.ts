import {Routes, initMionRouter, linkedFn, route} from '@mionkit/router';

const invalidRoutes = {
    authorizationLinkedFn: linkedFn((): void => undefined), // linkedFn
    1: {
        // Invalid naming !!!
        userOnlyLinkedFn: linkedFn((): void => undefined), // linkedFn
        getUser: route((): null => null), // route
    },
    '2': {
        // Invalid naming !!!
        getPet: route((): null => null), // route
    },
    errorHandlerLinkedFn: linkedFn((): void => undefined), // linkedFn
    loggingLinkedFn: linkedFn((): void => undefined), // linkedFn
} satisfies Routes;

// Throws an error as there are invalid route names
export const myInvalidApi = await initMionRouter(invalidRoutes);
