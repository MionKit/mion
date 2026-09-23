import {
  createBinaryDecoderFn,
  createBinaryEncoderFn,
  createDataViewDeserializer,
} from '@mionjs/run-types';

type Tick = {symbol: string; price: number};
const ticks: Tick[] = [
  {symbol: 'TS', price: 7},
  {symbol: 'GO', price: 9},
];

// start-reuse
const encodeInto = createBinaryEncoderFn<Tick>(undefined, {
  sizeStrategy: 'intoBuffer',
});
const decodeTick = createBinaryDecoderFn<Tick>();

const buffer = new ArrayBuffer(1024);
const reader = createDataViewDeserializer('ticks', buffer);

for (const tick of ticks) {
  encodeInto(tick, buffer); // overwrites the start of buffer
  reader.reset(); // read again from byte 0
  decodeTick(reader);
}
// end-reuse

export {encodeInto, decodeTick};
