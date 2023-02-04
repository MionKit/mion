import {registerRoutes, initRouter} from '@mikrokit/router';
import type {User} from 'MyModels';

const getUser = async (app, ctx, entity: {id: number}): Promise<User> => {
    const user = await ctx.db.getUserById(entity.id);
    return user;
};

const routes = {
    users: {
        getUser, // api/users/getUser
    },
};

export const apiSpec = registerRoutes(routes);
