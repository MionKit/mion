import {registerClassSerializer, createJsonEncoderFn, createJsonDecoderFn, type DataOnly} from '@ts-runtypes/core';

// A class with a non-empty constructor. The data goes on the wire structurally
// (just its declared properties), so you only have to teach ts-runtypes how to
// build a real instance back: pass the class itself and a `deserialize`.
// `serialize` is optional here (the default structural encode is exactly right).
class Money {
  constructor(
    public amount: number,
    public currency: string
  ) {}
  format(): string {
    return `${(this.amount / 100).toFixed(2)} ${this.currency}`;
  }
}

registerClassSerializer(Money, {
  // `data` is the data-only projection (methods already gone) -> a real instance
  deserialize: (data: DataOnly<Money>) => new Money(data.amount, data.currency),
});

// A class with a zero-argument constructor. There is nothing else to supply:
// the client just hands over the class. Decode rebuilds it with `new Settings()`
// and copies the decoded properties over.
class Settings {
  theme = 'light';
  fontSize = 12;
  summary(): string {
    return `${this.theme}/${this.fontSize}`;
  }
}

registerClassSerializer(Settings);

type Account = {id: string; balance: Money; settings: Settings};

const encode = createJsonEncoderFn<Account>();
const decode = createJsonDecoderFn<Account>();

const json = encode({id: 'acc_1', balance: new Money(4999, 'USD'), settings: new Settings()})!;
const back = decode(json); // back.balance is a real Money, back.settings a real Settings

export {Money, Settings, encode, decode, back};
export type {Account};
