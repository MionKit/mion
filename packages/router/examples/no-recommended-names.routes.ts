import {Routes, route} from '@mionkit/router';

const sayHello = route((ctx, name: string): string => {
    return `Hello ${name}.`;
});

const routes = {
    'say-Hello': sayHello, // path = /say-Hello  !! NOT Recommended
    'say Hello': sayHello, // path = /say%20Hello  !! ROUTE WONT BE FOUND
} satisfies Routes;
