import {createBinaryEncoderFn, createBinarySizerFn} from '@mionjs/run-types';

interface Message {
  from: string;
  text: string;
}

const message: Message = {from: 'ana', text: 'hello'};

// start-strategies
// 'dynamic' (default): the buffer grows when needed.
const encode = createBinaryEncoderFn<Message>();
encode(message);

// 'precalculate': measures the value first, then writes into a buffer of the exact size.
const encodeExact = createBinaryEncoderFn<Message>(undefined, {
  sizeStrategy: 'precalculate',
});
encodeExact(message);

// 'initialSize': you pass the buffer size on each call. Throws a RangeError if the value does not fit.
const encodeSized = createBinaryEncoderFn<Message>(undefined, {
  sizeStrategy: 'initialSize',
});
encodeSized(message, 64);

// 'intoBuffer': writes into your own ArrayBuffer. Throws a RangeError if the value does not fit.
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
