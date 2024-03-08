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
    public readonly allProps: PropertySignatureRunType[];
    constructor(
        public readonly src: TypeObjectLiteral,
        public readonly visitor: RunTypeVisitor,
        public readonly nestLevel: number
    ) {
        this.allProps = src.types.map((type) => visitor(type, nestLevel) as PropertySignatureRunType);
        this.shouldDecodeJson = this.allProps.some((prop) => prop.shouldDecodeJson);
        this.shouldEncodeJson = this.allProps.some((prop) => prop.shouldEncodeJson);
        this.name = `object<${this.allProps.map((prop) => prop.name).join(' & ')}>`;
    }
    isTypeJIT(varName: string): string {
        const propsCode = this.allProps.map((prop) => `(${prop.isTypeJIT(varName)})`).join(' &&');
        return `typeof ${varName} === 'object' && ${propsCode}`;
    }
    typeErrorsJIT(varName: string, errorsName: string, pathLiteral: string): string {
        const propsCode = this.allProps.map((prop) => prop.typeErrorsJIT(varName, errorsName, pathLiteral)).join(';');
        return (
            `if (typeof ${varName} !== 'object') ${errorsName}.push({path: ${pathLiteral}, expected: ${toLiteral(this.name)}});` +
            `else {${propsCode}}`
        );
    }
    jsonEncodeJIT(varName: string): string {
        if (!this.shouldEncodeJson) return `${varName}`;
        const propsCode = this.allProps.map((prop) => prop.jsonEncodeJIT(varName)).join(',');
        return `{${propsCode}}`;
    }
    // unlike the other JIT methods the separator is added within the PropertySignatureRunType
    // this is because optional properties can't emit any strings at runtime
    jsonStringifyJIT(varName: string): string {
        const propsCode = this.allProps.map((prop, i) => prop.jsonStringifyJIT(varName, i === 0)).join('');
        return `'{'+${propsCode}+'}'`;
    }
    jsonDecodeJIT(varName: string): string {
        if (!this.shouldDecodeJson) return `${varName}`;
        const propsCode = this.allProps.map((prop) => prop.jsonDecodeJIT(varName)).join(',');
        return `{${propsCode}}`;
    }
    mockJIT(varName: string): string {
        const objectName = `objετ${this.nestLevel}`;
        const propsCode = this.allProps.map((prop) => prop.mockJIT(objectName)).join(';');
        return `const ${objectName} = {}; ${propsCode}; ${varName} = ${objectName}`;
    }
}
