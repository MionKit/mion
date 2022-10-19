import {Routes, MkkRouter, Hook, Route} from '@mikrokit/router';

const authorizationHook: Hook = {hook() {}};
const userOnlyHook: Hook = {hook() {}};
const errorHandlerHook: Hook = {hook() {}};
const loggingHook: Hook = {hook() {}};
const getUser: Route = () => null;
const getPet: Route = () => null;
const getFoo: Route = () => null;
const getBar: Route = () => null;

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

MkkRouter.addRoutes(routes);

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

MkkRouter.addRoutes(invalidRoutes); // throws an error
