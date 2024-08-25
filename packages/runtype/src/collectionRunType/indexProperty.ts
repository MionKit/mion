import {ReflectionKind, TypeIndexSignature} from '../_deepkit/src/reflection/type';
import {BaseRunType} from '../baseRunTypes';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {hasCircularParents, isFunctionKind} from '../utils';
import {NumberRunType} from '../singleRunType/number';
import {StringRunType} from '../singleRunType/string';
import {SymbolRunType} from '../singleRunType/symbol';
import {jitNames} from '../constants';
import {
    compileChildrenJitFunction,
    handleCircularIsType,
    handleCircularJsonDecode,
    handleCircularJsonEncode,
    handleCircularJsonStringify,
    handleCircularTypeErrors,
} from '../jitCompiler';

/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export class IndexSignatureRunType extends BaseRunType<TypeIndexSignature> {
    public readonly isJsonEncodeRequired;
    public readonly isJsonDecodeRequired;
    public readonly indexType: RunType;
    public readonly indexKeyType: NumberRunType | StringRunType | SymbolRunType;
    public readonly isReadonly: boolean;
    public readonly shouldSerialize: boolean;
    public readonly propName: string;
    public readonly jitId: string;
    protected propertySeparator = '&';

    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeIndexSignature,
        public readonly parents: RunType[],
        opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        parents.push(this);
        this.indexType = visitor(src.type, parents, opts);
        this.indexKeyType = visitor(src.index, parents, opts) as NumberRunType | StringRunType | SymbolRunType;
        parents.pop();
        this.shouldSerialize = !isFunctionKind(src.type.kind) && src.index.kind !== ReflectionKind.symbol;
        this.isReadonly = false; // TODO: readonly allowed to set in typescript but not present in deepkit
        this.isJsonEncodeRequired = this.indexType.isJsonEncodeRequired;
        this.isJsonDecodeRequired = this.indexType.isJsonDecodeRequired;
        this.propName = `${src.index.kind}`;
        this.jitId = `[${this.propName}]:${this.indexType.jitId}`;
    }
    compileIsType(parents: RunType[], varName: string): string {
        const {prop, propAccessor, isCompilingCircularChild, nestLevel} = getJitVars(this, parents, varName);
        const callArgs = [varName];
        const compileChildren = (newParents) => this.indexType.compileIsType(newParents, propAccessor);
        const itemsCode = compileChildrenJitFunction(this, parents, isCompilingCircularChild, compileChildren);
        const code = `
            for (const ${prop} in ${varName}) {
                if (!(${itemsCode})) return false;
            }
            return true;
        `;
        return handleCircularIsType(this, code, callArgs, isCompilingCircularChild, nestLevel);
    }
    compileTypeErrors(parents: RunType[], varName: string, pathC: string[]): string {
        const {prop, propAccessor, isCompilingCircularChild} = getJitVars(this, parents, varName);
        const callArgs = [jitNames.errors, jitNames.circularPath];
        const compileChildren = (newParents) => {
            const newPath = [...pathC, prop];
            return this.indexType.compileTypeErrors(newParents, propAccessor, newPath);
        };
        const itemsCode = compileChildrenJitFunction(this, parents, isCompilingCircularChild, compileChildren);
        const code = `
            for (const ${prop} in ${varName}) {
                ${itemsCode}
            }
        `;
        return handleCircularTypeErrors(this, code, callArgs, isCompilingCircularChild, pathC);
    }
    compileJsonEncode(parents: RunType[], varName: string): string {
        const {prop, propAccessor, isCompilingCircularChild} = getJitVars(this, parents, varName);
        const callArgs = [varName];
        const compileChildren = (newParents) => this.indexType.compileJsonEncode(newParents, propAccessor);
        const itemsCode = compileChildrenJitFunction(this, parents, isCompilingCircularChild, compileChildren);
        const code = `
            for (const ${prop} in ${varName}) {
                ${itemsCode}
            }
        `;
        const encodeCode = this.isJsonEncodeRequired ? code : '';
        return handleCircularJsonEncode(this, encodeCode, callArgs, isCompilingCircularChild);
    }
    compileJsonDecode(parents: RunType[], varName: string): string {
        const {prop, propAccessor, isCompilingCircularChild} = getJitVars(this, parents, varName);
        const callArgs = [varName];
        const compileChildren = (newParents) => this.indexType.compileJsonDecode(newParents, propAccessor);
        const itemsCode = compileChildrenJitFunction(this, parents, isCompilingCircularChild, compileChildren);
        const code = `
            for (const ${prop} in ${varName}) {
                ${itemsCode}
            }
        `;
        const decodeCode = this.isJsonDecodeRequired ? code : '';
        return handleCircularJsonDecode(this, decodeCode, callArgs, isCompilingCircularChild);
    }
    compileJsonStringify(parents: RunType[], varName: string): string {
        const {prop, propAccessor, isCompilingCircularChild, nestLevel} = getJitVars(this, parents, varName);
        const arrName = `prΦpsλrr${nestLevel}`;
        const callArgs = [varName];
        const compileChildren = (newParents) => this.indexType.compileJsonStringify(newParents, propAccessor);
        const itemsCode = compileChildrenJitFunction(this, parents, isCompilingCircularChild, compileChildren);
        const code = `
            const ${arrName} = [];
            for (const ${prop} in ${varName}) {
                if (${propAccessor} !== undefined) ${arrName}.push(${jitNames.utils}.asJSONString(${prop}) + ':' + ${itemsCode})
            }
            return ${arrName}.join(',');
        `;

        return handleCircularJsonStringify(this, code, callArgs, isCompilingCircularChild, nestLevel);
    }
    mock(parentMockObj: Record<string | number | symbol, any>, ...args: any[]): any {
        const length = Math.floor(Math.random() * 10);
        for (let i = 0; i < length; i++) {
            let propName: number | string | symbol;
            switch (true) {
                case !!(this.indexKeyType instanceof NumberRunType):
                    propName = i;
                    break;
                case !!(this.indexKeyType instanceof StringRunType):
                    propName = `key${i}`;
                    break;
                case !!(this.indexKeyType instanceof SymbolRunType):
                    propName = Symbol.for(`key${i}`);
                    break;
                default:
                    throw new Error('Invalid index signature type');
            }
            parentMockObj[propName] = this.indexType.mock(...args);
        }
    }
}

function getJitVars(rt: IndexSignatureRunType, parents: RunType[], varName: string) {
    const nestLevel = parents.length;
    const isCompilingCircularChild = hasCircularParents(rt, parents);
    const prop = `prΦp${nestLevel}`;
    return {
        nestLevel,
        isCompilingCircularChild,
        prop,
        propAccessor: `${varName}[${prop}]`,
    };
}
