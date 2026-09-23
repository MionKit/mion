import {createBinaryEncoderFn, createBinarySizerFn} from '@mionjs/run-types';

// start-sizing
type Tick = {symbol: string; price: number};

const sizeOfTick = createBinarySizerFn<Tick>();
const encodeTick = createBinaryEncoderFn<Tick>(undefined, {
  sizeStrategy: 'initialSize',
});

const tick = {symbol: 'TS', price: 7.5};
const size = sizeOfTick(tick); // 11: the exact byte count, nothing is allocated
const bytes = encodeTick(tick, size); // throws RangeError if size is too small
// end-sizing

export {bytes};
