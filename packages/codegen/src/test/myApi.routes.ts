/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Item, Pet, User} from './myApi.types';

export const myApiRoutes = {
    auth: {
        hook: (app, ctx, token: string): void => {},
    },
    users: {
        getUser: async (app, ctx, id: number): Promise<User> => ({id, name: 'John', surname: 'Smith'}),
        setUser: {
            // user param is a type Literal, returned user is the a Type Symbol
            route: async (app, ctx, user: {id: number; name: string; surname: string}, user2?: User): Promise<User> =>
                user2 || user,
        },
        totalUsers: {
            canReturnData: true,
            hook(): number {
                return 3;
            },
        },
    },
    pets: {
        getPet: async (app, ctx, id: number): Promise<Pet> => ({id, race: 'Dog', name: 'Lassie'}),
        setPet: async (app, ctx, pet: Pet): Promise<Pet> => pet,
    },
    getNumber: {
        path: 'utils/getNumber',
        route: async (app, ctx, s: string, n: number): Promise<number> => n,
    },
    getItem: (app, ctx, item: Item<User>): Item<User> => ({item: {id: 3, name: 'John', surname: 'Smith'}}),
    getPetOrUser: (app, ctx, item: Pet | User): Pet | User => item,
    last: {hook(): void {}},
};

export type MyApiRoutes = typeof myApiRoutes;
