import {Routes} from '../types/general';
import {PublicApi} from '../types/publicMethods';
import {mionClientRoutes} from './client.routes';
import {mionErrorsRoutes} from './globalError.routes';

export const mionRoutes = {
    ...mionClientRoutes,
    ...mionErrorsRoutes,
} satisfies Routes;

export type MionRoutes = PublicApi<typeof mionRoutes>;
