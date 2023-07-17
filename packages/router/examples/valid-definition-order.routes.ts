import {Routes, registerRoutes} from '@mionkit/router';

// prettier-ignore
const routes = {
    authorizationHook: {hook(): void {}}, // hook
    users: {
        userOnlyHook: {hook(): void {}}, // hook
        getUser: (): null => null, // route: users/getUser
    },
    pets: {
        getPet: (): null => null, // route: users/getUser
    },
    errorHandlerHook: {hook(): void {}}, // hook,
    loggingHook: {hook(): void {}}, // hook,
} satisfies Routes;

export const myValidApi = registerRoutes(routes);
