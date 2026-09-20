/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The light half of the bundled-API lane: which lane the build chose, and the error a bundled
// client raises for a route it does not carry. Split from bundledApi.ts because that module
// reaches the marker reflection in @mionjs/core, and request.ts needs only these two.

import {RpcError} from '@mionjs/core';
import type {BundleApiMode} from '../types.ts';

let bundleApiMode: BundleApiMode | undefined;

/** Puts the client on the lane the build compiled for. Called by generated code, never by hand:
 *  it is a build option, so the build is the one place it is set. */
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

/** Raised for a method the bundle lacks; lives here, not with the fetch, so refusing never loads that code. */
export function bundledMetadataMissingError(missing: string[]): RpcError<'route-metadata-not-found'> {
  return new RpcError({
    type: 'route-metadata-not-found',
    publicMessage:
      `This mion client was built with bundleApi: 'bundled', so it carries the code to call and validate every ` +
      `route it uses, but it has none for ${missing.map((id) => `"${id}"`).join(', ')}. This happens when the ` +
      `client was built against an API that did not have the route yet, or had it under another name. Rebuild ` +
      `the client against the current API, or build with bundleApi: 'mixed' to fetch what it does not carry.`,
  });
}
