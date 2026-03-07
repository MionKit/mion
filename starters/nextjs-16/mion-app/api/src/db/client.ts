import {neon} from '@neondatabase/serverless';
import {drizzle, type NeonHttpDatabase} from 'drizzle-orm/neon-http';
import * as schema from './schema.ts';

let _db: NeonHttpDatabase<typeof schema> | null = null;

/** Lazy singleton — creates the DB client on first call, reuses on subsequent calls. Serverless-safe. */
export function getDb(): NeonHttpDatabase<typeof schema> {
    if (!_db) {
        const sql = neon(process.env.DATABASE_URL!);
        _db = drizzle({client: sql, schema});
    }
    return _db;
}
