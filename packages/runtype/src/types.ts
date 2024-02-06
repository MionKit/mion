/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Type} from '@deepkit/type';
import {SchemaOptions} from '@sinclair/typebox';

// Visitor function type definition
export type DeepkitVisitor = (deepkitType: Type, opts: SchemaOptions) => any;
