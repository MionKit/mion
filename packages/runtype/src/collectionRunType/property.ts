/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeProperty, TypePropertySignature} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {isFunctionKind, shouldSkipJsonDecode, shouldSkipJsonEncode, toLiteral} from '../utils';
import {jitNames, validPropertyNameRegExp} from '../constants';
import {MemberRunType} from '../baseRunTypes';
import {jitUtils} from '../jitUtils';
import {
    compileChildrenJitFunction,
    handleCircularIsType,
    handleCircularJsonDecode,
    handleCircularJsonEncode,
    handleCircularJsonStringify,
    handleCircularTypeErrors,
} from '../jitCircular';

export class PropertyRunType extends MemberRunType<TypePropertySignature | TypeProperty> {
    public readonly memberType: RunType;
    public readonly isSafePropName: boolean;
    public readonly memberName: string | number;
    public readonly shouldSerialize: boolean;
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly jitId: string = '$';
    public readonly safePropAccessor: string;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypePropertySignature,
        public readonly parents: RunType[],
        opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        parents.push(this);
        this.memberType = visitor(src.type, parents, opts);
        parents.pop();

        if (typeof src.name === 'symbol') {
            this.memberName = src.name.toString();
            this.shouldSerialize = false;
            this.isJsonEncodeRequired = this.memberType.isJsonEncodeRequired;
            this.isJsonDecodeRequired = this.memberType.isJsonDecodeRequired;
        } else {
            this.memberName = src.name;
            this.shouldSerialize = !isFunctionKind(src.kind);
            this.isJsonEncodeRequired = this.memberType.isJsonEncodeRequired && this.shouldSerialize;
            this.isJsonDecodeRequired = this.memberType.isJsonDecodeRequired;
        }
        const optional = this.src.optional ? '?' : '';
        this.isSafePropName =
            (typeof src.name === 'string' && validPropertyNameRegExp.test(src.name)) || typeof src.name === 'number';
        this.safePropAccessor = this.isSafePropName ? `.${this.memberName}` : `[${toLiteral(this.memberName)}]`;
        this.jitId = `${this.memberName}${optional}:${this.memberType.jitId}`;
    }
    compileIsType(parents: RunType[], varName: string): string {
        const {propAccessor, nestLevel} = getJitVars(this, parents, varName);
        const callArgs = [propAccessor];
        const compile = () => {
            return compileChildrenJitFunction(this, parents, (newParents) => {
                if (!this.shouldSerialize) return '';
                if (this.src.optional) {
                    return `(${propAccessor} === undefined || ${this.memberType.compileIsType(newParents, propAccessor)})`;
                }
                return this.memberType.compileIsType(newParents, propAccessor);
            });
        };
        return handleCircularIsType(this, compile, callArgs, nestLevel, false);
    }
    compileTypeErrors(parents: RunType[], varName: string, pathC: string[]): string {
        const {propAccessor} = getJitVars(this, parents, varName);
        const callArgs = [propAccessor, jitNames.errors, jitNames.circularPath];
        const compile = () => {
            return compileChildrenJitFunction(this, parents, (newParents) => {
                if (!this.shouldSerialize) return '';
                const accessor = `${varName}${this.safePropAccessor}`;
                const newPath = [...pathC, toLiteral(this.memberName)];
                if (this.src.optional) {
                    return `if (${accessor} !== undefined) {${this.memberType.compileTypeErrors(newParents, accessor, newPath)}}`;
                }
                return `${this.memberType.compileTypeErrors(newParents, accessor, newPath)}`;
            });
        };
        return handleCircularTypeErrors(this, compile, callArgs, pathC);
    }
    compileJsonEncode(parents: RunType[], varName: string): string {
        const {propAccessor} = getJitVars(this, parents, varName);
        const callArgs = [propAccessor];
        const compile = () => {
            return compileChildrenJitFunction(this, parents, (newParents) => {
                if (!this.shouldSerialize || shouldSkipJsonEncode(this)) return '';
                const propCode = this.memberType.compileJsonEncode(newParents, propAccessor);
                if (this.src.optional) return `if (${propAccessor} !== undefined) ${propCode}`;
                return propCode;
            });
        };
        return handleCircularJsonEncode(this, compile, callArgs);
    }
    compileJsonDecode(parents: RunType[], varName: string): string {
        const {propAccessor} = getJitVars(this, parents, varName);
        const callArgs = [propAccessor];
        const compile = () => {
            return compileChildrenJitFunction(this, parents, (newParents) => {
                if (!this.shouldSerialize || shouldSkipJsonDecode(this)) return '';
                const propCode = this.memberType.compileJsonDecode(newParents, propAccessor);
                if (this.src.optional) return `if (${propAccessor} !== undefined) ${propCode}`;
                return propCode;
            });
        };
        return handleCircularJsonDecode(this, compile, callArgs);
    }
    compileJsonStringify(parents: RunType[], varName: string, isFirst = false): string {
        const {propAccessor, nestLevel} = getJitVars(this, parents, varName);
        const callArgs = [propAccessor];
        const compile = () => {
            return compileChildrenJitFunction(this, parents, (newParents) => {
                if (!this.shouldSerialize) return '';
                // when is not safe firs stringify sanitizes string, second output double quoted scaped json string
                const proNameJSon = this.isSafePropName
                    ? `'${toLiteral(this.memberName)}'`
                    : jitUtils.asJSONString(toLiteral(this.memberName));
                const accessor = `${varName}${this.safePropAccessor}`;
                const propCode = this.memberType.compileJsonStringify(newParents, accessor);
                // this can´t be processed in the parent as we need to handle the empty string case when value is undefined
                const sep = isFirst ? '' : `','+`;
                if (this.src.optional) {
                    return `(${accessor} === undefined ? '' : ${sep}${proNameJSon}+':'+${propCode})`;
                }
                return `${sep}${proNameJSon}+':'+${propCode}`;
            });
        };
        return handleCircularJsonStringify(this, compile, callArgs, nestLevel, false);
    }
    mock(optionalProbability = 0.5, ...args: any[]): any {
        if (optionalProbability < 0 || optionalProbability > 1) throw new Error('optionalProbability must be between 0 and 1');
        if (this.src.optional && Math.random() < optionalProbability) return undefined;
        return this.memberType.mock(...args);
    }
}

function getJitVars(rt: PropertyRunType, parents: RunType[], varName: string) {
    const safeAccessor = rt.isSafePropName ? `.${(rt.src as any).name}` : `[${toLiteral(rt.src.name)}]`;
    return {
        nestLevel: parents.length,
        propAccessor: `${varName}${safeAccessor}`,
    };
}
