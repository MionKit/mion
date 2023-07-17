import {Routes, registerRoutes} from '@mionkit/router';

// prettier-ignore
const invalidRoutes = {
    authorizationHook: {hook(): void {}}, // hook
    1: {
        // invalid (this would execute before the authorizationHook)
        userOnlyHook: {hook(): void {}}, // hook
        getUser: (): null => null, // route: users/getUser
    },
    '2': {
        // invalid (this would execute before the authorizationHook)
        getPet: (): null => null, // route: users/getUser
    },
    errorHandlerHook: {hook(): void {}}, // hook,
    loggingHook: {hook(): void {}}, // hook,
} satisfies Routes;

export const myInvalidApi = registerRoutes(invalidRoutes); // throws an error
