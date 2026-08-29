import {describe, it} from 'vitest';
import {writeFileSync} from 'node:fs';
import {measurePipeline} from './modelPipelineHarness.ts';

const SPECS: [string, string][] = [
  ['bigint', "{mode: 'number'}"],
  ['bigserial', "{mode: 'number'}"],
  ['bit', '{dimensions: 4}'],
  ['boolean', ''],
  ['char', ''],
  ['cidr', ''],
  ['date', ''],
  ['numeric', ''],
  ['decimal', ''],
  ['doublePrecision', ''],
  ['geometry', ''],
  ['halfvec', '{dimensions: 3}'],
  ['inet', ''],
  ['integer', ''],
  ['interval', ''],
  ['json', ''],
  ['jsonb', ''],
  ['line', ''],
  ['macaddr', ''],
  ['macaddr8', ''],
  ['point', ''],
  ['real', ''],
  ['serial', ''],
  ['smallint', ''],
  ['smallserial', ''],
  ['sparsevec', '{dimensions: 3}'],
  ['text', ''],
  ['time', ''],
  ['timestamp', ''],
  ['uuid', ''],
  ['varchar', '{length: 10}'],
  ['vector', '{dimensions: 3}'],
];

describe('column to format family', () => {
  it('reports which pg columns carry a refinable format', () => {
    const out: string[] = [];
    for (const [fn, cfg] of SPECS) {
      const call = `${fn}('c'${cfg ? `, ${cfg}` : ''})`;
      const body = `
import {${fn}} from '@mionjs/drizzle-orm-pg-core';
export const probe = ${call}.format({});
`;
      const r = measurePipeline(body);
      const never = r.errors.some((e) => e.includes("type 'never'"));
      out.push(
        `${fn.padEnd(18)} refinable=${never ? 'NO ' : 'yes'}  ${r.errors.length ? r.errors[0].replace(/\n/g, ' ').slice(0, 100) : ''}`
      );
    }
    writeFileSync('/tmp/claude-0/-home-user-mion/f3244211-9d71-5e19-8593-a145ae88df44/scratchpad/fam.txt', out.join('\n'));
  }, 300000);
});
