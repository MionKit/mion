/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {MION_ROUTES, ROUTER_ITEM_SEPARATOR_CHAR} from '@mionjs/core';
import type {RpcError} from '@mionjs/core';
import type {ResponseBody, RemoteApi} from '@mionjs/router';
import type {ClientResponse} from '../types.ts';

type ResponseNode = Record<string, unknown>;

export function createClientResponse(): ClientResponse<RemoteApi> {
  return {};
}

/** Validation errors move from the thrown record to their path; the rest return by id so dispatch knows whose. */
export function nestResponseBody(response: ClientResponse<RemoteApi>, body: ResponseBody): Record<string, RpcError<string>> {
  for (const [id, value] of Object.entries(body)) {
    if (id !== MION_ROUTES.thrownErrors) setResponseValue(response, id, value);
  }
  const thrownErrors: Record<string, RpcError<string>> = {};
  for (const [id, error] of Object.entries(body[MION_ROUTES.thrownErrors] ?? {})) {
    if (error.type === 'validation-error') setResponseValue(response, id, error);
    else thrownErrors[id] = error;
  }
  return thrownErrors;
}

export function addThrownError(response: ClientResponse<RemoteApi>, error: RpcError<string>): void {
  (response[MION_ROUTES.thrownErrors] ??= []).push(error);
}

export function hasResponseValue(response: ClientResponse<RemoteApi>, id: string): boolean {
  const {parent, key} = findParent(response, id);
  return !!parent && key in parent;
}

export function getResponseValue(response: ClientResponse<RemoteApi>, id: string): unknown {
  const {parent, key} = findParent(response, id);
  return parent?.[key];
}

export function setResponseValue(response: ClientResponse<RemoteApi>, id: string, value: unknown): void {
  const pointer = id.split(ROUTER_ITEM_SEPARATOR_CHAR);
  let node = response as ResponseNode;
  for (let i = 0; i < pointer.length - 1; i++) node = (node[pointer[i]] ??= {}) as ResponseNode;
  node[pointer[pointer.length - 1]] = value;
}

export function deleteResponseValue(response: ClientResponse<RemoteApi>, id: string): void {
  const {parent, key} = findParent(response, id);
  if (parent) delete parent[key];
}

function findParent(response: ClientResponse<RemoteApi>, id: string): {parent: ResponseNode | undefined; key: string} {
  const pointer = id.split(ROUTER_ITEM_SEPARATOR_CHAR);
  let node: ResponseNode | undefined = response as ResponseNode;
  for (let i = 0; i < pointer.length - 1 && node; i++) node = node[pointer[i]] as ResponseNode | undefined;
  return {parent: node, key: pointer[pointer.length - 1]};
}
