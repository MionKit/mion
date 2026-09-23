import {createJsonEncoderFn, createJsonDecoderFn} from '@mionjs/run-types';

interface Item {
  name: string;
  price: bigint;
}

// internalNote is not declared in Item
const item = {name: 'pen', price: 5n, internalNote: 'do not send'} as Item;

// start-encoders
const encodeClone = createJsonEncoderFn<Item>(); // same as {strategy: 'clone'}
encodeClone(item); // {"name":"pen","price":"5"}   item is unchanged

const encodeDirect = createJsonEncoderFn<Item>(undefined, {strategy: 'direct'});
encodeDirect(item); // {"name":"pen","price":"5"}   item is unchanged

const encodeCompact = createJsonEncoderFn<Item>(undefined, {
  strategy: 'compact',
});
encodeCompact(item); // ["pen","5"]   item is unchanged

const encodeMutate = createJsonEncoderFn<Item>(undefined, {strategy: 'mutate'});
encodeMutate(item); // {"name":"pen","price":"5","internalNote":"do not send"}   item.price is now '5'
// end-encoders

// start-decoders
const body = '{"name":"pen","price":"5","isAdmin":true}';

const decodeStrip = createJsonDecoderFn<Item>(); // same as {strategy: 'strip'}
decodeStrip(body); // {name: 'pen', price: 5n, isAdmin: undefined}

const decodePreserve = createJsonDecoderFn<Item>(undefined, {
  strategy: 'preserve',
});
decodePreserve(body); // {name: 'pen', price: 5n, isAdmin: true}

const decodeCompact = createJsonDecoderFn<Item>(undefined, {
  strategy: 'compact',
});
decodeCompact('["pen","5"]'); // {name: 'pen', price: 5n}
// end-decoders
