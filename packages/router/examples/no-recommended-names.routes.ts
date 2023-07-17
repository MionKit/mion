import {Routes, registerRoutes} from '@mionkit/router';

const sayHello = (ctx, name: string): string => {
    return `Hello ${name}.`;
};

const routes = {
    'say-Hello': sayHello, // api/say-Hello  !! NOT Recommended
    'say Hello': sayHello, // api/say%20Hello  !! ROUTE WONT BE FOUND
} satisfies Routes;

export const apiSpec = registerRoutes(routes);
