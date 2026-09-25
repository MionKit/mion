import {createJsonEncoderFn, createJsonDecoderFn} from '@mionjs/run-types';
import {registerClassSerializer} from '@mionjs/run-types/runtime';

class Money {
  constructor(
    public amount: number,
    public currency: string
  ) {}
  format(): string {
    return `${this.amount} ${this.currency}`;
  }
}

// the constructor takes arguments, so say how to rebuild it
registerClassSerializer(Money, {
  deserialize: (data) => new Money(data.amount, data.currency),
});

const encodeMoney = createJsonEncoderFn<Money>();
const decodeMoney = createJsonDecoderFn<Money>();

// decoded as data only, so cast to get the methods back
const price = decodeMoney(
  encodeMoney(new Money(4999, 'USD')) as string
) as Money;
price instanceof Money; // true
price.format(); // '4999 USD'
