import {ReflectionKind, TypeIndexSignature} from '../_deepkit/src/reflection/type';
import {MemberRunType} from '../baseRunTypes';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {isFunctionKind} from '../utils';
import {NumberRunType} from '../atomicRunType/number';
import {StringRunType} from '../atomicRunType/string';
import {SymbolRunType} from '../atomicRunType/symbol';
import {jitNames} from '../constants';
import {
    compileChildrenJitFunction,
    handleCircularIsType,
    handleCircularJsonDecode,
    handleCircularJsonEncode,
    handleCircularJsonStringify,
    handleCircularTypeErrors,
} from '../jitCircular';

/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export class IndexSignatureRunType extends MemberRunType<TypeIndexSignature> {
    public readonly memberType: RunType;
    public readonly indexKeyType: NumberRunType | StringRunType | SymbolRunType;
    public readonly memberName: string | number;
    public readonly shouldSerialize: boolean;
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly jitId: string = '$';

    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeIndexSignature,
        public readonly parents: RunType[],
        opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        parents.push(this);
        this.memberType = visitor(src.type, parents, opts);
        this.indexKeyType = visitor(src.index, parents, opts) as NumberRunType | StringRunType | SymbolRunType;
        parents.pop();
        this.memberName = `${this.src.index.kind}`;
        this.shouldSerialize = !isFunctionKind(src.type.kind) && src.index.kind !== ReflectionKind.symbol;
        this.jitId = `[${this.memberName}]:${this.memberType.jitId}`;
        this.isJsonEncodeRequired = this.memberType.isJsonEncodeRequired;
        this.isJsonDecodeRequired = this.memberType.isJsonDecodeRequired;
    }

    compileIsType(parents: RunType[], varName: string): string {
        const {prop, propAccessor, nestLevel} = getJitVars(this, parents, varName);
        const callArgs = [varName];
        const compile = () => {
            const itemsCode = compileChildrenJitFunction(this, parents, (newParents) =>
                this.memberType.compileIsType(newParents, propAccessor)
            );
            return `
                for (const ${prop} in ${varName}) {
                    if (!(${itemsCode})) return false;
                }
                return true;
            `;
        };

        return handleCircularIsType(this, compile, callArgs, nestLevel, true);
    }
    compileTypeErrors(parents: RunType[], varName: string, pathC: string[]): string {
        const {prop, propAccessor} = getJitVars(this, parents, varName);
        const callArgs = [jitNames.errors, jitNames.circularPath];
        const compile = () => {
            const itemsCode = compileChildrenJitFunction(this, parents, (newParents) => {
                const newPath = [...pathC, prop];
                return this.memberType.compileTypeErrors(newParents, propAccessor, newPath);
            });
            return `
                for (const ${prop} in ${varName}) {
                    ${itemsCode}
                }
            `;
        };
        return handleCircularTypeErrors(this, compile, callArgs, pathC);
    }
    compileJsonEncode(parents: RunType[], varName: string): string {
        const {prop, propAccessor} = getJitVars(this, parents, varName);
        const callArgs = [varName];
        const compile = () => {
            const itemsCode = compileChildrenJitFunction(this, parents, (newParents) =>
                this.memberType.compileJsonEncode(newParents, propAccessor)
            );
            const code = `
                for (const ${prop} in ${varName}) {
                    ${itemsCode}
                }
            `;
            return this.isJsonEncodeRequired ? code : '';
        };

        return handleCircularJsonEncode(this, compile, callArgs);
    }
    compileJsonDecode(parents: RunType[], varName: string): string {
        const {prop, propAccessor} = getJitVars(this, parents, varName);
        const callArgs = [varName];
        const compile = () => {
            const itemsCode = compileChildrenJitFunction(this, parents, (newParents) =>
                this.memberType.compileJsonDecode(newParents, propAccessor)
            );
            const code = `
                for (const ${prop} in ${varName}) {
                    ${itemsCode}
                }
            `;
            return this.isJsonDecodeRequired ? code : '';
        };
        return handleCircularJsonDecode(this, compile, callArgs);
    }
    compileJsonStringify(parents: RunType[], varName: string): string {
        const {prop, propAccessor, nestLevel} = getJitVars(this, parents, varName);
        const callArgs = [varName];
        const compile = () => {
            const arrName = `prΦpsλrr${nestLevel}`;
            const itemsCode = compileChildrenJitFunction(this, parents, (newParents) =>
                this.memberType.compileJsonStringify(newParents, propAccessor)
            );
            return `
                const ${arrName} = [];
                for (const ${prop} in ${varName}) {
                    if (${propAccessor} !== undefined) ${arrName}.push(${jitNames.utils}.asJSONString(${prop}) + ':' + ${itemsCode})
                }
                return ${arrName}.join(',');
            `;
        };
        return handleCircularJsonStringify(this, compile, callArgs, nestLevel, true);
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
            parentMockObj[propName] = this.memberType.mock(...args);
        }
    }
}

function getJitVars(rt: IndexSignatureRunType, parents: RunType[], varName: string) {
    const nestLevel = parents.length;
    const prop = `prΦp${nestLevel}`;
    return {
        nestLevel,
        prop,
        propAccessor: `${varName}[${prop}]`,
    };
}
