import {PublicApi, Routes, initMionRouter, route} from '@mionkit/router';
import {FormatInt32, FormatUInt8, FormatUInt16, FormatFloat} from '@mionkit/type-formats/NumberFormats';

/** Sensor reading with optimized numeric types for binary serialization */
export type SensorReading = {
    sensorId: FormatUInt16; // 0-65535, uses 2 bytes in binary
    timestamp: FormatInt32; // Unix timestamp, uses 4 bytes
    temperature: FormatFloat; // Temperature reading
    humidity: FormatUInt8; // 0-255%, uses 1 byte
    pressure: FormatFloat; // Atmospheric pressure
};

/** Batch of sensor readings for efficient transfer */
export type SensorBatch = {
    batchId: FormatUInt16;
    readings: SensorReading[];
};

/** Statistics result with numeric data */
export type SensorStats = {
    avgTemperature: FormatFloat;
    avgHumidity: FormatUInt8;
    avgPressure: FormatFloat;
    readingCount: FormatUInt16;
};

// Define routes with binary serialization
const routes = {
    /** Submit a single sensor reading */
    submitReading: route((_ctx, reading: SensorReading): {success: boolean; id: FormatUInt16} => ({
        success: true,
        id: reading.sensorId,
    })),

    /** Submit a batch of sensor readings for efficient transfer */
    submitBatch: route((_ctx, batch: SensorBatch): {processed: FormatUInt16} => ({
        processed: batch.readings.length as FormatUInt16,
    })),

    /** Get statistics from sensor readings */
    getStats: route(
        (_ctx, sensorId: FormatUInt16): SensorStats => ({
            avgTemperature: 22.5 as FormatFloat,
            avgHumidity: 65 as FormatUInt8,
            avgPressure: 1013.25 as FormatFloat,
            readingCount: 100 as FormatUInt16,
        })
    ),
} satisfies Routes;

// Initialize router with binary serialization globally
initMionRouter(routes, {serializer: 'binary'});
// Export API type for client usage
export type BinaryApi = PublicApi<typeof routes>;
