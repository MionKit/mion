import {createJsonDecoderFn, createJsonEncoderFn} from '@mionjs/run-types';

interface Account {
  id: string;
  balance: number;
  describe(): string; // a method, so it is left out
}

const encodeAccount = createJsonEncoderFn<Account>();
const decodeAccount = createJsonDecoderFn<Account>();

const account: Account = {id: 'a1', balance: 10, describe: () => 'a1: 10'};
const json = encodeAccount(account) as string; // {"id":"a1","balance":10}

const decoded = decodeAccount(json);
// decoded type is {id: string; balance: number}, with no describe()

export {decoded};
