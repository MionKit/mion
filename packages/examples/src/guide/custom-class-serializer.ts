import {
  createJsonEncoderFn,
  createJsonDecoderFn,
  type DataOnly,
} from '@mionjs/run-types';
import {registerClassSerializer} from '@mionjs/run-types/runtime';

class Money {
  constructor(
    public amount: number,
    public currency: string
  ) {}
  format(): string {
    return `${(this.amount / 100).toFixed(2)} ${this.currency}`;
  }
}

// a constructor with arguments needs a deserialize
registerClassSerializer(Money, {
  deserialize: (data: DataOnly<Money>) => new Money(data.amount, data.currency),
});

class Settings {
  theme = 'light';
  fontSize = 12;
  summary(): string {
    return `${this.theme}/${this.fontSize}`;
  }
}

// a zero-argument constructor needs only the class
registerClassSerializer(Settings);

type Account = {id: string; balance: Money; settings: Settings};

const encode = createJsonEncoderFn<Account>();
const decode = createJsonDecoderFn<Account>();

const json = encode({
  id: 'acc_1',
  balance: new Money(4999, 'USD'),
  settings: new Settings(),
})!;
const back = decode(json); // back.balance is a real Money, back.settings a real Settings

export {Money, Settings, encode, decode, back};
export type {Account};
