import { Routes, registerRoutes } from '@mionkit/router';

const invalidRoutes = {
    authorizationHook: { hook(): void { } }, // hook
    1: { // Invalid naming !!!
        userOnlyHook: { hook(): void { } }, // hook
        getUser: (): null => null, // route
    },
    '2': { // Invalid naming !!!
        getPet: (): null => null, // route
    },
    errorHandlerHook: { hook(): void { } }, // hook
    loggingHook: { hook(): void { } }, // hook
} satisfies Routes;

// Throws an error as there are invalid route names
export const myInvalidApi = registerRoutes(invalidRoutes); 
