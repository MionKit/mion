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
import {
    compileChildrenJitFunction,
    handleCircularIsType,
    handleCircularJsonDecode,
    handleCircularJsonEncode,
    handleCircularJsonStringify,
    handleCircularTypeErrors,
} from '../jitCompiler';

export class PropertyRunType extends BaseRunType<TypePropertySignature | TypeProperty> {
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly memberRunType: RunType;
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
        const optional = this.src.optional ? '?' : '';
        this.jitId = `${this.propName}${optional}:${this.memberRunType.jitId}`;
    }
    compileIsType(parents: RunType[], varName: string): string {
        const {propAccessor, isCompilingCircularChild, nestLevel} = getJitVars(this, parents, varName);
        const callArgs = [propAccessor];
        const compileProperty = (newParents) => {
            if (!this.shouldSerialize) return '';
            if (this.src.optional) {
                return `(${propAccessor} === undefined || ${this.memberRunType.compileIsType(newParents, propAccessor)})`;
            }
            return this.memberRunType.compileIsType(newParents, propAccessor);
        };
        const propCode = compileChildrenJitFunction(this, parents, isCompilingCircularChild, compileProperty);
        return handleCircularIsType(this, propCode, callArgs, isCompilingCircularChild, nestLevel, false);
    }
    compileTypeErrors(parents: RunType[], varName: string, pathC: string[]): string {
        const {propAccessor, isCompilingCircularChild} = getJitVars(this, parents, varName);
        const callArgs = [propAccessor, jitNames.errors, jitNames.circularPath];
        const compileProperty = (newParents) => {
            if (!this.shouldSerialize) return '';
            const accessor = `${varName}${this.safePropAccessor}`;
            const newPath = [...pathC, toLiteral(this.propName)];
            if (this.src.optional) {
                return `if (${accessor} !== undefined) {${this.memberRunType.compileTypeErrors(newParents, accessor, newPath)}}`;
            }
            return `${this.memberRunType.compileTypeErrors(newParents, accessor, newPath)}`;
        };
        const propCode = compileChildrenJitFunction(this, parents, isCompilingCircularChild, compileProperty);
        return handleCircularTypeErrors(this, propCode, callArgs, isCompilingCircularChild, pathC);
    }
    compileJsonEncode(parents: RunType[], varName: string): string {
        const {propAccessor, isCompilingCircularChild} = getJitVars(this, parents, varName);
        const callArgs = [propAccessor];
        const compileProperty = (newParents) => {
            if (!this.shouldSerialize || shouldSkipJsonEncode(this)) return '';
            const propCode = this.memberRunType.compileJsonEncode(newParents, propAccessor);
            if (this.src.optional) return `if (${propAccessor} !== undefined) ${propCode}`;
            return propCode;
        };
        const propCode = compileChildrenJitFunction(this, parents, isCompilingCircularChild, compileProperty);
        return handleCircularJsonEncode(this, propCode, callArgs, isCompilingCircularChild);
    }
    compileJsonDecode(parents: RunType[], varName: string): string {
        const {propAccessor, isCompilingCircularChild} = getJitVars(this, parents, varName);
        const callArgs = [propAccessor];
        const compileProperty = (newParents) => {
            if (!this.shouldSerialize || shouldSkipJsonDecode(this)) return '';
            const propCode = this.memberRunType.compileJsonDecode(newParents, propAccessor);
            if (this.src.optional) return `if (${propAccessor} !== undefined) ${propCode}`;
            return propCode;
        };
        const propCode = compileChildrenJitFunction(this, parents, isCompilingCircularChild, compileProperty);
        return handleCircularJsonDecode(this, propCode, callArgs, isCompilingCircularChild);
    }
    compileJsonStringify(parents: RunType[], varName: string, isFirst = false): string {
        const {propAccessor, isCompilingCircularChild, nestLevel} = getJitVars(this, parents, varName);
        const callArgs = [propAccessor];
        const compileProperty = (newParents) => {
            if (!this.shouldSerialize) return '';
            // when is not safe firs stringify sanitizes string, second output double quoted scaped json string
            const proNameJSon = this.isSafePropName
                ? `'${toLiteral(this.propName)}'`
                : jitUtils.asJSONString(toLiteral(this.propName));
            const accessor = `${varName}${this.safePropAccessor}`;
            const propCode = this.memberRunType.compileJsonStringify(newParents, accessor);
            // this can´t be processed in the parent as we need to handle the empty string case when value is undefined
            const sep = isFirst ? '' : `','+`;
            if (this.src.optional) {
                return `(${accessor} === undefined ? '' : ${sep}${proNameJSon}+':'+${propCode})`;
            }
            return `${sep}${proNameJSon}+':'+${propCode}`;
        };
        const propCode = compileChildrenJitFunction(this, parents, isCompilingCircularChild, compileProperty);
        return handleCircularJsonStringify(this, propCode, callArgs, isCompilingCircularChild, nestLevel, false);
    }
    mock(optionalProbability = 0.2, ...args: any[]): any {
        if (optionalProbability < 0 || optionalProbability > 1) throw new Error('optionalProbability must be between 0 and 1');
        if (this.src.optional && Math.random() < optionalProbability) return undefined;
        return this.memberRunType.mock(...args);
    }
}

function getJitVars(rt: PropertyRunType, parents: RunType[], varName: string) {
    const isCompilingCircularChild = hasCircularParents(rt, parents);
    const safeAccessor = rt.isSafePropName ? `.${(rt.src as any).name}` : `[${toLiteral(rt.src.name)}]`;
    return {
        nestLevel: parents.length,
        isCompilingCircularChild,
        propAccessor: `${varName}${safeAccessor}`,
    };
}
