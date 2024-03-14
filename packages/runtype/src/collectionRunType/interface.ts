/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeObjectLiteral} from '../_deepkit/src/reflection/type';
import {RunTypeOptions, RunTypeVisitor} from '../types';
import {skipJsonDecode, skipJsonEncode, toLiteral} from '../utils';
import {PropertySignatureRunType} from './property';
import {BaseRunType} from '../baseRunType';
import {MethodSignatureRunType} from '../functionRunType/methodSignature';
import {CallSignatureRunType} from '../functionRunType/call';

export class InterfaceRunType extends BaseRunType<TypeObjectLiteral> {
    public readonly name: string;
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly entries: (PropertySignatureRunType | MethodSignatureRunType | CallSignatureRunType)[];
    public readonly serializableProps: PropertySignatureRunType[];
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeObjectLiteral,
        public readonly nestLevel: number,
        public readonly opts: RunTypeOptions
    ) {
        super(visitor, src, nestLevel, opts);
        this.entries = src.types.map((type) => visitor(type, nestLevel, opts)) as typeof this.entries;
        this.isJsonDecodeRequired = this.entries.some((prop) => prop.isJsonDecodeRequired);
        this.isJsonEncodeRequired = this.entries.some((prop) => prop.isJsonEncodeRequired);
        this.serializableProps = this.entries.filter((prop) => prop.shouldSerialize) as typeof this.serializableProps;
        this.name = `object<${this.serializableProps.map((prop) => prop.name).join(', ')}>`;
    }
    JIT_isType(varName: string): string {
        const propsCode = this.serializableProps.map((prop) => `(${prop.JIT_isType(varName)})`).join(' &&');
        return `typeof ${varName} === 'object' && ${propsCode}`;
    }
    JIT_typeErrors(varName: string, errorsName: string, pathLiteral: string): string {
        const propsCode = this.serializableProps.map((prop) => prop.JIT_typeErrors(varName, errorsName, pathLiteral)).join(';');
        return (
            `if (typeof ${varName} !== 'object') ${errorsName}.push({path: ${pathLiteral}, expected: ${toLiteral(this.name)}});` +
            `else {${propsCode}}`
        );
    }
    JIT_jsonEncode(varName: string): string {
        if (skipJsonEncode(this)) return varName;
        const propsCode = this.serializableProps.map((prop) => prop.JIT_jsonEncode(varName)).join(',');
        return `{${propsCode}}`;
    }
    JIT_jsonDecode(varName: string): string {
        if (skipJsonDecode(this)) return varName;
        const propsCode = this.serializableProps.map((prop) => prop.JIT_jsonDecode(varName)).join(',');
        return `{${propsCode}}`;
    }
    // unlike the other JIT methods the separator is added within the PropertySignatureRunType
    // this is because optional properties can't emit any strings at runtime
    JIT_jsonStringify(varName: string): string {
        const propsCode = this.serializableProps.map((prop, i) => prop.JIT_jsonStringify(varName, i === 0)).join('');
        return `'{'+${propsCode}+'}'`;
    }
    mock(
        optionalParamsProbability: Record<string | number, number>,
        objArgs: Record<string | number, any[]>
    ): Record<string | number, any> {
        const obj: Record<string | number, any> = {};
        this.serializableProps.forEach((prop) => {
            const name: string | number = prop.src.name as any;
            const optionalProbability: number | undefined = optionalParamsProbability?.[name];
            const propArgs: any[] = objArgs?.[name] || [];
            obj[name] = prop.mock(optionalProbability, ...propArgs);
        });
        return obj;
    }
}
