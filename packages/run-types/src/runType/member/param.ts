/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeParameter} from '@deepkit/type';
import type {JitFnCompiler} from '../../lib/jitFnCompiler';
import {TupleMemberRunType} from './tupleMember';

export class ParameterRunType<T extends TypeParameter = TypeParameter> extends TupleMemberRunType<T> {
    getChildVarName(comp: JitFnCompiler): number {
        return this.getChildIndex(comp);
    }
    getChildLiteral(comp: JitFnCompiler): number {
        return this.getChildIndex(comp);
    }
}
