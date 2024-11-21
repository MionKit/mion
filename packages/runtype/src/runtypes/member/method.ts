/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeMethod} from '../../lib/_deepkit/src/reflection/type';
import {FunctionRunType} from '../function/function';
import {RunTypeChildAccessor} from '../../types';
import {getPropIndex, getPropLiteral, getPropVarName, memorize, useArrayAccessorForProp} from '../../lib/utils';

export class MethodRunType extends FunctionRunType<TypeMethod> implements RunTypeChildAccessor {
    getChildIndex = memorize(() => getPropIndex(this.src));
    getChildVarName = memorize(() => getPropVarName(this.src.name));
    getChildLiteral = memorize(() => getPropLiteral(this.getChildVarName()));
    useArrayAccessor = memorize(() => useArrayAccessorForProp(this.src.name));
    isOptional = () => !!this.src.optional;
    skipSettingAccessor = () => false;
}
