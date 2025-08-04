/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {jitCode} from '../../types';
import {ClassRunType} from '../collection/class';
import {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {BaseRunType} from '../../lib/baseRunTypes';
import {CodeType} from '../../constants.functions';

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

    _compileIsType(comp: JitCompiler): jitCode {
        const entry = this.getCustomVλl(comp)?.vλl || comp.vλl;
        const children = this.getJitChildren(comp)
            .map((c) => c.compileIsType(comp))
            .filter(Boolean);
        const childrenCode = children.map((c) => `if (!(${c!.code})) return false`).join(';');
        const code = `
            if (!(${comp.vλl} instanceof ${this.instance})) return false;
            for (const ${entry} of ${comp.vλl}) {${childrenCode}} return true;
        `;
        return {
            code,
            codeType: 'RB',
            skipJit: false,
            children,
        };
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        const entry = this.getCustomVλl(comp)?.vλl || comp.vλl;
        const children = this.getJitChildren(comp)
            .map((c) => c.compileTypeErrors(comp))
            .filter(Boolean);
        const childrenCode = children.map((c) => c!.code).join(';');
        const index = this.getIndexVarName(comp);
        const code = `
            if (!(${comp.vλl} instanceof ${this.instance})){${comp.callJitErr(this)}}
            else {let ${index} = 0;for (const ${entry} of ${comp.vλl}) {${childrenCode}; ${index}++}}
        `;
        return {
            code,
            codeType: 'S',
            skipJit: false,
            children,
        };
    }
    _compileToJsonVal(comp: JitCompiler): jitCode {
        const entry = this.getCustomVλl(comp)?.vλl || comp.vλl;
        const resName = `ml${comp.getNestLevel(this)}`;
        const children = this.getJitChildren(comp)
            .map((c) => c.compileToJsonVal(comp))
            .filter(Boolean);
        const childrenCode = children.map((c) => c!.code).join(';');
        if (!childrenCode) {
            return {
                code: `${comp.vλl} = Array.from(${comp.vλl})`,
                codeType: 'S',
                skipJit: false,
            };
        }
        const code = `
            const ${resName} = [];
            for (let ${entry} of ${comp.vλl}) {${childrenCode} ${resName}.push(${entry})}
            ${comp.vλl} = ${resName};
        `;
        return {
            code,
            codeType: 'S',
            skipJit: false,
            children,
        };
    }
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        const childrenRts = this.getJitChildren(comp);
        if (!childrenRts.length) {
            return {
                code: `${comp.vλl} = new ${this.instance}(${comp.vλl})`,
                codeType: 'S',
                skipJit: false,
            };
        }
        const index = this.getCustomVλl(comp)?.vλl || comp.vλl;
        const children = childrenRts.map((c) => c.compileFromJsonVal(comp)).filter(Boolean);
        const childrenCode = children.map((c) => c!.code).join(';');
        if (!childrenCode) {
            return {
                code: `${comp.vλl} = new ${this.instance}(${comp.vλl})`,
                codeType: 'S',
                skipJit: false,
            };
        }
        const code = `
            for (let ${index} = 0; ${index} < ${comp.vλl}.length; ${index}++) {${childrenCode}}
            ${comp.vλl} = new ${this.instance}(${comp.vλl})
        `;
        return {
            code,
            codeType: 'S',
            skipJit: false,
            children,
        };
    }

    // TODO: Implement the following methods, should just call same compile method for children, look into to array run type

    _compileHasUnknownKeys(comp: JitCompiler): jitCode {
        const children = this.getJitChildren(comp)
            .map((child) => child.compileHasUnknownKeys(comp))
            .filter(Boolean);
        const childrenCode = children.map((child) => `if (${child!.code}) return true;`).join('');
        if (!childrenCode) {
            return {
                code: 'return false',
                codeType: 'S',
                skipJit: false,
            };
        }
        const entry = this.getCustomVλl(comp)?.vλl || comp.vλl;
        const code = `
            if (!(${comp.vλl} instanceof ${this.instance})) return false;
            for (const ${entry} of ${comp.vλl}) {${childrenCode}} return false;
        `;
        return {
            code,
            codeType: 'S',
            skipJit: false,
            children,
        };
    }

    _compileUnknownKeyErrors(comp: JitErrorsCompiler): jitCode {
        const children = this.getJitChildren(comp)
            .map((child) => child.compileUnknownKeyErrors(comp))
            .filter(Boolean);
        const childrenCodes = children.map((c) => c!.code).join(';');
        if (!childrenCodes) return undefined;
        const entry = this.getCustomVλl(comp)?.vλl || comp.vλl;
        const index = this.getIndexVarName(comp);
        const code = `
            if (!(${comp.vλl} instanceof ${this.instance})) return;
            let ${index} = 0; for (const ${entry} of ${comp.vλl}) {${childrenCodes}; ${index}++}
        `;
        return {
            code,
            codeType: 'S',
            skipJit: false,
            children,
        };
    }

    _compileStripUnknownKeys(comp: JitCompiler): jitCode {
        const children = this.getJitChildren(comp)
            .map((child) => child.compileStripUnknownKeys(comp))
            .filter(Boolean);
        const childrenCodes = children.map((c) => c!.code).join(';');
        if (!childrenCodes) return undefined;
        const entry = this.getCustomVλl(comp)?.vλl || comp.vλl;
        const code = `
            if (!(${comp.vλl} instanceof ${this.instance})) return;
            for (const ${entry} of ${comp.vλl}) {${childrenCodes}}
        `;
        return {
            code,
            codeType: 'S',
            skipJit: false,
            children,
        };
    }

    _compileUnknownKeysToUndefined(comp: JitCompiler): jitCode {
        const children = this.getJitChildren(comp)
            .map((child) => child.compileUnknownKeysToUndefined(comp))
            .filter(Boolean);
        const childrenCodes = children.map((c) => c!.code).join(';');
        if (!childrenCodes) return undefined;
        const entry = this.getCustomVλl(comp)?.vλl || comp.vλl;
        const code = `
            if (!(${comp.vλl} instanceof ${this.instance})) return;
            for (const ${entry} of ${comp.vλl}) {${childrenCodes}}
        `;
        return {
            code,
            codeType: 'S',
            skipJit: false,
            children,
        };
    }
}
