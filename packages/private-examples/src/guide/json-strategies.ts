import {createJsonEncoderFn, createJsonDecoderFn} from '@mionjs/run-types';

interface Item {
  name: string;
  price: bigint;
}

// internalNote is not declared in Item
const item = {name: 'pen', price: 5n, internalNote: 'do not send'} as Item;

// start-strategies
const encodeClone = createJsonEncoderFn<Item>(); // same as {strategy: 'clone'}
encodeClone(item); // {"name":"pen","price":"5"}   item is unchanged

const encodeCompact = createJsonEncoderFn<Item>(undefined, {
  strategy: 'compact',
});
encodeCompact(item); // ["pen","5"]   item is unchanged

const encodeMutate = createJsonEncoderFn<Item>(undefined, {strategy: 'mutate'});
encodeMutate(item); // {"name":"pen","price":"5","internalNote":"do not send"}   item.price is now '5'

const body = '{"name":"pen","price":"5","isAdmin":true}';

const decodeClone = createJsonDecoderFn<Item>(); // same as {strategy: 'clone'}
decodeClone(body); // {name: 'pen', price: 5n}

const decodeMutate = createJsonDecoderFn<Item>(undefined, {
  strategy: 'mutate',
});
decodeMutate(body); // {name: 'pen', price: 5n, isAdmin: true}

const decodeCompact = createJsonDecoderFn<Item>(undefined, {
  strategy: 'compact',
});
decodeCompact('["pen","5"]'); // {name: 'pen', price: 5n}
// end-strategies
