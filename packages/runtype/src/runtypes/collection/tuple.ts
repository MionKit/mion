/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeTuple} from '../../lib/_deepkit/src/reflection/type';
import {MockOperation} from '../../types';
import {ParameterListRunType} from './parameterList';

export class TupleRunType extends ParameterListRunType<TypeTuple> {
    _mock(ctx: MockOperation): any[] {
        return this.getChildRunTypes().map((rt, i) => rt.mock(ctx.tupleOptions?.[i]));
    }
}
