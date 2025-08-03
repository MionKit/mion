/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {JitFnID, jitCode} from '../../types';
import {ClassRunType} from '../collection/class';
import {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {BaseRunType} from '../../lib/baseRunTypes';
import {CodeType} from '../../constants.functions';
import {JitFunctions} from '../../constants.functions';

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

    // Helper method to create jitCode objects
    createJitCode(code: string, fnID: JitFnID, skipJit = false, children?: jitCode[]): jitCode {
        return {
            code,
            codeType: fnID === JitFunctions.isType.id ? 'RB' : 'S',
            skipJit,
            children
        };
    }

    _compileIsType(comp: JitCompiler): jitCode {
        const entry = this.getCustomVλl(comp)?.vλl || comp.vλl;
        const children = this.getJitChildren(comp)
            .map((c) => c.compileIsType(comp))
            .filter(Boolean);
        const childrenCode = children.map(c => `if (!(${c!.code})) return false`).join(';');
        const code = `
            if (!(${comp.vλl} instanceof ${this.instance})) return false;
            for (const ${entry} of ${comp.vλl}) {${childrenCode}} return true;
        `;
        return this.createJitCode(code, JitFunctions.isType.id, false, children);
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        const entry = this.getCustomVλl(comp)?.vλl || comp.vλl;
        const children = this.getJitChildren(comp)
            .map((c) => c.compileTypeErrors(comp))
            .filter(Boolean);
        const childrenCode = children.map(c => c!.code).join(';');
        const index = this.getIndexVarName(comp);
        const code = `
            if (!(${comp.vλl} instanceof ${this.instance})){${comp.callJitErr(this)}}
            else {let ${index} = 0;for (const ${entry} of ${comp.vλl}) {${childrenCode}; ${index}++}}
        `;
        return this.createJitCode(code, JitFunctions.typeErrors.id, false, children);
    }
    _compileToJsonVal(comp: JitCompiler): jitCode {
        const entry = this.getCustomVλl(comp)?.vλl || comp.vλl;
        const resName = `ml${comp.getNestLevel(this)}`;
        const children = this.getJitChildren(comp)
            .map((c) => c.compileToJsonVal(comp))
            .filter(Boolean);
        const childrenCode = children.map(c => c!.code).join(';');
        if (!childrenCode) {
            return this.createJitCode(`${comp.vλl} = Array.from(${comp.vλl})`, JitFunctions.toJsonVal.id);
        }
        const code = `
            const ${resName} = [];
            for (let ${entry} of ${comp.vλl}) {${childrenCode} ${resName}.push(${entry})}
            ${comp.vλl} = ${resName};
        `;
        return this.createJitCode(code, JitFunctions.toJsonVal.id, false, children);
    }
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        const childrenRts = this.getJitChildren(comp);
        if (!childrenRts.length) {
            return this.createJitCode(`${comp.vλl} = new ${this.instance}(${comp.vλl})`, JitFunctions.fromJsonVal.id);
        }
        const index = this.getCustomVλl(comp)?.vλl || comp.vλl;
        const children = childrenRts
            .map((c) => c.compileFromJsonVal(comp))
            .filter(Boolean);
        const childrenCode = children.map(c => c!.code).join(';');
        if (!childrenCode) {
            return this.createJitCode(`${comp.vλl} = new ${this.instance}(${comp.vλl})`, JitFunctions.fromJsonVal.id);
        }
        const code = `
            for (let ${index} = 0; ${index} < ${comp.vλl}.length; ${index}++) {${childrenCode}}
            ${comp.vλl} = new ${this.instance}(${comp.vλl})
        `;
        return this.createJitCode(code, JitFunctions.fromJsonVal.id, false, children);
    }

    // TODO: Implement the following methods, should just call same compile method for children, look into to array run type

    _compileHasUnknownKeys(comp: JitCompiler): jitCode {
        const children = this.getJitChildren(comp)
            .map((child) => child.compileHasUnknownKeys(comp))
            .filter(Boolean);
        const childrenCode = children
            .map((child) => `if (${child!.code}) return true;`)
            .join('');
        if (!childrenCode) {
            return this.createJitCode('return false', JitFunctions.hasUnknownKeys.id);
        }
        const entry = this.getCustomVλl(comp)?.vλl || comp.vλl;
        const code = `
            if (!(${comp.vλl} instanceof ${this.instance})) return false;
            for (const ${entry} of ${comp.vλl}) {${childrenCode}} return false;
        `;
        return this.createJitCode(code, JitFunctions.hasUnknownKeys.id, false, children);
    }

    _compileUnknownKeyErrors(comp: JitErrorsCompiler): jitCode {
        const children = this.getJitChildren(comp)
            .map((child) => child.compileUnknownKeyErrors(comp))
            .filter(Boolean);
        const childrenCodes = children.map(c => c!.code).join(';');
        if (!childrenCodes) return undefined;
        const entry = this.getCustomVλl(comp)?.vλl || comp.vλl;
        const index = this.getIndexVarName(comp);
        const code = `
            if (!(${comp.vλl} instanceof ${this.instance})) return;
            let ${index} = 0; for (const ${entry} of ${comp.vλl}) {${childrenCodes}; ${index}++}
        `;
        return this.createJitCode(code, JitFunctions.unknownKeyErrors.id, false, children);
    }

    _compileStripUnknownKeys(comp: JitCompiler): jitCode {
        const children = this.getJitChildren(comp)
            .map((child) => child.compileStripUnknownKeys(comp))
            .filter(Boolean);
        const childrenCodes = children.map(c => c!.code).join(';');
        if (!childrenCodes) return undefined;
        const entry = this.getCustomVλl(comp)?.vλl || comp.vλl;
        const code = `
            if (!(${comp.vλl} instanceof ${this.instance})) return;
            for (const ${entry} of ${comp.vλl}) {${childrenCodes}}
        `;
        return this.createJitCode(code, JitFunctions.stripUnknownKeys.id, false, children);
    }

    _compileUnknownKeysToUndefined(comp: JitCompiler): jitCode {
        const children = this.getJitChildren(comp)
            .map((child) => child.compileUnknownKeysToUndefined(comp))
            .filter(Boolean);
        const childrenCodes = children.map(c => c!.code).join(';');
        if (!childrenCodes) return undefined;
        const entry = this.getCustomVλl(comp)?.vλl || comp.vλl;
        const code = `
            if (!(${comp.vλl} instanceof ${this.instance})) return;
            for (const ${entry} of ${comp.vλl}) {${childrenCodes}}
        `;
        return this.createJitCode(code, JitFunctions.unknownKeysToUndefined.id, false, children);
    }
}
