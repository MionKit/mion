/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ClientOptions} from './types';

export const DEFAULT_PREFILL_OPTIONS: ClientOptions = {
    baseURL: '',
    fetchOptions: {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
    },
    /** Prefix for all routes, i.e: api/v1 */
    prefix: '',
    /** Suffix for all routes, i.e: .json */
    suffix: '',
    /** Enables automatic parameter validation */
    validateParams: true,
    /** Set true to automatically generate and id for every error */
    autoGenerateErrorId: false,
    /** Default serializer mode - stringifyJson as default native serializer */
    serializer: 'stringifyJson',
};

export const STORAGE_KEY = 'mionkit:client';

/** Workflow route key - matches router constant */
export const WORKFLOW_KEY = 'mion-workflow-route';

/** Workflow route path - matches router constant */
export const WORKFLOW_PATH = `/${WORKFLOW_KEY}`;
