// What the three security lanes share on the parent side: the resolver
// holder (restartable after a hang), the compile-with-timeout step, the
// TS-validity gate, and the report shape.

import {isValidTypeScript} from '../type/tsValidate.ts';
import {describeType, type GeneratedType} from '../core/typeGen.ts';
import type {CrashRecord} from '../core/crashGuard.ts';
import type {ResolverClient} from '../../../../devtools/src/core/resolver-client.ts';
import {openClient, compileSecurity, type CompiledSecurity} from './securityHarness.ts';
import type {SecurityViolation} from './securityOracle.ts';

export const COMPILE_TIMEOUT_MS = 10_000;

/** Owns the inline-server resolver and can restart it after a hang (one
 *  unanswered request wedges the whole request queue). **/
export class ClientHolder {
  private client: ResolverClient | null = null;
  get(): ResolverClient {
    if (!this.client) this.client = openClient();
    return this.client;
  }
  restart(): void {
    this.close();
    this.client = openClient();
  }
  close(): void {
    try {
      this.client?.close();
    } catch {
      /* already dead */
    }
    this.client = null;
  }
}

/** Compile, or null on a resolver timeout (the client is restarted; the
 *  timeout itself is reported by the type lane, so no violation here). **/
export async function compileWithTimeout(holder: ClientHolder, gen: GeneratedType): Promise<CompiledSecurity | null> {
  const compile = compileSecurity(holder.get(), gen);
  compile.catch(() => {});
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<'timeout'>((res) => {
    timer = setTimeout(() => res('timeout'), COMPILE_TIMEOUT_MS);
  });
  const result = await Promise.race([compile, timeout]);
  clearTimeout(timer!);
  if (result === 'timeout') {
    holder.restart();
    return null;
  }
  return result;
}

/** Drop violations recorded on a type that is not valid TypeScript (tsgo is
 *  lenient and still produces a RunType; behaviour there is undefined). Keeps
 *  them when the check itself throws, so a real bug is never hidden. **/
export function applyTsGate(gen: GeneratedType, out: SecurityViolation[], before: number, stats: LaneStats): void {
  if (out.length <= before) return;
  let valid = true;
  try {
    valid = isValidTypeScript(gen);
  } catch {
    valid = true;
  }
  if (!valid) {
    out.length = before;
    stats.skippedInvalidTypes++;
  }
}

export interface LaneStats {
  checked: number;
  skipped: number;
  skippedInvalidTypes: number;
  /** Attack id → times applied, across the run. **/
  applied: Record<string, number>;
  /** Decode outcome → count (the throw histogram). **/
  outcomes: Record<string, number>;
}

export function newStats(): LaneStats {
  return {checked: 0, skipped: 0, skippedInvalidTypes: 0, applied: {}, outcomes: {}};
}

export function mergeCounts(into: Record<string, number>, from: Record<string, number>): void {
  for (const [key, count] of Object.entries(from)) into[key] = (into[key] ?? 0) + count;
}

export interface SecurityReport extends LaneStats {
  runs: number;
  seed: number;
  violations: SecurityViolation[];
  /** Hard failures: the crash guard's records plus, for the binary lane, the
   *  worker host's out-of-memory / hang records. **/
  crashes: CrashRecord[];
  slowestIterationMs?: number;
  slowestIterationRound?: number;
}

export function targetTitle(gen: GeneratedType): string {
  return describeType(gen);
}

/** The attack ids that must have been applied at least once for a run to
 *  count as having exercised the dictionary: every family that had a matching
 *  position. A run where a family never fired is reported so a silently
 *  unreachable attack cannot pass. **/
export function unexercised(applied: Record<string, number>, expected: readonly string[]): string[] {
  return expected.filter((id) => !(applied[id] > 0));
}

/** Render the coverage line for the soak log. **/
export function renderCoverage(applied: Record<string, number>): string {
  const entries = Object.entries(applied).sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([id, count]) => `${id}=${count}`).join(' ');
}
