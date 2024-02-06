/* ########
 * 2021 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Type} from '@sinclair/typebox';
import {typeBox} from './reflection';

describe.skip('Standard JS Objects supported by typebox', () => {
    it('Promise', () => {
        type T = never;
        const boxType = typeBox<T>();
        expect(boxType).toEqual(Type.Never());
    });
    it('AsyncIterator', () => {
        type T = never;
        const boxType = typeBox<T>();
        expect(boxType).toEqual(Type.Never());
    });
    it('Iterator', () => {
        type T = never;
        const boxType = typeBox<T>();
        expect(boxType).toEqual(Type.Never());
    });
    it('RegExp', () => {
        type T = never;
        const boxType = typeBox<T>();
        expect(boxType).toEqual(Type.Never());
    });
    it('Uint8Array', () => {
        type T = never;
        const boxType = typeBox<T>();
        expect(boxType).toEqual(Type.Never());
    });
    it('Date', () => {
        type T = never;
        const boxType = typeBox<T>();
        expect(boxType).toEqual(Type.Never());
    });
});

describe.skip('Other Objects we might want to Implement', () => {
    it('Record', () => {
        type T = never;
        const boxType = typeBox<T>();
        expect(boxType).toEqual(Type.Never());
    });
    it('Map', () => {
        type T = never;
        const boxType = typeBox<T>();
        expect(boxType).toEqual(Type.Never());
    });
    it('Error', () => {
        type T = never;
        const boxType = typeBox<T>();
        expect(boxType).toEqual(Type.Never());
    });
    it('WeakMap', () => {
        type T = never;
        const boxType = typeBox<T>();
        expect(boxType).toEqual(Type.Never());
    });
    it('WeakSet', () => {
        type T = never;
        const boxType = typeBox<T>();
        expect(boxType).toEqual(Type.Never());
    });
});
