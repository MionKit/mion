/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, TypeEnum} from '../_deepkit/src/reflection/type';
import {RunTypeOptions, RunTypeVisitor} from '../types';
import {toLiteral} from '../utils';
import {random} from '../mock';
import {BaseRunType} from '../baseRunType';

export class EnumRunType extends BaseRunType<TypeEnum> {
    public readonly name: string;
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeEnum,
        public readonly nestLevel: number,
        public readonly opts: RunTypeOptions
    ) {
        super(visitor, src, nestLevel, opts);
        this.name = `enum<${src.values.map((v) => v).join(', ')}>`;
    }
    JIT_isType(varName: string): string {
        return this.src.values.map((v) => `${varName} === ${toLiteral(v)}`).join(' || ');
    }
    JIT_typeErrors(varName: string, errorsName: string, pathChain: string): string {
        return `if (!(${this.JIT_isType(varName)})) ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.name)}})`;
    }
    JIT_jsonEncode(): string {
        return '';
    }
    JIT_jsonDecode(): string {
        return '';
    }
    JIT_jsonStringify(varName: string): string {
        if (this.src.indexType.kind === ReflectionKind.number) return varName;
        return `JSON.stringify(${varName})`;
    }
    mock(index?: number): string | number | undefined | null {
        const i = index || random(0, this.src.values.length - 1);
        return this.src.values[i];
    }
}
