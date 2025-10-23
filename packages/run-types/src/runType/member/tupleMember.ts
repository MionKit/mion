/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeTupleMember} from '@deepkit/type';
import {ParameterRunType} from './param';
import {JitFnCompiler} from '../../lib/jitFnCompiler';

export class TupleMemberRunType extends ParameterRunType<TypeTupleMember> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getChildVarName(comp: JitFnCompiler): number {
        return this.src.parent.types.indexOf(this.src);
    }
    getChildLiteral(comp: JitFnCompiler): number {
        return this.getChildVarName(comp);
    }
}
