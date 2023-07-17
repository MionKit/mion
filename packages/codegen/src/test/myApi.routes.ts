/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {initRouter, Obj, registerRoutes, RouterOptions, Routes} from '@mionkit/router';
import {Item, Pet, User} from './myApi.types';

export const myApiRoutes = {
    auth: {
        inHeader: true,
        hook: (ctx, token: string): void => {},
    },
    users: {
        getUser: async (ctx, id: number): Promise<User> => ({id, name: 'John', surname: 'Smith'}),
        setUser: {
            // user param is a type Literal, returned user is the a Type Symbol
            route: async (ctx, user: {id: number; name: string; surname: string}, user2?: User): Promise<User> => user2 || user,
        },
        totalUsers: {
            canReturnData: true,
            hook(): number {
                return 3;
            },
        },
    },
    pets: {
        getPet: async (ctx, id: number): Promise<Pet> => ({id, race: 'Dog', name: 'Lassie'}),
        setPet: async (ctx, pet: Pet): Promise<Pet> => pet,
    },
    getNumber: {
        path: 'utils/getNumber',
        route: async (ctx, s: string, n: number): Promise<number> => n,
    },
    getItem: (ctx, item: Item<User>): Item<User> => ({item: {id: 3, name: 'John', surname: 'Smith'}}),
    getPetOrUser: (ctx, item: Pet | User): Pet | User => item,
    last: {hook(): void {}},
} satisfies Routes;

export const publicEndpoints = {
    login: {
        inHeader: true,
        route: (ctx, email: string, pass: string): string => 'AUTH-TOKEN-XWZ',
    },
} satisfies Routes;

export const getSharedData = (): Obj => ({});
export const options: Partial<RouterOptions> = {prefix: 'v1', getPublicRoutesData: true};

initRouter(getSharedData, options);
export const myApi = registerRoutes(myApiRoutes);
export const authApi = registerRoutes(publicEndpoints);
