import {RouterOptions} from '@mionkit/router';

export interface HttpOptions extends RouterOptions {
    /** API prefix, all routes will be prefixed with this value */
    prefix?: string;
}
