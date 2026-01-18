import {Routes, route} from '@mionkit/router';

export const routes = {
    sayHello: route((ctx, name1: string, name2: string): string => {
        return `Hello ${name1} and ${name2}.`;
    }),
} satisfies Routes;
