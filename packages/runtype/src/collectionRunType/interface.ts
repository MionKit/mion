/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeObjectLiteral} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {skipJsonDecode, skipJsonEncode, toLiteral} from '../utils';
import {PropertySignatureRunType} from '../singleRunType/property';

export class InterfaceRunType implements RunType<TypeObjectLiteral> {
    public readonly name: string;
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly props: PropertySignatureRunType[];
    public readonly serializableProps: PropertySignatureRunType[];
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeObjectLiteral,
        public readonly nestLevel: number,
        public readonly opts: RunTypeOptions
    ) {
        this.props = src.types.map((type) => visitor(type, nestLevel, opts) as PropertySignatureRunType);
        this.isJsonDecodeRequired = this.props.some((prop) => prop.isJsonDecodeRequired);
        this.isJsonEncodeRequired = this.props.some((prop) => prop.isJsonEncodeRequired);
        this.serializableProps = this.props.filter((prop) => !prop.skipSerialize);
        this.name = `object<${this.serializableProps.map((prop) => prop.name).join(' & ')}>`;
    }
    isTypeJIT(varName: string): string {
        const propsCode = this.serializableProps.map((prop) => `(${prop.isTypeJIT(varName)})`).join(' &&');
        return `typeof ${varName} === 'object' && ${propsCode}`;
    }
    typeErrorsJIT(varName: string, errorsName: string, pathLiteral: string): string {
        const propsCode = this.serializableProps.map((prop) => prop.typeErrorsJIT(varName, errorsName, pathLiteral)).join(';');
        return (
            `if (typeof ${varName} !== 'object') ${errorsName}.push({path: ${pathLiteral}, expected: ${toLiteral(this.name)}});` +
            `else {${propsCode}}`
        );
    }
    jsonEncodeJIT(varName: string): string {
        if (skipJsonEncode(this)) return varName;
        const propsCode = this.serializableProps.map((prop) => prop.jsonEncodeJIT(varName)).join(',');
        return `{${propsCode}}`;
    }
    jsonDecodeJIT(varName: string): string {
        if (skipJsonDecode(this)) return varName;
        const propsCode = this.serializableProps.map((prop) => prop.jsonDecodeJIT(varName)).join(',');
        return `{${propsCode}}`;
    }
    // unlike the other JIT methods the separator is added within the PropertySignatureRunType
    // this is because optional properties can't emit any strings at runtime
    jsonStringifyJIT(varName: string): string {
        const propsCode = this.serializableProps.map((prop, i) => prop.jsonStringifyJIT(varName, i === 0)).join('');
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
