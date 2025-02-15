/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {JitRunTypeTransformer} from '../lib/types';
import {ReflectionKind} from '../lib/_deepkit/src/reflection/type';

export type StringTransformParams = {
    toLowercase?: boolean;
    toUppercase?: boolean;
    capitalize?: boolean;
    unCapitalize?: boolean;
};

// toLowercase transformer
export const stringToLowercaseTransformer = {
    kind: ReflectionKind.string,
    name: 'toLowercase',
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
} satisfies JitRunTypeTransformer;

// toUppercase transformer
export const stringToUppercaseTransformer = {
    kind: ReflectionKind.string,
    name: 'toUppercase',
    _compileFromJsonVal: (comp) => {
        return `${comp.vλl}.toUpperCase()`;
    },
    _compileToJsonVal: () => {
        return undefined;
    },
    _compileJsonStringify: (comp) => {
        return `${comp.vλl}.toUpperCase()`;
    },
} satisfies JitRunTypeTransformer;

// capitalize transformer
export const stringCapitalizeTransformer = {
    kind: ReflectionKind.string,
    name: 'capitalize',
    _compileFromJsonVal: (comp) => {
        return `${comp.vλl}.charAt(0).toUpperCase() + ${comp.vλl}.slice(1)`;
    },
    _compileToJsonVal: () => {
        return undefined;
    },
    _compileJsonStringify: (comp) => {
        return `${comp.vλl}.charAt(0).toUpperCase() + ${comp.vλl}.slice(1)`;
    },
} satisfies JitRunTypeTransformer;

// unCapitalize transformer
export const stringUnCapitalizeTransformer = {
    kind: ReflectionKind.string,
    name: 'unCapitalize',
    _compileFromJsonVal: (comp) => {
        return `${comp.vλl}.charAt(0).toLowerCase() + ${comp.vλl}.slice(1)`;
    },
    _compileToJsonVal: () => {
        return undefined;
    },
    _compileJsonStringify: (comp) => {
        return `${comp.vλl}.charAt(0).toLowerCase() + ${comp.vλl}.slice(1)`;
    },
} satisfies JitRunTypeTransformer;
