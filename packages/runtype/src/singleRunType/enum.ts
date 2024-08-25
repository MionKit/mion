/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, TypeEnum} from '../_deepkit/src/reflection/type';
import type {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {toLiteral} from '../utils';
import {random} from '../mock';
import {SingleRunType} from '../baseRunTypes';
import {jitNames} from '../constants';

export class EnumRunType extends SingleRunType<TypeEnum> {
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;
    public readonly values: (string | number | undefined | null)[];
    public readonly indexKind: ReflectionKind;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeEnum,
        public readonly parents: RunType[],
        opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        this.values = src.values;
        this.indexKind = src.indexType.kind;
    }
    getJitId(): number | string {
        return `${this.indexKind}{${this.values.map((v) => v).join(',')}}`;
    }
    compileIsType(parents: RunType[], varName: string): string {
        return this.values.map((v) => `${varName} === ${toLiteral(v)}`).join(' || ');
    }
    compileTypeErrors(parents: RunType[], varName: string): string {
        return `if (!(${this.compileIsType(parents, varName)})) ${jitNames.errors}.push({path: [...${jitNames.path}], expected: ${toLiteral(this.getName())}})`;
    }
    compileJsonEncode(): string {
        return '';
    }
    compileJsonDecode(): string {
        return '';
    }
    compileJsonStringify(parents: RunType[], varName: string): string {
        if (this.indexKind === ReflectionKind.number) return varName;
        return `JSON.stringify(${varName})`;
    }
    mock(index?: number): string | number | undefined | null {
        const i = index || random(0, this.values.length - 1);
        return this.values[i];
    }
}
