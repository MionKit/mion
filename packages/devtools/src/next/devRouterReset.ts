/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import path from 'node:path';
import type {GenerateInfo} from '../core/unplugin.ts';

// `next dev` re-runs the router module, not @mionjs/router, so `createMionRouter` needs a reset; one line, no line moves.
// Keep the batch table: only the generated batch module refills it, and an edit elsewhere never re-runs it.
const RESET =
  "import {resetRouter as __mionReset, getBatchIds as __mionBatchIds, getBatch as __mionBatch, registerBatches as __mionRegisterBatches} from '@mionjs/router'; " +
  '{const __mionKept = Object.fromEntries(__mionBatchIds().map((id) => [id, __mionBatch(id)])); __mionReset(); __mionRegisterBatches(__mionKept);} ';

/** A directive must stay the first statement: a router module carrying one is left alone. */
const DIRECTIVE = /^\s*(['"])use (client|server)\1/;

export function createDevRouterReset(): {
  onGenerate: (info: GenerateInfo) => void;
  rewriteOutput: (file: string, code: string) => string;
} {
  let routerInitFiles = new Set<string>();
  return {
    onGenerate: (info) => {
      routerInitFiles = new Set(info.routerInitFiles.map((file) => path.resolve(file)));
    },
    rewriteOutput: (file, code) => {
      if (!routerInitFiles.has(path.resolve(file)) || DIRECTIVE.test(code)) return code;
      return RESET + code;
    },
  };
}
