import { RouteDef, Routes } from '@mionkit/router';

// Defining a route as Handler
const sayHello = (ctx, name: string): string => {
    return `Hello ${name}.`;
};

// Using a RouteDef object
const sayHello2 = {
    enableSerialization: false,
    enableValidation: false,
    route(ctx, name1: string, name2: string): string {
        return `Hello ${name1} and ${name2}.`;
    },
} satisfies RouteDef;

const routes = {
    sayHello,
    sayHello2,
} satisfies Routes;
