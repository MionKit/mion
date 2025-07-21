/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {JitFnID} from '../../types';
import {ClassRunType} from '../collection/class';
import {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {BaseRunType} from '../../lib/baseRunTypes';
import {CodeType} from '../../constants.functions';
import {JitFunctions} from '../../constants.functions';

// This is the base class for all iterable run types, like SetRunType and MapRunType
export abstract class IterableRunType extends ClassRunType {
    abstract children: BaseRunType[];
    abstract instance: string;
    getIndexVarName(): string {
        return `e${this.getNestLevel()}`;
    }
    getChildRunTypes = (): BaseRunType[] => {
        return this.children;
    };
    getCodeType(fnID: JitFnID): CodeType {
        switch (fnID) {
            case JitFunctions.isType.id:
            case JitFunctions.jsonStringify.id:
            case JitFunctions.hasUnknownKeys.id:
            case JitFunctions.toCode.id:
                return 'RB';
            default:
                return super.getCodeType(fnID);
        }
    }
    _compileIsType(comp: JitCompiler): string {
        const entry = this.getCustomVλl(comp)?.vλl || comp.vλl;
        const childrenCode = this.getJitChildren(comp)
            .map((c) => `if (!(${c.compileIsType(comp)})) return false`)
            .join(';');
        return `
            if (!(${comp.vλl} instanceof ${this.instance})) return false;
            for (const ${entry} of ${comp.vλl}) {${childrenCode}} return true;
        `;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        const entry = this.getCustomVλl(comp)?.vλl || comp.vλl;
        const childrenCode = this.getJitChildren(comp)
            .map((c) => c.compileTypeErrors(comp))
            .join(';');
        const index = this.getIndexVarName();
        return `
            if (!(${comp.vλl} instanceof ${this.instance})){${comp.callJitErr(this)}}
            else {let ${index} = 0;for (const ${entry} of ${comp.vλl}) {${childrenCode}; ${index}++}}
        `;
    }
    _compileToJsonVal(comp: JitCompiler): string {
        const entry = this.getCustomVλl(comp)?.vλl || comp.vλl;
        const resName = `ml${this.getNestLevel()}`;
        const childrenCode = this.getJitChildren(comp)
            .map((c) => c.compileToJsonVal(comp))
            .filter((c) => c)
            .join(';');
        if (!childrenCode) return `${comp.vλl} = Array.from(${comp.vλl})`;
        return `
            const ${resName} = [];
            for (let ${entry} of ${comp.vλl}) {${childrenCode} ${resName}.push(${entry})}
            ${comp.vλl} = ${resName};
        `;
    }
    _compileFromJsonVal(comp: JitCompiler): string {
        const children = this.getJitChildren(comp);
        if (!children.length) return `${comp.vλl} = new Map(${comp.vλl})`;
        const index = this.getCustomVλl(comp)?.vλl || comp.vλl;
        const childrenCode = children
            .map((c) => c.compileFromJsonVal(comp))
            .filter((c) => c)
            .join(';');
        if (!childrenCode) return `${comp.vλl} = new ${this.instance}(${comp.vλl})`;
        return `
            for (let ${index} = 0; ${index} < ${comp.vλl}.length; ${index}++) {${childrenCode}}
            ${comp.vλl} = new ${this.instance}(${comp.vλl})
        `;
    }

    // TODO: Implement the following methods, should just call same compile method for children, look into to array run type

    _compileHasUnknownKeys(comp: JitCompiler): string {
        const childrenCode = this.getJitChildren(comp)
            .map((child) => {
                const code = child.compileHasUnknownKeys(comp);
                return code ? `if (${code}) return true;` : '';
            })
            .filter(Boolean)
            .join('');
        if (!childrenCode) return 'return false';
        const entry = this.getCustomVλl(comp)?.vλl || comp.vλl;
        return `
            if (!(${comp.vλl} instanceof ${this.instance})) return false;
            for (const ${entry} of ${comp.vλl}) {${childrenCode}} return false;
        `;
    }

    _compileUnknownKeyErrors(comp: JitErrorsCompiler): string {
        const childrenCodes = this.getJitChildren(comp)
            .map((child) => child.compileUnknownKeyErrors(comp))
            .filter(Boolean)
            .join(';');
        if (!childrenCodes) return '';
        const entry = this.getCustomVλl(comp)?.vλl || comp.vλl;
        const index = this.getIndexVarName();
        return `
            if (!(${comp.vλl} instanceof ${this.instance})) return;
            let ${index} = 0; for (const ${entry} of ${comp.vλl}) {${childrenCodes}; ${index}++}
        `;
    }

    _compileStripUnknownKeys(comp: JitCompiler): string {
        const childrenCodes = this.getJitChildren(comp)
            .map((child) => child.compileStripUnknownKeys(comp))
            .filter(Boolean)
            .join(';');
        if (!childrenCodes) return '';
        const entry = this.getCustomVλl(comp)?.vλl || comp.vλl;
        return `
            if (!(${comp.vλl} instanceof ${this.instance})) return;
            for (const ${entry} of ${comp.vλl}) {${childrenCodes}}
        `;
    }

    _compileUnknownKeysToUndefined(comp: JitCompiler): string {
        const childrenCodes = this.getJitChildren(comp)
            .map((child) => child.compileUnknownKeysToUndefined(comp))
            .filter(Boolean)
            .join(';');
        if (!childrenCodes) return '';
        const entry = this.getCustomVλl(comp)?.vλl || comp.vλl;
        return `
            if (!(${comp.vλl} instanceof ${this.instance})) return;
            for (const ${entry} of ${comp.vλl}) {${childrenCodes}}
        `;
    }
}
