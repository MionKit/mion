<script setup lang="ts">
import "billboard.js/dist/billboard.css";
import 'billboard.js/dist/theme/datalab.css';
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import bb, {bar, line, type Chart} from "billboard.js";
import chartHelloRequests from './charts/charts-servers-hello/requests.json';
import chartHelloLatency from './charts/charts-servers-hello/latency.json';
import chartHelloThroughput from './charts/charts-servers-hello/throughput.json';
import chartHelloMaxMemory from './charts/charts-servers-hello/maxMem.json';
import chartHelloMemorySeries from './charts/charts-servers-hello/memSeries.json';
import chartUpdateRequests from './charts/charts-servers/requests.json';
import chartUpdateLatency from './charts/charts-servers/latency.json';
import chartUpdateThroughput from './charts/charts-servers/throughput.json';
import chartUpdateMaxMemory from './charts/charts-servers/maxMem.json';
import chartUpdateMemorySeries from './charts/charts-servers/memSeries.json';

import chartUpdateSimpleRequests from './charts/charts-servers-simple/requests.json';
import chartUpdateSimpleLatency from './charts/charts-servers-simple/latency.json';
import chartUpdateSimpleThroughput from './charts/charts-servers-simple/throughput.json';
import chartUpdateSimpleMaxMemory from './charts/charts-servers-simple/maxMem.json';
import chartUpdateSimpleMemorySeries from './charts/charts-servers-simple/memSeries.json';

const chartList: Record<string, unknown> = {
  'hello-requests': chartHelloRequests,
  'hello-latency': chartHelloLatency,
  'hello-throughput': chartHelloThroughput,
  'hello-max-mem': chartHelloMaxMemory,
  'hello-mem-series': chartHelloMemorySeries,
  'update-requests': chartUpdateRequests,
  'update-latency': chartUpdateLatency,
  'update-throughput': chartUpdateThroughput,
  'update-max-mem': chartUpdateMaxMemory,
  'update-mem-series': chartUpdateMemorySeries,
  'update-simple-requests': chartUpdateSimpleRequests,
  'update-simple-latency': chartUpdateSimpleLatency,
  'update-simple-throughput': chartUpdateSimpleThroughput,
  'update-simple-max-mem': chartUpdateSimpleMaxMemory,
  'update-simple-mem-series': chartUpdateSimpleMemorySeries,
};

const chartImages = import.meta.glob('./charts/**/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const imageList: Record<string, string> = {
  'hello-requests':           chartImages['./charts/charts-servers-hello/requests.png']!,
  'hello-latency':            chartImages['./charts/charts-servers-hello/latency.png']!,
  'hello-throughput':         chartImages['./charts/charts-servers-hello/throughput.png']!,
  'hello-max-mem':            chartImages['./charts/charts-servers-hello/maxMem.png']!,
  'hello-mem-series':         chartImages['./charts/charts-servers-hello/memSeries.png']!,
  'update-requests':          chartImages['./charts/charts-servers/requests.png']!,
  'update-latency':           chartImages['./charts/charts-servers/latency.png']!,
  'update-throughput':        chartImages['./charts/charts-servers/throughput.png']!,
  'update-max-mem':           chartImages['./charts/charts-servers/maxMem.png']!,
  'update-mem-series':        chartImages['./charts/charts-servers/memSeries.png']!,
  'update-simple-requests':   chartImages['./charts/charts-servers-simple/requests.png']!,
  'update-simple-latency':    chartImages['./charts/charts-servers-simple/latency.png']!,
  'update-simple-throughput': chartImages['./charts/charts-servers-simple/throughput.png']!,
  'update-simple-max-mem':    chartImages['./charts/charts-servers-simple/maxMem.png']!,
  'update-simple-mem-series': chartImages['./charts/charts-servers-simple/memSeries.png']!,
};

const props = defineProps<{
  id: string;
}>();

const chartId = `benchmark-chart-${props.id}`;
const showFallback = ref(true);
const imageSrc = computed(() => imageList[props.id]);

/** build a fresh billboard.js config without mutating the imported JSON module */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildChartConfig(chartData: any) {
  if (!chartData?.data?.type) throw new Error(`Chart type not defined`);
  const type = chartData.data.type;
  switch (type) {
    case 'bar':
      return {...chartData, type: bar()};
    case 'line':
      return {...chartData, type: line()};
    default:
      throw new Error(`Chart type "${type}" not supported`);
  }
}

let chart: Chart | undefined;

onMounted(() => {
  nextTick(() => {
    const chartData = chartList[props.id];
    if (!chartData) {
      console.error(`BenchChart: Unknown chart id "${props.id}"`);
      return;
    }
    try {
      chart = bb.generate({
        bindto: `#${chartId}`,
        ...buildChartConfig(chartData),
        tooltip: {
          show: false,
        },
      });
      showFallback.value = false;
    } catch (err) {
      console.error(`BenchChart: failed to render "${props.id}"`, err);
    }
  });
});

onBeforeUnmount(() => {
  chart?.destroy();
  chart = undefined;
});
</script>
<template>
  <div class="bench-card">
    <div :id="chartId" class="mion-bench"/>
    <img
      v-show="showFallback"
      :src="imageSrc"
      :alt="`Benchmark chart: ${id}`"
      class="bench-fallback"
    />
  </div>
</template>
<style>
.bench-card {
  position: relative;
  padding: 1.5rem;
  min-height: 370px;
  border: 1px solid var(--color-primary-400);
  background: 
    linear-gradient(to bottom, rgba(138, 168, 94, 0.03) 0%, rgba(138, 168, 94, 0.08) 100%),
    repeating-linear-gradient(
      0deg,
      transparent,
      transparent 24px,
      rgba(138, 168, 94, 0.08) 24px,
      rgba(138, 168, 94, 0.08) 25px
    ),
    repeating-linear-gradient(
      90deg,
      transparent,
      transparent 24px,
      rgba(138, 168, 94, 0.08) 24px,
      rgba(138, 168, 94, 0.08) 25px
    );
  box-shadow: 
    0 4px 6px -1px rgba(138, 168, 94, 0.1),
    0 2px 4px -2px rgba(138, 168, 94, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  margin: 1rem 0;
  overflow: hidden;
}

.dark .bench-card {
  border-color: var(--color-primary-600);
  background: 
    linear-gradient(to bottom, rgba(138, 168, 94, 0.02) 0%, rgba(138, 168, 94, 0.06) 100%),
    repeating-linear-gradient(
      0deg,
      transparent,
      transparent 24px,
      rgba(138, 168, 94, 0.06) 24px,
      rgba(138, 168, 94, 0.06) 25px
    ),
    repeating-linear-gradient(
      90deg,
      transparent,
      transparent 24px,
      rgba(138, 168, 94, 0.06) 24px,
      rgba(138, 168, 94, 0.06) 25px
    ),
    var(--ui-bg, #1a1a1a);
  box-shadow: 
    0 4px 6px -1px rgba(0, 0, 0, 0.3),
    0 2px 4px -2px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 rgba(138, 168, 94, 0.1);
}

.mion-bench.bb text {
  color: var(--ui-text);
  fill: var(--ui-text);
}

.dark .bb path {
  stroke: #363232;
}

/* Ensure chart fills the card properly */
.bench-card .mion-bench {
  position: relative;
  z-index: 1;
}

.bench-fallback {
  position: absolute;
  inset: 1.5rem;
  width: calc(100% - 3rem);
  height: calc(100% - 3rem);
  object-fit: contain;
  z-index: 2;
  background: transparent;
  pointer-events: none;
}
</style>