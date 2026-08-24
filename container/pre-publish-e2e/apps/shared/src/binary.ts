// Family 5 — Binary codec. Mirrors guide/binary-basics.ts + binary-reuse.ts.
// Round-trip, the sizer, and buffer reuse via the 'intoBuffer' size strategy.
import {createBinaryEncoderFn, createBinaryDecoderFn, createBinarySizerFn} from '@ts-runtypes/core';
import {type CheckResult, ok} from './check';

export interface Telemetry {
  deviceId: string;
  temperature: number;
  readings: number[];
  recordedAt: Date;
}

interface Tick {
  symbol: string;
  price: number;
}

export const encodeTelemetry = createBinaryEncoderFn<Telemetry>();
export const decodeTelemetry = createBinaryDecoderFn<Telemetry>();

export const encodeTickInto = createBinaryEncoderFn<Tick>(undefined, {sizeStrategy: 'intoBuffer'});
export const decodeTick = createBinaryDecoderFn<Tick>();
export const sizeOfTick = createBinarySizerFn<Tick>();

export function checkBinary(): CheckResult[] {
  const sample: Telemetry = {
    deviceId: 'sensor-7',
    temperature: 21.4,
    readings: [21.1, 21.3, 21.4],
    recordedAt: new Date('2026-01-01T00:00:00Z'),
  };
  const bytes = encodeTelemetry(sample);
  const back = decodeTelemetry(bytes);

  // Buffer reuse: one allocation, encode into it, decode the view before reuse.
  const ticks: Tick[] = [
    {symbol: 'TS', price: 7},
    {symbol: 'GO', price: 9},
  ];
  const buffer = new ArrayBuffer(Math.max(...ticks.map(sizeOfTick)));
  const decodedSymbols: string[] = [];
  for (const tick of ticks) {
    const view = encodeTickInto(tick, buffer);
    decodedSymbols.push(decodeTick(view).symbol);
  }

  return [
    ok('binary: encode produces bytes', bytes instanceof Uint8Array && bytes.byteLength > 0),
    ok('binary: Date round-trips as a Date', back.recordedAt instanceof Date),
    ok('binary: readings round-trip', Array.isArray(back.readings) && back.readings.length === 3),
    ok('binary: sizer returns a positive size', sizeOfTick(ticks[0]) > 0),
    ok('binary: intoBuffer reuse round-trips every tick', decodedSymbols.join(',') === 'TS,GO'),
  ];
}
