/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Split from bundledApi.ts: that module reaches the marker reflection in @mionjs/core, and
// request.ts needs only these two.

import {RpcError} from '@mionjs/core';
import type {BundleApiMode} from '../types.ts';

let bundleApiMode: BundleApiMode | undefined;

/** Called by generated code, never by hand: the lane is a build option. */
export function setBundleApiMode(mode: BundleApiMode): void {
  if (mode !== 'bundled' && mode !== 'mixed') {
    throw new RpcError({
      type: 'bundle-api-invalid-mode',
      publicMessage: `The generated bundleApi module named an unknown mode '${String(mode)}'; expected 'bundled' or 'mixed'.`,
    });
  }
  bundleApiMode = mode;
}

/** The lane the build put this client on; undefined means the fetched lane. */
export function getBundleApiMode(): BundleApiMode | undefined {
  return bundleApiMode;
}
