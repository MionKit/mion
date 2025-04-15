/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeRest} from '@deepkit/type';
import type {ParameterRunType} from './param';
import type {TupleMemberRunType} from './tupleMember';
import {ArrayRunType} from './array';

export class RestParamsRunType extends ArrayRunType<TypeRest> {
    getChildIndex(): number {
        const parent = this.getParent() as ParameterRunType | TupleMemberRunType;
        return parent.getChildIndex();
    }
    startIndex(): number {
        return this.getChildIndex();
    }
}
