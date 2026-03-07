import {Routes, route} from '@mionjs/router';

export const routes = {
    sayHello: route((ctx, name: string): string => {
        return `Hello ${name}!`;
    }),
} satisfies Routes;
