/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {JitRunTypeFormatter} from '../lib/types';
import {ReflectionKind} from '../lib/_deepkit/src/reflection/type';

// toLowercase transformer
export const stringToLowercaseTransformer = {
    kind: ReflectionKind.string,
    name: 'lowercase',
    // TODO: transformers might need only one function
    _compileFromJsonVal: (comp) => {
        return `${comp.vλl}.toLowerCase()`;
    },
    _compileToJsonVal: () => {
        return undefined;
    },
    _compileJsonStringify: (comp) => {
        return `${comp.vλl}.toLowerCase()`;
    },
} satisfies JitRunTypeFormatter;

// toUppercase transformer
export const stringToUppercaseTransformer = {
    kind: ReflectionKind.string,
    name: 'uppercase',
    // TODO: transformers might need only one function
    _compileFromJsonVal: (comp) => {
        return `${comp.vλl}.toUpperCase()`;
    },
    _compileToJsonVal: () => {
        return undefined;
    },
    _compileJsonStringify: (comp) => {
        return `${comp.vλl}.toUpperCase()`;
    },
} satisfies JitRunTypeFormatter;

// capitalize transformer
export const stringCapitalizeTransformer = {
    kind: ReflectionKind.string,
    name: 'capitalize',
    // TODO: transformers might need only one function
    _compileFromJsonVal: (comp) => {
        return `${comp.vλl}.charAt(0).toUpperCase() + ${comp.vλl}.slice(1)`;
    },
    _compileToJsonVal: () => {
        return undefined;
    },
    _compileJsonStringify: (comp) => {
        return `${comp.vλl}.charAt(0).toUpperCase() + ${comp.vλl}.slice(1)`;
    },
} satisfies JitRunTypeFormatter;

// unCapitalize transformer
export const stringUnCapitalizeTransformer = {
    kind: ReflectionKind.string,
    name: 'unCapitalize',
    // TODO: transformers might need only one function
    _compileFromJsonVal: (comp) => {
        return `${comp.vλl}.charAt(0).toLowerCase() + ${comp.vλl}.slice(1)`;
    },
    _compileToJsonVal: () => {
        return undefined;
    },
    _compileJsonStringify: (comp) => {
        return `${comp.vλl}.charAt(0).toLowerCase() + ${comp.vλl}.slice(1)`;
    },
} satisfies JitRunTypeFormatter;
