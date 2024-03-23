/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypePropertySignature} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {addToPathChain, asJSONString, isFunctionKind, skipJsonDecode, skipJsonEncode, toLiteral} from '../utils';
import {validPropertyNameRegExp} from '../constants';
import {BaseRunType} from '../baseRunType';

export class PropertySignatureRunType extends BaseRunType<TypePropertySignature> {
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly memberType: RunType;
    public readonly name: string;
    public readonly isOptional: boolean;
    public readonly isReadonly: boolean;
    public readonly propName: string | number;
    public readonly safeAccessor: string;
    public readonly isSafePropName: boolean;
    public readonly shouldSerialize: boolean;
    constructor(
        visitor: RunTypeVisitor,
        src: TypePropertySignature,
        public readonly nestLevel: number,
        public readonly opts: RunTypeOptions
    ) {
        super(visitor, src, nestLevel, opts);
        this.memberType = visitor(src.type, nestLevel, opts);

        this.isOptional = !!src.optional;
        this.isReadonly = !!src.readonly;
        if (typeof src.name === 'symbol') {
            this.shouldSerialize = false;
            // forces encode & ignore the symbol
            this.isJsonEncodeRequired = true;
            // either symbol is not present or should be ignored using this.opts?.strictJSON
            this.isJsonDecodeRequired = false;
            this.propName = src.name.toString();
            this.safeAccessor = ``;
            this.isSafePropName = true;
        } else {
            this.shouldSerialize = !isFunctionKind(src.kind);
            // forces encode & ignore the symbol
            this.isJsonEncodeRequired = this.memberType.isJsonEncodeRequired && this.shouldSerialize;
            // either symbol is not present or should be ignored using this.opts?.strictJSON
            this.isJsonDecodeRequired = this.memberType.isJsonDecodeRequired;
            this.isSafePropName =
                (typeof src.name === 'string' && validPropertyNameRegExp.test(src.name)) || typeof src.name === 'number';
            this.propName = src.name;
            this.safeAccessor = this.isSafePropName ? `.${src.name}` : `[${toLiteral(src.name)}]`;
        }

        this.name = `${this.propName}${this.isOptional ? '?' : ''}:${this.memberType.name}`;
    }
    JIT_isType(varName: string): string {
        if (!this.shouldSerialize) return '';
        const accessor = `${varName}${this.safeAccessor}`;
        if (this.isOptional) {
            return `${accessor} === undefined || (${this.memberType.JIT_isType(accessor)})`;
        }
        return this.memberType.JIT_isType(accessor);
    }
    JIT_typeErrors(varName: string, errorsName: string, pathChain: string): string {
        if (!this.shouldSerialize) return '';
        const accessor = `${varName}${this.safeAccessor}`;
        if (this.isOptional) {
            return `if (${accessor} !== undefined) {${this.memberType.JIT_typeErrors(
                accessor,
                errorsName,
                addToPathChain(pathChain, this.propName)
            )}}`;
        }
        return this.memberType.JIT_typeErrors(accessor, errorsName, addToPathChain(pathChain, this.propName));
    }
    JIT_jsonEncode(varName: string): string {
        if (!this.shouldSerialize) return '';
        const accessor = `${varName}${this.safeAccessor}`;
        const useNative = skipJsonEncode(this);
        const propCode = useNative ? '' : this.memberType.JIT_jsonEncode(accessor);
        if (!propCode) return '';
        if (this.isOptional) {
            return `if (${accessor} !== undefined) ${propCode}`;
        }
        return propCode;
    }
    JIT_jsonDecode(varName: string): string {
        if (!this.shouldSerialize) return '';
        const accessor = `${varName}${this.safeAccessor}`;
        const useNative = skipJsonDecode(this);
        const propCode = useNative ? '' : this.memberType.JIT_jsonDecode(accessor);
        if (!propCode) return '';
        if (this.isOptional) {
            return `if (${accessor} !== undefined) ${propCode}`;
        }
        return propCode;
    }
    JIT_jsonStringify(varName: string, isFirst = false): string {
        if (!this.shouldSerialize) return '';
        // when is not safe firs stringify sanitizes string, second output double quoted scaped json string
        const proNameJSon = this.isSafePropName ? `'${toLiteral(this.propName)}'` : asJSONString(toLiteral(this.propName));
        const accessor = `${varName}${this.safeAccessor}`;
        const propCode = this.memberType.JIT_jsonStringify(accessor);
        if (this.isOptional) {
            return `${isFirst ? '' : '+'}(${accessor} === undefined ?'':${isFirst ? '' : `(','+`}${proNameJSon}+':'+${propCode}))`;
        }
        return `${isFirst ? '' : `+','+`}${proNameJSon}+':'+${propCode}`;
    }
    mock(optionalProbability = 0.2, ...args: any[]): any {
        if (optionalProbability < 0 || optionalProbability > 1) throw new Error('optionalProbability must be between 0 and 1');
        if (this.isOptional && Math.random() < optionalProbability) return undefined;
        return this.memberType.mock(...args);
    }
}
