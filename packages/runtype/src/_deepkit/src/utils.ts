/*
 * Deepkit Framework
 * Copyright (c) Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */


export class NoTypeReceived extends Error {
    constructor(message: string = 'No type information received. Circular import or no runtime type available.') {
        super(message);
    }
}

export type Binary = ArrayBuffer | Uint8Array | Int8Array | Uint8ClampedArray | Uint16Array | Int16Array | Uint32Array | Int32Array | Float32Array | Float64Array;

export function regExpFromString(v: string): RegExp {
    if (v[0] === '/') {
        const end = v.lastIndexOf('/');
        const regexp = v.slice(1, end);
        const modifiers = v.slice(1 + end);
        return new RegExp(regexp, modifiers);
    }
    return new RegExp(v);
}
