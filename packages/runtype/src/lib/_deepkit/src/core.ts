/*
 * Deepkit Framework
 * Copyright (c) Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { ClassType } from '@deepkit/core';

//on unpopulated properties access
export enum UnpopulatedCheck {
    None, //returns undefined
    Throw, //throws regular error
    ReturnSymbol, //returns `unpopulatedSymbol`
}

export const unpopulatedSymbol = Symbol('unpopulated');

export interface TypeSettings {
    registeredEntities: { [name: string]: ClassType };
    unpopulatedCheck: UnpopulatedCheck;
}

export const typeSettings: TypeSettings = { registeredEntities: {}, unpopulatedCheck: UnpopulatedCheck.Throw };

export interface TypedArrayClassType<T> {
    new(...args: any[]): T;

    readonly BYTES_PER_ELEMENT: number;
}

export interface TypedArray {
    /**
     * The size in bytes of each element in the array.
     */
    readonly BYTES_PER_ELEMENT: number;

    /**
     * The ArrayBuffer instance referenced by the array.
     */
    readonly buffer: ArrayBufferLike;

    /**
     * The length of the array.
     */
    readonly length: number;

    /**
     * The length in bytes of the array.
     */
    readonly byteLength: number;

    /**
     * The offset in bytes of the array.
     */
    readonly byteOffset: number;
}
