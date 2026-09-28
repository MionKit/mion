// Stands in for a database: each query answers with the next queued raw rows.

export interface DriverCall {
  sql: string;
  params: unknown[];
  method: string;
}

const queued: unknown[][][] = [];
export const driverCalls: DriverCall[] = [];

/** Rows are arrays in select order, as pg / mysql / sqlite drivers send them. */
export function queueRows(...results: unknown[][][]): void {
  queued.push(...results);
}

export function resetDriver(): void {
  queued.length = 0;
  driverCalls.length = 0;
}

export async function answer(sql: string, params: unknown[], method: string): Promise<{rows: unknown[]}> {
  driverCalls.push({sql, params, method});
  // pg-proxy sends begin / commit / rollback as their own calls; they return nothing
  if (/^(begin|commit|rollback|savepoint|release)/i.test(sql.trim())) return {rows: []};
  const rows = queued.shift();
  if (!rows) throw new Error(`fakeDriver: no rows queued for: ${sql}`);
  return {rows};
}
