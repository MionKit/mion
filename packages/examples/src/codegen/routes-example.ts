import {Routes, route, initMionRouter, PublicApi} from '@mionjs/router';

export interface User {
    id: string;
    name: string;
    email: string;
}

export const routes = {
    users: {
        getById: route((ctx, id: string): User => {
            return {id, name: 'John', email: 'john@example.com'};
        }),
        create: route((ctx, user: Omit<User, 'id'>): User => {
            return {id: 'USER-123', ...user};
        }),
    },
} satisfies Routes;

export const myApi = await initMionRouter(routes);
export type MyApi = PublicApi<typeof routes>;
