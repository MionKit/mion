/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeObjectLiteral} from '../_deepkit/src/reflection/type';
import {RunTypeOptions, RunTypeVisitor} from '../types';
import {skipJsonDecode, skipJsonEncode, toLiteral} from '../utils';
import {PropertySignatureRunType} from './property';
import {BaseRunType} from '../baseRunType';
import {MethodSignatureRunType} from '../functionRunType/methodSignature';
import {CallSignatureRunType} from '../functionRunType/call';
import {IndexSignatureRunType} from './indexProperty';

const indexMessage = `ie supported: interface {[key: string]: string, [key: number]: string} | ie not supported: interface {[key: string]: string, [key: number]: number}`;

export class InterfaceRunType extends BaseRunType<TypeObjectLiteral> {
    public readonly name: string;
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly entries: (PropertySignatureRunType | MethodSignatureRunType | CallSignatureRunType | IndexSignatureRunType)[];
    public readonly serializableProps: PropertySignatureRunType[];
    public readonly indexProps: IndexSignatureRunType[];
    constructor(
        visitor: RunTypeVisitor,
        src: TypeObjectLiteral,
        public readonly nestLevel: number,
        public readonly opts: RunTypeOptions
    ) {
        super(visitor, src, nestLevel, opts);
        this.entries = src.types.map((type) => visitor(type, nestLevel, opts)) as typeof this.entries;
        this.isJsonDecodeRequired = this.entries.some((prop) => prop.isJsonDecodeRequired);
        this.isJsonEncodeRequired = this.entries.some((prop) => prop.isJsonEncodeRequired);
        this.serializableProps = this.entries.filter(
            (prop) => prop.shouldSerialize && !(prop instanceof IndexSignatureRunType)
        ) as PropertySignatureRunType[];

        // ### index props ###
        // with symbol not being serializable index can only be string or number (max length 2)
        this.indexProps = this.entries.filter(
            (prop) => prop.shouldSerialize && prop instanceof IndexSignatureRunType
        ) as IndexSignatureRunType[];
        const areIndexPropsValid =
            this.indexProps.length <= 1 || (this.indexProps.length === 2 && this.indexProps[0].name === this.indexProps[1].name);
        this.name = `object<${[...this.serializableProps, ...this.indexProps].map((prop) => prop.name).join(', ')}>`;
        if (!areIndexPropsValid)
            throw new Error(
                `Interface RunType with index properties of different types are not supported in ${this.name}.\n${indexMessage}`
            );
    }
    JIT_isType(varName: string): string {
        const propsCode = this.serializableProps.length
            ? this.serializableProps.map((prop) => `(${prop.JIT_isType(varName)})`).join(' &&')
            : '';
        const indexPropsCode = this.indexProps.length ? this.indexProps[0].JIT_isType(varName) : '';
        const code = [propsCode, indexPropsCode].filter((code) => !!code).join(' && ');
        return `typeof ${varName} === 'object' ${code ? `&& (${code})` : ''}`;
    }
    JIT_typeErrors(varName: string, errorsName: string, pathLiteral: string): string {
        const propsCode = this.serializableProps.length
            ? this.serializableProps.map((prop) => prop.JIT_typeErrors(varName, errorsName, pathLiteral)).join(';')
            : '';
        const indexPropsCode = this.indexProps.length ? this.indexProps[0].JIT_typeErrors(varName, errorsName, pathLiteral) : '';
        const code = [propsCode, indexPropsCode].filter((code) => !!code).join('; ');
        return (
            `if (typeof ${varName} !== 'object') ${errorsName}.push({path: ${pathLiteral}, expected: ${toLiteral(this.name)}});` +
            `else {${code}}`
        );
    }
    JIT_jsonEncode(varName: string): string {
        if (skipJsonEncode(this)) return '';
        if (this.indexProps.length) {
            return this.indexProps[0].JIT_jsonEncode(varName);
        }
        return this.serializableProps
            .map((prop) => prop.JIT_jsonEncode(varName))
            .filter((code) => !!code)
            .join(';');
    }
    JIT_jsonDecode(varName: string): string {
        if (skipJsonDecode(this)) return '';
        if (this.indexProps.length) {
            return this.indexProps[0].JIT_jsonDecode(varName);
        }
        return this.serializableProps
            .map((prop) => prop.JIT_jsonDecode(varName))
            .filter((code) => !!code)
            .join(';');
    }
    JIT_jsonStringify(varName: string): string {
        if (this.indexProps.length) {
            const indexPropsCode = this.indexProps[0].JIT_jsonStringify(varName);
            return `'{'+${indexPropsCode}+'}'`;
        }

        // unlike the other JIT methods the separator is added within the PropertySignatureRunType
        // this is because optional properties can't emit any strings at runtime
        const propsCode = this.serializableProps.map((prop, i) => prop.JIT_jsonStringify(varName, i === 0)).join('+');
        return `'{'+${propsCode}+'}'`;
    }
    mock(
        optionalParamsProbability: Record<string | number, number>,
        objArgs: Record<string | number, any[]>,
        indexArgs?: any[]
    ): Record<string | number, any> {
        const obj: Record<string | number, any> = {};
        this.serializableProps.forEach((prop) => {
            const name: string | number = prop.propName as any;
            const optionalProbability: number | undefined = optionalParamsProbability?.[name];
            const propArgs: any[] = objArgs?.[name] || [];
            if (prop instanceof IndexSignatureRunType) prop.mock(obj, ...(indexArgs || []));
            else obj[name] = prop.mock(optionalProbability, ...propArgs);
        });
        return obj;
    }
}
