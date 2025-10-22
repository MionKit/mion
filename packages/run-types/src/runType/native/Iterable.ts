/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {JitCode} from '../../types';
import {ClassRunType} from '../collection/class';
import {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {BaseRunType} from '../../lib/baseRunTypes';

// This is the base class for all iterable run types, like SetRunType and MapRunType
export abstract class IterableRunType extends ClassRunType {
    abstract children: BaseRunType[];
    abstract instance: string;
    getIndexVarName(comp: JitCompiler): string {
        return `e${comp.getNestLevel(this)}`;
    }
    getChildRunTypes = (): BaseRunType[] => {
        return this.children;
    };
    visitIsType(comp: JitCompiler): JitCode {
        const entry = this.getCustomVλl(comp)?.vλl || comp.vλl;
        const childrenCode = this.getJitChildren(comp)
            .map((c) => `if (!(${comp.compileIsType(c, 'E').code})) return false`)
            .join(';');
        return {
            code: `
            if (!(${comp.vλl} instanceof ${this.instance})) return false;
            for (const ${entry} of ${comp.vλl}) {${childrenCode}} return true;
        `,
            type: 'RB',
        };
    }
    visitTypeErrors(comp: JitErrorsCompiler): JitCode {
        const entry = this.getCustomVλl(comp)?.vλl || comp.vλl;
        const childrenCode = this.getJitChildren(comp)
            .map((c) => comp.compileTypeErrors(c, 'S').code)
            .join(';');
        const index = this.getIndexVarName(comp);
        return {
            code: `
            if (!(${comp.vλl} instanceof ${this.instance})){${comp.callJitErr(this)}}
            else {let ${index} = 0;for (const ${entry} of ${comp.vλl}) {${childrenCode}; ${index}++}}
        `,
            type: 'S',
        };
    }
    visitToJsonVal(comp: JitCompiler): JitCode {
        const entry = this.getCustomVλl(comp)?.vλl || comp.vλl;
        const resName = `ml${comp.getNestLevel(this)}`;
        const childrenCode = this.getJitChildren(comp)
            .map((c) => comp.compileToJsonVal(c, 'S').code)
            .filter(Boolean)
            .join(';');
        if (!childrenCode) return {code: `${comp.vλl} = Array.from(${comp.vλl})`, type: 'S'};
        return {
            code: `
            const ${resName} = [];
            for (let ${entry} of ${comp.vλl}) {${childrenCode} ${resName}.push(${entry})}
            ${comp.vλl} = ${resName};
        `,
            type: 'S',
        };
    }
    visitFromJsonVal(comp: JitCompiler): JitCode {
        const children = this.getJitChildren(comp);
        if (!children.length) return {code: `${comp.vλl} = new Map(${comp.vλl})`, type: 'S'};
        const index = this.getCustomVλl(comp)?.vλl || comp.vλl;
        const childrenCode = children
            .map((c) => comp.compileFromJsonVal(c, 'S').code)
            .filter(Boolean)
            .join(';');
        if (!childrenCode) return {code: `${comp.vλl} = new ${this.instance}(${comp.vλl})`, type: 'S'};
        return {
            code: `
            for (let ${index} = 0; ${index} < ${comp.vλl}.length; ${index}++) {${childrenCode}}
            ${comp.vλl} = new ${this.instance}(${comp.vλl})
        `,
            type: 'S',
        };
    }

    // TODO: Implement the following methods, should just call same compile method for children, look into to array run type

    visitHasUnknownKeys(comp: JitCompiler): JitCode {
        const childrenCode = this.getJitChildren(comp)
            .map((child) => {
                const itemJit = comp.compileHasUnknownKeys(child, 'E');
                return itemJit?.code ? `if (${itemJit.code}) return true;` : '';
            })
            .filter(Boolean)
            .join('');
        if (!childrenCode) return {code: 'return false', type: 'RB'};
        const entry = this.getCustomVλl(comp)?.vλl || comp.vλl;
        return {
            code: `
            if (!(${comp.vλl} instanceof ${this.instance})) return false;
            for (const ${entry} of ${comp.vλl}) {${childrenCode}} return false;
        `,
            type: 'RB',
        };
    }

    visitUnknownKeyErrors(comp: JitErrorsCompiler): JitCode {
        const childrenCode = this.getJitChildren(comp)
            .map((child) => comp.compileUnknownKeyErrors(child, 'S').code)
            .filter(Boolean)
            .join(';');
        if (!childrenCode) return {code: undefined, type: 'S'};
        const entry = this.getCustomVλl(comp)?.vλl || comp.vλl;
        const index = this.getIndexVarName(comp);
        return {
            code: `
            if (!(${comp.vλl} instanceof ${this.instance})) return;
            let ${index} = 0; for (const ${entry} of ${comp.vλl}) {${childrenCode}; ${index}++}
        `,
            type: 'S',
        };
    }

    visitStripUnknownKeys(comp: JitCompiler): JitCode {
        const childrenCode = this.getJitChildren(comp)
            .map((child) => comp.compileStripUnknownKeys(child, 'S').code)
            .filter(Boolean)
            .join(';');
        if (!childrenCode) return {code: undefined, type: 'S'};
        const entry = this.getCustomVλl(comp)?.vλl || comp.vλl;
        return {
            code: `
            if (!(${comp.vλl} instanceof ${this.instance})) return;
            for (const ${entry} of ${comp.vλl}) {${childrenCode}}
        `,
            type: 'S',
        };
    }

    visitUnknownKeysToUndefined(comp: JitCompiler): JitCode {
        const childrenCode = this.getJitChildren(comp)
            .map((child) => comp.compileUnknownKeysToUndefined(child, 'S').code)
            .filter(Boolean)
            .join(';');
        if (!childrenCode) return {code: undefined, type: 'S'};
        const entry = this.getCustomVλl(comp)?.vλl || comp.vλl;
        return {
            code: `
            if (!(${comp.vλl} instanceof ${this.instance})) return;
            for (const ${entry} of ${comp.vλl}) {${childrenCode}}
        `,
            type: 'S',
        };
    }
}
