import {
  createBinaryEncoderFn,
  createBinaryDecoderFn,
  createBinarySizerFn,
} from '@mionjs/run-types';

type Tick = {symbol: string; price: number};

// start-reuse
const encode = createBinaryEncoderFn<Tick>(undefined, {
  sizeStrategy: 'intoBuffer',
});
const decode = createBinaryDecoderFn<Tick>();
const sizeOf = createBinarySizerFn<Tick>();

const ticks: Tick[] = [
  {symbol: 'TS', price: 7},
  {symbol: 'GO', price: 9},
];

const buffer = new ArrayBuffer(Math.max(...ticks.map(sizeOf)));

for (const tick of ticks) {
  const view = encode(tick, buffer); // a Uint8Array view into `buffer`
  decode(view); // consume the view before the next encode reuses the buffer
}
// end-reuse

const firstTick = decode(encode(ticks[0], buffer));

export {encode, decode, firstTick};
