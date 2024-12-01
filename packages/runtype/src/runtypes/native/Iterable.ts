/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {JitConstants, JitFnID, MockOperation, Mutable} from '../../types';
import {ClassRunType} from '../collection/class';
import {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {BaseRunType} from '../../lib/baseRunTypes';
import {JitFnIDs} from '../../constants';

// This is the base class for all iterable run types, like SetRunType and MapRunType
export abstract class IterableRunType extends ClassRunType {
    abstract children: BaseRunType[];
    abstract instance: string;
    abstract _mock(ctx: MockOperation): any;

    getIndexVarName(): string {
        return `e${this.getNestLevel()}`;
    }

    getCustomVλl(comp: JitCompiler) {
        // jsonDecode is decoding a regular array so no need to use an special case for vλl as other operations
        if (comp.fnId === JitFnIDs.jsonDecode)
            return {vλl: `it${this.getNestLevel()}`, isStandalone: false, useArrayAccessor: true};
        // other operations use an special case for vλl where all parents are skipped
        return {vλl: `it${this.getNestLevel()}`, isStandalone: true};
    }
    getJitConstants(stack: BaseRunType[] = []): JitConstants {
        return {
            ...(super.getJitConstants(stack) as Mutable<JitConstants>),
            skipJsonEncode: false, // we always need to transform the map/set into to an array when encoding
            skipJsonDecode: false, // we always need to transform the array to a map/set when decoding
        };
    }
    getJsonEncodeChildren(): BaseRunType[] {
        return this.getJitChildren();
    }
    getJsonDecodeChildren(): BaseRunType[] {
        return this.getJitChildren();
    }
    getChildRunTypes = (): BaseRunType[] => {
        return this.children;
    };

    jitFnHasReturn(fnId: JitFnID): boolean {
        switch (fnId) {
            case JitFnIDs.isType:
            case JitFnIDs.jsonStringify:
            case JitFnIDs.hasUnknownKeys:
                return true;
            default:
                return super.jitFnHasReturn(fnId);
        }
    }
    _compileIsType(comp: JitCompiler): string {
        const entry = this.getCustomVλl(comp).vλl;
        const childrenCode = this.getJitChildren()
            .map((c) => `if (!(${c.compileIsType(comp)})) return false`)
            .join(';');
        return `
            if (!(${comp.vλl} instanceof ${this.instance})) return false;
            for (const ${entry} of ${comp.vλl}) {${childrenCode}} return true;
        `;
    }

    _compileTypeErrors(comp: JitErrorsCompiler): string {
        const entry = this.getCustomVλl(comp).vλl;
        const childrenCode = this.getJitChildren()
            .map((c) => c.compileTypeErrors(comp))
            .join(';');
        const index = this.getIndexVarName();
        return `
            if (!(${comp.vλl} instanceof ${this.instance})){${comp.callJitErr(this)}}
            else {let ${index} = 0;for (const ${entry} of ${comp.vλl}) {${childrenCode}; ${index}++}}
        `;
    }

    _compileJsonEncode(comp: JitCompiler): string {
        const entry = this.getCustomVλl(comp).vλl;
        const resName = `ml${this.getNestLevel()}`;
        const childrenCode = this.getJsonEncodeChildren()
            .map((c) => c.compileJsonEncode(comp))
            .filter((c) => c)
            .join(';');
        if (!childrenCode) return `${comp.vλl} = Array.from(${comp.vλl})`;
        return `
            const ${resName} = [];
            for (const ${entry} of ${comp.vλl}) {${childrenCode} ${resName}.push(${entry})}
            ${comp.vλl} = ${resName};
        `;
    }

    _compileJsonDecode(comp: JitCompiler): string {
        if (!this.getJsonDecodeChildren().length) return `${comp.vλl} = new Map(${comp.vλl})`;
        const index = this.getCustomVλl(comp).vλl;
        const childrenCode = this.getJsonDecodeChildren()
            .map((c) => c.compileJsonDecode(comp))
            .filter((c) => c)
            .join(';');
        if (!childrenCode) return `${comp.vλl} = new ${this.instance}(${comp.vλl})`;
        return `
            for (let ${index} = 0; ${index} < ${comp.vλl}.length; ${index}++) {${childrenCode}}
            ${comp.vλl} = new ${this.instance}(${comp.vλl})
        `;
    }

    _compileJsonStringify(comp: JitCompiler): string {
        const entry = this.getCustomVλl(comp).vλl;
        const childrenCode = this.getJitChildren()
            .map((c) => c.compileJsonStringify(comp))
            .join('+');
        const jsonItems = `ls${this.getNestLevel()}`;
        const resultVal = `res${this.getNestLevel()}`;
        return `
            const ${jsonItems} = [];
            for (const ${entry} of ${comp.vλl}) {
                const ${resultVal} = '['+${childrenCode}+']';
                ${jsonItems}.push(${resultVal});
            }
            return '[' + ${jsonItems}.join(',') + ']';
        `;
    }

    // TODO: Implement the following methods, shoild just call same compile method for children, look into to array run type

    _compileHasUnknownKeys(comp: JitCompiler): string {
        const childrenCode = this.getJitChildren()
            .map((child) => {
                const code = child.compileHasUnknownKeys(comp);
                return code ? `if (${code}) return true;` : '';
            })
            .filter(Boolean)
            .join('');
        if (!childrenCode) return 'return false';
        const entry = this.getCustomVλl(comp).vλl;
        return `
            if (!(${comp.vλl} instanceof ${this.instance})) return false;
            for (const ${entry} of ${comp.vλl}) {${childrenCode}} return false;
        `;
    }

    _compileUnknownKeyErrors(comp: JitErrorsCompiler): string {
        const childrenCodes = this.getJitChildren()
            .map((child) => child.compileUnknownKeyErrors(comp))
            .filter(Boolean)
            .join(';');
        if (!childrenCodes) return '';
        const entry = this.getCustomVλl(comp).vλl;
        const index = this.getIndexVarName();
        return `
            if (!(${comp.vλl} instanceof ${this.instance})) return;
            let ${index} = 0; for (const ${entry} of ${comp.vλl}) {${childrenCodes}; ${index}++}
        `;
    }

    _compileStripUnknownKeys(comp: JitCompiler): string {
        const childrenCodes = this.getJitChildren()
            .map((child) => child.compileStripUnknownKeys(comp))
            .filter(Boolean)
            .join(';');
        if (!childrenCodes) return '';
        const entry = this.getCustomVλl(comp).vλl;
        return `
            if (!(${comp.vλl} instanceof ${this.instance})) return;
            for (const ${entry} of ${comp.vλl}) {${childrenCodes}}
        `;
    }

    _compileUnknownKeysToUndefined(comp: JitCompiler): string {
        const childrenCodes = this.getJitChildren()
            .map((child) => child.compileUnknownKeysToUndefined(comp))
            .filter(Boolean)
            .join(';');
        if (!childrenCodes) return '';
        const entry = this.getCustomVλl(comp).vλl;
        return `
            if (!(${comp.vλl} instanceof ${this.instance})) return;
            for (const ${entry} of ${comp.vλl}) {${childrenCodes}}
        `;
    }
}
