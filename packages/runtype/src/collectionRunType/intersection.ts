/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeIntersection} from '@deepkit/type';
import {RunType, RunTypeVisitor} from '../types';
import {toLiteral} from '../utils';
import {PropertySignatureRunType} from '../singleRunType/property';


/** IMPORTANT:
 * Intersection are already resolved by deepkit so seems like this runtype wont ever be called
 * ie: type A = {a: string} & {b: number} will be resolved to ObjectLiteral {a: string, b: number}
 * ie: type NeVer = string & number will be resolved to never
 * */ 
export class IntersectionRunType implements RunType<TypeIntersection> {
    public readonly name: string;
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly props: PropertySignatureRunType[];
    public readonly serializableProps: PropertySignatureRunType[];
    constructor(
        public readonly src: TypeIntersection,
        public readonly visitor: RunTypeVisitor,
        public readonly nestLevel: number
    ) {
        this.props = src.types.map((type) => visitor(type, nestLevel) as PropertySignatureRunType);
        this.isJsonDecodeRequired = this.props.some((prop) => prop.isJsonDecodeRequired);
        this.isJsonEncodeRequired = this.props.some((prop) => prop.isJsonEncodeRequired);
        this.serializableProps = this.props.filter((prop) => !prop.skipSerialize);
        this.name = `intersection<${this.serializableProps.map((prop) => prop.name).join(' & ')}>`;
    }
    // this method is enabled but think it should never be called as intersection should resolve to other types
    isTypeJIT(varName: string): string {
        const propsCode = this.serializableProps.map((prop) => `(${prop.isTypeJIT(varName)})`).join(' &&');
        return `typeof ${varName} === 'object' && ${propsCode}`;
    }
    // this method is enabled but think it should never be called as intersection should resolve to other types
    typeErrorsJIT(varName: string, errorsName: string, pathLiteral: string): string {
        const propsCode = this.serializableProps.map((prop) => prop.typeErrorsJIT(varName, errorsName, pathLiteral)).join(';');
        return (
            `if (typeof ${varName} !== 'object') ${errorsName}.push({path: ${pathLiteral}, expected: ${toLiteral(this.name)}});` +
            `else {${propsCode}}`
        );
    }
    jsonEncodeJIT(): string {
        throw new Error('Intersection serialization not supported, should be resolve to other RunTypes');
    }
    jsonStringifyJIT(): string {
        throw new Error('Intersection serialization not supported, should be resolve to other RunTypes');
    }
    jsonDecodeJIT(): string {
        throw new Error('Intersection serialization not supported, should be resolve to other RunTypes');
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
