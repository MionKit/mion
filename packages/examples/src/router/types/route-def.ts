import {Handler, RouteMethod, RouteOptions} from '@mionkit/router';

/** Route definition */
export type RouteDef<H extends Handler = any> = Pick<RouteMethod<H>, 'type' | 'handler'> & {
    options?: RouteOptions;
};

