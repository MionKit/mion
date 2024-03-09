import {TypeObjectLiteral} from '@deepkit/type';
import {RunType, RunTypeVisitor} from '../types';
import {toLiteral} from '../utils';
import {PropertySignatureRunType} from '../singleRunType/property';

/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export class ObjectLiteralRunType implements RunType<TypeObjectLiteral> {
    public readonly name: string;
    public readonly shouldEncodeJson: boolean;
    public readonly shouldDecodeJson: boolean;
    public readonly props: PropertySignatureRunType[];
    public readonly enumerableProps: PropertySignatureRunType[];
    constructor(
        public readonly src: TypeObjectLiteral,
        public readonly visitor: RunTypeVisitor,
        public readonly nestLevel: number
    ) {
        this.props = src.types.map((type) => visitor(type, nestLevel) as PropertySignatureRunType);
        this.enumerableProps = this.props.filter((prop) => !prop.isSymbol);
        this.shouldDecodeJson = this.props.some((prop) => prop.shouldDecodeJson);
        this.shouldEncodeJson = this.props.some((prop) => prop.shouldEncodeJson);
        this.name = `object<${this.props.map((prop) => prop.name).join(' & ')}>`;
    }
    isTypeJIT(varName: string): string {
        const propsCode = this.enumerableProps.map((prop) => `(${prop.isTypeJIT(varName)})`).join(' &&');
        return `typeof ${varName} === 'object' && ${propsCode}`;
    }
    typeErrorsJIT(varName: string, errorsName: string, pathLiteral: string): string {
        const propsCode = this.enumerableProps.map((prop) => prop.typeErrorsJIT(varName, errorsName, pathLiteral)).join(';');
        return (
            `if (typeof ${varName} !== 'object') ${errorsName}.push({path: ${pathLiteral}, expected: ${toLiteral(this.name)}});` +
            `else {${propsCode}}`
        );
    }
    jsonEncodeJIT(varName: string): string {
        const propsCode = this.enumerableProps.map((prop) => prop.jsonEncodeJIT(varName)).join(',');
        return `{${propsCode}}`;
    }
    // unlike the other JIT methods the separator is added within the PropertySignatureRunType
    // this is because optional properties can't emit any strings at runtime
    jsonStringifyJIT(varName: string): string {
        const propsCode = this.enumerableProps.map((prop, i) => prop.jsonStringifyJIT(varName, i === 0)).join('');
        return `'{'+${propsCode}+'}'`;
    }
    jsonDecodeJIT(varName: string): string {
        const propsCode = this.enumerableProps.map((prop) => prop.jsonDecodeJIT(varName)).join(',');
        return `{${propsCode}}`;
    }
    mock(objArgs: Record<string | number, any[]>): Record<string | number, any> {
        const obj: Record<string | number, any> = {};
        this.enumerableProps.forEach((prop) => {
            const name: string | number = prop.src.name as any;
            const propArgs: any[] = objArgs?.[name] || [];
            obj[name] = prop.mock(...propArgs);
        });
        return obj;
    }
}
