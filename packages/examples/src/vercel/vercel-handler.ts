import {createVercelHandler} from '@mionjs/platform-vercel';
import {initMionRouter} from '@mionjs/router';
import {routes} from './vercel-routes.ts';

await initMionRouter(routes);

export const {GET, POST, PUT, DELETE, PATCH} = createVercelHandler();
