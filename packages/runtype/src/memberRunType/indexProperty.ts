import {ReflectionKind, TypeIndexSignature} from '../_deepkit/src/reflection/type';
import {SingleItemMemberRunType} from '../baseRunTypes';
import {JitOperation, JitPathItem, MockContext, JitTypeErrorOperation} from '../types';
import {jitNames} from '../constants';
import {memo} from '../utils';

/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export class IndexSignatureRunType extends SingleItemMemberRunType<TypeIndexSignature> {
    src: TypeIndexSignature = null as any; // will be set after construction
    getName(): string {
        return 'indexProperty';
    }
    isOptional(): boolean {
        return false;
    }
    useArrayAccessor() {
        return true;
    }
    getMemberName(): number {
        return this.src.index.kind;
    }
    protected hasReturnCompileIsType(): boolean {
        return true;
    }
    protected hasReturnCompileJsonStringify(): boolean {
        return true;
    }

    // #### index prop jit code ####
    protected _compileIsType(op: JitOperation): string {
        const child = this.getJitChild();
        if (!child) return 'true';
        const varName = op.args.vλl;
        const childPath: JitPathItem = this.getPathItem(op);
        const prop = childPath.vλl;
        return `
            for (const ${prop} in ${varName}) {
                if (!(${child.compileIsType(op)})) return false;
            }
            return true;
        `;
    }
    protected _compileTypeErrors(op: JitTypeErrorOperation): string {
        const child = this.getJitChild();
        if (!child) return '';
        const varName = op.args.vλl;
        const childPath: JitPathItem = this.getPathItem(op);
        const prop = childPath.vλl;
        return `
            for (const ${prop} in ${varName}) {
                ${child.compileTypeErrors(op)}
            }
        `;
    }
    protected _compileJsonEncode(op: JitOperation): string {
        return this.compileJsonDE(op, true);
    }
    protected _compileJsonDecode(op: JitOperation): string {
        return this.compileJsonDE(op, false);
    }
    private compileJsonDE(op: JitOperation, isEncode = false): string {
        const child = isEncode ? this.getJsonEncodeChild() : this.getJsonDecodeChild();
        if (!child) return '';
        const varName = op.args.vλl;
        const childPath: JitPathItem = this.getPathItem(op);
        const prop = childPath.vλl;
        return `
            for (const ${prop} in ${varName}) {
                ${isEncode ? child.compileJsonEncode(op) : child.compileJsonDecode(op)}
            }
        `;
    }
    protected _compileJsonStringify(op: JitOperation): string {
        const child = this.getJitChild();
        if (!child) return `''`;
        const childPath: JitPathItem = this.getPathItem(op);
        const varName = op.args.vλl;
        const prop = childPath.vλl;
        const arrName = `prΦpsλrr${op.stack.length}`;
        const jsonVal = child.compileJsonStringify(op);
        return `
            const ${arrName} = [];
            for (const ${prop} in ${varName}) {
                if (${prop} !== undefined) ${arrName}.push(${jitNames.utils}.asJSONString(${prop}) + ':' + ${jsonVal});
            }
            return ${arrName}.join(',');
        `;
    }
    mock(ctx?: Pick<MockContext, 'parentObj'>): any {
        const length = Math.floor(Math.random() * 10);
        const parentObj = ctx?.parentObj || {};
        for (let i = 0; i < length; i++) {
            let propName: number | string | symbol;
            switch (true) {
                case !!(this.src.index.kind === ReflectionKind.number):
                    propName = i;
                    break;
                case !!(this.src.index.kind === ReflectionKind.string):
                    propName = `key${i}`;
                    break;
                case !!(this.src.index.kind === ReflectionKind.symbol):
                    propName = Symbol.for(`key${i}`);
                    break;
                default:
                    throw new Error('Invalid index signature type');
            }
            parentObj[propName] = this.getMemberType().mock(ctx);
        }
    }
    getPathItem = memo((op: JitOperation): JitPathItem => {
        const prop = `prΦp${op.stack.length}`;
        return {vλl: prop, literal: prop, useArrayAccessor: true};
    });
}
