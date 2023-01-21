import {addRoutes} from '@mikrokit/router';
import type {Routes, HookDef, Route} from '@mikrokit/router';

const authorizationHook: HookDef = {hook(): void {}};
const userOnlyHook: HookDef = {hook(): void {}};
const errorHandlerHook: HookDef = {hook(): void {}};
const loggingHook: HookDef = {hook(): void {}};
const getUser: Route = (): null => null;
const getPet: Route = (): null => null;
const getFoo: Route = (): null => null;
const getBar: Route = (): null => null;

const routes = {
    authorizationHook, // hook
    users: {
        userOnlyHook, // hook
        getUser, // route: users/getUser
    },
    pets: {
        getPet, // route: users/getUser
    },
    errorHandlerHook, // hook,
    loggingHook, // hook,
};

addRoutes(routes);

const invalidRoutes = {
    authorizationHook, // hook
    1: {
        // invalid (this would execute before the authorizationHook)
        getFoo, // route
    },
    '2': {
        // invalid (this would execute before the authorizationHook)
        getBar, // route
    },
};

addRoutes(invalidRoutes); // throws an error
