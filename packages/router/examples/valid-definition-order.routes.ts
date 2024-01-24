import {Routes, initMionRouter} from '@mionkit/router';

const routes = {
    authorizationHook: {hook(): void {}}, // hook
    users: {
        userOnlyHook: {hook(): void {}}, // scoped hook
        getUser: (): null => null, // route
        setUser: (): null => null, // route
    },
    pets: {
        getPet: (): null => null, // route
        setPet: (): null => null, // route
    },
    errorHandlerHook: {hook(): void {}}, // hook
    loggingHook: {hook(): void {}}, // hook
} satisfies Routes;

export const myValidApi = initMionRouter(routes);
