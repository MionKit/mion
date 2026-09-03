// The PRE-FIX binary reader, kept as the negative control's twin.
//
// Before the bounds checks landed, `desLength()` and `desString()` in
// src/runtypes/dataView.ts read through a `Uint8Array`, which returns
// `undefined` past the end: the varint loop treated that as zero and
// `subarray` clamped, so a truncated buffer decoded to garbage instead of
// failing, and the emitted array arm did `new Array(len)` + a `len`-long loop
// on an unbounded count, so a five-byte body could exhaust the heap. This file
// restates that reader and that array arm VERBATIM so the security oracles can
// be proven to catch both (securityOracle.unit.test.ts): the todo's "run lane 1
// against the pre-fix decoder" control. It is test-only and never imported by
// shipped code.
//
// Erasable TypeScript only: the worker thread loads this file natively.

const textDecoder = new TextDecoder();

export interface PreFixDeserializer {
  index: number;
  readonly byteLength: number;
  desLength(): number;
  desString(): string;
}

/** The pre-fix reader over `bytes`. **/
export function createPreFixDeserializer(bytes: Uint8Array): PreFixDeserializer {
  const uint8View = bytes;
  return {
    index: 0,
    byteLength: bytes.byteLength,
    desLength(): number {
      const first = uint8View[this.index];
      if (first < 0x80) {
        this.index++;
        return first;
      }
      let value = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = uint8View[this.index++];
        value += (byte & 0x7f) * 2 ** shift;
        shift += 7;
      } while (byte & 0x80);
      return value;
    },
    desString(): string {
      const len = this.desLength();
      const decoded = textDecoder.decode(uint8View.subarray(this.index, this.index + len));
      this.index += len;
      return decoded;
    },
  };
}

/** The pre-fix emitted body for `string[]`: read a count, allocate, loop. **/
export function preFixStringArrayDecode(des: PreFixDeserializer): string[] {
  const alen = des.desLength();
  const ret = new Array<string>(alen);
  for (let i = 0; i < alen; i++) ret[i] = des.desString();
  return ret;
}

/** The matching encoder, so the control can build valid wires and re-encode. **/
export function stringArrayEncode(values: string[]): Uint8Array {
  const encoder = new TextEncoder();
  const parts: number[] = [...varint(values.length)];
  for (const value of values) {
    const body = encoder.encode(value);
    parts.push(...varint(body.length), ...body);
  }
  return Uint8Array.from(parts);
}

export function stringArrayValidate(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function varint(value: number): number[] {
  const out: number[] = [];
  let rest = value;
  do {
    let byte = rest % 128;
    rest = Math.floor(rest / 128);
    if (rest > 0) byte |= 0x80;
    out.push(byte);
  } while (rest > 0);
  return out;
}
