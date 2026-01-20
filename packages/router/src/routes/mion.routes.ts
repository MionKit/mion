import {Routes} from '../types/general';
import {PublicApi} from '../types/publicMethods';
import {mionClientRoutes} from './client.routes';
import {mionErrorsRoutes} from './errors.routes';

export const mionRoutes = {
    ...mionClientRoutes,
    ...mionErrorsRoutes,
} as const satisfies Routes;

export type MionRoutes = PublicApi<typeof mionRoutes>;
