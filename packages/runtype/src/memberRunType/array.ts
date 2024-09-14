/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeArray} from '../_deepkit/src/reflection/type';
import {JitOperation, JitPathItem, MockContext, JitTypeErrorOperation} from '../types';
import {getJitErrorPath, getExpected} from '../utils';
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
    protected _compileJsonEncodeNoChildren(): string {
        return ''; // array might be serializable, but children not require encoding
    }
    protected _compileJsonDecodeNoChildren(): string {
        return ''; // array might be serializable, but children not require decoding
    }
    protected _compileJsonStringifyNoChildren(): string {
        const name = this.getMemberType().getName();
        throw new Error(`Array of type <${name}> can't be compiled because <${name}> is non serializable.`);
    }

    protected _compileIsType(op: JitOperation): string {
        const varName = op.args.vλl;
        const resultVal = `rεsult${op.stack.length}`;
        const childPath: JitPathItem = this.getMemberPathItem(op);
        const index = childPath.vλl;
        const compNext = (nextOp: JitOperation) => this.getMemberType().compileIsType(nextOp);
        return `
            if (!Array.isArray(${varName})) return false;
            for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                const ${resultVal} = ${this.compileChildren(compNext, op, childPath)};
                if (!(${resultVal})) return false;
            }
            return true;
        `;
    }
    protected _compileTypeErrors(op: JitTypeErrorOperation): string {
        const varName = op.args.vλl;
        const errorsName = op.args.εrrors;
        const childPath: JitPathItem = this.getMemberPathItem(op);
        const index = childPath.vλl;
        const compNext = (nextOp: JitTypeErrorOperation) => this.getMemberType().compileTypeErrors(nextOp);
        return `
            if (!Array.isArray(${varName})) ${errorsName}.push({path: ${getJitErrorPath(op)}, expected: ${getExpected(this)}});
            else {
                for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                    ${this.compileChildren(compNext, op, childPath)}
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
        const childPath: JitPathItem = this.getMemberPathItem(op);
        const index = childPath.vλl;
        const encDec = isEncode ? this.getMemberType().compileJsonEncode : this.getMemberType().compileJsonDecode;
        const compNext = (nextOp: JitOperation) => encDec(nextOp);
        return `
            for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                ${this.compileChildren(compNext, op, childPath)}
            }
        `;
    }
    protected _compileJsonStringify(op: JitOperation): string {
        const varName = op.args.vλl;
        const jsonItems = `jsonItεms${op.stack.length}`;
        const resultVal = `rεsult${op.stack.length}`;
        const childPath: JitPathItem = this.getMemberPathItem(op);
        const index = childPath.vλl;
        const compNext = (nextOp: JitOperation) => this.getMemberType().compileJsonStringify(nextOp);
        return `
            const ${jsonItems} = [];
            for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                const ${resultVal} = ${this.compileChildren(compNext, op, childPath)};
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
    getMemberPathItem(op: JitOperation): JitPathItem {
        const index = `iε${op.stack.length}`;
        return {vλl: index, literal: index, useArrayAccessor: true};
    }
}
