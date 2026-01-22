import {StrFormat, StrEmail, StrDateTime} from '@mionkit/type-formats/FormatsString';
import {NumFormat} from '@mionkit/type-formats/FormatsNumber';
import {BigNumFormat} from '@mionkit/type-formats/FormatsBigInt';
import {initMionRouter, route} from '@mionkit/router';
import {RpcError} from '@mionkit/core';

type UserWithFormats = {
    name: StrFormat<{maxLength: 100; minLength: 2}>;
    age: NumFormat<{min: 0; max: 150}>;
    balance: BigNumFormat<{min: 0n}>;
    isActive: boolean;
    tags: string[];
    createdAt: StrDateTime;
    nested: {
        email: StrEmail;
        score: NumFormat<{min: 0}>;
    };
};

export const myApi = await initMionRouter({
    setUser: route((_ctx, user: UserWithFormats): UserWithFormats | RpcError<'user-exists'> => {
        return user;
    }),
});
export type MyApi = typeof myApi;
