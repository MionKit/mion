import {createJsonDecoderFn} from '@mionjs/run-types';

// A type with a method. Methods don't survive a JSON round-trip.
type Cart = {
  items: string[];
  total: number;
  checkout(): void;
};

// start-dataonly
const decode = createJsonDecoderFn<Cart>();

// The decoder returns DataOnly<Cart>, not Cart: the method is gone from the
// type because it was never on the wire. TS now stops you from calling it.
const cart = decode('{"items":["TS-7"],"total":42}');

cart.items; // string[]  ✅
cart.total; // number    ✅
// cart.checkout();      ❌ TS error: checkout isn't part of DataOnly<Cart>
// end-dataonly

export {cart};
