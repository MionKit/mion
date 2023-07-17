import {Routes, registerRoutes} from '@mionkit/router';
import type {User} from 'MyModels';

const getUser = async (ctx, entity: {id: number}): Promise<User> => {
    const user = await ctx.db.getUserById(entity.id);
    return user;
};

const routes = {
    users: {
        getUser, // api/users/getUser
    },
} satisfies Routes;

export const apiSpec = registerRoutes(routes);
