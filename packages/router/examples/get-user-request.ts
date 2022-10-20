import {Route, Routes, MkRouter} from '@mikrokit/router';

interface Entity {
    id: number;
}

const getUser: Route = async (context: any, entity: Entity) => {
    const user = await context.db.getUserById(entity.id);
    return user;
};

const routes: Routes = {
    users: {
        getUser, // api/users/getUser
    },
};

MkRouter.addRoutes(routes);
