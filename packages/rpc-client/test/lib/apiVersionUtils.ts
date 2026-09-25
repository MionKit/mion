/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Shared by the bundled and mixed lanes, whose specs differ only in what each lane bundles.

import {vi} from 'vitest';
import {HeadersSubset, MION_ROUTES, BUILD_VERSION_HEADER} from '@mionjs/core';
import type {MethodWithOptions, SerializableMethodsData} from '@mionjs/core';
import type {TestServerApi} from '@mionjs/test-server';
import type {initClient} from '../../src/client.ts';
import {resetClientCaches} from './testUtils.ts';
import {resetBundledApi} from '../../src/lib/bundledApi.ts';
import {resetApiBuildVersion} from '../../src/lib/apiBuildVersion.ts';
import {resetApiVersionRecovery} from '../../src/lib/apiVersionRecovery.ts';
import {resetMetadataStore} from '../../src/lib/metadataStore.ts';

/** Every route of the test server runs behind the root-level `auth` headers middleware. */
export function useAuth(middlewares: ReturnType<typeof initClient<TestServerApi>>['middlewares']): void {
  middlewares.auth.onRequest((auth) => auth(new HeadersSubset({Authorization: 'XWYZ-TOKEN'})));
}

export async function resetApiVersionState(): Promise<void> {
  resetClientCaches();
  resetBundledApi();
  resetApiBuildVersion();
  resetApiVersionRecovery();
  await resetMetadataStore();
}

/** Rewrites the metadata rows a response carries, so a row can be made to disagree. */
export type RowEdit = (methods: Record<string, MethodWithOptions>) => void;

/** Forces `version` into the build-version header of every response, or strips it when `null`.
 *  `editRows` is the only way to make the server's row differ from a bundle built against it. */
export function serveVersion(version: string | null, editRows?: RowEdit) {
  const realFetch = globalThis.fetch;
  const urls: string[] = [];
  const bodies: string[] = [];
  const spy = vi.fn(async (url: any, init?: any) => {
    urls.push(String(url));
    bodies.push(typeof init?.body === 'string' ? init.body : '');
    const response = await realFetch(url, init);
    const headers = new Headers(response.headers);
    if (version === null) headers.delete(BUILD_VERSION_HEADER);
    else headers.set(BUILD_VERSION_HEADER, version);
    let payload = await response.text();
    if (editRows) payload = rewriteRows(payload, editRows);
    return new Response(payload, {status: response.status, headers});
  });
  globalThis.fetch = spy as any;
  return {
    calls: () => spy.mock.calls.length,
    /** The ids each request asked the server to confirm, one entry per request that asked. */
    verifyAsks: () =>
      bodies
        .map((body) => safeParse(body)?.[MION_ROUTES.methodsMetadata]?.[0] as string[] | undefined)
        .filter((ids): ids is string[] => Array.isArray(ids)),
    restore: () => {
      globalThis.fetch = realFetch;
    },
  };
}

function rewriteRows(payload: string, editRows: RowEdit): string {
  const parsed = safeParse(payload);
  // the metadata middleware declares a union, so its slot rides as an `[index, value]` envelope
  const slot = parsed?.[MION_ROUTES.methodsMetadata];
  const data = (Array.isArray(slot) ? slot[1] : slot) as SerializableMethodsData | undefined;
  if (!data?.methods) return payload;
  editRows(data.methods as Record<string, MethodWithOptions>);
  return JSON.stringify(parsed);
}

function safeParse(text: string): Record<string, any> | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
