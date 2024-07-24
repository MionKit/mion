/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeObjectLiteral, TypeClass, TypeIntersection} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {skipJsonDecode, skipJsonEncode, toLiteral} from '../utils';
import {PropertyRunType} from './property';
import {BaseRunType} from '../baseRunTypes';
import {MethodSignatureRunType} from '../functionRunType/methodSignature';
import {CallSignatureRunType} from '../functionRunType/call';
import {IndexSignatureRunType} from './indexProperty';
import {MethodRunType} from '../functionRunType/method';

export type InterfaceRunTypeEntry =
    | PropertyRunType
    | MethodSignatureRunType
    | CallSignatureRunType
    | IndexSignatureRunType
    | MethodRunType;

export class InterfaceRunType<
    T extends TypeObjectLiteral | TypeClass | TypeIntersection = TypeObjectLiteral,
> extends BaseRunType<T> {
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly hasCircular: boolean;
    public readonly entries: InterfaceRunTypeEntry[];
    public readonly serializableProps: PropertyRunType[];
    public readonly serializableIndexProps: IndexSignatureRunType[];
    protected propertySeparator = ',';
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: T,
        public readonly parents: RunType[],
        public readonly opts: RunTypeOptions,
        isJsonDecodeRequired = false,
        isJsonEncodeRequired = false
    ) {
        super(visitor, src, parents, opts);
        const newParents = [...parents, this];
        this.entries = src.types.map((type) => visitor(type, newParents, opts)) as typeof this.entries;
        this.hasCircular = this.entries.some((prop) => prop.hasCircular);
        this.isJsonDecodeRequired = isJsonDecodeRequired || this.entries.some((prop) => prop.isJsonDecodeRequired);
        this.isJsonEncodeRequired = isJsonEncodeRequired || this.entries.some((prop) => prop.isJsonEncodeRequired);
        this.serializableProps = this.entries.filter(
            (prop) => prop.shouldSerialize && !(prop instanceof IndexSignatureRunType)
        ) as PropertyRunType[];

        // ### index props ###
        // with symbol not being serializable index can only be string or number (max length 2)
        this.serializableIndexProps = this.entries.filter(
            (prop) => prop.shouldSerialize && prop instanceof IndexSignatureRunType
        ) as IndexSignatureRunType[];
    }
    private _jitId: string | undefined;
    getJitId(): string {
        if (this._jitId) return this._jitId;
        const sortedProps = this.getAllSerializableProps(); // TODO: should we sort props?
        this._jitId = `${this.src.kind}{${sortedProps.map((prop) => `${prop.getJitId()}`).join(this.propertySeparator)}}`;
        return this._jitId;
    }

    private _allSerializableProps: (PropertyRunType | IndexSignatureRunType)[] | undefined;
    private getAllSerializableProps(): (PropertyRunType | IndexSignatureRunType)[] {
        if (this._allSerializableProps) return this._allSerializableProps;
        return (this._allSerializableProps = [...this.serializableProps, ...this.serializableIndexProps]);
    }

    compileIsType(varName: string): string {
        const propsCode = this.serializableProps.length
            ? this.serializableProps.map((prop) => `(${prop.compileIsType(varName)})`).join(' &&')
            : '';
        const indexPropsCode = this.serializableIndexProps.length ? this.serializableIndexProps[0].compileIsType(varName) : '';
        const code = [propsCode, indexPropsCode].filter((code) => !!code).join(' && ');
        return `typeof ${varName} === 'object' ${code ? `&& (${code})` : ''}`;
    }
    compileTypeErrors(varName: string, errorsName: string, pathLiteral: string): string {
        const propsCode = this.serializableProps.length
            ? this.serializableProps.map((prop) => prop.compileTypeErrors(varName, errorsName, pathLiteral)).join(';')
            : '';
        const indexPropsCode = this.serializableIndexProps.length
            ? this.serializableIndexProps[0].compileTypeErrors(varName, errorsName, pathLiteral)
            : '';
        const code = [propsCode, indexPropsCode].filter((code) => !!code).join('; ');
        return (
            `if (typeof ${varName} !== 'object') ${errorsName}.push({path: ${pathLiteral}, expected: ${toLiteral(this.getJitId())}});` +
            `else {${code}}`
        );
    }
    compileJsonEncode(varName: string): string {
        if (skipJsonEncode(this)) return '';
        if (this.serializableIndexProps.length) {
            return this.serializableIndexProps[0].compileJsonEncode(varName);
        }
        return this.serializableProps
            .map((prop) => prop.compileJsonEncode(varName))
            .filter((code) => !!code)
            .join(';');
    }
    compileJsonDecode(varName: string): string {
        if (skipJsonDecode(this)) return '';
        if (this.serializableIndexProps.length) {
            return this.serializableIndexProps[0].compileJsonDecode(varName);
        }
        return this.serializableProps
            .map((prop) => prop.compileJsonDecode(varName))
            .filter((code) => !!code)
            .join(';');
    }
    compileJsonStringify(varName: string): string {
        if (this.serializableIndexProps.length) {
            const indexPropsCode = this.serializableIndexProps[0].compileJsonStringify(varName);
            return `'{'+${indexPropsCode}+'}'`;
        }
        const propsCode = this.serializableProps.map((prop, i) => prop.compileJsonStringify(varName, i === 0)).join('+');
        return `'{'+${propsCode}+'}'`;
    }
    mock(
        optionalParamsProbability: Record<string | number, number>,
        objArgs: Record<string | number, any[]>,
        indexArgs?: any[],
        obj: Record<string | number, any> = {}
    ): Record<string | number, any> {
        this.getAllSerializableProps().forEach((prop) => {
            const name: string | number = prop.propName as any;
            const optionalProbability: number | undefined = optionalParamsProbability?.[name];
            const propArgs: any[] = objArgs?.[name] || [];
            if (prop instanceof IndexSignatureRunType) prop.mock(obj, ...(indexArgs || []));
            else obj[name] = prop.mock(optionalProbability, ...propArgs);
        });
        return obj;
    }
}
