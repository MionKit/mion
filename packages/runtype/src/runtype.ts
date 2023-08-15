/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {typeOf, TypeClass} from '@deepkit/type';
import {RpcError} from '@mionkit/core';

export const RPC_ERROR_TYPE = typeOf<RpcError>() as TypeClass;
export const ERROR_TYPE = typeOf<Error>() as TypeClass;
