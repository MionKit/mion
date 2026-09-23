import {createBinaryDecoderFn, createBinaryEncoderFn} from '@mionjs/run-types';

// start-basics
type Tick = {symbol: string; price: number; at: Date};

const encodeTick = createBinaryEncoderFn<Tick>();
const decodeTick = createBinaryDecoderFn<Tick>();

const bytes = encodeTick({symbol: 'TS', price: 7.5, at: new Date(0)}); // a 19-byte Uint8Array
const tick = decodeTick(bytes); // also takes an ArrayBuffer or any typed array
// end-basics

export {bytes, tick};
