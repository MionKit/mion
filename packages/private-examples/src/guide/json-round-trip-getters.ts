import {createJsonEncoderFn, createValidateFn} from '@mionjs/run-types';

class Account {
  name = 'Ana';
  #cents = 100;
  get cents(): number {
    return this.#cents;
  }
  set cents(value: number) {
    this.#cents = value;
  }
  get label(): string {
    return `${this.name}: ${this.#cents}`;
  }
}

JSON.stringify(new Account()); // '{"name":"Ana"}'

const encodeAccount = createJsonEncoderFn<Account>();
encodeAccount(new Account()); // '{"name":"Ana","cents":100,"label":"Ana: 100"}'

const isAccount = createValidateFn<Account>(undefined, {checkUnknowns: true});
isAccount(new Account()); // true, an extra key still fails
