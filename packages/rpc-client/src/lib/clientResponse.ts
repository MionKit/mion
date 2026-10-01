/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {MION_ROUTES, ROUTER_ITEM_SEPARATOR_CHAR} from '@mionjs/core';
import type {RpcError} from '@mionjs/core';
import type {RemoteApi} from '@mionjs/router';
import type {ClientResponse} from '../types.ts';

type ResponseNode = Record<string, unknown>;

export function addThrownError(response: ClientResponse<RemoteApi>, error: RpcError<string>): void {
  const thrownErrors = response[MION_ROUTES.thrownErrors];
  if (Array.isArray(thrownErrors)) thrownErrors.push(error);
  else response[MION_ROUTES.thrownErrors] = [error];
}

export function hasResponseValue(response: ClientResponse<RemoteApi>, id: string): boolean {
  const {parent, key} = findParent(response, id);
  return !!parent && Object.hasOwn(parent, key);
}

export function getResponseValue(response: ClientResponse<RemoteApi>, id: string): unknown {
  const {parent, key} = findParent(response, id);
  return parent && Object.hasOwn(parent, key) ? parent[key] : undefined;
}

/** False when the id has no safe path, so the caller keeps the value somewhere else */
export function setResponseValue(response: ClientResponse<RemoteApi>, id: string, value: unknown): boolean {
  const {parent, key} = findParent(response, id, true);
  if (parent) parent[key] = value;
  return !!parent;
}

/** Drops the value, and every group it leaves empty, so the response never holds what the body did not */
export function deleteResponseValue(response: ClientResponse<RemoteApi>, id: string): void {
  const pointer = id.split(ROUTER_ITEM_SEPARATOR_CHAR);
  for (let depth = pointer.length; depth > 0; depth--) {
    const {parent, key} = findParent(response, pointer.slice(0, depth).join(ROUTER_ITEM_SEPARATOR_CHAR));
    if (!parent || !Object.hasOwn(parent, key)) return;
    const child = parent[key];
    if (depth < pointer.length && !(isNode(child) && !Object.keys(child).length)) return;
    delete parent[key];
  }
}

function findParent(response: ClientResponse<RemoteApi>, id: string, create = false): {parent?: ResponseNode; key: string} {
  const pointer = id.split(ROUTER_ITEM_SEPARATOR_CHAR);
  const key = pointer[pointer.length - 1];
  // a response key is untrusted: `__proto__` would write the prototype, and the top-level thrown list is not a group
  if (pointer.includes('__proto__') || pointer[0] === MION_ROUTES.thrownErrors) return {key};
  let node: ResponseNode = response;
  for (let i = 0; i < pointer.length - 1; i++) {
    let next = Object.hasOwn(node, pointer[i]) ? node[pointer[i]] : undefined;
    if (next === undefined && create) next = node[pointer[i]] = {};
    if (!isNode(next)) return {key};
    node = next;
  }
  return {parent: node, key};
}

function isNode(value: unknown): value is ResponseNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
