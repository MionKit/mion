/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, TypeEnum} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {toLiteral} from '../utils';
import {random} from '../mock';
import {SingleRunType} from '../baseRunTypes';

export class EnumRunType extends SingleRunType<TypeEnum> {
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;
    public readonly values: (string | number | undefined | null)[];
    public readonly indexKind: ReflectionKind;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeEnum,
        public readonly parents: RunType[],
        public readonly opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        this.values = src.values;
        this.indexKind = src.indexType.kind;
    }

    getJitId(): number | string {
        return `${this.indexKind}{${this.values.map((v) => v).join(',')}}`;
    }
    compileIsType(varName: string): string {
        return this.values.map((v) => `${varName} === ${toLiteral(v)}`).join(' || ');
    }
    compileTypeErrors(varName: string, errorsName: string, pathChain: string): string {
        return `if (!(${this.compileIsType(varName)})) ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.getJitId())}})`;
    }
    compileJsonEncode(): string {
        return '';
    }
    compileJsonDecode(): string {
        return '';
    }
    compileJsonStringify(varName: string): string {
        if (this.indexKind === ReflectionKind.number) return varName;
        return `JSON.stringify(${varName})`;
    }
    mock(index?: number): string | number | undefined | null {
        const i = index || random(0, this.values.length - 1);
        return this.values[i];
    }
}
