import {createJsonDecoderFn} from '@mionjs/run-types';

type Cart = {
  items: string[];
  total: number;
  checkout(): void;
};

// start-dataonly
const decode = createJsonDecoderFn<Cart>();

// DataOnly<Cart> has no checkout: it was never on the wire
const cart = decode('{"items":["TS-7"],"total":42}');

cart.items; // string[]  ✅
cart.total; // number    ✅
// cart.checkout();      ❌ TS error: checkout isn't part of DataOnly<Cart>
// end-dataonly

export {cart};
