// The pure parts of the mion server benchmark's compact lane, testable without the image: how a body
// is cut around its id on both wires, how the sweep pads, what each result row carries, and which rows
// a chart draws.
import {describe, expect, it} from 'vitest';
// Plain ESM dev scripts, no types: one directive per import line, so the formatter can never
// wrap the import away from the line the error lands on.
// @ts-expect-error untyped .mjs
import {bodyTemplate, invalidBody} from '../../../container/mion-bench/harness/wire.mjs';
// @ts-expect-error untyped .mjs
import {buildUser, buildUserOfSize, mionBody, plainBody, SWEEP_SIZES} from '../../../container/mion-bench/shared/payloads.mjs';
// @ts-expect-error untyped .mjs
import {bodyFor} from '../../../container/mion-bench/shared/suites.mjs';
// @ts-expect-error untyped .mjs
import {APPS} from '../../../container/mion-bench/shared/apps.mjs';
// @ts-expect-error untyped .mjs
import {toRow} from '../../../scripts/website/bench-data/gen-servers-docs.mjs';
// @ts-expect-error untyped .js (the site's tsconfig only exists in its image)
import {changeVsBase, formatChange, visibleRows} from '../../../container/website/app/utils/serverBenchRows.js';

const ID = 4815162342108;
const user = {...buildUser(), id: ID};

describe('bodyTemplate cuts a body at its id, whatever the wire', () => {
  const bodies = {
    'a plain JSON object': plainBody(user),
    'a mion argument array': mionBody(user),
    'a positional compact body': JSON.stringify([[ID, 'john_smith', [['credit_card', '4242', 12, 2025, 'visa']]]]),
  };

  for (const [name, body] of Object.entries(bodies)) {
    it(`splits ${name} around the id, and the halves rebuild it`, () => {
      const {prefix, suffix} = bodyTemplate(body, ID);
      expect(prefix + ID + suffix).toBe(body);
      expect(prefix + 7 + suffix).not.toContain(String(ID));
    });
  }

  it('fails on a body that does not carry the id', () => {
    expect(() => bodyTemplate(plainBody({...user, id: 1}), ID)).toThrow(/does not carry its id/);
  });

  it('fails when the id appears twice, since wrk could only vary one', () => {
    expect(() => bodyTemplate(JSON.stringify([ID, ID]), ID)).toThrow(/appears 2 times/);
  });

  it('never matches the id inside a longer number', () => {
    const body = JSON.stringify([`${ID}0`, Number(`9${ID}`), ID]);
    const {prefix} = bodyTemplate(body, ID);
    expect(prefix).toBe(body.slice(0, body.lastIndexOf(String(ID))));
  });

  it('invalidBody puts a string where the id was, on both wires', () => {
    expect(JSON.parse(invalidBody(bodyTemplate(plainBody(user), ID))).id).toBe('not-a-number');
    const compact = JSON.parse(invalidBody(bodyTemplate(JSON.stringify([[ID, 'john_smith']]), ID)));
    expect(compact[0][0]).toBe('not-a-number');
  });
});

describe('the payload sweep pads with repeated objects', () => {
  for (const size of SWEEP_SIZES as {key: string; bytes: number}[]) {
    it(`reaches ${size.key} within 1% by growing only paymentMethods`, () => {
      const padded = buildUserOfSize(size.bytes);
      const bytes = JSON.stringify(padded).length;
      expect(Math.abs(bytes - size.bytes) / size.bytes).toBeLessThan(0.01);
      expect(padded.tags).toEqual(buildUser().tags);
      expect({...padded, id: 0, paymentMethods: []}).toEqual({...buildUser(), id: 0, paymentMethods: []});
    });
  }

  it('cycles through every member of the PaymentMethod union', () => {
    const types = new Set(buildUserOfSize(50 * 1024).paymentMethods.map((method: {type: string}) => method.type));
    expect([...types].sort()).toEqual(['bank_account', 'credit_card', 'paypal']);
  });

  it('keeps the ~1 KB heavy-validation user as it was: two payment methods', () => {
    expect(buildUser().paymentMethods.map((method: {type: string}) => method.type)).toEqual(['credit_card', 'paypal']);
  });
});

describe('bodyFor writes each app in its own wire', () => {
  const app = (name: string) => APPS.find((entry: {name: string}) => entry.name === name);

  it('a competitor gets the object, mion the argument array', () => {
    expect(bodyFor(app('fastify'), user)).toBe(plainBody(user));
    expect(bodyFor(app('mion'), user)).toBe(mionBody(user));
  });

  it('a compact lane hands the argument array to its codec', () => {
    const codec = {encodeParams: (args: unknown[]) => `compact:${JSON.stringify(args)}`};
    expect(bodyFor(app('mion.compact'), user, codec)).toBe(`compact:${mionBody(user)}`);
  });

  it('registers mion.compact as the compact twin of mion', () => {
    expect(app('mion.compact')).toMatchObject({family: 'mion', dir: 'mion', runtime: 'node', wire: 'compact', twinOf: 'mion'});
  });
});

describe('gen-servers-docs rows carry the bytes and the twin', () => {
  const record = {
    app: 'mion.compact',
    label: 'mion.compact',
    family: 'mion',
    twinOf: 'mion',
    requests: {mean: 1000},
    latency: {mean: 1},
    throughput: {mean: 1e6},
    maxMem: 50,
    maxCpu: 100,
    bytes: {sent: 600, received: 650},
  };

  it('sums the body bytes of one call', () => {
    expect(toRow(record)).toMatchObject({twinOf: 'mion', bytes: 1250});
  });

  it('leaves both empty on a record that has neither', () => {
    expect(toRow({...record, app: 'mion', bytes: undefined, twinOf: undefined})).toMatchObject({twinOf: null, bytes: null});
  });
});

describe('which server rows a chart draws', () => {
  const rows = [
    {app: 'fastify', twinOf: null, requests: 900, bytes: 2000},
    {app: 'mion', twinOf: null, requests: 1000, bytes: 2000},
    {app: 'mion.compact', twinOf: 'mion', requests: 1100, bytes: 1240},
  ];

  it('leaves twins out of every chart that does not ask for them', () => {
    expect(visibleRows(rows).map((row: {app: string}) => row.app)).toEqual(['fastify', 'mion']);
  });

  it('draws only the base and its twins when asked', () => {
    expect(visibleRows(rows, 'mion').map((row: {app: string}) => row.app)).toEqual(['mion', 'mion.compact']);
  });

  it('measures a twin against its base, and nothing for the base itself', () => {
    expect(changeVsBase(rows[2], rows, 'bytes')).toBeCloseTo(-38);
    expect(changeVsBase(rows[2], rows, 'requests')).toBeCloseTo(10);
    expect(changeVsBase(rows[1], rows, 'bytes')).toBeNull();
  });

  it('has nothing to say when the base is missing or zero', () => {
    expect(changeVsBase(rows[2], [rows[2]], 'bytes')).toBeNull();
    expect(changeVsBase(rows[2], [{...rows[1], bytes: 0}, rows[2]], 'bytes')).toBeNull();
  });

  it('writes the change as a signed whole percent', () => {
    expect(formatChange(-38.4)).toBe('-38%');
    expect(formatChange(9.6)).toBe('+10%');
    expect(formatChange(0.2)).toBe('0%');
  });
});
