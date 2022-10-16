/* ########
 * 2021 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {typeOf, ReflectionKind, reflect} from '@deepkit/type';

const map: Map<string, (...args: any) => any> = new Map();
const f = (a: number, b: number, c?: string) => `${c || 'sum'} => ${a + b}`;
map.set('sum function', f);

const x = map.get('sum function');

const typ1 = reflect(f);
const typ2 = reflect(x);
console.log('reflection from function', typ1);
console.log('reflection from map', typ2);
