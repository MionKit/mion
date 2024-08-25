/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeProperty, TypePropertySignature} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {hasCircularParents, isFunctionKind, shouldSkipJsonDecode, shouldSkipJsonEncode, toLiteral} from '../utils';
import {jitNames, validPropertyNameRegExp} from '../constants';
import {BaseRunType} from '../baseRunTypes';
import {jitUtils} from '../jitUtils';
import {compileChildrenJitFunction, handleCircularJitCompiling} from '../jitCompiler';

export class PropertyRunType extends BaseRunType<TypePropertySignature | TypeProperty> {
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly memberRunType: RunType;
    public readonly isOptional: boolean;
    public readonly isReadonly: boolean;
    public readonly propName: string | number;
    public readonly safePropAccessor: string;
    public readonly isSafePropName: boolean;
    public readonly shouldSerialize: boolean;
    public readonly jitId: string;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypePropertySignature,
        public readonly parents: RunType[],
        opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        parents.push(this);
        this.memberRunType = visitor(src.type, parents, opts);
        parents.pop();
        this.isOptional = !!src.optional;
        this.isReadonly = !!src.readonly;
        if (typeof src.name === 'symbol') {
            this.shouldSerialize = false;
            // forces encode & ignore the symbol
            this.isJsonEncodeRequired = true;
            // either symbol is not present or should be ignored using this.opts?.strictJSON
            this.isJsonDecodeRequired = false;
            this.propName = src.name.toString();
            this.safePropAccessor = ``;
            this.isSafePropName = true;
        } else {
            this.shouldSerialize = !isFunctionKind(src.kind);
            // forces encode & ignore the symbol
            this.isJsonEncodeRequired = this.memberRunType.isJsonEncodeRequired && this.shouldSerialize;
            // either symbol is not present or should be ignored using this.opts?.strictJSON
            this.isJsonDecodeRequired = this.memberRunType.isJsonDecodeRequired;
            this.isSafePropName =
                (typeof src.name === 'string' && validPropertyNameRegExp.test(src.name)) || typeof src.name === 'number';
            this.propName = src.name;
            this.safePropAccessor = this.isSafePropName ? `.${src.name}` : `[${toLiteral(src.name)}]`;
        }
        const optional = this.isOptional ? '?' : '';
        this.jitId = `${this.propName}${optional}:${this.memberRunType.jitId}`;
    }
    compileIsType(parents: RunType[], varName: string): string {
        const {propAccessor, isCompilingCircularChild} = getJitVars(this, parents, varName);
        const callArgs = [propAccessor];
        const compileProperty = (newParents) => {
            if (!this.shouldSerialize) return '';
            if (this.isOptional) {
                return `(${propAccessor} === undefined || ${this.memberRunType.compileIsType(newParents, propAccessor)})`;
            }
            return this.memberRunType.compileIsType(newParents, propAccessor);
        };
        const propCode = compileChildrenJitFunction(this, parents, isCompilingCircularChild, compileProperty);
        return handleCircularJitCompiling(this, 'isT', propCode, callArgs, isCompilingCircularChild);
    }
    compileTypeErrors(parents: RunType[], varName: string): string {
        const {propAccessor, isCompilingCircularChild} = getJitVars(this, parents, varName);
        const callArgs = [propAccessor, jitNames.errors, jitNames.path];
        const compileProperty = (newParents) => {
            if (!this.shouldSerialize) return '';
            const accessor = `${varName}${this.safePropAccessor}`;
            if (this.isOptional) {
                return `if (${accessor} !== undefined) {
                    ${jitNames.path}.push(${toLiteral(this.src.name)});
                    ${this.memberRunType.compileTypeErrors(newParents, accessor)}
                    ${jitNames.path}.pop();
                }`;
            }
            return this.memberRunType.compileTypeErrors(newParents, accessor);
        };
        const propCode = compileChildrenJitFunction(this, parents, isCompilingCircularChild, compileProperty);
        return handleCircularJitCompiling(this, 'isT', propCode, callArgs, isCompilingCircularChild);
    }
    compileJsonEncode(parents: RunType[], varName: string): string {
        const {propAccessor, isCompilingCircularChild} = getJitVars(this, parents, varName);
        const callArgs = [propAccessor];
        const compileProperty = (newParents) => {
            if (!this.shouldSerialize || shouldSkipJsonEncode(this)) return '';
            const propCode = this.memberRunType.compileJsonEncode(newParents, propAccessor);
            if (this.isOptional) return `if (${propAccessor} !== undefined) ${propCode}`;
            return propCode;
        };
        const propCode = compileChildrenJitFunction(this, parents, isCompilingCircularChild, compileProperty);
        return handleCircularJitCompiling(this, 'isT', propCode, callArgs, isCompilingCircularChild);
    }
    compileJsonDecode(parents: RunType[], varName: string): string {
        const {propAccessor, isCompilingCircularChild} = getJitVars(this, parents, varName);
        const callArgs = [propAccessor];
        const compileProperty = (newParents) => {
            if (!this.shouldSerialize || shouldSkipJsonDecode(this)) return '';
            const propCode = this.memberRunType.compileJsonDecode(newParents, propAccessor);
            if (this.isOptional) return `if (${propAccessor} !== undefined) ${propCode}`;
            return propCode;
        };
        const propCode = compileChildrenJitFunction(this, parents, isCompilingCircularChild, compileProperty);
        return handleCircularJitCompiling(this, 'isT', propCode, callArgs, isCompilingCircularChild);
    }
    compileJsonStringify(parents: RunType[], varName: string, isFirst = false): string {
        const {propAccessor, isCompilingCircularChild} = getJitVars(this, parents, varName);
        const callArgs = [propAccessor];
        const compileProperty = (newParents) => {
            if (!this.shouldSerialize) return '';
            // when is not safe firs stringify sanitizes string, second output double quoted scaped json string
            const proNameJSon = this.isSafePropName
                ? `'${toLiteral(this.propName)}'`
                : jitUtils.asJSONString(toLiteral(this.propName));
            const accessor = `${varName}${this.safePropAccessor}`;
            const propCode = this.memberRunType.compileJsonStringify(newParents, accessor);
            const sep = isFirst ? '' : `','+`;
            if (this.isOptional) {
                return `(${accessor} === undefined ? '' : ${sep}${proNameJSon}+':'+${propCode})`;
            }
            return `${sep}${proNameJSon}+':'+${propCode}`;
        };
        const propCode = compileChildrenJitFunction(this, parents, isCompilingCircularChild, compileProperty);
        return handleCircularJitCompiling(this, 'isT', propCode, callArgs, isCompilingCircularChild);
    }
    mock(optionalProbability = 0.2, ...args: any[]): any {
        if (optionalProbability < 0 || optionalProbability > 1) throw new Error('optionalProbability must be between 0 and 1');
        if (this.isOptional && Math.random() < optionalProbability) return undefined;
        return this.memberRunType.mock(...args);
    }
}

function getJitVars(rt: PropertyRunType, parents: RunType[], varName: string) {
    const isCompilingCircularChild = hasCircularParents(rt, parents);
    const safeAccessor = rt.isSafePropName ? `.${(rt.src as any).name}` : `[${toLiteral(rt.src.name)}]`;
    return {
        isCompilingCircularChild,
        propAccessor: `${varName}${safeAccessor}`,
    };
}
