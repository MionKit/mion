import {Routes, route} from '@mionkit/router';

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

