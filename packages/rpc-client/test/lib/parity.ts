/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Shared by the bundled and mixed lanes: every method of the test server, bundled at once, compared with what the
// server itself answers (rows, route sync ids and the code of every compiled function a row reaches).

import {expect} from 'vitest';
import {parseAst} from 'vite';
import {MION_ROUTES, getJitFnHashes, getRoutePath} from '@mionjs/core';
import type {ParserStrategy, SerializableMethodsData} from '@mionjs/core';
import {getRTUtils} from '@mionjs/run-types/runtime';
import type {InjectApiMetadata} from '@mionjs/run-types';
import type {TestServerApi} from '@mionjs/test-server';
import {initClient} from '../../src/client.ts';
import {resetBundledApi} from '../../src/lib/bundledApi.ts';
import {bundledMethodIds, getMethod} from '../../src/lib/methods.ts';
import type {InjectedApiMetadata} from '../../src/types.ts';
import {resetClientCaches} from './testUtils.ts';
import {clientRowView} from './clientRowView.ts';

/** Every method id of an API, nested keys joined with `/`. */
export type MethodIds<Api, Prefix extends string = ''> = {
  [K in keyof Api & string]: Api[K] extends {type: number; handler: unknown}
    ? `${Prefix}${K}`
    : MethodIds<Api[K], `${Prefix}${K}/`>;
}[keyof Api & string];

/** A dispatch point naming every id at once, so the build injects the whole API into its slot. */
const everyMethod = {
  call(apiMetadata?: InjectApiMetadata<TestServerApi, MethodIds<TestServerApi>>) {
    return apiMetadata;
  },
};

async function serverRows(baseURL: string): Promise<SerializableMethodsData> {
  const url = new URL(getRoutePath([MION_ROUTES.methodsMetadataById], {basePath: '', suffix: ''} as never), baseURL);
  const response = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({[MION_ROUTES.methodsMetadataById]: [[], true]}),
  });
  expect(response.ok).toBe(true);
  const body = (await response.json()) as Record<string, unknown>;
  const envelope = body[MION_ROUTES.methodsMetadataById];
  return (Array.isArray(envelope) ? envelope[1] : envelope) as SerializableMethodsData;
}

/** The code as a syntax tree, positions and empty statements dropped: the test runner's transform adds a `;`. */
function codeTree(code: string | undefined): unknown {
  if (!code) return code;
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip).filter((child) => (child as {type?: string})?.type !== 'EmptyStatement');
    if (!node || typeof node !== 'object') return node;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === 'start' || key === 'end' || key === 'range' || key === 'loc') continue;
      out[key] = strip(value);
    }
    return out;
  };
  return strip(parseAst(`function f(){${code}}`));
}

/** A bundled entry carries its code as the live factory `function g_<hash>(utl){<code>}`, the server as text. */
function entryCode(entry: Record<string, any>): string | undefined {
  if (entry.code) return entry.code;
  if (typeof entry.createRTFn !== 'function') return undefined;
  const factory = String(entry.createRTFn);
  return factory.slice(factory.indexOf('{') + 1, factory.lastIndexOf('}'));
}

/** The fields of a compiled function both ends hold; header check functions are never sent, so they are not reached. */
function fnView(entry: Record<string, any>) {
  return {
    fnID: entry.fnID,
    args: entry.args,
    defaultParamValues: entry.defaultParamValues,
    isNoop: !!entry.isNoop,
    rtDependencies: entry.rtDependencies?.length ? [...entry.rtDependencies] : undefined,
    pureFnDependencies: entry.pureFnDependencies?.length ? [...entry.pureFnDependencies] : undefined,
    code: codeTree(entryCode(entry)),
  };
}

function expectSameFunctions(hash: string, served: SerializableMethodsData['deps'], seen: Set<string>): void {
  if (seen.has(hash)) return;
  seen.add(hash);
  const server = served[hash] as Record<string, any> | undefined;
  if (!server) return;
  const client = getRTUtils().getRT(hash) as Record<string, any> | undefined;
  expect(client, `compiled function ${hash} is missing from the bundle`).toBeDefined();
  expect(fnView(client!), hash).toEqual(fnView(server));
  for (const dependency of server.rtDependencies ?? []) expectSameFunctions(dependency, served, seen);
}

export async function expectEveryMethodMatchesTheServer(baseURL: string): Promise<void> {
  resetClientCaches();
  resetBundledApi();
  const {client, middlewares} = initClient<TestServerApi>({baseURL});
  // nothing is sent, but the build still checks that every called route's middlewares are read
  void [
    middlewares.notes.csrf,
    middlewares.notes.admin.csrf,
    middlewares.notes.audit,
    middlewares.session,
    middlewares.audit,
    middlewares.utils.scopeTag,
    middlewares.compact.stamp,
    middlewares.compact.plainStamp,
  ];
  client.useBundledApi(everyMethod.call() as InjectedApiMetadata);
  const served = await serverRows(baseURL);
  const ids = Object.keys(served.methods).sort();

  expect(ids.length).toBeGreaterThan(10);
  expect(bundledMethodIds().sort()).toEqual(ids);
  const seen = new Set<string>();
  for (const id of ids) {
    const bundled = getMethod(id)!;
    const server = served.methods[id];
    // the view holds syncId, so this also proves both builds agree on it
    expect(server.syncId, id).toBeTruthy();
    expect(clientRowView(bundled), id).toEqual(clientRowView(server));
    const parser = clientRowView(server).parser as {params: ParserStrategy; return: ParserStrategy};
    const hashes = [
      ...Object.values(getJitFnHashes(server.paramsJitHash, parser.params)),
      ...Object.values(getJitFnHashes(server.returnJitHash, parser.return)),
    ];
    for (const hash of hashes) expectSameFunctions(hash, served.deps, seen);
  }
  expect(seen.size).toBeGreaterThan(ids.length);
}
