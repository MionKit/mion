/* ########
 * 2021 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Type} from '@sinclair/typebox';
import {typeBox} from './reflection';
import {TypeCompiler} from '@sinclair/typebox/compiler';

describe('native types', () => {
    it('new RegExp', () => {
        // (typeof not working)
        // const reg = new RegExp('foo', 'i');
        // type T = typeof reg;
        // const boxType = typeBox<T>();
        // expect(boxType).toEqual(Type.RegExp(reg));
    });
    it('RegExp', () => {
        type T = RegExp;
        const boxType = typeBox<T>();
        expect(boxType).toEqual(Type.RegExp(new RegExp('')));
    });
    it('Promise', () => {
        type T = Promise<string>;
        const boxType = typeBox<T>();
        expect(boxType).toEqual(Type.Promise(Type.String()));
    });
    it('new Promise', () => {
        // (typeof not working)
        // const promise: Promise<string> = new Promise<string>((resolve, reject) => {
        //     /* ... */
        // });
        // const boxType = typeBox<typeof promise>();
        // expect(boxType).toEqual(Type.Promise(Type.String()));
    });
    it('AsyncIterator', () => {
        type T = AsyncIterator<string>;
        const boxType = typeBox<T>();
        expect(boxType).toEqual(Type.AsyncIterator(Type.String()));
    });
    it('Iterator', () => {
        type T = Iterator<string>;
        const boxType = typeBox<T>();
        expect(boxType).toEqual(Type.Iterator(Type.String()));
    });
    it('Uint8Array', () => {
        type T = Uint8Array;
        const boxType = typeBox<T>();
        expect(boxType).toEqual(Type.Uint8Array());
    });
    it('Date', () => {
        type T = Date;
        const boxType = typeBox<T>();
        expect(boxType).toEqual(Type.Date());

        const d = new Date();
        const boxType2 = typeBox<typeof d>();
        expect(boxType2).toEqual(Type.Date());
    });
});

describe.skip('Other native types that are not implemented by Typebox', () => {
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
