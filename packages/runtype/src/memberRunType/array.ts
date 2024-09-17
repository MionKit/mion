/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeArray} from '../_deepkit/src/reflection/type';
import {JitOperation, JitPathItem, MockContext, JitTypeErrorOperation} from '../types';
import {getJitErrorPath, getExpected, memo} from '../utils';
import {mockRecursiveEmptyArray, random} from '../mock';
import {MemberRunType} from '../baseRunTypes';

export class ArrayRunType extends MemberRunType<TypeArray> {
    src: TypeArray = null as any; // will be set after construction
    getName() {
        return `array`;
    }
    getMemberName(): '' {
        return ''; // Although array is considered a Member run type, it has no name like a property or method
    }
    useArrayAccessor() {
        return true;
    }
    isOptional(): boolean {
        return false;
    }
    protected hasReturnCompileIsType(): boolean {
        return true;
    }
    protected hasReturnCompileJsonStringify(): boolean {
        return true;
    }

    // ####### array with Jit children, means children is not serializable #######
    protected _compileIsTypeNoChildren(): string {
        const name = this.getMemberType().getName();
        throw new Error(`Array of type <${name}> can't be compiled because <${name}> is non serializable.`);
    }
    protected _compileTypeErrorsNoChildren(): string {
        const name = this.getMemberType().getName();
        throw new Error(`Array of type <${name}> can't be compiled because <${name}> is non serializable.`);
    }
    protected _compileJsonEncodeNoChildren(op: JitOperation): string {
        return op.args.vλl; // array might be serializable, but children not require encoding
    }
    protected _compileJsonDecodeNoChildren(op: JitOperation): string {
        return op.args.vλl; // array might be serializable, but children not require decoding
    }
    protected _compileJsonStringifyNoChildren(): string {
        const name = this.getMemberType().getName();
        throw new Error(`Array of type <${name}> can't be compiled because <${name}> is non serializable.`);
    }

    protected _compileIsType(op: JitOperation): string {
        const varName = op.args.vλl;
        const resultVal = `rεsult${op.stack.length}`;
        const childPath: JitPathItem = this.getPathItem(op);
        const index = childPath.vλl;
        return `
            if (!Array.isArray(${varName})) return false;
            for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                const ${resultVal} = ${this.getMemberType().compileIsType(op)};
                if (!(${resultVal})) return false;
            }
            return true;
        `;
    }
    protected _compileTypeErrors(op: JitTypeErrorOperation): string {
        const varName = op.args.vλl;
        const errorsName = op.args.εrrors;
        const childPath: JitPathItem = this.getPathItem(op);
        const index = childPath.vλl;
        return `
            if (!Array.isArray(${varName})) ${errorsName}.push({path: ${getJitErrorPath(op)}, expected: ${getExpected(this)}});
            else {
                for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                    ${this.getMemberType().compileTypeErrors(op)}
                }
            }
        `;
    }
    protected _compileJsonEncode(op: JitOperation): string {
        return this.arrayJsonEncDec(op, true);
    }
    protected _compileJsonDecode(op: JitOperation): string {
        return this.arrayJsonEncDec(op, false);
    }
    private arrayJsonEncDec(op: JitOperation, isEncode: boolean): string {
        const varName = op.args.vλl;
        const childPath: JitPathItem = this.getPathItem(op);
        const index = childPath.vλl;
        const childrenCode = isEncode ? this.getMemberType().compileJsonEncode(op) : this.getMemberType().compileJsonDecode(op);
        return `
            for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                ${childrenCode}
            }
        `;
    }
    protected _compileJsonStringify(op: JitOperation): string {
        const varName = op.args.vλl;
        const jsonItems = `jsonItεms${op.stack.length}`;
        const resultVal = `rεsult${op.stack.length}`;
        const childPath: JitPathItem = this.getPathItem(op);
        const index = childPath.vλl;
        return `
            const ${jsonItems} = [];
            for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                const ${resultVal} = ${this.getMemberType().compileJsonStringify(op)};
                ${jsonItems}.push(${resultVal});
            }
            return '[' + ${jsonItems}.join(',') + ']';
        `;
    }
    mock(ctx?: Pick<MockContext, 'arrayLength'>): any[] {
        const length = ctx?.arrayLength ?? random(0, 30);
        if (this.constants().isCircularRef) {
            const depth = random(1, 5);
            // specific scenario where array is circular with itself, i.e: CircularArray = CircularArray[]
            return mockRecursiveEmptyArray(depth, length);
        }
        return Array.from({length}, () => this.getMemberType().mock(ctx));
    }
    getPathItem = memo((op: JitOperation): JitPathItem => {
        const index = `iε${op.stack.length}`;
        return {vλl: index, literal: index, useArrayAccessor: true};
    });
}
