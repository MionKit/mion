/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeMethod} from '../_deepkit/src/reflection/type';
import {FunctionRunType} from '../functionRunType/function';
import {RunTypeChildAccessor} from '../types';
import {getPropIndex, getPropLiteral, getPropVarName, memo, useArrayAccessorForProp} from '../utils';

export class MethodRunType extends FunctionRunType<TypeMethod> implements RunTypeChildAccessor {
    getChildIndex = memo(() => getPropIndex(this.src));
    getChildVarName = memo(() => getPropVarName(this.src.name));
    getChildLiteral = memo(() => getPropLiteral(this.getChildVarName()));
    useArrayAccessor = memo(() => useArrayAccessorForProp(this.src.name));
    isOptional = () => !!this.src.optional;
}
