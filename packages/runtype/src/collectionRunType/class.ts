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
import {jitUtils, jitVarNames} from '../jitUtils';
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
        super(visitor, src, parents, opts, true, true);
        this.className = src.classType.name;
        this.canDeserialize = this.entries.every((prop) => !isConstructor(prop) || prop.parameterTypes.length === 0);
        if (this.canDeserialize) jitUtils.addSerializableClass(src.classType);
    }
    getJitId(): string {
        return `${this.src.kind}:${this.className}`;
    }
    compileJsonDecode(varName: string): string {
        ClassRunType.checkSerializable(this.canDeserialize, this.className);
        const decodeParams = super.compileJsonDecode(varName);
        const decode = decodeParams ? `${decodeParams}; ` : '';
        const classVarname = `clλss${this.nestLevel}`;
        // todo create a new class
        return `${decode}; const ${classVarname} = ${jitVarNames.getSerializableClass}(${toLiteral(this.className)}); ${varName} = Object.assign(new ${classVarname}, ${varName});`;
    }
    mock(
        optionalParamsProbability: Record<string | number, number>,
        objArgs: Record<string | number, any[]>,
        indexArgs?: any[]
    ): Record<string | number, any> {
        ClassRunType.checkSerializable(this.canDeserialize, this.className);
        return super.mock(optionalParamsProbability, objArgs, indexArgs, new this.src.classType());
    }

    private static checkSerializable(canDeserialize: boolean, className: string) {
        if (!canDeserialize)
            throw new Error(
                `Class ${className} can't be deserialized. Only classes with and empty constructor can be deserialized.`
            );
    }
}
