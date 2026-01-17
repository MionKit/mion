<script setup lang="ts">
import "billboard.js/dist/billboard.css";
import 'billboard.js/dist/theme/datalab.css';
import { onMounted, nextTick } from 'vue';
import bb, {bar, line} from "billboard.js";
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
import chartColdStarts from './charts/charts/cold-starts.json';

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
  'cold-starts': chartColdStarts,
};

const props = defineProps<{
  id: string;
}>();

const chartId = `benchmark-chart-${props.id}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadChartType(chartData: any) {
  if (!chartData?.data?.type) throw new Error(`Chart type not defined`);
  if (chartData.data?.loaded) return; // already loaded
  const type = chartData.data.type;
  switch (type) {
    case 'bar':
      chartData.type = bar();
      chartData.data.loaded = true;
      break;
    case 'line':
      chartData.type = line();
      chartData.data.loaded = true;
      break;
    default:
      throw new Error(`Chart type "${type}" not supported`);
  }
  return chartData;
}

onMounted(() => {
  nextTick(() => {
    const chartData = chartList[props.id];
    if (!chartData) {
      console.error(`BenchChart: Unknown chart id "${props.id}"`);
      return;
    }
    bb.generate({
      bindto: `#${chartId}`,
      ...loadChartType(chartData),
      tooltip: {
        show: false,
      },
    });
  });
});
</script>

<template>
  <div :id="chartId" />
</template>