/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeIntersection} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeVisitor} from '../types';
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
    isTypeJIT(): string {
        throw new Error('Intersection validation not supported, should be resolve to other RunTypes');
    }
    typeErrorsJIT(): string {
        throw new Error('Intersection validation not supported, should be resolve to other RunTypes');
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
