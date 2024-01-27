/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {CallContext, headersHook, hook, initRouter, registerRoutes, route, RouterOptions, Routes} from '@mionkit/router';
import {Item, Pet, User} from './myApi.types';

const auth = headersHook('Authorization', (ctx, token: string): void => {});
const getUser = route(async (ctx, id: number): Promise<User> => ({id, name: 'John', surname: 'Smith'}));
const setUser = route(
    async (ctx, user: {id: number; name: string; surname: string}, user2?: User): Promise<User> => user2 || user
);
const totalUsers = hook((): number => 3);

const getPet = route(async (ctx, id: number): Promise<Pet> => ({id, race: 'Dog', name: 'Lassie'}));
const setPet = route(async (ctx, pet: Pet): Promise<Pet> => pet);

const getNumber = route(async (ctx, s: string, n: number): Promise<number> => n);
const getItem = route((ctx, item: Item<User>): Item<User> => ({item: {id: 3, name: 'John', surname: 'Smith'}}));
const getPetOrUser = route((ctx, item: Pet | User): Pet | User => item);
const logErrors = hook((ctx: CallContext): void => console.log(ctx.request.internalErrors));

const login = route((ctx: CallContext, email: string, pass: string): void => {
    ctx.response.headers.set('auth', 'AUTH-TOKEN-XWZ');
});

export const myApiRoutes = {
    auth: auth,
    users: {
        getUser,
        setUser: setUser,
        totalUsers: totalUsers,
    },
    pets: {getPet, setPet},
    utils: {getNumber},
    getItem,
    getPetOrUser,
    logErrors: logErrors,
} satisfies Routes;

export const publicEndpoints = {
    login,
} satisfies Routes;

export const getSharedData = (): any => ({});
export const options: Partial<RouterOptions> = {prefix: 'v1', getPublicRoutesData: true};

initRouter(options);
export const myApi = registerRoutes(myApiRoutes);
export const authApi = registerRoutes(publicEndpoints);
// type TotalUsers = typeof myApi.users.totalUsers;
