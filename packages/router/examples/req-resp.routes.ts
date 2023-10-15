import {Routes} from '@mionkit/router';

const routes = {
    sayHello: (ctx, name: string): string => {
        return `Hello ${name}.`;
    },
    greetings: (ctx, name1: string, name2: string): string => {
        return `Hello ${name1} and ${name2}.`;
    },
} satisfies Routes;
