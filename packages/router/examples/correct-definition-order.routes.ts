import {Routes, Router, Hook, Route} from '@mikrokit/router';

const authorizationHook: Hook = {hook(): void {}};
const userOnlyHook: Hook = {hook(): void {}};
const errorHandlerHook: Hook = {hook(): void {}};
const loggingHook: Hook = {hook(): void {}};
const getUser: Route = (): null => null;
const getPet: Route = (): null => null;
const getFoo: Route = (): null => null;
const getBar: Route = (): null => null;

const routes: Routes = {
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

Router.addRoutes(routes);

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

Router.addRoutes(invalidRoutes); // throws an error
