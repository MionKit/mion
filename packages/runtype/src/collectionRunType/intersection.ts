/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeIntersection} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {PropertyRunType} from './property';
import {BaseRunType} from '../baseRunTypes';

/** IMPORTANT:
 * Intersection are already resolved by deepkit so seems like this runType wont ever be called
 * ie: type A = {a: string} & {b: number} will be resolved to ObjectLiteral {a: string, b: number}
 * ie: type NeVer = string & number will be resolved to never
 * */
export class IntersectionRunType extends BaseRunType<TypeIntersection> {
    public readonly slug: string;
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly hasCircular: boolean;
    public readonly props: PropertyRunType[];
    public readonly serializableProps: PropertyRunType[];
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeIntersection,
        public readonly parents: RunType[],
        public readonly opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        const newParents = [...parents, this];
        this.props = src.types.map((type) => visitor(type, newParents, opts) as PropertyRunType);
        this.isJsonDecodeRequired = this.props.some((prop) => prop.isJsonDecodeRequired);
        this.isJsonEncodeRequired = this.props.some((prop) => prop.isJsonEncodeRequired);
        this.serializableProps = this.props.filter((prop) => !prop.shouldSerialize);
        this.slug = `intersection<${this.serializableProps.map((prop) => prop.slug).join(' & ')}>`;
        this.hasCircular = this.serializableProps.some((prop) => prop.hasCircular);
    }
    JIT_isType(): string {
        throw new Error('Intersection validation not supported, should be resolve to other RunTypes');
    }
    JIT_typeErrors(): string {
        throw new Error('Intersection validation not supported, should be resolve to other RunTypes');
    }
    JIT_jsonEncode(): string {
        throw new Error('Intersection serialization not supported, should be resolve to other RunTypes');
    }
    JIT_jsonDecode(): string {
        throw new Error('Intersection serialization not supported, should be resolve to other RunTypes');
    }
    JIT_jsonStringify(): string {
        throw new Error('Intersection serialization not supported, should be resolve to other RunTypes');
    }
    mock(
        optionalParamsProbability: Record<string | number, number>,
        objArgs: Record<string | number, any[]>
    ): Record<string | number, any> {
        const obj: Record<string | number, any> = {};
        this.serializableProps.forEach((prop) => {
            const name: string | number = prop.propName as any;
            const optionalProbability: number | undefined = optionalParamsProbability?.[name];
            const propArgs: any[] = objArgs?.[name] || [];
            obj[name] = prop.mock(optionalProbability, ...propArgs);
        });
        return obj;
    }
}
