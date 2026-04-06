/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {isRpcError, MION_ROUTES, getRoutePath, routesCache} from '@mionjs/core';
import {ClientOptions, RequestBody} from '../types.ts';
import {restoreFromLocalStorage} from './clientMethodsMetadata.ts';
import {deserializeResponseBody} from './serializer.ts';

/** Manually calls mionGetRemoteMethodsInfoById to get Remote Api Metadata */
export async function fetchRemoteMethodsMetadata(methodIds: string[], options: ClientOptions) {
    restoreFromLocalStorage(methodIds, options);
    const missingAfterLocal = methodIds.filter((path) => !routesCache.hasMetadata(path));
    if (!missingAfterLocal.length) return;
    const body: RequestBody = {
        [MION_ROUTES.methodsMetadataById]: [missingAfterLocal],
    };
    try {
        const path = getRoutePath([MION_ROUTES.methodsMetadataById], options);
        const url = new URL(path, options.baseURL);
        const response = await fetch(url, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body),
        });
        const deserialized = await deserializeResponseBody(response, options);
        const platformError = deserialized[MION_ROUTES.platformError];
        if (isRpcError(platformError)) throw platformError;
        const stillMissing = missingAfterLocal.filter((id) => !routesCache.hasMetadata(id));
        if (stillMissing.length) throw new Error(`Failed to fetch metadata for: ${stillMissing.join(', ')}`);
    } catch (error: any) {
        throw new Error(`Error fetching validation and serialization metadata: ${error?.message}`);
    }
}
