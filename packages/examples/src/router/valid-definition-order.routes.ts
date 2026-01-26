import {Routes, initMionRouter, linkedFn, route} from '@mionkit/router';

const routes = {
    authorizationLinkedFn: linkedFn((): void => undefined), // linkedFn
    users: {
        userOnlyLinkedFn: linkedFn((): void => undefined), // scoped linkedFn
        getUser: route((): null => null), // route
        setUser: route((): null => null), // route
    },
    pets: {
        getPet: route((): null => null), // route
        setPet: route((): null => null), // route
    },
    errorHandlerLinkedFn: linkedFn((): void => undefined), // linkedFn
    loggingLinkedFn: linkedFn((): void => undefined), // linkedFn
} satisfies Routes;

export const myValidApi = await initMionRouter(routes);
