/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeTupleMember} from '@deepkit/type';
import {ParameterRunType} from './param';
import {JitCompiler} from '../../lib/jitCompiler';

export class TupleMemberRunType extends ParameterRunType<TypeTupleMember> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getChildVarName(comp: JitCompiler): number {
        return this.src.parent.types.indexOf(this.src);
    }
    getChildLiteral(comp: JitCompiler): number {
        return this.getChildVarName(comp);
    }
}
