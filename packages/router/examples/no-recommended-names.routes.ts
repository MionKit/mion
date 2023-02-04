import {registerRoutes} from '@mikrokit/router';

const sayHello = (app, ctx, name: string): string => {
    return `Hello ${name}.`;
};

const routes = {
    'say-Hello': sayHello, // api/say-Hello  !! NOT Recommended
    'say Hello': sayHello, // api/say%20Hello  !! ROUTE WONT BE FOUND
};

export const apiSpec = registerRoutes(routes);
