/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeClass} from '../_deepkit/src/reflection/type';
import {RunTypeOptions, RunTypeVisitor, SerializableClass} from '../types';
import {toLiteral} from '../utils';
import {InterfaceRunType} from './interface';
import {IndexSignatureRunType} from './indexProperty';
import {jitUtils} from '../jitUtils';
import {jitUtilsGetClass} from '../constants';

export class ClassRunType extends InterfaceRunType<TypeClass> {
    public readonly className: string;
    public readonly serializableClass: SerializableClass | undefined;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeClass,
        public readonly nestLevel: number,
        public readonly opts: RunTypeOptions
    ) {
        super(visitor, src, nestLevel, opts, 'class', true, true);
        this.className = jitUtils.getClassName(src.classType);
        this.serializableClass = jitUtils.getSerializableClass(this.className);
    }
    JIT_jsonDecode(varName: string): string {
        if (!this.serializableClass)
            throw new Error(
                `Class ${this.className} can't be serialized. Make sure to register it using registerSerializableClass()`
            );
        const decodeParams = super.JIT_jsonDecode(varName);
        const decode = decodeParams ? `${decodeParams}; ` : '';
        const classVarname = `clλss${this.nestLevel}`;
        // todo create a new class
        return `${decode}; const ${classVarname} = ${jitUtilsGetClass}(${toLiteral(this.className)}); ${varName} = Object.assign(new ${classVarname}, ${varName});`;
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
