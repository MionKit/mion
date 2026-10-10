<script setup lang="ts">
// Code coloured by Shiki at render time; highlighted lines get the accent band, lines enter one by one.
import {codeToHtml} from 'shiki';
import {nextStep} from './shared.ts';

const props = withDefaults(
  defineProps<{
    code: string;
    lang?: string;
    /** Lines to mark, 1-based: `3`, `11-12` or `3,7-8`. */
    highlight?: string;
  }>(),
  {lang: 'ts', highlight: ''}
);

const THEME = 'tokyo-night';
const step = nextStep();
const code = props.code.replace(/^\n/, '').replace(/\s+$/, '');
const lineCount = code.split('\n').length;
const marked = parseHighlight(props.highlight, lineCount);

function parseHighlight(spec: string, count: number): Set<number> {
  const lines = new Set<number>();
  for (const part of spec.split(',').map((p) => p.trim()).filter(Boolean)) {
    const match = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!match) throw new Error(`CardCode: highlight "${spec}" must look like 3, 11-12 or 3,7-8`);
    const from = Number(match[1]);
    const to = Number(match[2] ?? match[1]);
    if (from < 1 || to < from || to > count)
      throw new Error(`CardCode: highlight "${part}" is outside the code's ${count} lines`);
    for (let line = from; line <= to; line++) lines.add(line);
  }
  return lines;
}

const html = await codeToHtml(code, {
  lang: props.lang,
  theme: THEME,
  transformers: [
    {
      line(node, line) {
        if (marked.has(line)) this.addClassToHast(node, 'hl');
        node.properties['data-cc'] = 'line';
        node.properties.style = `--cc-i:${step['--cc-i']};--cc-sub:${line - 1}`;
      },
    },
  ],
});
</script>

<template>
  <div class="cc-code" data-check="no-overflow" v-html="html"></div>
</template>
