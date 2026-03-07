import {Routes, initMionRouter, middleFn, route} from '@mionjs/router';

const routes = {
    authorizationMiddleFn: middleFn((): void => undefined), // middleFn
    users: {
        userOnlyMiddleFn: middleFn((): void => undefined), // scoped middleFn
        getUser: route((): null => null), // route
        setUser: route((): null => null), // route
    },
    pets: {
        getPet: route((): null => null), // route
        setPet: route((): null => null), // route
    },
    errorHandlerMiddleFn: middleFn((): void => undefined), // middleFn
    loggingMiddleFn: middleFn((): void => undefined), // middleFn
} satisfies Routes;

export const myValidApi = await initMionRouter(routes);
