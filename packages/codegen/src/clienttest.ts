/* ########
 * 2023 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReceiveType, resolveReceiveType} from '@deepkit/type';
import {Routes} from '@mikrokit/router';
import {MyApiRoutes} from './test/myApi.routes';

const printS = {showHidden: true, depth: 8, colors: true};

export function registerCLientRoutes<R extends Routes>(type?: ReceiveType<R>) {
    const rtype = resolveReceiveType(type);
    console.log('receivedType client', rtype);
}

registerCLientRoutes<MyApiRoutes>();
