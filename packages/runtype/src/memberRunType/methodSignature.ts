/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeMethodSignature} from '../_deepkit/src/reflection/type';
import {RunTypeChildAccessor} from '../types';
import {FunctionRunType} from '../functionRunType/function';
import {getPropIndex, getPropLiteral, getPropVarName, memo, useArrayAccessorForProp} from '../utils';

export class MethodSignatureRunType extends FunctionRunType<TypeMethodSignature> implements RunTypeChildAccessor {
    getChildIndex = memo(() => getPropIndex(this.src));
    getChildVarName = memo(() => getPropVarName(this.src.name));
    getChildLiteral = memo(() => getPropLiteral(this.getChildVarName()));
    useArrayAccessor = memo(() => useArrayAccessorForProp(this.src.name));
    isOptional = () => !!this.src.optional;
}
