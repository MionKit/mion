import {Routes, route} from '@mionkit/router';

const routes = {
    sayHello: route((ctx, name: string): string => {
        return `Hello ${name}.`;
    }),
    greetings: route((ctx, name1: string, name2: string): string => {
        return `Hello ${name1} and ${name2}.`;
    }),
} satisfies Routes;
