/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeClass} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {toLiteral} from '../utils';
import {InterfaceRunType} from './interface';
import {IndexSignatureRunType} from './indexProperty';
import {jitUtils, jitUtilsVarNames} from '../jitUtils';
import {isConstructor} from '../guards';

export class ClassRunType extends InterfaceRunType<TypeClass> {
    public readonly className: string;
    public readonly canDeserialize: boolean;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeClass,
        public readonly parents: RunType[],
        public readonly opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts, 'class', true, true);
        this.className = src.classType.name;
        this.canDeserialize = this.entries.every((prop) => !isConstructor(prop) || prop.parameterTypes.length === 0);
        if (this.canDeserialize) jitUtils.registerSerializableClass(src.classType);
    }
    compileJsonDecode(varName: string): string {
        if (!this.canDeserialize)
            throw new Error(
                `Class ${this.className} can't be deserialized. Oly classes with and empty constructor can be deserialized.`
            );
        const decodeParams = super.compileJsonDecode(varName);
        const decode = decodeParams ? `${decodeParams}; ` : '';
        const classVarname = `clλss${this.nestLevel}`;
        // todo create a new class
        return `${decode}; const ${classVarname} = ${jitUtilsVarNames.getSerializableClass}(${toLiteral(this.className)}); ${varName} = Object.assign(new ${classVarname}, ${varName});`;
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
