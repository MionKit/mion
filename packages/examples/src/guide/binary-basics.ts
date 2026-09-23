import {createBinaryEncoderFn, createBinaryDecoderFn} from '@mionjs/run-types';

interface Reading {
  sensor: string;
  value: number;
  at: Date;
  note?: string;
}

const encodeReading = createBinaryEncoderFn<Reading>();
const decodeReading = createBinaryDecoderFn<Reading>();

const bytes = encodeReading({
  sensor: 'temp-1',
  value: 21.5,
  at: new Date('2024-05-01T10:00:00.000Z'),
});
bytes.byteLength; // 24

// also takes any typed array view or an ArrayBuffer
const reading = decodeReading(bytes); // at is a Date, note is absent

export {reading};
