import {createJsonDecoderFn, createJsonEncoderFn} from '@mionjs/run-types';
import {registerClassSerializer} from '@mionjs/run-types/runtime';

// start-class
class Money {
  constructor(
    public cents: number,
    public currency: string
  ) {}
  format(): string {
    return `${(this.cents / 100).toFixed(2)} ${this.currency}`;
  }
}

// the constructor takes arguments, so deserialize is required
registerClassSerializer(Money, {
  deserialize: (data) => new Money(data.cents, data.currency),
});

const encodeMoney = createJsonEncoderFn<Money>();
const decodeMoney = createJsonDecoderFn<Money>();

const price = decodeMoney(encodeMoney(new Money(4999, 'USD'))!) as Money; // the return type is DataOnly<Money>
price.format(); // '49.99 USD'
// end-class

export {price};
