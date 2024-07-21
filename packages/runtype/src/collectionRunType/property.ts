/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeProperty, TypePropertySignature} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {addToPathChain, hasCircularRunType, isFunctionKind, skipJsonDecode, skipJsonEncode, toLiteral} from '../utils';
import {validPropertyNameRegExp} from '../constants';
import {BaseRunType} from '../baseRunTypes';
import {jitUtils} from '../jitUtils';

export class PropertyRunType extends BaseRunType<TypePropertySignature | TypeProperty> {
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly hasCircular: boolean;
    public readonly memberRunType: RunType;
    public readonly slug: string;
    public readonly isOptional: boolean;
    public readonly isReadonly: boolean;
    public readonly propName: string | number;
    public readonly safeAccessor: string;
    public readonly isSafePropName: boolean;
    public readonly shouldSerialize: boolean;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypePropertySignature,
        public readonly parents: RunType[],
        public readonly opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        const newParents = [...parents, this];
        this.memberRunType = visitor(src.type, newParents, opts);
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
            this.isJsonEncodeRequired = this.memberRunType.isJsonEncodeRequired && this.shouldSerialize;
            // either symbol is not present or should be ignored using this.opts?.strictJSON
            this.isJsonDecodeRequired = this.memberRunType.isJsonDecodeRequired;
            this.isSafePropName =
                (typeof src.name === 'string' && validPropertyNameRegExp.test(src.name)) || typeof src.name === 'number';
            this.propName = src.name;
            this.safeAccessor = this.isSafePropName ? `.${src.name}` : `[${toLiteral(src.name)}]`;
        }

        this.slug = `${this.propName}${this.isOptional ? '?' : ''}:${this.memberRunType.slug}`;
        this.hasCircular = this.memberRunType.hasCircular || hasCircularRunType(this.memberRunType, parents);
    }
    compileIsType(varName: string): string {
        if (!this.shouldSerialize) return '';
        const accessor = `${varName}${this.safeAccessor}`;
        if (this.isOptional) {
            return `${accessor} === undefined || (${this.memberRunType.compileIsType(accessor)})`;
        }
        return this.memberRunType.compileIsType(accessor);
    }
    compileTypeErrors(varName: string, errorsName: string, pathChain: string): string {
        if (!this.shouldSerialize) return '';
        const accessor = `${varName}${this.safeAccessor}`;
        if (this.isOptional) {
            return `if (${accessor} !== undefined) {${this.memberRunType.compileTypeErrors(
                accessor,
                errorsName,
                addToPathChain(pathChain, this.propName)
            )}}`;
        }
        return this.memberRunType.compileTypeErrors(accessor, errorsName, addToPathChain(pathChain, this.propName));
    }
    compileJsonEncode(varName: string): string {
        if (!this.shouldSerialize) return '';
        const accessor = `${varName}${this.safeAccessor}`;
        const useNative = skipJsonEncode(this);
        const propCode = useNative ? '' : this.memberRunType.compileJsonEncode(accessor);
        if (!propCode) return '';
        if (this.isOptional) {
            return `if (${accessor} !== undefined) ${propCode}`;
        }
        return propCode;
    }
    compileJsonDecode(varName: string): string {
        if (!this.shouldSerialize) return '';
        const accessor = `${varName}${this.safeAccessor}`;
        const useNative = skipJsonDecode(this);
        const propCode = useNative ? '' : this.memberRunType.compileJsonDecode(accessor);
        if (!propCode) return '';
        if (this.isOptional) {
            return `if (${accessor} !== undefined) ${propCode}`;
        }
        return propCode;
    }
    compileJsonStringify(varName: string, isFisrt = false): string {
        if (!this.shouldSerialize) return '';
        // when is not safe firs stringify sanitizes string, second output double quoted scaped json string
        const proNameJSon = this.isSafePropName
            ? `'${toLiteral(this.propName)}'`
            : jitUtils.asJSONString(toLiteral(this.propName));
        const accessor = `${varName}${this.safeAccessor}`;
        const propCode = this.memberRunType.compileJsonStringify(accessor);
        const sep = isFisrt ? '' : `','+`;
        if (this.isOptional) {
            return `(${accessor} === undefined ? '' : ${sep}${proNameJSon}+':'+${propCode})`;
        }
        return `${sep}${proNameJSon}+':'+${propCode}`;
    }
    mock(optionalProbability = 0.2, ...args: any[]): any {
        if (optionalProbability < 0 || optionalProbability > 1) throw new Error('optionalProbability must be between 0 and 1');
        if (this.isOptional && Math.random() < optionalProbability) return undefined;
        return this.memberRunType.mock(...args);
    }
}
