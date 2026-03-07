import {RouterOptions} from '@mionjs/router';

export interface GcloudOptions extends RouterOptions {
    /** API prefix, all routes will be prefixed with this value */
    prefix?: string;
}
