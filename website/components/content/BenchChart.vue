<script>
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

const chartList = {
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
</script>

<script setup>
import {onMounted, nextTick} from 'vue';

const props = defineProps({
  id: {
    type: String,
    required: true,
    validator: (value) => {
      return chartList[value] !== undefined;
    },
  },
});

const chartId = `benchmark-chart-${props.id}`;

onMounted(() => {
  nextTick(() => {
    const chartData = chartList[props.id];
    const chart = window.bb.generate({
      bindto: `#${chartId}`,
      ...chartData,
      tooltip: {
        show: false,
      },
    });
  });
});
</script>

<template>
  <div :id="chartId"></div>
</template>