/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {AnyObject} from './general.types';

/** Batch request payload - multiple route calls in a single HTTP request */
export interface BatchRequest {
    /** Array of route paths - e.g. /users/get, /posts/list */
    routeIds: string[];
    /** Per-route request bodies - each is the individual route body */
    bodies: AnyObject[];
}

/** Batch response payload - combined results from multiple route calls */
export interface BatchResponse {
    /** Route paths matching request order */
    routeIds: string[];
    /** HTTP status code per route */
    statuses: number[];
    /** Per-route response bodies */
    bodies: AnyObject[];
}
