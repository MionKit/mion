/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Type} from '@deepkit/type';
import {SchemaOptions, TSchema, TTransform} from '@sinclair/typebox';

export type DeepkitVisitor = (deepkitType: Type, opts: SchemaOptions) => any;

export type TypeSer = TSchema & {jsonTransformer?: TTransform<any, any>};

export type TRunType = TSchema & {jsonTransformer?: TTransform<any, any>};
