import {createBinaryEncoderFn, createBinarySizerFn} from '@mionjs/run-types';

interface Message {
  from: string;
  text: string;
}

const message: Message = {from: 'ana', text: 'hello'};

// start-strategies
// 'dynamic' is the default
const encode = createBinaryEncoderFn<Message>();
encode(message);

const encodeExact = createBinaryEncoderFn<Message>(undefined, {
  sizeStrategy: 'precalculate',
});
encodeExact(message);

const encodeSized = createBinaryEncoderFn<Message>(undefined, {
  sizeStrategy: 'initialSize',
});
encodeSized(message, 64);

const encodeInto = createBinaryEncoderFn<Message>(undefined, {
  sizeStrategy: 'intoBuffer',
});
const buffer = new ArrayBuffer(1024);
encodeInto(message, buffer);
// end-strategies

// start-sizer
const getMessageSize = createBinarySizerFn<Message>();
const size = getMessageSize(message); // 10, the exact number of bytes

encodeSized(message, size);
// end-sizer
