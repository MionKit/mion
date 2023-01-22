import {addRoutes} from '@mikrokit/router';
import type {User} from 'MyModels';

const getUser = async (context: any, entity: {id: number}): Promise<User> => {
    const user = await context.db.getUserById(entity.id);
    return user;
};

const routes = {
    users: {
        getUser, // api/users/getUser
    },
};

export const executables = addRoutes(routes);
