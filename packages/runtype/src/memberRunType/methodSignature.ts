/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeMethodSignature} from '../_deepkit/src/reflection/type';
import {RunTypeChildAccessor} from '../types';
import {FunctionRunType} from '../functionRunType/function';
import {getPropIndex, getPropLiteral, getPropVarName, memorize, useArrayAccessorForProp} from '../utils';

export class MethodSignatureRunType extends FunctionRunType<TypeMethodSignature> implements RunTypeChildAccessor {
    getChildIndex = memorize(() => getPropIndex(this.src));
    getChildVarName = memorize(() => getPropVarName(this.src.name));
    getChildLiteral = memorize(() => getPropLiteral(this.getChildVarName()));
    useArrayAccessor = memorize(() => useArrayAccessorForProp(this.src.name));
    isOptional = () => !!this.src.optional;
    skipSettingAccessor = () => false;
}
