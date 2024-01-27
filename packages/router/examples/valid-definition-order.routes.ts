import {Routes, initMionRouter, hook, route} from '@mionkit/router';

const routes = {
    authorizationHook: hook((): void => undefined), // hook
    users: {
        userOnlyHook: hook((): void => undefined), // scoped hook
        getUser: (): null => null, // route
        setUser: route((): null => null), // route
    },
    pets: {
        getPet: (): null => null, // route
        setPet: route((): null => null), // route
    },
    errorHandlerHook: hook((): void => undefined), // hook
    loggingHook: hook((): void => undefined), // hook
} satisfies Routes;

export const myValidApi = initMionRouter(routes);
