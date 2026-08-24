// Wire-size spec for the Temporal binary packing. Round-trip tests
// (temporal.test.ts) prove the encoding is *lossless*; these prove it is
// *compact* — they pin the exact byte count of each numeric layout and assert
// it beats the toJSON() string it replaced. Without this, a regression that
// silently fell back to the string encoding (e.g. the ISO discriminator always
// taking the else branch) would still pass every round-trip test.
//
// createBinaryEncoderFn returns a Uint8Array view of the written bytes, so
// `.byteLength` is exactly the on-wire byte count for a top-level value.

import {describe, expect, it} from 'vitest';
import {createBinaryEncoderFn} from '@ts-runtypes/core';

const T = (globalThis as {Temporal: typeof Temporal}).Temporal;

// Byte width of the unsigned LEB128 varint length prefix serString writes.
const varintLen = (n: number): number => (n < 0x80 ? 1 : n < 0x4000 ? 2 : n < 0x200000 ? 3 : n < 0x10000000 ? 4 : 5);
// bytes the string (serString) encoding would cost: varint length prefix + UTF-8.
const stringFormSize = (v: {toJSON(): string}): number => {
  const utf8 = new TextEncoder().encode(v.toJSON()).length;
  return varintLen(utf8) + utf8;
};

describe('Temporal binary wire size — numeric layouts are exact and compact', () => {
  it('Instant — 12 bytes (int64 seconds + int32 sub-second ns), beats the string form', () => {
    const v = T.Instant.from('2020-01-15T10:30:00.123456789Z');
    const bytes = createBinaryEncoderFn<Temporal.Instant>()(v as never);
    expect(bytes.byteLength).toBe(12);
    expect(bytes.byteLength).toBeLessThan(stringFormSize(v));
  });

  it('PlainTime — 9 bytes (u8 h/m/s + u16 ms/us/ns)', () => {
    const v = T.PlainTime.from('19:39:09.068346205');
    const bytes = createBinaryEncoderFn<Temporal.PlainTime>()(v as never);
    expect(bytes.byteLength).toBe(9);
    expect(bytes.byteLength).toBeLessThan(stringFormSize(v));
  });

  it('PlainDate (ISO) — 7 bytes (1 disc + i32 year + u8 month + u8 day)', () => {
    const v = T.PlainDate.from('2020-08-24');
    const bytes = createBinaryEncoderFn<Temporal.PlainDate>()(v as never);
    expect(bytes.byteLength).toBe(7);
    expect(bytes.byteLength).toBeLessThan(stringFormSize(v));
  });

  it('PlainDateTime (ISO) — 16 bytes (1 disc + date 6 + time 9)', () => {
    const v = T.PlainDateTime.from('1995-12-07T15:00:00');
    const bytes = createBinaryEncoderFn<Temporal.PlainDateTime>()(v as never);
    expect(bytes.byteLength).toBe(16);
    expect(bytes.byteLength).toBeLessThan(stringFormSize(v));
  });

  it('PlainYearMonth (ISO) — 6 bytes (1 disc + i32 year + u8 month)', () => {
    const v = T.PlainYearMonth.from('2020-10');
    const bytes = createBinaryEncoderFn<Temporal.PlainYearMonth>()(v as never);
    expect(bytes.byteLength).toBe(6);
    expect(bytes.byteLength).toBeLessThan(stringFormSize(v));
  });

  it('PlainDate (non-ISO calendar) — 1-byte disc + serString(toJSON()) fallback', () => {
    const v = T.PlainDate.from('2024-03-20[u-ca=hebrew]');
    const bytes = createBinaryEncoderFn<Temporal.PlainDate>()(v as never);
    // disc byte (0) + the exact string-encoded toJSON
    expect(bytes.byteLength).toBe(1 + stringFormSize(v));
    // and the fallback genuinely costs more than the 7-byte ISO packing
    expect(bytes.byteLength).toBeGreaterThan(7);
  });

  it('string-encoded types stay string-sized (ZonedDateTime / Duration / PlainMonthDay)', () => {
    const zdt = T.ZonedDateTime.from('2020-01-15T10:30:00[UTC]');
    expect(createBinaryEncoderFn<Temporal.ZonedDateTime>()(zdt as never).byteLength).toBe(stringFormSize(zdt));
    const dur = T.Duration.from('P1Y2M10DT2H30M');
    expect(createBinaryEncoderFn<Temporal.Duration>()(dur as never).byteLength).toBe(stringFormSize(dur));
    const md = T.PlainMonthDay.from('07-14');
    expect(createBinaryEncoderFn<Temporal.PlainMonthDay>()(md as never).byteLength).toBe(stringFormSize(md));
  });
});
