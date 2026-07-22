import {String, Email, StringDateTime} from '@ts-runtypes/core/formats';
import {Number} from '@ts-runtypes/core/formats';
import {BigInt} from '@ts-runtypes/core/formats';
import {initMionRouter, route} from '@mionjs/router';
import {RpcError} from '@mionjs/core';

type UserWithFormats = {
    name: String<{maxLength: 100; minLength: 2}>;
    age: Number<{min: 0; max: 150}>;
    balance: BigInt<{min: 0n}>;
    isActive: boolean;
    tags: string[];
    createdAt: StringDateTime;
    nested: {
        email: Email;
        score: Number<{min: 0}>;
    };
};

export const myApi = await initMionRouter({
    setUser: route((_ctx, user: UserWithFormats): UserWithFormats | RpcError<'user-exists'> => {
        return user;
    }),
});
export type MyApi = typeof myApi;
