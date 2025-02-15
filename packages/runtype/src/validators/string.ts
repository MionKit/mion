/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {JitRunTypeValidator} from '../formats/typeFormat.runtypes';
import {ReflectionKind} from '../lib/_deepkit/src/reflection/type';
import {toLiteral} from '../lib/utils';

// maxLength validator
export class StringMaxLengthValidator extends JitRunTypeValidator {
    kind = ReflectionKind.string;
    name = 'maxLength';
    _compileIsType(comp, rt): string {
        const typeParam = rt.getTypeFormatParam(this.name, 'number') as number;
        return `${comp.vλl}.length <= ${typeParam}`;
    }
    _compileTypeErrors(comp, rt): string {
        return `if (!(${this._compileIsType(comp, rt)})) ${comp.callJitErr(this.name)}`;
    }
}

// minLength validator
export class StringMinLengthValidator extends JitRunTypeValidator {
    kind = ReflectionKind.string;
    name = 'minLength';
    _compileIsType(comp, rt): string {
        const typeParam = rt.getTypeFormatParam(this.name, 'number') as number;
        return `${comp.vλl}.length >= ${typeParam}`;
    }
    _compileTypeErrors(comp, rt): string {
        return `if (!(${this._compileIsType(comp, rt)})) ${comp.callJitErr(this.name)}`;
    }
}

// length validator
export class StringLengthValidator extends JitRunTypeValidator {
    kind = ReflectionKind.string;
    name = 'length';
    _compileIsType(comp, rt): string {
        const typeParam = rt.getTypeFormatParam(this.name, 'number') as number;
        return `${comp.vλl}.length === ${typeParam}`;
    }
    _compileTypeErrors(comp, rt): string {
        return `if (!(${this._compileIsType(comp, rt)})) ${comp.callJitErr(this.name)}`;
    }
}

// pattern validator
export class StringPatternValidator extends JitRunTypeValidator {
    kind = ReflectionKind.string;
    name = 'pattern';
    _compileIsType(comp, rt): string {
        const typeParam = rt.getTypeFormatParam(this.name, 'object') as RegExp;
        if (!(typeParam instanceof RegExp))
            throw new Error(`Type option ${this.name} for ${rt.getName()} must be a Regular Expression`);
        const regexpVarName = `regexp${rt.getNestLevel()}_${comp.contextCodeItems.size}`;
        comp.contextCodeItems.set(regexpVarName, `const ${regexpVarName} = ${typeParam}`);
        return `${regexpVarName}.test(${comp.vλl})`;
    }
    _compileTypeErrors(comp, rt): string {
        return `if (!(${this._compileIsType(comp, rt)})) ${comp.callJitErr(this.name)}`;
    }
}

// allowedChars validator
export class StringAllowedCharsValidator extends JitRunTypeValidator {
    kind = ReflectionKind.string;
    name = 'allowedChars';
    _compileIsType(comp, rt): string {
        const typeParam = rt.getTypeFormatParam(this.name, 'string') as string;
        const auxFn = `allowedCharsFn${rt.getNestLevel()}_${comp.contextCodeItems.size}`;
        const auxCode = `function ${auxFn}(s, allCh) {for (let i = 0; i < s.length; i++) {if (!allCh.includes(s[i])) return false;} return true;}`;
        comp.contextCodeItems.set(auxFn, auxCode);
        return `${auxFn}(${comp.vλl}, ${toLiteral(typeParam)})`;
    }
    _compileTypeErrors(comp, rt): string {
        return `if (!(${this._compileIsType(comp, rt)})) ${comp.callJitErr(this.name)}`;
    }
}

// disallowedChars validator
export class StringDisallowedCharsValidator extends JitRunTypeValidator {
    kind = ReflectionKind.string;
    name = 'disallowedChars';
    _compileIsType(comp, rt): string {
        const typeParam = rt.getTypeFormatParam(this.name, 'string') as string;
        const auxFn = `disallowedCharsFn${rt.getNestLevel()}_${comp.contextCodeItems.size}`;
        const auxCode = `function ${auxFn}(s, disCh) {for (let i = 0; i < disCh.length; i++) {if (s.includes(disCh[i])) return false;} return true;}`;
        comp.contextCodeItems.set(auxFn, auxCode);
        return `${auxFn}(${comp.vλl}, ${toLiteral(typeParam)})`;
    }
    _compileTypeErrors(comp, rt): string {
        return `if (!(${this._compileIsType(comp, rt)})) ${comp.callJitErr(this.name)}`;
    }
}
