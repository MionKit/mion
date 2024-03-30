/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeClass} from '../_deepkit/src/reflection/type';
import {RunTypeOptions, RunTypeVisitor} from '../types';
import {skipJsonDecode, skipJsonEncode} from '../utils';
import {InterfaceRunType} from './interface';
import {IndexSignatureRunType} from './indexProperty';

export class ClassRunType extends InterfaceRunType<TypeClass> {
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeClass,
        public readonly nestLevel: number,
        public readonly opts: RunTypeOptions
    ) {
        super(visitor, src, nestLevel, opts);
        console.log('ClassRunType', src);
    }
    JIT_jsonEncode(varName: string): string {
        if (skipJsonEncode(this)) return '';
        if (this.indexProps.length) {
            return this.indexProps[0].JIT_jsonEncode(varName);
        }
        return this.serializableProps
            .map((prop) => prop.JIT_jsonEncode(varName))
            .filter((code) => !!code)
            .join(';');
    }
    JIT_jsonDecode(varName: string): string {
        if (skipJsonDecode(this)) return '';
        if (this.indexProps.length) {
            return this.indexProps[0].JIT_jsonDecode(varName);
        }
        return this.serializableProps
            .map((prop) => prop.JIT_jsonDecode(varName))
            .filter((code) => !!code)
            .join(';');
    }
    JIT_jsonStringify(varName: string): string {
        if (this.indexProps.length) {
            const indexPropsCode = this.indexProps[0].JIT_jsonStringify(varName);
            return `'{'+${indexPropsCode}+'}'`;
        }
        const propsCode = this.serializableProps.map((prop, i) => prop.JIT_jsonStringify(varName, i === 0)).join('+');
        return `'{'+${propsCode}+'}'`;
    }
    mock(
        optionalParamsProbability: Record<string | number, number>,
        objArgs: Record<string | number, any[]>,
        indexArgs?: any[]
    ): Record<string | number, any> {
        const obj: Record<string | number, any> = {};
        this.serializableProps.forEach((prop) => {
            const name: string | number = prop.propName as any;
            const optionalProbability: number | undefined = optionalParamsProbability?.[name];
            const propArgs: any[] = objArgs?.[name] || [];
            if (prop instanceof IndexSignatureRunType) prop.mock(obj, ...(indexArgs || []));
            else obj[name] = prop.mock(optionalProbability, ...propArgs);
        });
        return obj;
    }
}
