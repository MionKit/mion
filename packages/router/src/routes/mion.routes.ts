import {Routes} from '../types/general';
import {PublicApi} from '../types/publicMethods';
import {mionClientRoutes} from './client.routes';
import {mionGlobalErrorRoute} from './globalError.routes';

const mionRoutes = {
    ...mionClientRoutes,
    ...mionGlobalErrorRoute,
} satisfies Routes;

export type MionRoutes = PublicApi<typeof mionRoutes>;
