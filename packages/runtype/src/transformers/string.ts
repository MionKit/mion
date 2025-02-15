/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {JitRunTypeFormatter} from '../formats/typeFormat.runtypes';
import {ReflectionKind} from '../lib/_deepkit/src/reflection/type';

// toLowercase transformer
export class StringToLowercaseTransformer extends JitRunTypeFormatter {
    kind = ReflectionKind.string;
    name = 'lowercase';
    // TODO: transformers might need only one function
    _compileFromJsonVal(comp) {
        return `${comp.vλl}.toLowerCase()`;
    }
    _compileToJsonVal() {
        return undefined;
    }
    _compileJsonStringify(comp) {
        return `${comp.vλl}.toLowerCase()`;
    }
}

// toUppercase transformer
export class StringToUppercaseTransformer extends JitRunTypeFormatter {
    kind = ReflectionKind.string;
    name = 'uppercase';
    // TODO: transformers might need only one function
    _compileFromJsonVal(comp) {
        return `${comp.vλl}.toUpperCase()`;
    }
    _compileToJsonVal() {
        return undefined;
    }
    _compileJsonStringify(comp) {
        return `${comp.vλl}.toUpperCase()`;
    }
}

// capitalize transformer
export class StringCapitalizeTransformer extends JitRunTypeFormatter {
    kind = ReflectionKind.string;
    name = 'capitalize';
    // TODO: transformers might need only one function
    _compileFromJsonVal(comp) {
        return `${comp.vλl}.charAt(0).toUpperCase() + ${comp.vλl}.slice(1)`;
    }
    _compileToJsonVal() {
        return undefined;
    }
    _compileJsonStringify(comp) {
        return `${comp.vλl}.charAt(0).toUpperCase() + ${comp.vλl}.slice(1)`;
    }
}

// unCapitalize transformer
export class StringUnCapitalizeTransformer extends JitRunTypeFormatter {
    kind = ReflectionKind.string;
    name = 'unCapitalize';
    // TODO: transformers might need only one function
    _compileFromJsonVal(comp) {
        return `${comp.vλl}.charAt(0).toLowerCase() + ${comp.vλl}.slice(1)`;
    }
    _compileToJsonVal() {
        return undefined;
    }
    _compileJsonStringify(comp) {
        return `${comp.vλl}.charAt(0).toLowerCase() + ${comp.vλl}.slice(1)`;
    }
}
