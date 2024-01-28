import {RouteOptions, Routes, route} from '@mionkit/router';

const routes = {
    // Using the route function to define a route
    sayHello: route(
        (ctx, name1: string, name2: string): string => {
            return `Hello ${name1} and ${name2}.`;
        },
        {description: 'A route that says hello.'} as RouteOptions
    ),
} satisfies Routes;
