/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {CallContext, initRouter, registerRoutes, RouterOptions, Routes} from '@mionkit/router';
import {Item, Pet, User} from './myApi.types';
import {Mutable, Obj} from '@mionkit/core';

const auth = (ctx, token: string): void => {};
const getUser = async (ctx, id: number): Promise<User> => ({id, name: 'John', surname: 'Smith'});
const setUser = async (ctx, user: {id: number; name: string; surname: string}, user2?: User): Promise<User> => user2 || user;
const totalUsers = (): number => 3;

const getPet = async (ctx, id: number): Promise<Pet> => ({id, race: 'Dog', name: 'Lassie'});
const setPet = async (ctx, pet: Pet): Promise<Pet> => pet;

const getNumber = async (ctx, s: string, n: number): Promise<number> => n;
const getItem = (ctx, item: Item<User>): Item<User> => ({item: {id: 3, name: 'John', surname: 'Smith'}});
const getPetOrUser = (ctx, item: Pet | User): Pet | User => item;
const logErrors = (ctx: CallContext): void => console.log(ctx.request.internalErrors);

const login = (ctx: CallContext, email: string, pass: string): void => {
    ctx.response.headers.auth = 'AUTH-TOKEN-XWZ';
};

export const myApiRoutes = {
    auth: {headerHook: auth},
    users: {
        getUser,
        setUser: setUser,
        // will return total users count in response body as canReturnData = true
        totalUsers: {canReturnData: true, hook: totalUsers},
    },
    pets: {getPet, setPet},
    getNumber: {
        // will use http://myApi.com/utils/getNumber instead http://myApi.com/getNumber
        path: 'utils/getNumber',
        route: getNumber,
    },
    getItem,
    getPetOrUser,
    logErrors: {hook: logErrors},
} satisfies Routes;

export const publicEndpoints = {
    login,
} satisfies Routes;

export const getSharedData = (): any => ({});
export const options: Partial<RouterOptions> = {prefix: 'v1', getPublicRoutesData: true};

initRouter(options);
export const myApi = registerRoutes(myApiRoutes);
export const authApi = registerRoutes(publicEndpoints);
type TotalUsers = typeof myApi.users.totalUsers;
