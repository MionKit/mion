import {Routes, initMionRouter, hook, route} from '@mionkit/router';

const invalidRoutes = {
    authorizationHook: hook((): void => undefined), // hook
    1: {
        // Invalid naming !!!
        userOnlyHook: hook((): void => undefined), // hook
        getUser: route((): null => null), // route
    },
    '2': {
        // Invalid naming !!!
        getPet: route((): null => null), // route
    },
    errorHandlerHook: hook((): void => undefined), // hook
    loggingHook: hook((): void => undefined), // hook
} satisfies Routes;

// Throws an error as there are invalid route names
export const myInvalidApi = initMionRouter(invalidRoutes);
