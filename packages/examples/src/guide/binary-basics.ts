import {createBinaryEncoderFn, createBinaryDecoderFn} from '@ts-runtypes/core';

type Telemetry = {
  deviceId: string;
  temperature: number;
  readings: number[];
  recordedAt: Date;
};

const sample: Telemetry = {
  deviceId: 'sensor-7',
  temperature: 21.4,
  readings: [21.1, 21.3, 21.4],
  recordedAt: new Date('2026-01-01T00:00:00Z'),
};

// start-roundtrip
const encode = createBinaryEncoderFn<Telemetry>();
const decode = createBinaryDecoderFn<Telemetry>();

const bytes = encode(sample); // a Uint8Array view of the encoded bytes: compact, no field names on the wire
const back = decode(bytes); // decode reads the bytes directly; typed as DataOnly<Telemetry>

back.recordedAt instanceof Date; // true: Date round-trips, like JSON
// end-roundtrip

export {encode, decode, bytes, back};
