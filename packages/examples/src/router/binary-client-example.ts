import {initClient} from '@mionjs/client';
import type {BinaryApi, SensorReading, SensorBatch} from './binary-server-example.ts';
import type {UInt16, UInt8, Float, Int32} from '@ts-runtypes/core/formats';

// Initialize client with the server URL
const {routes} = initClient<BinaryApi>({baseURL: 'http://localhost:3000'});

// Create a sensor reading with optimized numeric types
const reading: SensorReading = {
    sensorId: 1 as UInt16,
    timestamp: Math.floor(Date.now() / 1000) as Int32,
    temperature: 23.5 as Float,
    humidity: 65 as UInt8,
    pressure: 1013.25 as Float,
};

// Submit a single reading
const [result, error] = await routes.submitReading(reading).call();
console.log(result, error);
// Logs { success: true, id: 1 }

// Submit a batch of readings for efficient transfer
const batch: SensorBatch = {
    batchId: 1 as UInt16,
    readings: [reading, {...reading, sensorId: 2 as UInt16}],
};
const [batchResult] = await routes.submitBatch(batch).call();
console.log(batchResult);
// Logs { processed: 2 }

// Get statistics for a sensor
const [stats] = await routes.getStats(1 as UInt16).call();
console.log(stats);
// Logs { avgTemperature: 22.5, avgHumidity: 65, avgPressure: 1013.25, readingCount: 100 }
