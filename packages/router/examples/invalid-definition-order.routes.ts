import {Routes, initMionRouter, hook} from '@mionkit/router';

const invalidRoutes = {
    authorizationHook: hook((): void => undefined), // hook
    1: {
        // Invalid naming !!!
        userOnlyHook: hook((): void => undefined), // hook
        getUser: (): null => null, // route
    },
    '2': {
        // Invalid naming !!!
        getPet: (): null => null, // route
    },
    errorHandlerHook: hook((): void => undefined), // hook
    loggingHook: hook((): void => undefined), // hook
} satisfies Routes;

// Throws an error as there are invalid route names
export const myInvalidApi = initMionRouter(invalidRoutes);
