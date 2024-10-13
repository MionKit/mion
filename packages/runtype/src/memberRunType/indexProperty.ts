import {ReflectionKind, TypeIndexSignature} from '../_deepkit/src/reflection/type';
import {MemberRunType} from '../baseRunTypes';
import {PathItem, MockContext} from '../types';
import {jitNames} from '../constants';
import {JitCompileOp, JitTypeErrorCompileOp} from '../jitOperation';

/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export class IndexSignatureRunType extends MemberRunType<TypeIndexSignature> {
    src: TypeIndexSignature = null as any; // will be set after construction
    getName(): string {
        return 'indexProperty';
    }
    isOptional(): boolean {
        return false;
    }
    getMemberName(): number {
        return this.src.index.kind;
    }
    getJitChildrenPath(cop: JitCompileOp): PathItem {
        const prop = this.getPropName(cop);
        return cop.newPathItem(prop, prop, true);
    }
    private getPropName(cop: JitCompileOp): string {
        return `prΦp${cop.length}`;
    }
    protected hasReturnCompileIsType(): boolean {
        return true;
    }
    protected hasReturnCompileJsonStringify(): boolean {
        return true;
    }
    // #### jit code ####
    protected _compileIsType(cop: JitCompileOp): string {
        const child = this.getJitChild();
        if (!child) return 'true';
        const varName = cop.vλl;
        const prop = this.getPropName(cop);
        return `
            for (const ${prop} in ${varName}) {
                if (!(${child.compileIsType(cop)})) return false;
            }
            return true;
        `;
    }
    protected _compileTypeErrors(cop: JitTypeErrorCompileOp): string {
        const child = this.getJitChild();
        if (!child) return '';
        const varName = cop.vλl;
        const prop = this.getPropName(cop);
        return `
            for (const ${prop} in ${varName}) {
                ${child.compileTypeErrors(cop)}
            }
        `;
    }
    protected _compileJsonEncode(cop: JitCompileOp): string {
        const child = this.getJsonEncodeChild();
        if (!child) return '';
        const varName = cop.vλl;
        const prop = this.getPropName(cop);
        return `
            for (const ${prop} in ${varName}) {
                ${child.compileJsonEncode(cop)}
            }
        `;
    }
    protected _compileJsonDecode(cop: JitCompileOp): string {
        const child = this.getJsonDecodeChild();
        if (!child) return '';
        const varName = cop.vλl;
        const prop = this.getPropName(cop);
        return `
            for (const ${prop} in ${varName}) {
                ${child.compileJsonDecode(cop)}
            }
        `;
    }

    protected _compileJsonStringify(cop: JitCompileOp): string {
        const child = this.getJitChild();
        if (!child) return `''`;
        const varName = cop.vλl;
        const prop = this.getPropName(cop);
        const arrName = `prΦpsλrr${cop.length}`;
        const jsonVal = child.compileJsonStringify(cop);
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
}
