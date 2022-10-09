/* ########
 * 2021 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ApiRouterConfig, ApiRoute, ApiRouteOptions} from './types';

function addApiRoute<Req, Resp>(path: string, route: ApiRoute<Req, Resp>) {}

function addApiRouteOptions<Req, Resp>(path: string, route: ApiRouteOptions<Req, Resp>) {}

export function addApiRoutes<Req, Resp>(path: string, routes: (ApiRoute<Req, Resp> | ApiRouteOptions<Req, Resp>)[]) {}

function validateApiModue() {}
