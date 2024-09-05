/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeObjectLiteral, TypeClass, TypeIntersection} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {shouldSkipJsonDecode, shouldSkipJsonEncode, getErrorPath, getExpected} from '../utils';
import {PropertyRunType} from './property';
import {CollectionRunType} from '../baseRunTypes';
import {MethodSignatureRunType} from '../functionRunType/methodSignature';
import {CallSignatureRunType} from '../functionRunType/call';
import {IndexSignatureRunType} from './indexProperty';
import {MethodRunType} from '../functionRunType/method';
import {
    compileChildrenJitFunction,
    handleCircularIsType,
    handleCircularJsonDecode,
    handleCircularJsonEncode,
    handleCircularJsonStringify,
    handleCircularTypeErrors,
} from '../jitCircular';
import {jitNames} from '../constants';

export type InterfaceRunTypeEntry =
    | PropertyRunType
    | MethodSignatureRunType
    | CallSignatureRunType
    | IndexSignatureRunType
    | MethodRunType;

export class InterfaceRunType<
    T extends TypeObjectLiteral | TypeClass | TypeIntersection = TypeObjectLiteral,
> extends CollectionRunType<T> {
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly entries: InterfaceRunTypeEntry[];
    public readonly childRunTypes: (PropertyRunType | IndexSignatureRunType)[];
    public readonly jitId: string = '_';
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: T,
        public readonly parents: RunType[],
        opts: RunTypeOptions,
        isJsonDecodeRequired = false,
        isJsonEncodeRequired = false
    ) {
        super(visitor, src, parents, opts);
        parents.push(this);
        this.entries = src.types.map((type) => visitor(type, parents, opts)) as typeof this.entries;
        parents.pop();
        this.isJsonDecodeRequired = isJsonDecodeRequired || this.entries.some((prop) => prop.isJsonDecodeRequired);
        this.isJsonEncodeRequired = isJsonEncodeRequired || this.entries.some((prop) => prop.isJsonEncodeRequired);
        this.childRunTypes = this.entries.filter((prop) => prop.shouldSerialize) as (PropertyRunType | IndexSignatureRunType)[];
        this.jitId = `${this.src.kind}{${this.childRunTypes.map((prop) => prop.jitId).join(',')}}`;
    }

    compileIsType(parents: RunType[], varName: string): string {
        const nestLevel = parents.length;
        const callArgs = [varName];
        const compile = () => {
            const propsCode = compileChildrenJitFunction(this, parents, (newParents) => {
                return this.childRunTypes.map((prop) => prop.compileIsType(newParents, varName)).join(' && ');
            });
            return `(typeof ${varName} === 'object' && ${varName} !== null && !Array.isArray(${varName}) && ${propsCode})`;
        };
        return handleCircularIsType(this, compile, callArgs, nestLevel, false);
    }
    compileCollectionIsType(parents: RunType[], varName: string): string {
        return `typeof ${varName} === 'object' && ${varName} !== null && !Array.isArray(${varName})`;
    }
    compileTypeErrors(parents: RunType[], varName: string, pathC: string[]): string {
        const callArgs = [varName, jitNames.errors, jitNames.circularPath];
        const compile = () => {
            const itemsCode = compileChildrenJitFunction(this, parents, (newParents) => {
                return this.childRunTypes.map((prop) => prop.compileTypeErrors(newParents, varName, pathC)).join(';');
            });
            return `
                if (typeof ${varName} !== 'object' && ${varName} !== null && !Array.isArray(${varName})) {
                    ${jitNames.errors}.push({path: ${getErrorPath(pathC)}, expected: ${getExpected(this)}});
                } else {
                    ${itemsCode}
                }
            `;
        };
        return handleCircularTypeErrors(this, compile, callArgs, pathC);
    }
    compileJsonEncode(parents: RunType[], varName: string): string {
        const callArgs = [varName];
        const compile = () => {
            return compileChildrenJitFunction(this, parents, (newParents) => {
                if (shouldSkipJsonEncode(this)) return '';
                return this.childRunTypes.map((prop) => prop.compileJsonEncode(newParents, varName)).join(';');
            });
        };
        return handleCircularJsonEncode(this, compile, callArgs);
    }
    compileJsonDecode(parents: RunType[], varName: string): string {
        const callArgs = [varName];
        const compile = () => {
            return compileChildrenJitFunction(this, parents, (newParents) => {
                if (shouldSkipJsonDecode(this)) return '';
                return this.childRunTypes.map((prop) => prop.compileJsonDecode(newParents, varName)).join(';');
            });
        };
        return handleCircularJsonDecode(this, compile, callArgs);
    }
    compileJsonStringify(parents: RunType[], varName: string): string {
        const nestLevel = parents.length;
        const callArgs = [varName];
        const compile = () => {
            const propsCode = compileChildrenJitFunction(this, parents, (newParents) => {
                return this.childRunTypes.map((prop, i) => prop.compileJsonStringify(newParents, varName, i === 0)).join('+');
            });
            return `'{'+${propsCode}+'}'`;
        };
        return handleCircularJsonStringify(this, compile, callArgs, nestLevel, false);
    }
    mock(
        optionalParamsProbability: Record<string | number, number>,
        objArgs: Record<string | number, any[]>,
        indexArgs?: any[],
        obj: Record<string | number, any> = {}
    ): Record<string | number, any> {
        this.childRunTypes.forEach((prop) => {
            const name: string | number = prop.memberName as any;
            const optionalProbability: number | undefined = optionalParamsProbability?.[name];
            const propArgs: any[] = objArgs?.[name] || [];
            if (prop instanceof IndexSignatureRunType) prop.mock(obj, ...(indexArgs || []));
            else obj[name] = prop.mock(optionalProbability, ...propArgs);
        });
        return obj;
    }
}
