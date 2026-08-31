// Binary wire-format measurement harness — encoded SIZE + encode/decode
// throughput per representative payload. The container serialization benchmark
// only measures throughput; this fills the size gap so wire-format changes
// (e.g. the string length-prefix encoding) can be reviewed on bytes too.
//
// Always round-trip-asserts correctness so it doubles as a regression guard in
// `pnpm test`. The timing table only prints under BINARY_BENCH=1 so the normal
// suite stays quiet:
//
//   BINARY_BENCH=1 pnpm exec vitest run packages/ts-runtypes/test/features/binaryWire.test.ts
//
// NOTE: the devtools plugin resolves createBinaryEncoderFn/Decoder at each call
// site from the STATIC schema type, so every case inlines a concrete schema and
// its own encoder/decoder calls — a shared `RunType<unknown>` table would erase
// the type and inject the wrong (unknown) entry.

import * as TF from '@mionjs/run-types/formats';
import {describe, it, expect} from 'vitest';
import * as RT from '@mionjs/run-types/builders';
import {createBinaryEncoderFn, createBinaryDecoderFn, type BinaryEncoderFn, type BinaryDecoderFn} from '@mionjs/run-types';

const PRINT = process.env.BINARY_BENCH === '1';
const TIME_MS = Number(process.env.BINARY_BENCH_MS ?? 200);

const rows: {label: string; bytes: number; enc: number; dec: number}[] = [];

function opsPerSec(fn: () => void): number {
  for (let i = 0; i < 2000; i++) fn(); // warm up
  let n = 0;
  const start = performance.now();
  while (performance.now() - start < TIME_MS) {
    fn();
    n++;
  }
  return n / ((performance.now() - start) / 1000);
}

// Round-trip-assert, then record size (always) and throughput (PRINT only).
function record(label: string, encode: BinaryEncoderFn, decode: BinaryDecoderFn<unknown>, value: unknown): void {
  const buf = encode(value);
  expect(decode(buf)).toEqual(value);
  const enc = PRINT ? opsPerSec(() => encode(value)) : 0;
  const dec = PRINT ? opsPerSec(() => decode(encode(value))) : 0;
  rows.push({label, bytes: buf.byteLength, enc, dec});
}

describe('binary wire-format size + throughput', () => {
  it('string short ("hello")', () => {
    const s = TF.string();
    record('string short ("hello")', createBinaryEncoderFn(s), createBinaryDecoderFn(s), 'hello');
  });

  it('string id (uuid-ish)', () => {
    const s = TF.string();
    record('string id (uuid-ish)', createBinaryEncoderFn(s), createBinaryDecoderFn(s), '3f2504e0-4f89-41d3-9a0c-0305e82c3301');
  });

  it('string long (200 chars)', () => {
    const s = TF.string();
    record('string long (200 chars)', createBinaryEncoderFn(s), createBinaryDecoderFn(s), 'x'.repeat(200));
  });

  it('object user (4 strings)', () => {
    const s = RT.object({id: TF.string(), name: TF.string(), email: TF.string(), role: TF.string()});
    record('object user (4 strings)', createBinaryEncoderFn(s), createBinaryDecoderFn(s), {
      id: 'u_1042',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      role: 'admin',
    });
  });

  it('array of 100 short strings', () => {
    const s = RT.array(TF.string());
    record(
      'array of 100 short strings',
      createBinaryEncoderFn(s),
      createBinaryDecoderFn(s),
      Array.from({length: 100}, (_, i) => `tag-${i}`)
    );
  });

  it('array of 100 numbers', () => {
    const s = RT.array(TF.number());
    record(
      'array of 100 numbers',
      createBinaryEncoderFn(s),
      createBinaryDecoderFn(s),
      Array.from({length: 100}, (_, i) => i * 1.5)
    );
  });

  it('reports the table', () => {
    if (!PRINT) return;
    const fmt = (n: number) =>
      n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${n.toFixed(0)}`;

    console.log('\n=== binary wire (size = bytes, lower better; enc/dec = ops/sec, higher better) ===');
    for (const r of rows) {
      console.log(
        `${r.label.padEnd(34)} ${String(r.bytes).padStart(7)} B   enc ${fmt(r.enc).padStart(8)}   dec ${fmt(r.dec).padStart(8)}`
      );
    }
  });
});
